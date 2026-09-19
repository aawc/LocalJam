/**
 * LocalJam - L2 Overflow Menu Component
 * Compact popover (desktop) and bottom sheet (mobile) providing secondary controls:
 * Star, Shuffle, Repeat, Volume slider, Equalizer sheet trigger, Visualizer modes,
 * Folder import, Library rescan, Release notes modal trigger, and destructive Library reset.
 */

import { db as defaultDb } from '../../storage/db.js';
import { audioEngine as defaultAudioEngine } from '../../player/audio-engine.js';
import { queueManager as defaultQueueManager } from '../../player/queue.js';
import { audioVisualizer as defaultVisualizer } from '../../visualizer/visualizer.js';
import { equalizer as defaultEqualizer } from '../../player/equalizer.js';
import { toggleFavoriteStation } from '../../radio/stations.js';
import { APP_VERSION } from '../../version.js';
import { escapeHtml } from '../../utils/sanitize.js';
import { attachGestures } from '../gestures.js';

/**
 * The verified object-store list from §4.3.1.
 * Guaranteed to match db.js schema and exclude 'stations' to preserve radio favorites.
 */
export const RESET_STORE_NAMES = [
  'roots', 'tracks', 'artwork', 'playlists',
  'favorites', 'playHistory', 'playbackState', 'settings'
];

/**
 * Creates the L2 Overflow Menu component.
 *
 * @param {{
 *   onOpenEq?: () => void,
 *   onOpenNotes?: () => void,
 *   onPickFolder?: () => void,
 *   onRescan?: () => void,
 *   onReset?: () => Promise<void>|void,
 *   onToggleVisualizer?: () => void,
 *   onToast?: (message: string) => void,
 *   onClose?: () => void,
 *   db?: object,
 *   audioEngine?: object,
 *   queueManager?: object,
 *   visualizer?: object,
 *   equalizer?: object
 * }} [deps]
 * @returns {{
 *   element: HTMLElement,
 *   onOpen: (props?: object) => Promise<void>|void,
 *   onClose: () => void,
 *   focusFirst: () => void
 * }}
 */
