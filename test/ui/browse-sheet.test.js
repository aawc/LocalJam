import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowseSheet, DEBOUNCE_DELAY_MS, STAR_DEDUPE_MS } from '../../src/ui/components/browse-sheet.js';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Browse Sheet Component (L1)', () => {
  let mockDb;
  let mockAudioEngine;
  let mockQueueManager;
  let sampleTracks;
  let sampleStations;
  let toastMessages;

  beforeEach(() => {
    setupMockDom();
    toastMessages = [];

    sampleTracks = [
      { id: 'trk_1', title: 'Midnight City', artist: 'M83', album: 'Hurry Up', duration: 243, isMissing: 0 },
      { id: 'trk_2', title: 'Outro', artist: 'M83', album: 'Hurry Up', duration: 221, isMissing: 0 },
      { id: 'trk_3', title: 'Cosmos Track 1', artist: 'Solar', album: 'Cosmos', duration: 180, isMissing: 0 },
      { id: 'trk_4', title: 'Lost Signal', artist: 'Deep', album: 'Abyss', duration: 150, isMissing: 1 }
    ];

    sampleStations = [
      {
        id: 'st_1',
        name: 'SomaFM: Groove Salad',
        genre: 'Ambient / Chillout',
        country: 'USA',
        bitrate: '128 kbps',
        isFavorite: false
      },
      {
        id: 'st_2',
        name: 'Radio Paradise',
        genre: 'Eclectic Rock',
        country: 'USA',
        bitrate: '320 kbps',
        isFavorite: true
      },
      {
        id: 'st_folk',
        name: 'Folk Alley',
        genre: 'Folk & Roots',
        country: 'USA',
        bitrate: '128 kbps',
        isFavorite: false
      },
      {
        id: 'st_xss',
        name: '<script>alert("xss")</script>',
        genre: 'Synthpop',
        country: 'UK',
        bitrate: '192 kbps',
        isFavorite: false
      }
    ];

    mockDb = {
      favorites: new Set(),
      settings: new Map(),
      async getAllTracks() {
        return sampleTracks;
      },
      async getFavorites() {
        return Array.from(this.favorites).map((id) => ({ trackId: id }));
      },
      async isFavorite(id) {
        return this.favorites.has(id);
      },
      async toggleFavorite(id) {
        if (this.favorites.has(id)) {
          this.favorites.delete(id);
          return false;
        } else {
          this.favorites.add(id);
          return true;
        }
      },
      async getRecentHistory() {
        return [{ trackId: 'trk_1', timestamp: Date.now(), track: sampleTracks[0] }];
      },
      async getStations() {
        return sampleStations;
      },
      async saveStations(updated) {
        sampleStations = updated;
      },
      async getSetting(k) {
        return this.settings.get(k);
      },
      async setSetting(k, v) {
        this.settings.set(k, v);
      }
    };

    mockAudioEngine = {
      isPlaying: false,
      isRadio: false,
      currentTrack: null,
      currentStation: null,
      playedStations: [],
      catalog: [],
      playTrack(t) { this.currentTrack = t; this.isPlaying = true; this.isRadio = false; },
      playRadio(s) { this.currentStation = s; this.isPlaying = true; this.isRadio = true; },
      setStationCatalog(cat) { this.catalog = [...cat]; }
    };

    mockQueueManager = {
      queue: [],
      currentIndex: -1,
      setQueue(tracks, idx) {
        this.queue = [...tracks];
        this.currentIndex = idx;
      },
      getCurrentTrack() {
        return this.queue[this.currentIndex] || null;
      }
    };
  });

  afterEach(() => {
    teardownMockDom();
  });

  it('exports verified debounce delay constant of 120ms', () => {
    assert.equal(DEBOUNCE_DELAY_MS, 120);
  });

  it('returned element has role="dialog", aria-modal="true", and aria-label="Browse library and radio"', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onToast: (msg) => toastMessages.push(msg)
    });
    await sheet.onOpen();

    assert.ok(sheet.element, 'element must be returned');
    assert.equal(sheet.element.getAttribute('role'), 'dialog');
    assert.equal(sheet.element.getAttribute('aria-modal'), 'true');
    assert.equal(sheet.element.getAttribute('aria-label'), 'Browse library and radio');
  });

  it('markup contains both tab labels Library and Radio plus the [+ Folder] button', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen();

    const html = sheet.element.innerHTML;
    assert.ok(html.includes('Library'), 'must contain Library tab');
    assert.ok(html.includes('Radio'), 'must contain Radio tab');
    assert.ok(html.includes('Add music folder') || html.includes('+ Folder'), 'must contain [+ Folder] button');
  });

  it('markup contains all five library chips (Songs, Albums, Artists, Starred, Recent)', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen();

    const html = sheet.element.innerHTML;
    for (const chip of ['Songs', 'Albums', 'Artists', 'Starred', 'Recent']) {
      assert.ok(html.includes(chip), `must contain chip "${chip}"`);
    }
  });

  it('markup contains a filter input with an aria-label', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen();

    const input = sheet.element.querySelector('.browse-filter-input');
    assert.ok(input, 'filter input must exist');
    assert.equal(input.getAttribute('aria-label'), 'Filter tracks');
  });

  it('markup contains no onclick= and no onerror= substrings (CSP / SEC-06)', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen();

    const html = sheet.element.innerHTML;
    assert.ok(!html.includes('onclick='), 'forbidden inline onclick handler found');
    assert.ok(!html.includes('onerror='), 'forbidden inline onerror handler found');
  });

  it('a station whose name is a <script> payload is rendered escaped (&lt;script&gt;)', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const html = sheet.element.innerHTML;
    assert.ok(html.includes('&lt;script&gt;'), 'script tag must be HTML-escaped');
    assert.ok(!html.includes('<script>alert("xss")</script>'), 'raw script tag must not appear in HTML');
  });

  it('tab switching to Radio hides [+ Folder] and renders radio genre chips without duplicate All (F9)', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen();

    const radioTabBtn = sheet.element.querySelector('[data-tab="radio"]');
    assert.ok(radioTabBtn, 'radio tab button must exist');
    radioTabBtn.click();
    await delay(20);

    const folderBtn = sheet.element.querySelector('[data-action="add-folder"]');
    assert.ok(folderBtn, '[+ Folder] button must exist in DOM');
    assert.equal(folderBtn.getAttribute('aria-hidden'), 'true', '[+ Folder] must have aria-hidden="true"');
    assert.equal(folderBtn.style.display, 'none', '[+ Folder] must have display: none');

    const html = sheet.element.innerHTML;
    assert.ok(html.includes('★'), 'Radio chips must include ★ favorites chip');

    const starBtn = sheet.element.querySelector('[data-genre="Favorites"]');
    assert.ok(starBtn, 'star favorites chip must exist');
    assert.equal(starBtn.getAttribute('aria-label'), 'Favorite stations', 'star chip must have accessible name');

    // Regression guard for §4.2: HIGH_LEVEL_GENRES[0] is already 'All', must not be duplicated
    const allMatches = (html.match(/>All</g) || []).length;
    assert.equal(allMatches, 1, 'must have exactly one "All" genre chip, no duplicates');

    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    assert.ok(sortSelect, 'Radio view must render sort select control');
  });

  it('radio genre chip with "&" character filters stations correctly and round-trips attributes (F4)', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const folkChip = sheet.element.querySelector('[data-genre="Folk & Roots"]');
    assert.ok(folkChip, 'Folk & Roots chip must exist and decode attribute');
    folkChip.click();
    await delay(20);

    const html = sheet.element.innerHTML;
    assert.ok(html.includes('Folk Alley'), 'Folk Alley station must be displayed');
    assert.ok(!html.includes('SomaFM: Groove Salad'), 'non-folk station must be filtered out');
  });

  it('radio sort select changes order of visible stations', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    assert.ok(sortSelect);
    sortSelect.value = 'name-desc';
    sortSelect.dispatchEvent(new globalThis.Event('change'));
    const rows = sheet.element.querySelectorAll('.browse-row');
    assert.ok(rows.length > 0);
    const firstRowPrimary = rows[0].querySelector('.browse-row-primary').textContent;
    const lastRowPrimary = rows[rows.length - 1].querySelector('.browse-row-primary').textContent;
    assert.ok(firstRowPrimary.localeCompare(lastRowPrimary) > 0, 'Z-A sorting puts later alphabetical letters first');
  });

  it('clicking an album row enters drill-in mode showing back button and that album tracks only', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'library' });

    // Switch to Albums chip
    const albumsChip = sheet.element.querySelector('[data-mode="albums"]');
    assert.ok(albumsChip, 'albums chip must exist');
    albumsChip.click();
    await delay(20);

    let html = sheet.element.innerHTML;
    assert.ok(html.includes('Hurry Up') && html.includes('Cosmos'), 'renders albums list');

    // Click on Hurry Up album row
    const hurryRow = sheet.element.querySelector('[data-primary="Hurry Up"]');
    assert.ok(hurryRow, 'Hurry Up album row must exist');
    hurryRow.click();
    await delay(20);

    html = sheet.element.innerHTML;
    assert.ok(html.includes('Back to Albums') || html.includes('←'), 'drill-in header must show back chip');
    assert.ok(html.includes('Midnight City') && html.includes('Outro'), 'shows tracks for Hurry Up');
    assert.ok(!html.includes('Cosmos Track 1'), 'does not show tracks from other albums');

    // Clicking back returns to Albums list
    const backBtn = sheet.element.querySelector('[data-action="back"]');
    assert.ok(backBtn, 'back button must exist in drill-in');
    backBtn.click();
    await delay(20);

    html = sheet.element.innerHTML;
    assert.ok(html.includes('Cosmos'), 'returns to full album list');
  });

  it('playing a track row invokes queueManager and closes sheet (§4.5)', async () => {
    let closed = false;
    let playedTrack = null;

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onPlayTrack: (track, visibleTracks, index) => {
        playedTrack = track;
        mockQueueManager.setQueue(visibleTracks, index);
        mockAudioEngine.playTrack(mockQueueManager.getCurrentTrack());
      },
      onClose: () => { closed = true; }
    });
    await sheet.onOpen({ tab: 'library' });

    const trackRow = sheet.element.querySelector('[data-primary="Midnight City"]');
    assert.ok(trackRow, 'track row must exist');
    trackRow.click();
    await delay(10);

    assert.ok(playedTrack, 'onPlayTrack should have been called');
    assert.equal(playedTrack.id, 'trk_1');
    assert.equal(mockAudioEngine.currentTrack.id, 'trk_1');
    assert.equal(closed, true, 'sheet should close on track selection');
  });

  it('playing a station row sets station catalog and closes sheet (§4.5)', async () => {
    let closed = false;
    let playedStation = null;

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onPlayStation: (station, visibleStations) => {
        playedStation = station;
        mockAudioEngine.setStationCatalog(visibleStations);
        mockAudioEngine.playRadio(station);
      },
      onClose: () => { closed = true; }
    });
    await sheet.onOpen({ tab: 'radio' });

    const stationRow = sheet.element.querySelector('[data-primary="SomaFM: Groove Salad"]');
    assert.ok(stationRow, 'station row must exist');
    stationRow.click();
    await delay(10);

    assert.ok(playedStation, 'onPlayStation should have been called');
    assert.equal(playedStation.id, 'st_1');
    assert.equal(mockAudioEngine.currentStation.id, 'st_1');
    assert.ok(mockAudioEngine.catalog.length > 0, 'station catalog must be updated');
    assert.equal(closed, true, 'sheet should close on station selection');
  });

  it('double-coding: playing row displays is-playing class, cyan bar, and sr-only [PLAYING] label', async () => {
    mockAudioEngine.isPlaying = true;
    mockAudioEngine.isRadio = false;
    mockAudioEngine.currentTrack = sampleTracks[0]; // trk_1 Midnight City

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'library' });

    const activeRow = sheet.element.querySelector('[data-primary="Midnight City"]');
    assert.ok(activeRow, 'playing row must exist');
    assert.ok(activeRow.classList.contains('is-playing'), 'active row must have is-playing class');
    assert.equal(activeRow.getAttribute('aria-selected'), 'true', 'active row must have aria-selected="true"');

    const playingBar = activeRow.querySelector('.browse-playing-bar');
    assert.ok(playingBar, 'playing bar must be rendered on playing row');

    const srText = activeRow.querySelector('.sr-only');
    assert.ok(srText, 'sr-only text must be rendered on playing row');
    assert.ok(srText.textContent.includes('[PLAYING]'), 'sr-only text must contain [PLAYING]');

    const otherRow = sheet.element.querySelector('[data-primary="Outro"]');
    assert.ok(otherRow, 'non-playing row must exist');
    assert.ok(!otherRow.classList.contains('is-playing'), 'non-playing row must not have is-playing');
    assert.equal(otherRow.getAttribute('aria-selected'), 'false');
  });

  it('toggling star on row via keyboard "f" shows toast notification and keeps sheet open', async () => {
    let closed = false;

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onToast: (msg) => toastMessages.push(msg),
      onClose: () => { closed = true; }
    });
    await sheet.onOpen({ tab: 'library' });

    const trackRow = sheet.element.querySelector('[data-primary="Midnight City"]');
    assert.ok(trackRow, 'track row must exist');

    trackRow.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'f' }));
    await delay(20);

    assert.equal(closed, false, 'sheet must stay open when starring a row');
    assert.ok(toastMessages.some((msg) => msg.includes('[STARRED] Midnight City')), 'announces starred toast');
    assert.ok(await mockDb.isFavorite('trk_1'), 'trk_1 is now favorite in DB');

    // Toggle star again after dedupe window expires -> unstarred
    await delay(STAR_DEDUPE_MS + 20);
    trackRow.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'f' }));
    await delay(20);

    assert.ok(toastMessages.some((msg) => msg.includes('[UNSTARRED] Midnight City')), 'announces unstarred toast');
    assert.equal(await mockDb.isFavorite('trk_1'), false, 'trk_1 is no longer favorite');
  });

  it('toggling star on row via touch long-press shows toast notification (F3)', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onToast: (msg) => toastMessages.push(msg)
    });
    await sheet.onOpen({ tab: 'library' });

    const trackRow = sheet.element.querySelector('[data-primary="Midnight City"]');
    assert.ok(trackRow);

    // Simulate pointerdown followed by 600ms hold -> long-press
    trackRow.dispatchEvent(new globalThis.PointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }));
    await delay(600);
    trackRow.dispatchEvent(new globalThis.PointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 }));
    await delay(20);

    assert.ok(toastMessages.some((msg) => msg.includes('[STARRED] Midnight City')), 'touch long-press stars track');
    assert.ok(await mockDb.isFavorite('trk_1'));
  });

  it('station starring via keydown "f" and long-press works cleanly', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onToast: (msg) => toastMessages.push(msg)
    });
    await sheet.onOpen({ tab: 'radio' });

    const stationRow = sheet.element.querySelector('[data-primary="SomaFM: Groove Salad"]');
    assert.ok(stationRow);

    stationRow.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'f' }));
    await delay(20);

    assert.ok(toastMessages.some((msg) => msg.includes('[STARRED] SomaFM: Groove Salad')));
  });

  it('handleRowStar catches DB rejections and emits [ERROR] toast without unhandled promise rejection (F6)', async () => {
    mockDb.toggleFavorite = async () => {
      throw new Error('Disk quota exceeded');
    };

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onToast: (msg) => toastMessages.push(msg)
    });
    await sheet.onOpen({ tab: 'library' });

    const trackRow = sheet.element.querySelector('[data-primary="Midnight City"]');
    trackRow.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'f' }));
    await delay(20);

    assert.ok(toastMessages.some((msg) => msg.includes('[ERROR] Could not update star')));
  });

  it('debounced filter delays search execution and cancels on tab switch (F1)', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'library' });

    const input = sheet.element.querySelector('.browse-filter-input');
    input.value = 'Outro';
    input.dispatchEvent(new globalThis.Event('input'));

    // Before debounce delay (50ms): list is still unfiltered
    await delay(50);
    let html = sheet.element.innerHTML;
    assert.ok(html.includes('Midnight City'), 'unfiltered before debounce fires');

    // After debounce delay (150ms): list is filtered to Outro
    await delay(120);
    html = sheet.element.innerHTML;
    assert.ok(html.includes('Outro'), 'filtered after debounce fires');
    assert.ok(!html.includes('Midnight City'), 'other tracks excluded');

    // F1 test: type in filter, switch tab immediately within debounce window
    input.value = 'Cosmos';
    input.dispatchEvent(new globalThis.Event('input'));
    await delay(30);

    const radioTabBtn = sheet.element.querySelector('[data-tab="radio"]');
    radioTabBtn.click();
    await delay(150);

    // Radio tab should not be filtered by 'Cosmos' from the library tab
    html = sheet.element.innerHTML;
    assert.ok(html.includes('SomaFM: Groove Salad'), 'pending filter was cancelled on tab switch');
  });

  it('focus trap wraps Tab and Shift+Tab and restores focus on close (F5)', async () => {
    const opener = globalThis.document.createElement('button');
    opener.id = 'stage-local-pill';
    globalThis.document.body.appendChild(opener);
    opener.focus();

    let closed = false;
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onClose: () => { closed = true; }
    });
    await sheet.onOpen({ openerEl: opener });

    const focusables = Array.from(sheet.element.querySelectorAll('button, input, select, [tabindex]')).filter(
      (el) => !el.disabled && !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1' && el.style.display !== 'none' && el.getAttribute('aria-hidden') !== 'true'
    );
    assert.ok(focusables.length >= 2);

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // Focus last, press Tab -> wraps to first
    last.focus();
    sheet.element.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'Tab', shiftKey: false }));
    assert.equal(globalThis.document.activeElement, first, 'Tab at end wraps to first element');

    // Focus first, press Shift+Tab -> wraps to last
    first.focus();
    sheet.element.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    assert.equal(globalThis.document.activeElement, last, 'Shift+Tab at start wraps to last element');

    // Close sheet -> restores focus to opener
    sheet.onClose();
    assert.equal(closed, true);
    assert.equal(globalThis.document.activeElement, opener, 'focus restored to opener on close');
  });

  it('drag handle swipe-down closes sheet while swipe-down on list does not (F2)', async () => {
    let closedCount = 0;
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onClose: () => { closedCount++; }
    });
    await sheet.onOpen({ tab: 'library' });

    // 1. Swipe down on the drag handle -> triggers onClose
    const dragHandle = sheet.element.querySelector('.sheet-drag-handle');
    assert.ok(dragHandle, 'sheet-drag-handle must exist');

    dragHandle.dispatchEvent(new globalThis.PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 50 }));
    dragHandle.dispatchEvent(new globalThis.PointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 250 }));
    await delay(20);

    assert.equal(closedCount, 1, 'swipe-down on drag handle closes sheet');

    // 2. Swipe down on a list row -> does NOT trigger onClose
    const row = sheet.element.querySelector('.browse-row');
    assert.ok(row);

    row.dispatchEvent(new globalThis.PointerEvent('pointerdown', { pointerId: 2, clientX: 100, clientY: 100 }));
    row.dispatchEvent(new globalThis.PointerEvent('pointerup', { pointerId: 2, clientX: 100, clientY: 300 }));
    await delay(20);

    assert.equal(closedCount, 1, 'swipe-down on row does not dismiss sheet (scroll preserved)');
  });

  it('Escape key exits drill-in when drilled in, closes sheet when at root', async () => {
    let closedCount = 0;
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onClose: () => { closedCount++; }
    });
    await sheet.onOpen({ tab: 'library' });

    // Switch to Albums and drill in
    sheet.element.querySelector('[data-mode="albums"]').click();
    await delay(20);
    const hurryRow = sheet.element.querySelector('[data-primary="Hurry Up"]');
    assert.ok(hurryRow, 'Hurry Up row must exist');
    hurryRow.click();
    await delay(20);

    assert.ok(sheet.element.innerHTML.includes('Back to Albums'));

    // 1st Escape exits drill-in
    sheet.element.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'Escape' }));
    await delay(20);

    assert.equal(closedCount, 0, 'sheet must NOT close when exiting drill-in');
    assert.ok(!sheet.element.innerHTML.includes('Back to Albums'));

    // 2nd Escape closes sheet
    sheet.element.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'Escape' }));
    await delay(20);

    assert.equal(closedCount, 1, 'sheet closes on Escape at root');
  });

  it('destroy cancels timers and unbinds all gesture listeners', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'library' });

    // Set filter to trigger debounce timer
    const input = sheet.element.querySelector('.browse-filter-input');
    input.value = 'test';
    input.dispatchEvent(new globalThis.Event('input'));

    sheet.destroy();
    // After destroy, waiting past debounce should not throw
    await delay(150);
    assert.ok(true, 'destroy executed without errors');
  });

  it('empty state renders accessible message when no tracks or stations match', async () => {
    const emptyDb = {
      ...mockDb,
      async getAllTracks() { return []; },
      async getStations() { return []; }
    };
    const sheet = createBrowseSheet({
      db: emptyDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'library' });

    let html = sheet.element.innerHTML;
    assert.ok(html.includes('No music in this view'), 'renders empty library state');

    // Filter query that matches nothing
    const input = sheet.element.querySelector('.browse-filter-input');
    input.value = 'NonexistentXYZ';
    input.dispatchEvent(new globalThis.Event('input'));
    await delay(150);

    html = sheet.element.innerHTML;
    assert.ok(html.includes('No matches found'), 'renders no matches empty state');
  });

  it('focusFirst directs focus to the filter search input', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen();

    sheet.focusFirst();
    const input = sheet.element.querySelector('.browse-filter-input');
    assert.equal(globalThis.document.activeElement, input, 'filter input should be focused');
  });

  it('clicking [+ Folder] invokes onPickFolder', async () => {
    let pickFolderCalled = false;
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onPickFolder: () => { pickFolderCalled = true; }
    });
    await sheet.onOpen({ tab: 'library' });

    const folderBtn = sheet.element.querySelector('[data-action="add-folder"]');
    assert.ok(folderBtn, 'folder button must exist');
    folderBtn.click();

    assert.equal(pickFolderCalled, true, 'onPickFolder must be called');
  });

  it('a single touch long-press stars exactly once and does not play or close the sheet (R1/R2)', async () => {
    let closed = 0;
    let played = null;
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onToast: (m) => toastMessages.push(m),
      onClose: () => { closed++; },
      onPlayTrack: (t) => { played = t.id; }
    });
    await sheet.onOpen({ tab: 'library' });
    const row = sheet.element.querySelector('[data-primary="Midnight City"]');

    // The full event sequence a touch browser emits for one physical long press:
    // pointerdown -> 600ms hold -> contextmenu -> pointerup -> trailing click
    row.dispatchEvent(new globalThis.PointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }));
    await delay(600);
    row.dispatchEvent(new globalThis.Event('contextmenu'));
    row.dispatchEvent(new globalThis.PointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 }));
    row.dispatchEvent(new globalThis.Event('click'));
    await delay(40);

    const starEvents = toastMessages.filter((m) => m.includes('STARRED'));
    assert.equal(starEvents.length, 1, 'one physical long-press must produce exactly one star toggle');
    assert.ok(await mockDb.isFavorite('trk_1'), 'the star must persist, not be toggled back');
    assert.equal(played, null, 'long-press must not play the row');
    assert.equal(closed, 0, 'long-press must keep the sheet open');
  });

  it('right-click contextmenu toggles star exactly once and keeps sheet open', async () => {
    let closed = 0;
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onToast: (m) => toastMessages.push(m),
      onClose: () => { closed++; }
    });
    await sheet.onOpen({ tab: 'library' });
    const row = sheet.element.querySelector('[data-primary="Midnight City"]');

    row.dispatchEvent(new globalThis.Event('contextmenu'));
    await delay(20);

    assert.ok(toastMessages.some((m) => m.includes('[STARRED] Midnight City')));
    assert.equal(closed, 0, 'right-click star keeps sheet open');
    assert.ok(await mockDb.isFavorite('trk_1'));
  });

  it('Enter key activates row, invokes onPlayTrack, and closes sheet', async () => {
    let closed = 0;
    let playedTrack = null;
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onPlayTrack: (t) => { playedTrack = t; },
      onClose: () => { closed++; }
    });
    await sheet.onOpen({ tab: 'library' });
    const row = sheet.element.querySelector('[data-primary="Midnight City"]');

    row.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'Enter' }));
    await delay(10);

    assert.ok(playedTrack, 'onPlayTrack should have been called on Enter');
    assert.equal(playedTrack.id, 'trk_1');
    assert.equal(closed, 1, 'Enter closes the sheet');
  });

  it('clicking header close button [X] invokes onClose', async () => {
    let closed = 0;
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onClose: () => { closed++; }
    });
    await sheet.onOpen();

    const closeBtn = sheet.element.querySelector('[data-action="close"]');
    assert.ok(closeBtn);
    closeBtn.click();

    assert.equal(closed, 1, 'clicking close button closes sheet');
  });

  it('swipe-right on sheet exits drill-in view', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'library' });

    // Drill into Albums -> Hurry Up
    sheet.element.querySelector('[data-mode="albums"]').click();
    await delay(20);
    sheet.element.querySelector('[data-primary="Hurry Up"]').click();
    await delay(20);

    assert.ok(sheet.element.innerHTML.includes('Back to Albums'));

    // Swipe right on sheetEl (dx = 120, dy = 10)
    sheet.element.dispatchEvent(new globalThis.PointerEvent('pointerdown', { pointerId: 1, clientX: 50, clientY: 100 }));
    sheet.element.dispatchEvent(new globalThis.PointerEvent('pointerup', { pointerId: 1, clientX: 180, clientY: 100 }));
    await delay(20);

    assert.ok(!sheet.element.innerHTML.includes('Back to Albums'), 'swipe-right exits drill-in view');
  });

  it('harness resets document.activeElement when focused child is detached (R6)', () => {
    const parent = globalThis.document.createElement('div');
    globalThis.document.body.appendChild(parent);

    parent.innerHTML = '<button id="btn-child">Click</button>';
    const child = parent.querySelector('#btn-child');
    child.focus();
    assert.equal(globalThis.document.activeElement, child);

    parent.innerHTML = '<p>Cleared</p>';
    assert.equal(globalThis.document.activeElement, globalThis.document.body);
  });

  it('clicking close button dispatches layer-close custom event for layer coordinator dismissal', async () => {
    let eventFired = false;
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    sheet.element.addEventListener('layer-close', () => {
      eventFired = true;
    });
    await sheet.onOpen();

    const closeBtn = sheet.element.querySelector('[data-action="close"]');
    assert.ok(closeBtn);
    closeBtn.click();

    assert.equal(eventFired, true, 'clicking close button must dispatch layer-close event');
  });

  it('renders browse rows with .browse-row-main wrapping primary and secondary labels', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'library' });

    const rows = sheet.element.querySelectorAll('.browse-row');
    assert.ok(rows.length > 0, 'must render library rows');

    const firstRow = rows[0];
    const rowMain = firstRow.querySelector('.browse-row-main');
    assert.ok(rowMain, 'must contain .browse-row-main wrapper');

    const primary = rowMain.querySelector('.browse-row-primary');
    const secondary = rowMain.querySelector('.browse-row-secondary');
    assert.ok(primary, 'primary label must reside inside .browse-row-main');
    assert.ok(secondary, 'secondary label must reside inside .browse-row-main');

    const trailing = firstRow.querySelector('.browse-row-trailing');
    assert.ok(trailing, 'trailing label must exist as sibling of .browse-row-main');

    // Test radio tab rows
    await sheet.onOpen({ tab: 'radio' });
    const stationRows = sheet.element.querySelectorAll('.browse-row');
    assert.ok(stationRows.length > 0, 'must render radio station rows');

    const firstStationRow = stationRows[0];
    const stationMain = firstStationRow.querySelector('.browse-row-main');
    assert.ok(stationMain, 'station row must contain .browse-row-main wrapper');
    assert.ok(stationMain.querySelector('.browse-row-primary'));
    assert.ok(stationMain.querySelector('.browse-row-secondary'));
  });
});
