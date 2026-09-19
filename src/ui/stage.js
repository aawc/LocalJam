/**
 * LocalJam - Stage Viewport Component (L0)
 * The persistent one-screen player stage featuring 6 rows:
 * Row 1: Interactive status chips ([★], [SHUFFLE], [REPEAT], [EQ], [MUTED]) & [ ••• ] overflow button
 * Row 2: 280x280 Album artwork / real-time Canvas audio visualizer with tap/double-tap/long-press gestures
 * Row 3: Track / Station title and subtitle metadata
 * Row 4: Timeline seek range slider (local) or double-coded status line (radio)
 * Row 5: Ergonomic transport cluster (Previous, Play/Pause, Next)
 * Row 6: Dual-Source Handle Bar ([ Local ] · [ Radio ]) with swipe source toggle and Tier 2 re-auth
 */

import { db as defaultDb } from '../storage/db.js';
import { audioEngine as defaultAudioEngine } from '../player/audio-engine.js';
import { queueManager as defaultQueueManager } from '../player/queue.js';
import { sessionRegistry as defaultSessionRegistry } from '../storage/session-registry.js';
import { audioVisualizer as defaultVisualizer, AudioVisualizer, VISUALIZER_MODES } from '../visualizer/visualizer.js';
import { equalizer as defaultEqualizer } from '../player/equalizer.js';
import { toggleFavoriteStation, getStationFallbackArtwork } from '../radio/stations.js';
import { escapeHtml } from '../utils/sanitize.js';
import { attachGestures } from './gestures.js';
import { hasFileSystemAccess as defaultHasFSAA } from './library-source.js';
import { formatDuration } from './browse-model.js';

/**
 * Creates the L0 Stage viewport component.
 *
 * @param {{
 *   onOpenBrowse: (tab: 'library' | 'radio') => void,
 *   onOpenOverflow: () => void,
 *   onPickFolder: () => Promise<boolean>,
 *   onToggleSource: () => Promise<void>,
 *   onToast: (msg: string) => void,
 *   audioEngine?: object,
 *   queueManager?: object,
 *   db?: object,
 *   sessionRegistry?: object,
 *   visualizer?: object,
 *   equalizer?: object,
 *   hasFSAA?: boolean
 * }} deps
 * @returns {{
 *   element: HTMLElement,
 *   destroy: () => void,
 *   setVisualizer: (enabled: boolean, modeId?: string) => void,
 *   setVisualizerMode: (modeId: string) => void
 * }}
 */