export function createOverflowMenu(deps = {}) {
  const {
    onOpenEq,
    onOpenNotes,
    onPickFolder,
    onRescan,
    onReset,
    onToggleVisualizer,
    onToast,
    onClose,
    db = defaultDb,
    audioEngine = defaultAudioEngine,
    queueManager = defaultQueueManager,
    visualizer = defaultVisualizer,
    equalizer = defaultEqualizer
  } = deps;

  let openerEl = null;
  let isRadio = false;
  let currentTrack = null;
  let currentStation = null;
  let isStarred = false;
  let shuffle = false;
  /** @type {'off'|'all'|'one'} */
  let repeat = 'off';
  let volume = 1;
  let muted = false;
  let isEqCustom = false;
  let visualizerMode = 'bars';
  let visualizerRunning = false;
  let trackCount = 0;

  const sheetEl = document.createElement('div');
  sheetEl.className = 'overflow-sheet-layer layer-overlay';
  sheetEl.setAttribute('role', 'dialog');
  sheetEl.setAttribute('aria-modal', 'true');
  sheetEl.setAttribute('aria-label', 'More options and settings');
  sheetEl.hidden = true;

  const backdropEl = document.createElement('div');
  backdropEl.className = 'sheet-backdrop';
  sheetEl.appendChild(backdropEl);

  const panelEl = document.createElement('div');
  panelEl.className = 'overflow-panel sheet-panel';
  sheetEl.appendChild(panelEl);

  const dragHandle = document.createElement('div');
  dragHandle.className = 'sheet-drag-handle';
  dragHandle.setAttribute('role', 'button');
  dragHandle.setAttribute('aria-label', 'Drag down to dismiss');
  dragHandle.setAttribute('tabindex', '0');
  panelEl.appendChild(dragHandle);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'overflow-close-btn';
  closeBtn.setAttribute('aria-label', 'Close overflow menu');
  closeBtn.textContent = '✕';
  panelEl.appendChild(closeBtn);

  const contentEl = document.createElement('div');
  contentEl.className = 'overflow-content';
  panelEl.appendChild(contentEl);

  function getVisualizerStateText() {
    if (!visualizerRunning) return '[OFF]';
    return `[ON — ${visualizerMode.toUpperCase()}]`;
  }

  function getEqStateText() {
    return isEqCustom ? '[CUSTOM]' : '[FLAT]';
  }

  function getStarStateText() {
    return isStarred ? '[STARRED]' : '[NOT STARRED]';
  }

  function getVolumeStateText() {
    if (muted) return '[MUTED]';
    return `[${Math.round(volume * 100)}%]`;
  }

  function renderMarkup() {
    contentEl.innerHTML = `
      <div class="overflow-list" role="menu">
        <button type="button" class="overflow-row" data-action="star" role="menuitem">
          <span class="overflow-label">Star</span>
          <span class="overflow-state">${getStarStateText()}</span>
        </button>

        ${!isRadio ? `
        <button type="button" class="overflow-row" data-action="shuffle" role="menuitem">
          <span class="overflow-label">Shuffle</span>
          <span class="overflow-state">${shuffle ? '[ON]' : '[OFF]'}</span>
        </button>

        <button type="button" class="overflow-row" data-action="repeat" role="menuitem">
          <span class="overflow-label">Repeat</span>
          <span class="overflow-state">[${repeat.toUpperCase()}]</span>
        </button>
        ` : ''}

        <div class="overflow-row overflow-volume-row">
          <label for="overflow-volume-slider" class="overflow-label">Volume</label>
          <input id="overflow-volume-slider" class="overflow-volume-slider" type="range" min="0" max="1" step="0.01" value="${volume}" aria-label="Volume">
          <button type="button" class="overflow-volume-toggle" aria-label="Toggle mute">
            <span class="overflow-state">${getVolumeStateText()}</span>
          </button>
        </div>

        <button type="button" class="overflow-row" data-action="eq" role="menuitem">
          <span class="overflow-label">Equalizer</span>
          <span class="overflow-state">${getEqStateText()}</span>
        </button>

        <button type="button" class="overflow-row" data-action="visualizer" role="menuitem">
          <span class="overflow-label">Visualizer</span>
          <span class="overflow-state">${getVisualizerStateText()}</span>
        </button>

        <hr class="overflow-divider" />

        <button type="button" class="overflow-row" data-action="pick-folder" role="menuitem">
          <span class="overflow-label">Add music folder…</span>
          <span class="overflow-state">[IMPORT]</span>
        </button>

        <button type="button" class="overflow-row" data-action="rescan" role="menuitem">
          <span class="overflow-label">Rescan library</span>
          <span class="overflow-state">[${trackCount} tracks]</span>
        </button>

        <button type="button" class="overflow-row" data-action="notes" role="menuitem">
          <span class="overflow-label">LocalJam ${escapeHtml(APP_VERSION)}</span>
          <span class="overflow-state">[RELEASE NOTES]</span>
        </button>

        <hr class="overflow-divider" />

        <button type="button" class="overflow-row overflow-row-destructive" data-action="reset" role="menuitem">
          <span class="overflow-label">Reset library</span>
          <span class="overflow-state">[DESTRUCTIVE]</span>
        </button>
      </div>
    `;

    bindEvents();
  }

  function updateRowState(action, text) {
    const btn = contentEl.querySelector(`[data-action="${action}"] .overflow-state`);
    if (btn) btn.textContent = text;
  }

  function bindEvents() {
    const starBtn = contentEl.querySelector('[data-action="star"]');
    if (starBtn) {
      starBtn.addEventListener('click', handleStar);
    }

    const shuffleBtn = contentEl.querySelector('[data-action="shuffle"]');
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', handleShuffle);
    }

    const repeatBtn = contentEl.querySelector('[data-action="repeat"]');
    if (repeatBtn) {
      repeatBtn.addEventListener('click', handleRepeat);
    }

    const volumeSlider = contentEl.querySelector('.overflow-volume-slider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          volume = val;
          if (muted) muted = false;
          if (audioEngine && typeof audioEngine.setVolume === 'function') {
            audioEngine.setVolume(val);
          }
          const stateSpan = contentEl.querySelector('.overflow-volume-toggle .overflow-state');
          if (stateSpan) stateSpan.textContent = getVolumeStateText();
        }
      });
    }

    const volumeToggle = contentEl.querySelector('.overflow-volume-toggle');
    if (volumeToggle) {
      volumeToggle.addEventListener('click', () => {
        if (audioEngine && typeof audioEngine.toggleMute === 'function') {
          audioEngine.toggleMute();
          muted = Boolean(audioEngine.muted);
        } else {
          muted = !muted;
        }
        const stateSpan = contentEl.querySelector('.overflow-volume-toggle .overflow-state');
        if (stateSpan) stateSpan.textContent = getVolumeStateText();
      });
    }

    const eqBtn = contentEl.querySelector('[data-action="eq"]');
    if (eqBtn) {
      eqBtn.addEventListener('click', () => {
        handleClose();
        if (typeof onOpenEq === 'function') onOpenEq();
      });
    }

    const vizBtn = contentEl.querySelector('[data-action="visualizer"]');
    if (vizBtn) {
      vizBtn.addEventListener('click', handleVisualizer);
    }

    const folderBtn = contentEl.querySelector('[data-action="pick-folder"]');
    if (folderBtn) {
      folderBtn.addEventListener('click', () => {
        handleClose();
        if (typeof onPickFolder === 'function') onPickFolder();
      });
    }

    const rescanBtn = contentEl.querySelector('[data-action="rescan"]');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => {
        handleClose();
        if (typeof onRescan === 'function') onRescan();
      });
    }

    const notesBtn = contentEl.querySelector('[data-action="notes"]');
    if (notesBtn) {
      notesBtn.addEventListener('click', () => {
        handleClose();
        if (typeof onOpenNotes === 'function') onOpenNotes();
      });
    }

    const resetBtn = contentEl.querySelector('[data-action="reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', handleReset);
    }
  }

  async function handleStar() {
    if (isRadio && currentStation) {
      try {
        let nowStarred = false;
        if (typeof toggleFavoriteStation === 'function') {
          nowStarred = await toggleFavoriteStation(currentStation.id, db);
        } else if (db && typeof db.toggleFavoriteStation === 'function') {
          nowStarred = await db.toggleFavoriteStation(currentStation.id);
        }
        isStarred = Boolean(nowStarred);
        if (currentStation) {
          currentStation.isFavorite = isStarred;
        }
        updateRowState('star', getStarStateText());
        if (typeof onToast === 'function') {
          onToast(isStarred ? `[STARRED] ${currentStation.name || 'Station'}` : `[UNSTARRED] ${currentStation.name || 'Station'}`);
        }
      } catch (err) {
        console.error('[Overflow] Failed to toggle station favorite', err);
      }
    } else if (currentTrack) {
      try {
        let nowStarred = false;
        if (db && typeof db.toggleFavorite === 'function') {
          nowStarred = await db.toggleFavorite(currentTrack.id);
        }
        isStarred = Boolean(nowStarred);
        updateRowState('star', getStarStateText());
        if (typeof onToast === 'function') {
          onToast(isStarred ? `[STARRED] ${currentTrack.title || 'Track'}` : `[UNSTARRED] ${currentTrack.title || 'Track'}`);
        }
      } catch (err) {
        console.error('[Overflow] Failed to toggle track favorite', err);
      }
    } else {
      if (typeof onToast === 'function') {
        onToast('[INFO] Nothing playing to star');
      }
    }
  }

  function handleShuffle() {
    if (queueManager && typeof queueManager.toggleShuffle === 'function') {
      const nowShuffle = queueManager.toggleShuffle();
      shuffle = Boolean(nowShuffle);
    } else {
      shuffle = !shuffle;
    }
    updateRowState('shuffle', shuffle ? '[ON]' : '[OFF]');
    if (typeof onToast === 'function') {
      onToast(shuffle ? '[SHUFFLE ON]' : '[SHUFFLE OFF]');
    }
  }

  function handleRepeat() {
    if (queueManager && typeof queueManager.cycleRepeat === 'function') {
      repeat = queueManager.cycleRepeat();
    } else {
      if (repeat === 'off') repeat = 'all';
      else if (repeat === 'all') repeat = 'one';
      else repeat = 'off';
    }
    updateRowState('repeat', `[${repeat.toUpperCase()}]`);
    if (typeof onToast === 'function') {
      onToast(`[REPEAT ${repeat.toUpperCase()}]`);
    }
  }

  function handleVisualizer() {
    if (typeof onToggleVisualizer === 'function') {
      onToggleVisualizer();
      if (visualizer) {
        visualizerRunning = Boolean(visualizer.isRunning);
        if (visualizer.mode) visualizerMode = visualizer.mode;
      }
    } else if (visualizer) {
      const modes = ['bars', 'wave', 'nebula', 'starfield'];
      if (!visualizer.isRunning) {
        visualizer.mode = 'bars';
        visualizer.isRunning = true;
        if (typeof visualizer.start === 'function') visualizer.start();
        visualizerRunning = true;
        visualizerMode = 'bars';
        if (typeof onToast === 'function') onToast('[VISUALIZER BARS]');
      } else {
        const currIdx = modes.indexOf(visualizer.mode);
        if (currIdx < modes.length - 1) {
          const nextMode = modes[currIdx + 1];
          visualizer.mode = nextMode;
          if (typeof visualizer.setMode === 'function') visualizer.setMode(nextMode);
          visualizerRunning = true;
          visualizerMode = nextMode;
          if (typeof onToast === 'function') onToast(`[VISUALIZER ${nextMode.toUpperCase()}]`);
        } else {
          visualizer.isRunning = false;
          if (typeof visualizer.pause === 'function') visualizer.pause();
          visualizerRunning = false;
          if (typeof onToast === 'function') onToast('[VISUALIZER OFF]');
        }
      }
    }
    updateRowState('visualizer', getVisualizerStateText());
  }

  async function handleReset() {
    const confirmed = typeof globalThis.confirm === 'function'
      ? globalThis.confirm('Are you sure you want to reset your library? This will delete all imported tracks, artwork, and playback history. Radio favorites will be preserved.')
      : false;

    if (!confirmed) return;

    for (const storeName of RESET_STORE_NAMES) {
      try {
        if (db && typeof db.clearStore === 'function') {
          await db.clearStore(storeName);
        }
      } catch (err) {
        console.error('[Reset] Failed to clear store', storeName, err);
      }
    }

    if (typeof onReset === 'function') {
      try {
        await onReset();
      } catch (err) {
        console.error('[Reset] onReset callback failed', err);
      }
    }

    if (typeof onToast === 'function') {
      onToast('[RESET] Library cleared');
    }

    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
      try {
        window.location.reload();
      } catch (err) {
        console.warn('[Reset] window.location.reload failed', err);
      }
    }
  }

  function handleClose() {
    sheetEl.hidden = true;
    sheetEl.classList.remove('is-open');
    if (openerEl && typeof openerEl.focus === 'function') {
      try {
        openerEl.focus();
      } catch (err) {
        console.warn('[Overflow] Failed to restore opener focus', err);
      }
    }
    if (typeof onClose === 'function') {
      onClose();
    }
    sheetEl.dispatchEvent(new CustomEvent('layer-close', { bubbles: true }));
  }

  // Backdrops, close button, and drag handle gesture
  backdropEl.addEventListener('click', handleClose);
  closeBtn.addEventListener('click', handleClose);
  attachGestures(dragHandle, {
    onSwipeDown: handleClose
  });

  // Keyboard navigation & focus trap
  sheetEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      handleClose();
      return;
    }

    if (e.key === 'Tab') {
      const focusables = Array.from(
        sheetEl.querySelectorAll('button, input, select, [tabindex="0"]')
      ).filter(el => !el.disabled && el.style.display !== 'none' && !el.hidden);

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  function focusFirst() {
    const firstInteractive = panelEl.querySelector('button, input, select');
    if (firstInteractive && typeof firstInteractive.focus === 'function') {
      firstInteractive.focus();
    }
  }

  function onOpen(props = {}) {
    openerEl = props.openerEl || (typeof document !== 'undefined' ? document.activeElement : null);

    isRadio = props.isRadio !== undefined
      ? Boolean(props.isRadio)
      : Boolean(audioEngine?.isRadio);

    currentTrack = props.currentTrack !== undefined
      ? props.currentTrack
      : (audioEngine?.currentTrack || (queueManager?.getCurrentTrack ? queueManager.getCurrentTrack() : null));

    currentStation = props.currentStation !== undefined
      ? props.currentStation
      : (audioEngine?.currentStation || null);

    shuffle = props.shuffle !== undefined
      ? Boolean(props.shuffle)
      : Boolean(queueManager?.shuffle);

    repeat = props.repeat !== undefined
      ? props.repeat
      : (queueManager?.repeat || 'off');

    volume = props.volume !== undefined
      ? props.volume
      : (audioEngine?.volume !== undefined ? audioEngine.volume : 1);

    muted = props.muted !== undefined
      ? Boolean(props.muted)
      : Boolean(audioEngine?.muted);

    if (props.isEqCustom !== undefined) {
      isEqCustom = Boolean(props.isEqCustom);
    } else if (equalizer && Array.isArray(equalizer.gains)) {
      isEqCustom = equalizer.gains.some(g => g !== 0);
    } else {
      isEqCustom = false;
    }

    if (props.visualizerRunning !== undefined) {
      visualizerRunning = Boolean(props.visualizerRunning);
    } else if (visualizer) {
      visualizerRunning = Boolean(visualizer.isRunning);
    }

    if (props.visualizerMode !== undefined) {
      visualizerMode = props.visualizerMode;
    } else if (visualizer?.mode) {
      visualizerMode = visualizer.mode;
    }

    if (props.trackCount !== undefined) {
      trackCount = props.trackCount;
    }

    if (props.isStarred !== undefined) {
      isStarred = Boolean(props.isStarred);
    }

    // Synchronous initial render so DOM is populated immediately
    renderMarkup();

    sheetEl.hidden = false;
    sheetEl.classList.add('is-open');

    // Async updates in background if not supplied in props
    if (props.trackCount === undefined && db && typeof db.getAllTracks === 'function') {
      db.getAllTracks().then((all) => {
        trackCount = Array.isArray(all) ? all.length : 0;
        updateRowState('rescan', `[${trackCount} tracks]`);
      }).catch((err) => {
        if (err?.message?.includes('IndexedDB is not supported')) return;
        console.warn('[Overflow] Failed to retrieve track count', err);
      });
    }

    if (props.isStarred === undefined) {
      if (isRadio && currentStation) {
        isStarred = Boolean(currentStation.isFavorite);
        updateRowState('star', getStarStateText());
      } else if (!isRadio && currentTrack && db && typeof db.isFavorite === 'function') {
        db.isFavorite(currentTrack.id).then((fav) => {
          isStarred = Boolean(fav);
          updateRowState('star', getStarStateText());
        }).catch((err) => {
          if (err?.message?.includes('IndexedDB is not supported')) return;
          console.warn('[Overflow] Failed to check track star state', err);
        });
      }
    }
  }

  return {
    element: sheetEl,
    onOpen,
    onClose: handleClose,
    focusFirst
  };
}
