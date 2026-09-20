/**
 * LocalJam - Main Application Bootstrapper (Minimalist One-Screen Redesign)
 */

import { db } from './storage/db.js';
import { audioEngine } from './player/audio-engine.js';
import { queueManager } from './player/queue.js';
import { equalizer } from './player/equalizer.js';
import { keyboardManager } from './ui/keyboard.js';
import { createStage } from './ui/stage.js';
import { layers } from './ui/layers.js';
import { createBrowseSheet } from './ui/components/browse-sheet.js';
import { createOverflowMenu } from './ui/components/overflow-menu.js';
import { createToastHost, showToast } from './ui/components/toast.js';
import { pickFolder, rescan } from './ui/library-source.js';
import { loadStations, CURATED_STATIONS, toggleFavoriteStation } from './radio/stations.js';
import { createEqModal } from './ui/components/eq-modal.js';
import { createReleaseNotesModal } from './ui/components/release-notes-modal.js';
import { createFeedbackModal } from './ui/components/feedback-modal.js';
import { createUpdateBanner, initUpdateChecker } from './ui/components/update-banner.js';
import { APP_VERSION } from './version.js';
import { recordDiagnosticError } from './utils/diagnostics.js';

let lastStation = null;
let lastTrack = null;

/**
 * Hydrates audioEngine and queueManager on cold start from IndexedDB playbackState.
 * Ensures the Stage displays playable media immediately on launch (1-tap resume).
 *
 * @param {object} [deps]
 * @returns {Promise<{type:'radio'|'track', station?:object, track?:object}|null>}
 */
