/**
 * LocalJam - L1 Browse Sheet Component
 * One-screen unified music browser for local library and internet radio.
 * Provides segmented tabs, [+ Folder] action, chips, debounced search,
 * uniform 48px rows with drill-in navigation, queue semantics, star toggling,
 * accessible focus trap, and touch-scrolling gesture isolation.
 */

import { db as defaultDb } from '../../storage/db.js';
import { audioEngine as defaultAudioEngine } from '../../player/audio-engine.js';
import { queueManager as defaultQueueManager } from '../../player/queue.js';
import { escapeHtml } from '../../utils/sanitize.js';
import {
  loadStations,
  toggleFavoriteStation,
  HIGH_LEVEL_GENRES
} from '../../radio/stations.js';
import {
  buildLibraryRows,
  buildStationRows,
  filterStations
} from '../browse-model.js';
import { attachGestures } from '../gestures.js';

export const DEBOUNCE_DELAY_MS = 120;
export const STAR_DEDUPE_MS = 700;
const FOCUSABLE_SELECTOR = 'button, input, select, [tabindex]';

/**
 * Creates the L1 Browse Sheet modal/bottom-sheet component.
 *
 * @param {{
 *   onPlayTrack?: (track: object, visibleTracks: Array<object>, index: number) => void,
 *   onPlayStation?: (station: object, visibleStations: Array<object>) => void,
 *   onPickFolder?: () => void,
 *   onToast?: (message: string) => void,
 *   onClose?: () => void,
 *   db?: object,
 *   audioEngine?: object,
 *   queueManager?: object
 * }} [deps]
 * @returns {{
 *   element: HTMLElement,
 *   onOpen: (props?: object) => Promise<void>,
 *   onClose: () => void,
 *   focusFirst: () => void,
 *   destroy: () => void
 * }}
 */