export function createStage(deps) {
  const audioEngine = deps.audioEngine || defaultAudioEngine;
  const queueManager = deps.queueManager || defaultQueueManager;
  const db = deps.db || defaultDb;
  const sessionRegistry = deps.sessionRegistry || defaultSessionRegistry;
  let visualizer = deps.visualizer || defaultVisualizer;
  const equalizer = deps.equalizer || defaultEqualizer;
  const checkFSAA = deps.hasFSAA !== undefined ? () => deps.hasFSAA : defaultHasFSAA;

  let visualizerEnabled = false;
  let currentVizMode = 'bars';
  let unsubscribeAudio = null;
  let unsubscribeQueue = null;
  let unbindArtworkGestures = null;
  let unbindSourceBarGestures = null;

  // Cached state to prevent unnecessary DOM recreation
  let lastTrackId = undefined;
  let lastStationId = undefined;
  let lastIsRadio = undefined;
  let lastStreamState = undefined;
  let lastIsPlaying = undefined;
  let isStarred = false;
  let lastSourceStateKey = '';

  const stageEl = document.createElement('main');
  stageEl.className = 'stage-viewport stage-container';
  stageEl.setAttribute('role', 'main');

  const columnEl = document.createElement('div');
  columnEl.className = 'stage-player-column';
  stageEl.appendChild(columnEl);

  // --- Row 1: Status Chips + Overflow Button ---
  const row1El = document.createElement('div');
  row1El.className = 'stage-row-status stage-row-1';
  columnEl.appendChild(row1El);

  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'stage-status-chips stage-chips-group';
  chipsContainer.setAttribute('role', 'toolbar');
  chipsContainer.setAttribute('aria-label', 'Active playback modes');
  row1El.appendChild(chipsContainer);

  const overflowBtn = document.createElement('button');
  overflowBtn.type = 'button';
  overflowBtn.className = 'btn-stage-overflow stage-btn-overflow';
  overflowBtn.setAttribute('aria-label', 'More options and settings');
  overflowBtn.textContent = '•••';
  overflowBtn.addEventListener('click', () => {
    if (typeof deps.onOpenOverflow === 'function') deps.onOpenOverflow();
  });
  row1El.appendChild(overflowBtn);

  // --- Row 2: Artwork & Visualizer Container ---
  const row2El = document.createElement('div');
  row2El.className = 'stage-row-artwork stage-row-2';
  columnEl.appendChild(row2El);

  const artworkContainer = document.createElement('div');
  artworkContainer.className = 'stage-artwork-container stage-artwork-wrapper';
  artworkContainer.setAttribute('tabindex', '0');
  artworkContainer.setAttribute('role', 'button');
  artworkContainer.setAttribute('aria-label', 'Album artwork and visualizer. Tap to cycle visualizer, double tap to star, long press for options.');
  row2El.appendChild(artworkContainer);

  const artworkImg = document.createElement('img');
  artworkImg.className = 'stage-artwork-img stage-artwork';
  artworkImg.alt = 'Album artwork';
  artworkImg.addEventListener('error', () => {
    if (lastIsRadio && lastStationId && typeof getStationFallbackArtwork === 'function') {
      const station = audioEngine.currentStation;
      if (station && !artworkImg.src.startsWith('data:image/svg+xml')) {
        artworkImg.src = getStationFallbackArtwork(station);
        return;
      }
    }
    if (artworkImg.src !== './public/icons/icon-192.svg') {
      artworkImg.src = './public/icons/icon-192.svg';
    }
  });
  artworkContainer.appendChild(artworkImg);

  const visualizerCanvas = document.createElement('canvas');
  visualizerCanvas.className = 'stage-visualizer-canvas';
  visualizerCanvas.hidden = true;
  artworkContainer.appendChild(visualizerCanvas);

  if (visualizer && typeof visualizer.init === 'function') {
    visualizer.init(visualizerCanvas);
  }

  // --- Row 3: Metadata (Title & Subtitle) ---
  const row3El = document.createElement('div');
  row3El.className = 'stage-row-metadata stage-row-3';
  columnEl.appendChild(row3El);

  const titleEl = document.createElement('h1');
  titleEl.className = 'stage-track-title';
  row3El.appendChild(titleEl);

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'stage-track-subtitle';
  row3El.appendChild(subtitleEl);

  // --- Row 4: Timeline Seek Bar (Local) or Radio Status Line (Radio) ---
  const row4El = document.createElement('div');
  row4El.className = 'stage-row-timeline stage-row-4';
  columnEl.appendChild(row4El);

  // Seek slider elements (created once and reused)
  const seekSlider = document.createElement('input');
  seekSlider.type = 'range';
  seekSlider.className = 'stage-seek-slider';
  seekSlider.min = '0';
  seekSlider.max = '100';
  seekSlider.step = '0.5';
  seekSlider.value = '0';
  seekSlider.setAttribute('aria-label', 'Seek track position');

  seekSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && typeof audioEngine.seek === 'function') {
      audioEngine.seek(val);
    }
  });

  const timestampsContainer = document.createElement('div');
  timestampsContainer.className = 'stage-timestamps';

  const currentTimeEl = document.createElement('span');
  currentTimeEl.className = 'timestamp-current stage-time-current';
  currentTimeEl.textContent = '0:00';
  timestampsContainer.appendChild(currentTimeEl);

  const remainingTimeEl = document.createElement('span');
  remainingTimeEl.className = 'timestamp-remaining stage-time-remaining';
  remainingTimeEl.textContent = '-0:00';
  timestampsContainer.appendChild(remainingTimeEl);

  const radioStatusEl = document.createElement('div');
  radioStatusEl.className = 'stage-radio-status';

  // --- Row 5: Transport Controls ---
  const row5El = document.createElement('div');
  row5El.className = 'stage-row-transport stage-row-5';
  columnEl.appendChild(row5El);

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn-stage-transport stage-btn-transport btn-stage-prev';
  prevBtn.setAttribute('aria-label', 'Previous track');
  prevBtn.textContent = '⏮';
  prevBtn.addEventListener('click', () => {
    if (typeof audioEngine.previous === 'function') audioEngine.previous();
  });
  row5El.appendChild(prevBtn);

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'btn-stage-transport stage-btn-transport btn-stage-play stage-btn-play';
  playBtn.setAttribute('aria-label', 'Play');
  playBtn.textContent = '▶';
  playBtn.addEventListener('click', () => {
    if (typeof audioEngine.togglePlay === 'function') audioEngine.togglePlay();
  });
  row5El.appendChild(playBtn);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn-stage-transport stage-btn-transport btn-stage-next';
  nextBtn.setAttribute('aria-label', 'Next track');
  nextBtn.textContent = '⏭';
  nextBtn.addEventListener('click', () => {
    if (typeof audioEngine.next === 'function') audioEngine.next();
  });
  row5El.appendChild(nextBtn);

  // --- Row 6: Dual-Source Handle Bar ---
  const row6El = document.createElement('div');
  row6El.className = 'stage-row-source-bar stage-row-6';
  columnEl.appendChild(row6El);

  const sourceBar = document.createElement('div');
  sourceBar.className = 'stage-source-bar stage-source-handle-bar';
  sourceBar.setAttribute('role', 'navigation');
  sourceBar.setAttribute('aria-label', 'Media source selection');
  row6El.appendChild(sourceBar);

  const localPill = document.createElement('button');
  localPill.type = 'button';
  localPill.className = 'stage-source-pill';
  localPill.setAttribute('data-source', 'local');
  sourceBar.appendChild(localPill);

  const barDot = document.createElement('button');
  barDot.type = 'button';
  barDot.className = 'stage-source-separator';
  barDot.textContent = '·';
  barDot.setAttribute('aria-label', 'Toggle playback source');
  barDot.addEventListener('click', () => {
    deps.onToggleSource?.();
  });
  sourceBar.appendChild(barDot);

  const radioPill = document.createElement('button');
  radioPill.type = 'button';
  radioPill.className = 'stage-source-pill';
  radioPill.setAttribute('data-source', 'radio');
  radioPill.textContent = 'Radio';
  sourceBar.appendChild(radioPill);

  // --- Pointer Gestures on Row 6 (Swipe source toggle) ---
  unbindSourceBarGestures = attachGestures(sourceBar, {
    onSwipeLeft: () => deps.onToggleSource?.(),
    onSwipeRight: () => deps.onToggleSource?.()
  });

  // --- Wheel & Auxclick (Volume & Mute on Stage) ---
  stageEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const currentVol = audioEngine.volume !== undefined ? audioEngine.volume : 1;
    const newVol = Math.max(0, Math.min(1, Math.round((currentVol + delta) * 100) / 100));
    if (typeof audioEngine.setVolume === 'function') {
      audioEngine.setVolume(newVol);
    }
    deps.onToast?.(`[VOLUME ${Math.round(newVol * 100)}%]`);
  }, { passive: false });

  stageEl.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      e.preventDefault();
    }
  });

  stageEl.addEventListener('auxclick', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      if (typeof audioEngine.toggleMute === 'function') {
        audioEngine.toggleMute();
        const isMuted = Boolean(audioEngine.muted);
        deps.onToast?.(isMuted ? '[MUTED]' : `[VOLUME ${Math.round((audioEngine.volume || 1) * 100)}%]`);
      }
    }
  });

  // --- Artwork Pointer Gestures ---
  unbindArtworkGestures = attachGestures(artworkContainer, {
    onTap: () => handleArtworkTap(),
    onDoubleTap: () => handleArtworkDoubleTap(),
    onLongPress: () => deps.onOpenOverflow?.()
  });

  artworkContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    deps.onOpenOverflow?.();
  });

  function handleArtworkTap() {
    const modes = ['bars', 'wave', 'nebula', 'starfield'];
    if (!visualizerEnabled) {
      setVisualizer(true, 'bars');
      deps.onToast?.('[VISUALIZER: BARS]');
      if (db && typeof db.setSetting === 'function') {
        db.setSetting('viz.enabled', true).catch(() => {});
        db.setSetting('viz.mode', 'bars').catch(() => {});
      }
    } else {
      const idx = modes.indexOf(currentVizMode);
      if (idx < modes.length - 1) {
        const nextMode = modes[idx + 1];
        setVisualizerMode(nextMode);
        deps.onToast?.(`[VISUALIZER: ${nextMode.toUpperCase()}]`);
        if (db && typeof db.setSetting === 'function') {
          db.setSetting('viz.mode', nextMode).catch(() => {});
        }
      } else {
        setVisualizer(false);
        deps.onToast?.('[VISUALIZER: OFF]');
        if (db && typeof db.setSetting === 'function') {
          db.setSetting('viz.enabled', false).catch(() => {});
        }
      }
    }
  }

  async function handleArtworkDoubleTap() {
    const isRadio = Boolean(audioEngine.isRadio);
    const station = audioEngine.currentStation;
    const track = audioEngine.currentTrack || queueManager?.getCurrentTrack?.();

    if (isRadio && station) {
      try {
        let nowFav = false;
        if (typeof toggleFavoriteStation === 'function') {
          nowFav = await toggleFavoriteStation(station.id, db);
        } else if (db && typeof db.toggleFavoriteStation === 'function') {
          nowFav = await db.toggleFavoriteStation(station.id);
        }
        station.isFavorite = Boolean(nowFav);
        isStarred = Boolean(nowFav);
        updateStatusChips();
        deps.onToast?.(isStarred ? `[STARRED] ${station.name || 'Station'}` : `[UNSTARRED] ${station.name || 'Station'}`);
      } catch (err) {
        console.error('[Stage] Failed to toggle station star', err);
      }
    } else if (track) {
      try {
        let nowFav = false;
        if (db && typeof db.toggleFavorite === 'function') {
          nowFav = await db.toggleFavorite(track.id);
        }
        isStarred = Boolean(nowFav);
        updateStatusChips();
        deps.onToast?.(isStarred ? `[STARRED] ${track.title || 'Track'}` : `[UNSTARRED] ${track.title || 'Track'}`);
      } catch (err) {
        console.error('[Stage] Failed to toggle track star', err);
      }
    }
  }

  function setVisualizer(enabled, modeId = 'bars') {
    visualizerEnabled = Boolean(enabled);
    if (visualizerEnabled) {
      currentVizMode = modeId;
      if (visualizer) {
        if (!visualizer.canvas || visualizer.canvas !== visualizerCanvas) {
          if (typeof visualizer.init === 'function') {
            visualizer.init(visualizerCanvas);
          }
        }
        visualizer.mode = modeId;
        if (typeof visualizer.setMode === 'function') visualizer.setMode(modeId);
        if (typeof visualizer.resize === 'function') visualizer.resize();
      } else if (typeof AudioVisualizer === 'function') {
        visualizer = new AudioVisualizer(visualizerCanvas);
      }
      visualizerCanvas.hidden = false;
      artworkImg.style.display = 'none';
      if (visualizer && typeof visualizer.start === 'function') {
        visualizer.start();
      }
    } else {
      visualizerCanvas.hidden = true;
      artworkImg.style.display = '';
      if (visualizer && typeof visualizer.pause === 'function') {
        visualizer.pause();
      }
    }
    updateStatusChips();
  }

  function setVisualizerMode(modeId) {
    currentVizMode = modeId;
    if (visualizer && typeof visualizer.setMode === 'function') {
      visualizer.setMode(modeId);
    }
  }

  let lastChipsKey = '';
  function updateStatusChips() {
    const isEqCustom = Boolean(equalizer && Array.isArray(equalizer.gains) && equalizer.gains.some(g => g !== 0));
    const isRadio = Boolean(audioEngine.isRadio);
    const chipsKey = `${isStarred}|${!isRadio && queueManager?.shuffle}|${!isRadio ? queueManager?.repeat : ''}|${isEqCustom}|${Boolean(audioEngine.muted)}`;
    if (chipsKey === lastChipsKey) return;
    lastChipsKey = chipsKey;

    chipsContainer.innerHTML = '';

    // Star chip
    if (isStarred) {
      const starChip = document.createElement('button');
      starChip.type = 'button';
      starChip.className = 'stage-chip stage-chip-star active';
      starChip.setAttribute('data-chip', 'star');
      starChip.setAttribute('aria-label', 'Toggle favorite');
      starChip.textContent = '[★]';
      starChip.addEventListener('click', handleArtworkDoubleTap);
      chipsContainer.appendChild(starChip);
    }

    // Shuffle chip (Local only)
    if (!audioEngine.isRadio && queueManager && queueManager.shuffle) {
      const shuffleChip = document.createElement('button');
      shuffleChip.type = 'button';
      shuffleChip.className = 'stage-chip stage-chip-shuffle active';
      shuffleChip.setAttribute('data-chip', 'shuffle');
      shuffleChip.setAttribute('aria-label', 'Toggle shuffle');
      shuffleChip.textContent = '[SHUFFLE]';
      shuffleChip.addEventListener('click', () => {
        if (typeof queueManager.toggleShuffle === 'function') {
          queueManager.toggleShuffle();
          updateStatusChips();
          deps.onToast?.(queueManager.shuffle ? '[SHUFFLE ON]' : '[SHUFFLE OFF]');
        }
      });
      chipsContainer.appendChild(shuffleChip);
    }

    // Repeat chip (Local only)
    if (!audioEngine.isRadio && queueManager && queueManager.repeat && queueManager.repeat !== 'off') {
      const repeatChip = document.createElement('button');
      repeatChip.type = 'button';
      repeatChip.className = 'stage-chip stage-chip-repeat active';
      repeatChip.setAttribute('data-chip', 'repeat');
      repeatChip.setAttribute('aria-label', 'Cycle repeat');
      repeatChip.textContent = queueManager.repeat === 'one' ? '[REPEAT ONE]' : '[REPEAT ALL]';
      repeatChip.addEventListener('click', () => {
        if (typeof queueManager.cycleRepeat === 'function') {
          const mode = queueManager.cycleRepeat();
          updateStatusChips();
          deps.onToast?.(`[REPEAT ${mode.toUpperCase()}]`);
        }
      });
      chipsContainer.appendChild(repeatChip);
    }

    // Equalizer chip
    if (isEqCustom) {
      const eqChip = document.createElement('button');
      eqChip.type = 'button';
      eqChip.className = 'stage-chip stage-chip-eq active';
      eqChip.setAttribute('data-chip', 'eq');
      eqChip.setAttribute('aria-label', 'Equalizer custom');
      eqChip.textContent = '[EQ]';
      eqChip.addEventListener('click', () => {
        deps.onOpenOverflow?.();
      });
      chipsContainer.appendChild(eqChip);
    }

    // Muted chip
    if (audioEngine.muted) {
      const mutedChip = document.createElement('button');
      mutedChip.type = 'button';
      mutedChip.className = 'stage-chip stage-chip-muted active';
      mutedChip.setAttribute('data-chip', 'muted');
      mutedChip.setAttribute('aria-label', 'Unmute audio');
      mutedChip.textContent = '[MUTED]';
      mutedChip.addEventListener('click', () => {
        if (typeof audioEngine.toggleMute === 'function') {
          audioEngine.toggleMute();
          updateStatusChips();
          deps.onToast?.('[UNMUTED]');
        }
      });
      chipsContainer.appendChild(mutedChip);
    }
  }

  function renderRadioStatusLine(streamState, isPlaying, bitrate) {
    let glyph = '●';
    let label = '[READY]';
    let colorVar = 'var(--text-secondary)';

    if (streamState === 'connecting') {
      glyph = '▲';
      label = '[CONNECTING]';
      colorVar = 'var(--accent-amber)';
    } else if (streamState === 'buffering') {
      glyph = '⏳';
      label = '[BUFFERING]';
      colorVar = 'var(--accent-amber)';
    } else if (streamState === 'error') {
      glyph = '✖';
      label = '[OFFLINE]';
      colorVar = 'var(--accent-rose)';
    } else if (streamState === 'playing' && isPlaying) {
      glyph = '●';
      label = `[LIVE] · ${bitrate || 128} kbps`;
      colorVar = 'var(--accent-cyan)';
    } else {
      glyph = '●';
      label = '[READY]';
      colorVar = 'var(--text-secondary)';
    }

    radioStatusEl.innerHTML = `
      <span class="status-glyph" style="color: ${colorVar}; margin-right: 6px;">${glyph}</span>
      <span class="status-label">${label}</span>
    `;
  }

  function updateArtwork(track, station, isRadio) {
    if (isRadio && station) {
      if (station.favicon) {
        artworkImg.src = station.favicon;
      } else if (typeof getStationFallbackArtwork === 'function') {
        artworkImg.src = getStationFallbackArtwork(station);
      } else {
        artworkImg.src = './public/icons/icon-192.svg';
      }
    } else if (track) {
      if (track.artwork && track.artwork.dataUrl) {
        artworkImg.src = track.artwork.dataUrl;
      } else if (track.artworkId && db && typeof db.getArtwork === 'function') {
        db.getArtwork(track.artworkId).then((art) => {
          if (art && art.thumbnailDataUrl) {
            artworkImg.src = art.thumbnailDataUrl;
          } else {
            artworkImg.src = './public/icons/icon-192.svg';
          }
        }).catch(() => {
          artworkImg.src = './public/icons/icon-192.svg';
        });
      } else {
        artworkImg.src = './public/icons/icon-192.svg';
      }
    } else {
      artworkImg.src = './public/icons/icon-192.svg';
    }
  }

  function syncState(state = {}) {
    const isRadio = state.isRadio !== undefined ? Boolean(state.isRadio) : Boolean(audioEngine.isRadio);
    const isPlaying = state.isPlaying !== undefined ? Boolean(state.isPlaying) : Boolean(audioEngine.isPlaying);
    const track = state.currentTrack !== undefined ? state.currentTrack : audioEngine.currentTrack;
    const station = state.currentStation !== undefined ? state.currentStation : audioEngine.currentStation;
    const currentTime = state.currentTime !== undefined ? state.currentTime : (audioEngine.currentTime || 0);
    const duration = state.duration !== undefined ? state.duration : (audioEngine.duration || 0);
    const streamState = state.streamState !== undefined ? state.streamState : (audioEngine.streamState || 'idle');

    if (isRadio && streamState === 'error' && lastStreamState !== undefined && lastStreamState !== 'error') {
      deps.onToast?.('[STREAM OFFLINE]');
    }
    lastStreamState = streamState;
    lastIsPlaying = isPlaying;

    // Transport button states
    playBtn.textContent = isPlaying ? '⏸' : '▶';
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');

    const hasMedia = Boolean((isRadio && station) || (!isRadio && track));
    prevBtn.disabled = !hasMedia;
    prevBtn.setAttribute('aria-disabled', String(!hasMedia));
    playBtn.disabled = !hasMedia;
    playBtn.setAttribute('aria-disabled', String(!hasMedia));
    nextBtn.disabled = !hasMedia;
    nextBtn.setAttribute('aria-disabled', String(!hasMedia));

    // Update Visualizer running state
    if (visualizerEnabled && visualizer) {
      if (!visualizer.isRunning && typeof visualizer.start === 'function') {
        visualizer.start();
      }
    }

    // Media changes (Title, Artwork, Star state)
    const currentMediaId = isRadio ? (station?.id || null) : (track?.id || null);
    const lastMediaId = lastIsRadio ? lastStationId : lastTrackId;

    if (currentMediaId !== lastMediaId || isRadio !== lastIsRadio) {
      lastIsRadio = isRadio;
      lastStationId = station?.id || null;
      lastTrackId = track?.id || null;

      updateArtwork(track, station, isRadio);

      if (isRadio && station) {
        titleEl.textContent = station.name || 'Internet Radio';
        subtitleEl.textContent = `${station.genre || 'Live Stream'} · ${station.country || 'Global'}`;
        isStarred = Boolean(station.isFavorite);
      } else if (!isRadio && track) {
        titleEl.textContent = track.title || track.filename || 'Unknown Title';
        subtitleEl.textContent = `${track.artist || 'Unknown Artist'} — ${track.album || 'Unknown Album'}`;
        isStarred = Boolean(track.isFavorite);
        if (db && typeof db.isFavorite === 'function') {
          db.isFavorite(track.id).then((fav) => {
            isStarred = Boolean(fav);
            updateStatusChips();
          }).catch(() => {});
        } else {
          isStarred = Boolean(track.isFavorite);
        }
      } else {
        titleEl.textContent = 'Nothing playing';
        subtitleEl.textContent = 'Open a local music folder or tune in to internet radio';
        isStarred = false;
      }
    }

    // Check Tier 2 Re-auth requirement
    const hasFSAA = checkFSAA();
    const needsReauth = !isRadio && track && !hasFSAA && !track.handle && (!sessionRegistry || !sessionRegistry.getFile(track.id));
    const sourceStateKey = `${needsReauth}|${hasMedia}|${isRadio}`;

    // Update Row 6 Source Bar Pills only when source state transitions
    if (sourceStateKey !== lastSourceStateKey) {
      lastSourceStateKey = sourceStateKey;

      if (needsReauth) {
        localPill.replaceChildren();
        const icon = document.createElement('span');
        icon.className = 'prompt-folder-icon';
        icon.textContent = '📁 ';
        localPill.appendChild(icon);
        const label = document.createElement('span');
        label.className = 'pill-label';
        label.textContent = 'Re-open music folder to play';
        localPill.appendChild(label);
        localPill.className = 'stage-source-pill stage-prompt-reauth';
        localPill.onclick = () => deps.onPickFolder?.();

        radioPill.replaceChildren();
        const rLabel = document.createElement('span');
        rLabel.className = 'pill-label';
        rLabel.textContent = 'Radio';
        radioPill.appendChild(rLabel);
        radioPill.className = 'stage-source-pill';
        radioPill.onclick = () => deps.onToggleSource?.();
      } else if (!hasMedia) {
        localPill.replaceChildren();
        const icon = document.createElement('span');
        icon.className = 'prompt-folder-icon';
        icon.textContent = '📁 ';
        localPill.appendChild(icon);
        const label = document.createElement('span');
        label.className = 'pill-label';
        label.textContent = 'Open music folder';
        localPill.appendChild(label);
        localPill.className = 'stage-source-pill';
        localPill.onclick = () => deps.onPickFolder?.();

        radioPill.replaceChildren();
        const rIcon = document.createElement('span');
        rIcon.className = 'prompt-radio-icon';
        rIcon.textContent = '📻 ';
        radioPill.appendChild(rIcon);
        const rLabel = document.createElement('span');
        rLabel.className = 'pill-label';
        rLabel.textContent = 'Listen to radio';
        radioPill.appendChild(rLabel);
        radioPill.className = 'stage-source-pill';
        radioPill.onclick = () => deps.onToggleSource?.();
      } else {
        localPill.replaceChildren();
        const label = document.createElement('span');
        label.className = 'pill-label';
        label.textContent = !isRadio ? '● Local' : 'Local';
        localPill.appendChild(label);
        localPill.className = `stage-source-pill ${!isRadio ? 'active' : ''}`;
        localPill.onclick = () => {
          if (isRadio) {
            deps.onToggleSource?.();
          } else {
            deps.onOpenBrowse?.('library');
          }
        };

        radioPill.replaceChildren();
        const rLabel = document.createElement('span');
        rLabel.className = 'pill-label';
        rLabel.textContent = isRadio ? '● Radio' : 'Radio';
        radioPill.appendChild(rLabel);
        radioPill.className = `stage-source-pill ${isRadio ? 'active' : ''}`;
        radioPill.onclick = () => {
          if (!isRadio) {
            deps.onToggleSource?.();
          } else {
            deps.onOpenBrowse?.('radio');
          }
        };
      }
    }

    // Row 4 (Timeline vs Radio Status Line)
    if (isRadio) {
      if (row4El.contains(seekSlider)) row4El.removeChild(seekSlider);
      if (row4El.contains(timestampsContainer)) row4El.removeChild(timestampsContainer);
      if (!row4El.contains(radioStatusEl)) row4El.appendChild(radioStatusEl);

      renderRadioStatusLine(streamState, isPlaying, station?.bitrate);
    } else {
      if (row4El.contains(radioStatusEl)) row4El.removeChild(radioStatusEl);
      if (!row4El.contains(seekSlider)) row4El.appendChild(seekSlider);
      if (!row4El.contains(timestampsContainer)) row4El.appendChild(timestampsContainer);

      seekSlider.max = String(Math.max(1, duration || 100));
      seekSlider.value = String(currentTime || 0);
      currentTimeEl.textContent = formatDuration(currentTime);
      remainingTimeEl.textContent = '-' + formatDuration(Math.max(0, (duration || 0) - currentTime));
    }

    // Chips update
    updateStatusChips();
  }

  // Subscribe to AudioEngine state updates
  if (typeof audioEngine.subscribe === 'function') {
    unsubscribeAudio = audioEngine.subscribe((state) => {
      syncState(state);
    });
  }

  // Subscribe to QueueManager updates
  if (queueManager && typeof queueManager.subscribe === 'function') {
    unsubscribeQueue = queueManager.subscribe(() => {
      updateStatusChips();
    });
  }

  // Initial synchronization
  syncState();

  function destroy() {
    if (typeof unsubscribeAudio === 'function') unsubscribeAudio();
    if (typeof unsubscribeQueue === 'function') unsubscribeQueue();
    if (typeof unbindArtworkGestures === 'function') unbindArtworkGestures();
    if (typeof unbindSourceBarGestures === 'function') unbindSourceBarGestures();
    if (visualizer && typeof visualizer.pause === 'function') {
      visualizer.pause();
    }
  }

  return {
    element: stageEl,
    destroy,
    setVisualizer,
    setVisualizerMode,
    isVisualizerEnabled: () => visualizerEnabled
  };
}