export async function hydratePlaybackState(deps = {}) {
  const database = deps.db || db;
  const engine = deps.audioEngine || audioEngine;
  const queue = deps.queueManager || queueManager;

  let savedState = null;
  if (database && typeof database.getPlaybackState === 'function') {
    try {
      savedState = await database.getPlaybackState();
    } catch (err) {
      console.warn('[LocalJam] Failed to load playback state from DB:', err?.message || err);
    }
  }

  // Restore volume and mute if saved
  if (savedState && typeof savedState.volume === 'number') {
    engine.volume = savedState.volume;
    if (typeof engine.setVolume === 'function') {
      engine.setVolume(savedState.volume);
    }
  }
  if (savedState && typeof savedState.muted === 'boolean') {
    engine.muted = savedState.muted;
  }
  if (savedState && typeof savedState.shuffle === 'boolean' && queue) {
    queue.shuffle = savedState.shuffle;
  }
  if (savedState && typeof savedState.repeat === 'string' && queue) {
    queue.repeat = savedState.repeat;
  }

  // Force paused on cold start (never auto-play)
  engine.isPlaying = false;

  // Radio saved state branch
  if (savedState?.isRadio) {
    let station = savedState.currentStation || null;
    const stationId = savedState.stationId || station?.id;
    if (!station && stationId) {
      let stations = [];
      if (deps.stations) {
        stations = deps.stations;
      } else {
        try {
          stations = await loadStations(database);
        } catch {
          stations = CURATED_STATIONS;
        }
      }
      station = stations.find((s) => s.id === stationId) || { id: stationId, name: 'Radio Station' };
    }

    // Automatic migration for decommissioned BBC 6 Music stream
    if (station?.id === 'bbc_radio_6' || station?.streamUrl?.includes('bbc_6music') || stationId === 'bbc_radio_6') {
      let stations = [];
      if (deps.stations) {
        stations = deps.stations;
      } else {
        try {
          stations = await loadStations(database);
        } catch {
          stations = CURATED_STATIONS;
        }
      }
      const ntsStation = stations.find((s) => s.id === 'nts_radio_1') || CURATED_STATIONS.find((s) => s.id === 'nts_radio_1');
      if (ntsStation) {
        station = ntsStation;
        if (database && typeof database.savePlaybackState === 'function') {
          database.savePlaybackState({ ...savedState, stationId: ntsStation.id, currentStation: ntsStation }).catch(() => {});
        }
      }
    }

    if (station) {
      engine.isRadio = true;
      engine.currentStation = station;
      engine.currentTrack = null;
      engine.streamState = 'idle';
      lastStation = station;
      if (typeof engine.notifyState === 'function') {
        engine.notifyState();
      }
      return { type: 'radio', station };
    }
  }

  // Track saved state or local track branch
  let allTracks = [];
  if (database && typeof database.getAllTracks === 'function') {
    try {
      allTracks = (await database.getAllTracks()) || [];
    } catch {}
  }
  const availableTracks = allTracks.filter((t) => !t.isMissing);

  let targetTrack = null;
  let targetIndex = 0;

  if (savedState && (savedState.trackId || savedState.currentTrack)) {
    const trackId = savedState.trackId || savedState.currentTrack.id;
    const foundIdx = availableTracks.findIndex((t) => t.id === trackId);
    if (foundIdx >= 0) {
      targetTrack = availableTracks[foundIdx];
      targetIndex = foundIdx;
    } else if (savedState.currentTrack) {
      targetTrack = savedState.currentTrack;
    }
  }

  // Fall back to first available local track if no saved track was matched
  if (!targetTrack && availableTracks.length > 0) {
    targetTrack = availableTracks[0];
    targetIndex = 0;
  }

  if (targetTrack) {
    engine.isRadio = false;
    engine.currentTrack = targetTrack;
    engine.currentStation = null;
    lastTrack = targetTrack;
    if (savedState && typeof savedState.currentTime === 'number') {
      engine.currentTime = savedState.currentTime;
    }
    if (savedState && typeof savedState.duration === 'number') {
      engine.duration = savedState.duration;
    } else if (targetTrack.duration) {
      engine.duration = targetTrack.duration;
    }
    if (queue && availableTracks.length > 0 && typeof queue.setQueue === 'function') {
      queue.setQueue(availableTracks, targetIndex);
    }
    if (typeof engine.notifyState === 'function') {
      engine.notifyState();
    }
    return { type: 'track', track: targetTrack };
  }

  // If no local tracks exist, fall back to first curated station (§6.1)
  let stations = [];
  if (deps.stations) {
    stations = deps.stations;
  } else {
    try {
      stations = await loadStations(database);
    } catch {
      stations = CURATED_STATIONS;
    }
  }
  if (stations && stations.length > 0) {
    const fallbackStation = stations[0];
    engine.isRadio = true;
    engine.currentStation = fallbackStation;
    engine.currentTrack = null;
    engine.streamState = 'idle';
    lastStation = fallbackStation;
    if (typeof engine.notifyState === 'function') {
      engine.notifyState();
    }
    return { type: 'radio', station: fallbackStation };
  }

  if (typeof engine.notifyState === 'function') {
    engine.notifyState();
  }
  return null;
}

/**
 * Switches active source between last-played Local track and last-played Radio station in 1 gesture.
 *
 * @param {object} [deps]
 */