export function createBrowseSheet(deps = {}) {
  const {
    onPlayTrack,
    onPlayStation,
    onPickFolder,
    onOpenFeedback,
    onToast,
    onClose: onParentClose,
    db = defaultDb,
    audioEngine = defaultAudioEngine,
    queueManager = defaultQueueManager,
    loadStations: loadStationsFn = loadStations
  } = deps;

  let activeTab = 'library';
  let libraryMode = 'songs';
  let libraryDrill = null;
  let radioGenre = 'All';
  let radioSort = 'default';
  let filterQuery = '';

  let cachedTracks = [];
  let cachedFavorites = [];
  let cachedHistory = [];
  let cachedStations = [];
  let visibleRows = [];

  let debounceTimer = null;
  let handleGestureUnbind = null;
  let sheetGestureUnbind = null;
  let rowGestureUnbinds = [];
  let openerEl = null;

  const sheetEl = document.createElement('div');
  sheetEl.className = 'browse-sheet';
  sheetEl.setAttribute('role', 'dialog');
  sheetEl.setAttribute('aria-modal', 'true');
  sheetEl.setAttribute('aria-label', 'Browse library and radio');

  // Hoist the drag handle outside the dynamically re-rendered header
  const dragHandleEl = document.createElement('div');
  dragHandleEl.className = 'sheet-drag-handle';
  dragHandleEl.setAttribute('aria-hidden', 'true');
  sheetEl.appendChild(dragHandleEl);

  const contentContainer = document.createElement('div');
  contentContainer.className = 'browse-sheet-content';
  sheetEl.appendChild(contentContainer);

  function cancelPendingFilter() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function onClose() {
    cancelPendingFilter();
    if (openerEl && typeof openerEl.focus === 'function') {
      try {
        openerEl.focus();
      } catch (err) {
        console.warn('[BrowseSheet] Failed to restore focus to opener:', err?.name, err?.message);
      }
    }
    if (typeof onParentClose === 'function') {
      onParentClose();
    }
    sheetEl.dispatchEvent(new CustomEvent('browse-sheet-close', { bubbles: true }));
    sheetEl.dispatchEvent(new CustomEvent('layer-close', { bubbles: true }));
  }

  function focusFirst() {
    const input = sheetEl.querySelector('.browse-filter-input');
    if (input && typeof input.focus === 'function') {
      input.focus();
    } else {
      const firstBtn = sheetEl.querySelector('button');
      if (firstBtn && typeof firstBtn.focus === 'function') {
        firstBtn.focus();
      }
    }
  }

  function exitDrillIn() {
    libraryDrill = null;
    cancelPendingFilter();
    renderAll();
  }

  async function loadData() {
    try {
      if (typeof db.getAllTracks === 'function') {
        cachedTracks = (await db.getAllTracks()) || [];
      }
    } catch (err) {
      console.error('[BrowseSheet] Error loading tracks:', err?.name, err?.message);
      cachedTracks = [];
    }

    try {
      if (typeof db.getFavorites === 'function') {
        cachedFavorites = (await db.getFavorites()) || [];
      }
    } catch (err) {
      console.error('[BrowseSheet] Error loading favorites:', err?.name, err?.message);
      cachedFavorites = [];
    }

    try {
      if (typeof db.getRecentHistory === 'function') {
        cachedHistory = (await db.getRecentHistory(50)) || [];
      }
    } catch (err) {
      console.error('[BrowseSheet] Error loading history:', err?.name, err?.message);
      cachedHistory = [];
    }

    try {
      if (typeof loadStationsFn === 'function') {
        cachedStations = (await loadStationsFn(db)) || [];
      } else if (typeof db.getStations === 'function') {
        cachedStations = (await db.getStations()) || [];
      }
    } catch (err) {
      console.error('[BrowseSheet] Error loading stations:', err?.name, err?.message);
      cachedStations = [];
    }
  }

  function updateRows() {
    if (activeTab === 'library') {
      visibleRows = buildLibraryRows({
        mode: libraryMode,
        tracks: cachedTracks,
        favorites: cachedFavorites,
        history: cachedHistory,
        drill: libraryDrill,
        query: filterQuery
      });
    } else {
      const filtered = filterStations(cachedStations, {
        genre: radioGenre,
        query: filterQuery,
        sort: radioSort
      });
      visibleRows = buildStationRows(filtered);
    }
  }

  function renderHeaderMarkup() {
    const isLibrary = activeTab === 'library';

    const tabHtml = `
      <div class="segmented-tabs" role="tablist">
        <button type="button" role="tab" class="tab-btn ${isLibrary ? 'active' : ''}" data-tab="library" aria-selected="${isLibrary ? 'true' : 'false'}">Library</button>
        <button type="button" role="tab" class="tab-btn ${!isLibrary ? 'active' : ''}" data-tab="radio" aria-selected="${!isLibrary ? 'true' : 'false'}">Radio</button>
      </div>
    `;

    const folderStyle = isLibrary ? '' : 'style="display:none;" aria-hidden="true"';
    const folderHtml = `
      <button type="button" class="browse-folder-btn" data-action="add-folder" aria-label="Add music folder" ${folderStyle}>+ Folder</button>
    `;

    const feedbackHtml = `
      <button type="button" class="browse-feedback-btn" data-action="feedback" aria-label="Diagnostics and feedback">Feedback</button>
    `;

    const filterPlaceholder = isLibrary ? 'Filter tracks...' : 'Filter stations...';
    const filterLabel = isLibrary ? 'Filter tracks' : 'Filter stations';
    const filterHtml = `
      <input type="search" class="browse-filter-input" placeholder="${filterPlaceholder}" aria-label="${filterLabel}" value="${escapeHtml(filterQuery)}" />
    `;

    const closeHtml = `
      <button type="button" class="browse-close-btn" data-action="close" aria-label="Close browse sheet">&times;</button>
    `;

    let chipsHtml = '';
    if (isLibrary) {
      if (libraryDrill) {
        const parentKindLabel = libraryDrill.kind === 'album' ? 'Albums' : 'Artists';
        const drillPrefix = libraryDrill.kind === 'album' ? 'Album' : 'Artist';
        chipsHtml = `
          <button type="button" class="chip browse-back-chip" data-action="back">&larr; Back to ${parentKindLabel}</button>
          <span class="browse-breadcrumb-tag">${drillPrefix}: ${escapeHtml(libraryDrill.name)}</span>
        `;
      } else {
        const modes = [
          { key: 'songs', label: 'Songs' },
          { key: 'albums', label: 'Albums' },
          { key: 'artists', label: 'Artists' },
          { key: 'starred', label: 'Starred' },
          { key: 'recent', label: 'Recent' }
        ];
        chipsHtml = modes
          .map(
            (m) => `
          <button type="button" class="chip ${libraryMode === m.key ? 'active' : ''}" data-mode="${m.key}">${m.label}</button>
        `
          )
          .join('');
      }
    } else {
      const favActive = radioGenre === 'Favorites' ? 'active' : '';
      const genreChips = HIGH_LEVEL_GENRES.map((g) => {
        const active = radioGenre === g ? 'active' : '';
        return `<button type="button" class="chip ${active}" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`;
      }).join('');

      const sortOptions = [
        { value: 'default', label: 'Default' },
        { value: 'popularity-desc', label: 'Popularity' },
        { value: 'provider', label: 'Provider' },
        { value: 'name-asc', label: 'Name (A-Z)' },
        { value: 'name-desc', label: 'Name (Z-A)' },
        { value: 'genre-asc', label: 'Genre' },
        { value: 'bitrate-desc', label: 'Bitrate' }
      ]
        .map(
          (opt) => `
        <option value="${opt.value}" ${radioSort === opt.value || (opt.value === 'popularity-desc' && radioSort === 'popularity') ? 'selected' : ''}>${opt.label}</option>
      `
        )
        .join('');

      chipsHtml = `
        <button type="button" class="chip ${favActive}" data-genre="Favorites" aria-label="Favorite stations">★</button>
        ${genreChips}
        <select class="browse-sort-select" aria-label="Sort stations">
          ${sortOptions}
        </select>
      `;
    }

    const listAriaLabel = isLibrary ? 'Tracks and albums' : 'Radio stations';

    return `
      <div class="browse-header">
        <div class="browse-header-row1">
          ${tabHtml}
          ${folderHtml}
          ${feedbackHtml}
          ${filterHtml}
          ${closeHtml}
        </div>
        <div class="browse-header-row2 browse-chips-bar" role="toolbar" aria-label="Browse categories">
          ${chipsHtml}
        </div>
      </div>
      <div class="browse-list-container">
        <div class="browse-list" role="listbox" aria-label="${listAriaLabel}"></div>
      </div>
    `;
  }

  function renderListRows() {
    const listEl = sheetEl.querySelector('.browse-list');
    if (!listEl) return;

    // Unbind any existing row gestures
    for (const fn of rowGestureUnbinds) {
      if (typeof fn === 'function') fn();
    }
    rowGestureUnbinds = [];

    if (visibleRows.length === 0) {
      const msg = filterQuery.trim()
        ? 'No matches found'
        : activeTab === 'library'
        ? 'No music in this view. Click [+ Folder] to add music.'
        : 'No radio stations found.';
      listEl.innerHTML = `
        <div class="browse-empty-state">
          <p>${escapeHtml(msg)}</p>
        </div>
      `;
      return;
    }

    const currentTrackId = audioEngine?.currentTrack?.id;
    const currentStationId = audioEngine?.currentStation?.id;
    const isRadioPlaying = Boolean(audioEngine?.isRadio);

    function renderRowHtml(row, idx) {
      const isPlaying =
        row.kind === 'track'
          ? !isRadioPlaying && currentTrackId && row.id === currentTrackId
          : row.kind === 'station'
          ? isRadioPlaying && currentStationId && row.id === currentStationId
          : false;

      const playingBar = isPlaying
        ? `<span class="browse-playing-bar" aria-hidden="true"></span><span class="sr-only">[PLAYING] </span>`
        : '';

      const providerBadge =
        row.kind === 'station'
          ? `<span class="browse-provider-badge">[${escapeHtml(row.provider || 'Independent')}]</span>`
          : '';

      return `
        <div class="browse-row ${isPlaying ? 'is-playing' : ''}" role="option" aria-selected="${isPlaying ? 'true' : 'false'}" tabindex="0" data-index="${idx}" data-id="${escapeHtml(row.id)}" data-primary="${escapeHtml(row.primary)}" data-kind="${row.kind}">
          ${playingBar}
          <div class="browse-row-main">
            <span class="browse-row-primary">${escapeHtml(row.primary)}</span>
            <span class="browse-row-secondary">${providerBadge ? `${providerBadge} ` : ''}${escapeHtml(row.secondary)}</span>
          </div>
          <span class="browse-row-trailing">${escapeHtml(row.trailing)}</span>
        </div>
      `;
    }

    if (activeTab === 'radio' && radioSort === 'provider') {
      const groupsMap = new Map();
      for (let idx = 0; idx < visibleRows.length; idx++) {
        const row = visibleRows[idx];
        const provider = row.provider || 'Independent';
        if (!groupsMap.has(provider)) {
          groupsMap.set(provider, []);
        }
        groupsMap.get(provider).push({ row, idx });
      }

      const groupsHtml = Array.from(groupsMap.entries())
        .map(([provider, items]) => {
          const count = items.length;
          const rowsInGroupHtml = items
            .map(({ row, idx }) => renderRowHtml(row, idx))
            .join('');

          return `
            <div class="browse-provider-group" role="group" aria-label="${escapeHtml(provider)} (${count} stations)">
              <div class="browse-section-header" aria-hidden="true">
                <span class="browse-section-title">${escapeHtml(provider)}</span>
                <span class="browse-section-count">${count}</span>
              </div>
              ${rowsInGroupHtml}
            </div>
          `;
        })
        .join('');

      listEl.innerHTML = groupsHtml;
    } else {
      const rowsHtml = visibleRows
        .map((row, idx) => renderRowHtml(row, idx))
        .join('');
      listEl.innerHTML = rowsHtml;
    }

    bindRowEvents();
  }

  function renderList() {
    updateRows();
    renderListRows();
  }

  function renderAll() {
    updateRows();
    contentContainer.innerHTML = renderHeaderMarkup();
    renderListRows();
    bindHeaderEvents();
  }

  function bindHeaderEvents() {
    // Tabs
    const tabButtons = sheetEl.querySelectorAll('.segmented-tabs .tab-btn');
    for (const btn of tabButtons) {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (targetTab && targetTab !== activeTab) {
          cancelPendingFilter();
          activeTab = targetTab;
          filterQuery = '';
          libraryDrill = null;
          if (typeof db.setSetting === 'function') {
            Promise.resolve(db.setSetting('browse.tab', activeTab)).catch((err) => {
              console.warn('[BrowseSheet] Failed to persist browse.tab:', err?.name, err?.message, { tab: activeTab });
            });
          }
          renderAll();
          focusFirst();
        }
      });
    }

    // [+ Folder]
    const folderBtn = sheetEl.querySelector('[data-action="add-folder"]');
    if (folderBtn) {
      folderBtn.addEventListener('click', () => {
        if (typeof onPickFolder === 'function') {
          onPickFolder();
        }
      });
    }

    // Feedback
    const feedbackBtn = sheetEl.querySelector('[data-action="feedback"]');
    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => {
        if (typeof onOpenFeedback === 'function') {
          onOpenFeedback();
        }
      });
    }

    // Close button
    const closeBtn = sheetEl.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        onClose();
      });
    }

    // Filter input
    const filterInput = sheetEl.querySelector('.browse-filter-input');
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        const val = e.target.value;
        cancelPendingFilter();
        debounceTimer = setTimeout(() => {
          filterQuery = val;
          updateRows();
          renderListRows();
        }, DEBOUNCE_DELAY_MS);
      });
    }

    // Library chips
    const modeChips = sheetEl.querySelectorAll('[data-mode]');
    for (const chip of modeChips) {
      chip.addEventListener('click', () => {
        const m = chip.getAttribute('data-mode');
        if (m) {
          libraryMode = m;
          libraryDrill = null;
          renderAll();
        }
      });
    }

    // Back chip (drill-in)
    const backBtn = sheetEl.querySelector('[data-action="back"]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        exitDrillIn();
      });
    }

    // Radio genre chips
    const genreChips = sheetEl.querySelectorAll('[data-genre]');
    for (const chip of genreChips) {
      chip.addEventListener('click', () => {
        const g = chip.getAttribute('data-genre');
        if (g) {
          radioGenre = g;
          renderAll();
        }
      });
    }

    // Radio sort select
    const sortSelect = sheetEl.querySelector('.browse-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        radioSort = e.target.value;
        updateRows();
        renderListRows();
      });
    }
  }

  async function handleRowStar(rowItem) {
    if (!rowItem || !rowItem.payload) return;

    try {
      if (rowItem.kind === 'track') {
        const track = rowItem.payload;
        let isFav = false;
        if (typeof db.toggleFavorite === 'function') {
          isFav = await db.toggleFavorite(track.id);
        }
        if (typeof db.getFavorites === 'function') {
          cachedFavorites = (await db.getFavorites()) || [];
        }
        const label = isFav ? `[STARRED] ${rowItem.primary}` : `[UNSTARRED] ${rowItem.primary}`;
        if (typeof onToast === 'function') {
          onToast(label);
        }
        if (libraryMode === 'starred') {
          renderList();
        }
      } else if (rowItem.kind === 'station') {
        const station = rowItem.payload;
        let isFav = false;
        if (typeof toggleFavoriteStation === 'function') {
          isFav = await toggleFavoriteStation(station.id, db);
        }
        if (typeof loadStationsFn === 'function') {
          cachedStations = (await loadStationsFn(db)) || [];
        }
        const label = isFav ? `[STARRED] ${rowItem.primary}` : `[UNSTARRED] ${rowItem.primary}`;
        if (typeof onToast === 'function') {
          onToast(label);
        }
        if (radioGenre === 'Favorites') {
          renderList();
        }
      }
    } catch (err) {
      console.error('[BrowseSheet] Failed to toggle favorite:', err?.name, err?.message, {
        kind: rowItem.kind,
        id: rowItem.id
      });
      if (typeof onToast === 'function') {
        onToast('[ERROR] Could not update star');
      }
    }
  }

  function handleRowActivate(rowItem) {
    if (!rowItem) return;

    if (rowItem.kind === 'album' || rowItem.kind === 'artist') {
      libraryDrill = { kind: rowItem.kind, name: rowItem.primary };
      cancelPendingFilter();
      filterQuery = '';
      renderAll();
      return;
    }

    if (rowItem.kind === 'track') {
      const visibleTracks = visibleRows
        .filter((r) => r.kind === 'track')
        .map((r) => r.payload);
      const index = visibleTracks.findIndex((t) => t.id === rowItem.payload.id);

      if (typeof onPlayTrack === 'function') {
        onPlayTrack(rowItem.payload, visibleTracks, index >= 0 ? index : 0);
      } else {
        if (queueManager && typeof queueManager.setQueue === 'function') {
          queueManager.setQueue(visibleTracks, index >= 0 ? index : 0);
        }
        if (audioEngine && typeof audioEngine.playTrack === 'function') {
          const current = queueManager?.getCurrentTrack?.() || rowItem.payload;
          audioEngine.playTrack(current);
        }
      }
      onClose();
      return;
    }

    if (rowItem.kind === 'station') {
      const visibleStations = visibleRows
        .filter((r) => r.kind === 'station')
        .map((r) => r.payload);

      if (typeof onPlayStation === 'function') {
        onPlayStation(rowItem.payload, visibleStations);
      } else {
        if (audioEngine && typeof audioEngine.setStationCatalog === 'function') {
          audioEngine.setStationCatalog(visibleStations);
        }
        if (audioEngine && typeof audioEngine.playRadio === 'function') {
          audioEngine.playRadio(rowItem.payload);
        }
      }
      onClose();
    }
  }

  function bindRowEvents() {
    const rowElements = sheetEl.querySelectorAll('.browse-row');
    for (const el of rowElements) {
      const idxStr = el.getAttribute('data-index');
      const rowItem = visibleRows[Number(idxStr)] || visibleRows.find((r) => String(r.id) === String(el.getAttribute('data-id')));
      if (!rowItem) continue;

      let lastStarAt = 0;
      const starOnce = () => {
        const now = Date.now();
        if (now - lastStarAt < STAR_DEDUPE_MS) return;
        lastStarAt = now;
        handleRowStar(rowItem);
      };

      // Click row (tap / click activates row, but swallow trailing click after long-press)
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (Date.now() - lastStarAt < STAR_DEDUPE_MS) return;
        handleRowActivate(rowItem);
      });

      // Contextmenu (right-click) to toggle favorite
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        starOnce();
      });

      // Long-press gesture for mobile touch starring
      if (typeof attachGestures === 'function') {
        rowGestureUnbinds.push(
          attachGestures(el, {
            onLongPress: () => {
              starOnce();
            }
          })
        );
      }

      // Keyboard navigation on row (Enter activates, 'f'/'F' stars)
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleRowActivate(rowItem);
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          starOnce();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const allRows = Array.from(sheetEl.querySelectorAll('.browse-row'));
          const curIdx = allRows.indexOf(el);
          if (curIdx >= 0 && curIdx < allRows.length - 1) {
            const next = allRows[curIdx + 1];
            if (next && typeof next.focus === 'function') next.focus();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const allRows = Array.from(sheetEl.querySelectorAll('.browse-row'));
          const curIdx = allRows.indexOf(el);
          if (curIdx > 0) {
            const prev = allRows[curIdx - 1];
            if (prev && typeof prev.focus === 'function') prev.focus();
          }
        } else if (e.key === 'Home') {
          e.preventDefault();
          const first = sheetEl.querySelector('.browse-row');
          if (first && typeof first.focus === 'function') {
            first.focus();
          }
        } else if (e.key === 'End') {
          e.preventDefault();
          const allRows = sheetEl.querySelectorAll('.browse-row');
          if (allRows.length > 0) {
            const last = allRows[allRows.length - 1];
            if (last && typeof last.focus === 'function') {
              last.focus();
            }
          }
        }
      });
    }
  }

  // Keyboard focus trap & Escape navigation on dialog
  sheetEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const items = Array.from(sheetEl.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.disabled && !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1' && el.style.display !== 'none' && el.getAttribute('aria-hidden') !== 'true'
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = typeof document !== 'undefined' ? document.activeElement : null;

      if (e.shiftKey && (active === first || !sheetEl.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (libraryDrill) {
        exitDrillIn();
      } else {
        onClose();
      }
    }
  });

  // Gestures: swipe-down to dismiss is bound specifically to the drag handle
  if (typeof attachGestures === 'function') {
    handleGestureUnbind = attachGestures(dragHandleEl, {
      onSwipeDown: () => {
        onClose();
      }
    });

    // Horizontal swipe right leaves drill-in view
    sheetGestureUnbind = attachGestures(sheetEl, {
      onSwipeRight: () => {
        if (libraryDrill) {
          exitDrillIn();
        }
      }
    });
  }

  return {
    element: sheetEl,
    async onOpen(props = {}) {
      cancelPendingFilter();
      filterQuery = '';
      libraryDrill = null;
      activeTab = props.tab || (await db.getSetting?.('browse.tab')) || 'library';
      openerEl = props.openerEl || (typeof document !== 'undefined' ? document.activeElement : null);
      await loadData();
      renderAll();
    },
    onClose,
    focusFirst,
    destroy() {
      cancelPendingFilter();
      if (typeof handleGestureUnbind === 'function') {
        handleGestureUnbind();
        handleGestureUnbind = null;
      }
      if (typeof sheetGestureUnbind === 'function') {
        sheetGestureUnbind();
        sheetGestureUnbind = null;
      }
      for (const fn of rowGestureUnbinds) {
        if (typeof fn === 'function') fn();
      }
      rowGestureUnbinds = [];
    }
  };
}