export async function togglePlaybackSource(deps = {}) {
  const database = deps.db || db;
  const engine = deps.audioEngine || audioEngine;
  const queue = deps.queueManager || queueManager;
  const toast = deps.onToast || showToast;

  if (engine.isRadio) {
    if (engine.currentStation) {
      lastStation = engine.currentStation;
    }
    // Switch from Radio to Local Track
    let track = engine.currentTrack || (deps.lastTrack !== undefined ? deps.lastTrack : lastTrack) || queue?.getCurrent?.()?.track;
    let hasLocalTracks = false;
    if (database && typeof database.getAllTracks === 'function') {
      try {
        const allTracks = (await database.getAllTracks()) || [];
        const available = allTracks.filter((t) => !t.isMissing);
        if (available.length > 0) {
          hasLocalTracks = true;
          if (!track || !available.some((t) => t.id === track.id)) {
            track = null;
          }
          if (queue && typeof queue.setQueue === 'function') {
            queue.setQueue(available, track ? Math.max(0, available.findIndex((t) => t.id === track.id)) : 0);
          }
        } else {
          track = null;
        }
      } catch (err) {
        console.warn('[LocalJam] Error querying tracks during source toggle:', err?.message || err);
      }
    }
    if (track) {
      engine.isRadio = false;
      lastTrack = track;
      await engine.playTrack(track);
      toast('[SOURCE: LOCAL]');
    } else if (hasLocalTracks) {
      // Local tracks exist in library, but none was chosen yet:
      // pause radio, switch source, and open library browse sheet to let user choose
      if (typeof engine.pause === 'function') {
        engine.pause();
      }
      engine.isRadio = false;
      const openBrowse = deps.onOpenBrowse || ((tab) => layers?.open?.('browse', { tab }));
      if (typeof openBrowse === 'function') {
        openBrowse('library');
      }
      toast('[CHOOSE A TRACK]');
    } else {
      // Prompt user to pick a folder instead of merely showing [NO LOCAL TRACKS]
      const picker = deps.onPickFolder || pickFolder;
      let picked = false;
      try {
        picked = await picker();
      } catch (err) {
        console.warn('[LocalJam] Folder picker error during source toggle:', err?.message || err);
      }
      if (picked && database && typeof database.getAllTracks === 'function') {
        try {
          const freshTracks = (await database.getAllTracks()) || [];
          const freshAvailable = freshTracks.filter((t) => !t.isMissing);
          if (freshAvailable.length > 0) {
            if (queue && typeof queue.setQueue === 'function') {
              queue.setQueue(freshAvailable, 0);
            }
            track = freshAvailable[0];
            engine.isRadio = false;
            lastTrack = track;
            await engine.playTrack(track);
            toast('[SOURCE: LOCAL]');
            return;
          }
        } catch (err) {
          console.warn('[LocalJam] Error reading tracks after folder pick:', err?.message || err);
        }
      }
      toast('[NO LOCAL TRACKS]');
    }
  } else {
    if (engine.currentTrack) {
      lastTrack = engine.currentTrack;
    }
    // Switch from Local Track to Radio
    let station = engine.currentStation || deps.lastStation || lastStation;
    if (!station) {
      let stations = [];
      if (deps.stations) {
        stations = deps.stations;
      } else {
        try {
          stations = await loadStations(database);
        } catch {
          stations = CURATED_STATIONS;
        }
      }
      if (stations.length > 0) {
        station = stations[0];
      }
    }
    if (station) {
      lastStation = station;
      await engine.playRadio(station);
      toast('[SOURCE: RADIO]');
    } else {
      toast('[NO RADIO STATIONS]');
    }
  }
}

/**
 * Persists current playback state into IndexedDB.
 *
 * @param {object} state
 * @param {object} [customDb]
 */
export async function savePlaybackState(state, customDb = db) {
  if (!state || !customDb || typeof customDb.savePlaybackState !== 'function') return;
  return customDb.savePlaybackState({
    isRadio: Boolean(state.isRadio),
    stationId: state.currentStation?.id || state.stationId || null,
    currentStation: state.currentStation || null,
    trackId: state.currentTrack?.id || state.trackId || null,
    currentTrack: state.currentTrack || null,
    currentTime: typeof state.currentTime === 'number' ? state.currentTime : 0,
    duration: typeof state.duration === 'number' ? state.duration : 0,
    volume: typeof state.volume === 'number' ? state.volume : 1.0,
    muted: Boolean(state.muted),
    repeat: state.repeat || 'off',
    shuffle: Boolean(state.shuffle)
  });
}

/**
 * Initializes the LocalJam application shell.
 */
export async function initApp() {
  try {
    // 1. Initialize IndexedDB
    await db.init();

    // 2. Mount Toast Notification Host into #toast-root
    const toastRoot = document.getElementById('toast-root');
    if (toastRoot) {
      const toastHost = createToastHost();
      toastRoot.appendChild(toastHost.element);
    }

    // 3. Initialize Layer Controller into #layer-root
    const layerRoot = document.getElementById('layer-root');
    if (layerRoot) {
      layers.init(layerRoot);
    }

    // 4. Instantiate Modals and Register Layers
    const eqModal = createEqModal();
    layers.register('eq', () => {
      eqModal.element.style.display = 'flex';
      return {
        element: eqModal.element,
        onOpen: () => eqModal.open(),
        onClose: () => eqModal.close(),
        focusFirst: () => {
          const select = eqModal.element.querySelector('#eq-preset-select');
          if (select) select.focus();
        }
      };
    });

    const releaseNotesModal = createReleaseNotesModal();
    if (typeof window !== 'undefined') {
      window.localjamReleaseNotesModal = releaseNotesModal;
    }
    layers.register('notes', () => ({
      element: releaseNotesModal.element,
      onOpen: () => releaseNotesModal.open(),
      onClose: () => releaseNotesModal.close(),
      focusFirst: () => {
        const btn = releaseNotesModal.element.querySelector('#btn-done-release-notes') ||
                    releaseNotesModal.element.querySelector('#btn-close-release-notes');
        if (btn) btn.focus();
      }
    }));

    const feedbackModal = createFeedbackModal({
      onToast: (msg) => showToast(msg),
      db,
      audioEngine,
      queueManager,
      equalizer
    });
    layers.register('feedback', () => ({
      element: feedbackModal.element,
      onOpen: (props) => feedbackModal.open(props),
      onClose: () => feedbackModal.close(),
      focusFirst: () => feedbackModal.focusFirst?.()
    }));

    layers.register('browse', () => createBrowseSheet({
      onPlayTrack: (track, tracks, index) => {
        audioEngine.isRadio = false;
        lastTrack = track;
        queueManager.setQueue(tracks, index);
        audioEngine.playTrack(track);
      },
      onPlayStation: (station) => {
        lastStation = station;
        audioEngine.playRadio(station);
      },
      onPickFolder: async () => pickFolder(),
      onOpenFeedback: () => layers.open('feedback'),
      onToast: (msg) => showToast(msg),
      onClose: () => layers.close()
    }));

    let stageInstance = null;

    layers.register('overflow', () => createOverflowMenu({
      onOpenEq: () => layers.open('eq'),
      onOpenNotes: () => layers.open('notes'),
      onOpenFeedback: () => layers.open('feedback'),
      onPickFolder: async () => pickFolder(),
      onRescan: async () => rescan(),
      onReset: async () => {
        audioEngine.pause();
      },
      onToggleVisualizer: () => {
        if (stageInstance) {
          const isViz = typeof stageInstance.isVisualizerEnabled === 'function'
            ? stageInstance.isVisualizerEnabled()
            : !stageInstance.element.querySelector('.stage-visualizer-canvas')?.hidden;
          const nextViz = !isViz;
          stageInstance.setVisualizer(nextViz);
          showToast(`[VIZ ${nextViz ? 'ON' : 'OFF'}]`);
        }
      },
      onToast: (msg) => showToast(msg),
      onClose: () => layers.close()
    }));

    // 5. Create and Mount Stage Viewport into #stage-root
    const stageRoot = document.getElementById('stage-root');
    if (stageRoot) {
      stageInstance = createStage({
        onOpenBrowse: (tab) => layers.open('browse', { tab }),
        onOpenOverflow: () => layers.open('overflow'),
        onOpenFeedback: () => layers.open('feedback'),
        onPickFolder: async () => pickFolder(),
        onToggleSource: async () => togglePlaybackSource({ onOpenBrowse: (tab) => layers.open('browse', { tab }) }),
        onToast: (msg) => showToast(msg)
      });
      stageRoot.appendChild(stageInstance.element);
    }

    // 6. Initialize Global Keyboard Navigation
    keyboardManager.init({
      audioEngine,
      queueManager,
      layers,
      onToast: (msg) => showToast(msg),
      onToggleSource: () => togglePlaybackSource({ onOpenBrowse: (tab) => layers.open('browse', { tab }) }),
      onToggleVisualizer: () => {
        if (stageInstance) {
          const isViz = typeof stageInstance.isVisualizerEnabled === 'function'
            ? stageInstance.isVisualizerEnabled()
            : !stageInstance.element.querySelector('.stage-visualizer-canvas')?.hidden;
          const nextViz = !isViz;
          stageInstance.setVisualizer(nextViz);
          showToast(`[VIZ ${nextViz ? 'ON' : 'OFF'}]`);
        }
      },
      onToggleFavorite: async () => {
        if (audioEngine.isRadio && audioEngine.currentStation) {
          const st = audioEngine.currentStation;
          const isFav = await toggleFavoriteStation(st.id, db);
          showToast(isFav ? `[STARRED] ${st.name}` : `[UNSTARRED] ${st.name}`);
          audioEngine.notifyState();
        } else if (audioEngine.currentTrack) {
          const trk = audioEngine.currentTrack;
          const isFav = await db.toggleFavorite(trk.id);
          showToast(isFav ? `[STARRED] ${trk.title}` : `[UNSTARRED] ${trk.title}`);
          audioEngine.notifyState();
        }
      }
    });

    // 7. Cold-Start Playback State Hydration (Ready/Paused in 1-Tap)
    await hydratePlaybackState();

    // 8. Debounced State Persistence (500ms)
    let persistTimer = null;
    audioEngine.subscribe((state) => {
      if (state.isRadio && state.currentStation) {
        lastStation = state.currentStation;
      } else if (!state.isRadio && state.currentTrack) {
        lastTrack = state.currentTrack;
      }
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        savePlaybackState(state).catch((err) => {
          console.warn('[LocalJam] Failed to persist playback state:', err?.message || err);
        });
      }, 500);
    });

    // 9. Global User Interaction Audio Unlock for Mobile & Desktop
    const unlockAudio = () => {
      if (audioEngine && typeof audioEngine.unlock === 'function') {
        audioEngine.unlock();
      }
    };
    ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'].forEach((evt) => {
      document.addEventListener(evt, unlockAudio, { passive: true });
    });

    // 10. Update Banner & Service Worker Lifecycle
    const updateBanner = createUpdateBanner();
    document.body.appendChild(updateBanner.element);

    let updateCheckerInstance = null;
    const handleUpdateReady = (newVersion, worker) => {
      updateBanner.show(newVersion, worker);
    };

    if (typeof fetch === 'function') {
      fetch(`./version.json?_t=${Date.now()}`, { cache: 'no-cache' })
        .then((res) => (res.ok ? res.json() : null))
        .then(async (verData) => {
          if (verData && verData.version) {
            if (typeof window !== 'undefined') {
              window.localjamRemoteVersionData = verData;
            }
            if (typeof releaseNotesModal?.updateVersion === 'function') {
              releaseNotesModal.updateVersion(verData);
            }
            if (verData.version !== APP_VERSION) {
              let worker = null;
              if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                try {
                  const reg = await navigator.serviceWorker.getRegistration();
                  if (reg) {
                    worker = reg.waiting || reg.installing || null;
                  }
                } catch {}
              }
              handleUpdateReady(verData.version, worker);
            }
          }
        })
        .catch((err) => {
          console.warn('[LocalJam] Could not fetch remote version.json:', err?.message || err);
        });
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        if (typeof window !== 'undefined' && window.location) {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('_t', Date.now().toString());
            window.location.replace(url.toString());
          } catch {
            window.location.reload();
          }
        }
      });

      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('./sw.js')
          .then((reg) => {
            console.log('[SW] ServiceWorker registered with scope:', reg.scope);
            if (typeof reg.update === 'function') {
              reg.update().catch(() => {});
            }
            updateCheckerInstance = initUpdateChecker({
              registration: reg,
              currentVersion: APP_VERSION,
              onUpdateReady: handleUpdateReady
            });
          })
          .catch((err) => {
            console.warn('[SW] ServiceWorker registration failed:', err);
            updateCheckerInstance = initUpdateChecker({
              currentVersion: APP_VERSION,
              onUpdateReady: handleUpdateReady
            });
          });
      });
    } else {
      updateCheckerInstance = initUpdateChecker({
        currentVersion: APP_VERSION,
        onUpdateReady: handleUpdateReady
      });
    }
  } catch (err) {
    console.error('[LocalJam] Initialization failure:', err);
    recordDiagnosticError(err, 'App bootstrap failure');
  }
}

// Global runtime diagnostic error listeners
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    recordDiagnosticError(event.error || event.message, 'Uncaught window error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordDiagnosticError(event.reason, 'Unhandled promise rejection');
  });
}

// Auto-boot when loaded in browser
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
