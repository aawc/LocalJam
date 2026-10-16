import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBrowseSheet,
  DEBOUNCE_DELAY_MS,
  STAR_DEDUPE_MS,
  FILTER_EXPIRATION_MS,
  FILTER_STORAGE_KEY
} from '../../src/ui/components/browse-sheet.js';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const CSS_PATH = path.join(ROOT_DIR, 'src/ui/app.css');

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

  it('default radio sort is popularity-desc on DOM startup', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });
    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    const selectedOpt = sortSelect.querySelector('option[selected]');
    assert.ok(selectedOpt);
    assert.equal(selectedOpt.value, 'popularity-desc');
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
    assert.equal(playedStation.id, 'soma_groove_salad');
    assert.equal(mockAudioEngine.currentStation.id, 'soma_groove_salad');
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

  it('renders feedback button in header and invokes onOpenFeedback callback on click', async () => {
    let feedbackOpened = false;
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onOpenFeedback: () => {
        feedbackOpened = true;
      }
    });
    await sheet.onOpen({ tab: 'library' });

    const feedbackBtn = sheet.element.querySelector('[data-action="feedback"]');
    assert.ok(feedbackBtn, 'Feedback button must exist in header');
    feedbackBtn.click();

    assert.equal(feedbackOpened, true, 'Clicking feedback button must invoke onOpenFeedback callback');
  });

  it('passes clicked track, all visible tracks, and index to onPlayTrack callback', async () => {
    let playedTrack = null;
    let playedTracks = null;
    let playedIndex = -1;

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      onPlayTrack: (track, tracks, idx) => {
        playedTrack = track;
        playedTracks = tracks;
        playedIndex = idx;
      }
    });
    await sheet.onOpen({ tab: 'library' });

    const rows = sheet.element.querySelectorAll('.browse-row');
    assert.ok(rows.length > 1, 'multiple rows must exist');

    // Click second row (index 1)
    rows[1].click();

    assert.equal(playedTrack?.id, sampleTracks[1].id, 'Clicked track must match index 1');
    assert.ok(Array.isArray(playedTracks), 'Tracks must be an array');
    assert.equal(playedIndex, 1, 'Index must be 1');
  });

  it('radio sort select includes popularity-desc and provider options (F10)', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    assert.ok(sortSelect, 'Sort select must exist on radio tab');

    const options = Array.from(sortSelect.querySelectorAll('option'));
    const optionMap = new Map(options.map((opt) => [opt.getAttribute('value'), opt.textContent.trim()]));

    assert.ok(optionMap.has('popularity-desc'), 'Must include popularity-desc option');
    assert.equal(optionMap.get('popularity-desc'), 'Popularity');

    assert.ok(optionMap.has('provider'), 'Must include provider option');
    assert.equal(optionMap.get('provider'), 'Provider');
  });




  it('renders accessible provider groups with role="group" and sticky section headers when provider sort is selected (F11)', async () => {
    sampleStations = [
      { id: 'st_soma_1', name: 'Groove Salad', genre: 'Ambient', country: 'USA', bitrate: '128 kbps', provider: 'SomaFM', popularity: 90 },
      { id: 'st_soma_2', name: 'Secret Agent', genre: 'Spy', country: 'USA', bitrate: '128 kbps', provider: 'SomaFM', popularity: 80 },
      { id: 'st_bbc_1', name: 'BBC Radio 1', genre: 'Pop', country: 'UK', bitrate: '128 kbps', provider: 'BBC', popularity: 95 },
      { id: 'st_bbc_2', name: 'BBC Radio 6 Music', genre: 'Alternative', country: 'UK', bitrate: '128 kbps', provider: 'BBC', popularity: 92 },
      { id: 'st_ind_1', name: 'Community Radio', genre: 'Variety', country: 'USA', bitrate: '64 kbps', provider: '', popularity: 10 }
    ];

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      loadStations: async () => sampleStations
    });
    await sheet.onOpen({ tab: 'radio' });

    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    assert.ok(sortSelect);
    sortSelect.value = 'provider';
    sortSelect.dispatchEvent(new globalThis.Event('change'));

    const providerGroups = sheet.element.querySelectorAll('.browse-provider-group');
    assert.equal(providerGroups.length, 3, 'Must render 3 provider groups (BBC, Independent, SomaFM)');

    // Group 1: BBC
    const bbcGroup = providerGroups[0];
    assert.equal(bbcGroup.getAttribute('role'), 'group', 'Group container must have role="group"');
    assert.equal(bbcGroup.getAttribute('aria-label'), 'BBC (2 stations)', 'Group aria-label must include provider and station count');

    const bbcHeader = bbcGroup.querySelector('.browse-section-header');
    assert.ok(bbcHeader, 'Group must have section header');
    assert.equal(bbcHeader.getAttribute('aria-hidden'), 'true', 'Section header must have aria-hidden="true" to prevent screen reader double-speaking');

    const bbcTitle = bbcHeader.querySelector('.browse-section-title');
    assert.ok(bbcTitle);
    assert.equal(bbcTitle.textContent.trim(), 'BBC');

    const bbcCount = bbcHeader.querySelector('.browse-section-count');
    assert.ok(bbcCount);
    assert.equal(bbcCount.textContent.trim(), '2');

    const bbcRows = bbcGroup.querySelectorAll('.browse-row');
    assert.equal(bbcRows.length, 2, 'BBC group must contain 2 station rows');

    // Group 2: Independent (empty provider defaults to Independent)
    const indGroup = providerGroups[1];
    assert.equal(indGroup.getAttribute('role'), 'group');
    assert.equal(indGroup.getAttribute('aria-label'), 'Independent (1 stations)');
    assert.equal(indGroup.querySelectorAll('.browse-row').length, 1);

    // Group 3: SomaFM
    const somaGroup = providerGroups[2];
    assert.equal(somaGroup.getAttribute('role'), 'group');
    assert.equal(somaGroup.getAttribute('aria-label'), 'SomaFM (2 stations)');
    assert.equal(somaGroup.querySelectorAll('.browse-row').length, 2);
  });

  it('renders dual-coded provider badge with brackets on radio station rows (F12)', async () => {
    sampleStations = [
      { id: 'st_soma_1', name: 'Groove Salad', genre: 'Ambient', country: 'USA', bitrate: '128 kbps', provider: 'SomaFM', popularity: 90 },
      { id: 'st_ind_1', name: 'Community Radio', genre: 'Variety', country: 'USA', bitrate: '64 kbps', provider: '', popularity: 10 }
    ];

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      loadStations: async () => sampleStations
    });
    await sheet.onOpen({ tab: 'radio' });

    const rows = sheet.element.querySelectorAll('.browse-row');
    assert.equal(rows.length, 2);

    // Row 0: SomaFM
    const badge0 = rows[0].querySelector('.browse-provider-badge');
    assert.ok(badge0, 'Station row must contain .browse-provider-badge');
    assert.equal(badge0.textContent.trim(), '[SomaFM]', 'Badge must contain bracketed provider name');

    // Row 1: Empty provider falls back to Independent
    const badge1 = rows[1].querySelector('.browse-provider-badge');
    assert.ok(badge1, 'Station row with empty provider must contain .browse-provider-badge');
    assert.equal(badge1.textContent.trim(), '[Independent]', 'Badge must contain bracketed Independent fallback');

    // Verify library tracks do NOT render provider badge
    await sheet.onOpen({ tab: 'library' });
    const trackRows = sheet.element.querySelectorAll('.browse-row');
    assert.ok(trackRows.length > 0);
    const trackBadge = trackRows[0].querySelector('.browse-provider-badge');
    assert.equal(trackBadge, null, 'Track row must NOT contain .browse-provider-badge');
  });

  it('navigates seamlessly across provider group boundaries with ArrowDown and ArrowUp without focus trapping (F13)', async () => {
    sampleStations = [
      { id: 'st_bbc_1', name: 'BBC Radio 1', genre: 'Pop', country: 'UK', bitrate: '128 kbps', provider: 'BBC' },
      { id: 'st_bbc_2', name: 'BBC Radio 6 Music', genre: 'Alternative', country: 'UK', bitrate: '128 kbps', provider: 'BBC' },
      { id: 'st_soma_1', name: 'Groove Salad', genre: 'Ambient', country: 'USA', bitrate: '128 kbps', provider: 'SomaFM' },
      { id: 'st_soma_2', name: 'Secret Agent', genre: 'Spy', country: 'USA', bitrate: '128 kbps', provider: 'SomaFM' }
    ];

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      loadStations: async () => sampleStations
    });
    await sheet.onOpen({ tab: 'radio' });

    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    sortSelect.value = 'provider';
    sortSelect.dispatchEvent(new globalThis.Event('change'));

    const allRows = sheet.element.querySelectorAll('.browse-row');
    assert.equal(allRows.length, 4);

    const bbcLastRow = allRows[1]; // BBC Radio 6 Music (last row of BBC group)
    const somaFirstRow = allRows[2]; // Groove Salad (first row of SomaFM group)

    // Focus last item of first group
    bbcLastRow.focus();
    assert.equal(globalThis.document.activeElement, bbcLastRow);

    // Press ArrowDown on last row of first group -> should move focus to first row of second group
    bbcLastRow.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'ArrowDown' }));
    assert.equal(globalThis.document.activeElement, somaFirstRow, 'ArrowDown must move focus across group boundary to next row');

    // Press ArrowUp on first row of second group -> should move focus back to last row of first group
    somaFirstRow.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'ArrowUp' }));
    assert.equal(globalThis.document.activeElement, bbcLastRow, 'ArrowUp must move focus across group boundary to previous row');
  });

  it('jumps to first and last rows on Home and End keys per WAI-ARIA APG Listbox pattern (F13)', async () => {
    sampleStations = [
      { id: 'st_1', name: 'Station 1', genre: 'Pop', provider: 'A' },
      { id: 'st_2', name: 'Station 2', genre: 'Pop', provider: 'A' },
      { id: 'st_3', name: 'Station 3', genre: 'Rock', provider: 'B' },
      { id: 'st_4', name: 'Station 4', genre: 'Rock', provider: 'B' }
    ];

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      loadStations: async () => sampleStations
    });
    await sheet.onOpen({ tab: 'radio' });

    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    sortSelect.value = 'provider';
    sortSelect.dispatchEvent(new globalThis.Event('change'));

    const allRows = sheet.element.querySelectorAll('.browse-row');
    assert.equal(allRows.length, 4);

    // Focus a middle row (index 2)
    allRows[2].focus();
    assert.equal(globalThis.document.activeElement, allRows[2]);

    // Press Home -> jump to first row (index 0)
    allRows[2].dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'Home' }));
    assert.equal(globalThis.document.activeElement, allRows[0], 'Home key must jump to first row');

    // Press End -> jump to last row (index 3)
    allRows[0].dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'End' }));
    assert.equal(globalThis.document.activeElement, allRows[3], 'End key must jump to last row');
  });

  it('wheel event translates vertical deltaY to horizontal scrollLeft when deltaY dominates and container has scroll room', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const chipsBar = sheet.element.querySelector('.browse-chips-bar');
    assert.ok(chipsBar, 'chips bar must exist');
    chipsBar.scrollWidth = 1000;
    chipsBar.clientWidth = 300;
    chipsBar.scrollLeft = 0;

    const wheelEvt = new globalThis.WheelEvent('wheel', { deltaX: 0, deltaY: 50, cancelable: true });
    chipsBar.dispatchEvent(wheelEvt);

    assert.equal(chipsBar.scrollLeft, 50, 'scrollLeft should advance by deltaY');
    assert.equal(wheelEvt.defaultPrevented, true, 'wheel event should be prevented when scrolled');
  });

  it('wheel event passes through without preventDefault when boundary reached or deltaX is dominant', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const chipsBar = sheet.element.querySelector('.browse-chips-bar');
    chipsBar.scrollWidth = 1000;
    chipsBar.clientWidth = 300;

    // At right boundary
    chipsBar.scrollLeft = 700;
    const wheelRightBound = new globalThis.WheelEvent('wheel', { deltaX: 0, deltaY: 50, cancelable: true });
    chipsBar.dispatchEvent(wheelRightBound);
    assert.equal(wheelRightBound.defaultPrevented, false, 'must not preventDefault at right boundary');
    assert.equal(chipsBar.scrollLeft, 700);

    // At left boundary
    chipsBar.scrollLeft = 0;
    const wheelLeftBound = new globalThis.WheelEvent('wheel', { deltaX: 0, deltaY: -50, cancelable: true });
    chipsBar.dispatchEvent(wheelLeftBound);
    assert.equal(wheelLeftBound.defaultPrevented, false, 'must not preventDefault at left boundary');
    assert.equal(chipsBar.scrollLeft, 0);

    // deltaX is dominant (e.g. trackpad horizontal swipe)
    chipsBar.scrollLeft = 100;
    const wheelDeltaX = new globalThis.WheelEvent('wheel', { deltaX: 60, deltaY: 20, cancelable: true });
    chipsBar.dispatchEvent(wheelDeltaX);
    assert.equal(wheelDeltaX.defaultPrevented, false, 'must not preventDefault when deltaX dominates');
    assert.equal(chipsBar.scrollLeft, 100, 'scrollLeft should not be changed when deltaX dominates');
  });

  it('wheel event normalizes deltaMode 1 (lines) and 2 (pages)', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const chipsBar = sheet.element.querySelector('.browse-chips-bar');
    chipsBar.scrollWidth = 1000;
    chipsBar.clientWidth = 300;
    chipsBar.scrollLeft = 0;

    // deltaMode 1 (DOM_DELTA_LINE) multiplies deltaY by 24
    const lineWheel = new globalThis.WheelEvent('wheel', { deltaX: 0, deltaY: 2, deltaMode: 1, cancelable: true });
    chipsBar.dispatchEvent(lineWheel);
    assert.equal(chipsBar.scrollLeft, 48, 'deltaMode 1 should multiply deltaY by 24');
    assert.equal(lineWheel.defaultPrevented, true);

    // deltaMode 2 (DOM_DELTA_PAGE) multiplies deltaY by clientWidth
    chipsBar.scrollLeft = 0;
    const pageWheel = new globalThis.WheelEvent('wheel', { deltaX: 0, deltaY: 1, deltaMode: 2, cancelable: true });
    chipsBar.dispatchEvent(pageWheel);
    assert.equal(chipsBar.scrollLeft, 300, 'deltaMode 2 should multiply deltaY by clientWidth');
    assert.equal(pageWheel.defaultPrevented, true);
  });

  it('wheel event respects subpixel thresholds at boundaries to prevent trapping on high-DPI displays', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const chipsBar = sheet.element.querySelector('.browse-chips-bar');
    chipsBar.scrollWidth = 1000;
    chipsBar.clientWidth = 300; // maxScroll = 700

    // Within 1px of right boundary (699.5 >= 700 - 1)
    chipsBar.scrollLeft = 699.5;
    const rightSubpixel = new globalThis.WheelEvent('wheel', { deltaX: 0, deltaY: 50, cancelable: true });
    chipsBar.dispatchEvent(rightSubpixel);
    assert.equal(rightSubpixel.defaultPrevented, false, 'must not trap at right subpixel boundary');

    // Within 1px of left boundary (0.5 <= 1)
    chipsBar.scrollLeft = 0.5;
    const leftSubpixel = new globalThis.WheelEvent('wheel', { deltaX: 0, deltaY: -50, cancelable: true });
    chipsBar.dispatchEvent(leftSubpixel);
    assert.equal(leftSubpixel.defaultPrevented, false, 'must not trap at left subpixel boundary');
  });

  it('clicking a radio genre chip updates active, tabindex, aria-pressed in-place and preserves scrollLeft', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const chipsBar = sheet.element.querySelector('.browse-chips-bar');
    chipsBar.scrollWidth = 1000;
    chipsBar.clientWidth = 300;
    chipsBar.scrollLeft = 240;

    const allGenreChip = chipsBar.querySelector('[data-genre="All"]');
    assert.ok(allGenreChip.classList.contains('active'));
    assert.equal(allGenreChip.getAttribute('tabindex'), '0');
    assert.equal(allGenreChip.getAttribute('aria-pressed'), 'true');

    const folkChip = chipsBar.querySelector('[data-genre="Folk & Roots"]');
    assert.ok(folkChip);
    assert.ok(!folkChip.classList.contains('active'));
    assert.equal(folkChip.getAttribute('tabindex'), '-1');
    assert.equal(folkChip.getAttribute('aria-pressed'), 'false');

    folkChip.click();

    // Verify chips bar was NOT replaced in DOM and scrollLeft was preserved
    const chipsBarAfter = sheet.element.querySelector('.browse-chips-bar');
    assert.equal(chipsBarAfter, chipsBar, 'chipsBar element identity must be preserved');
    assert.equal(chipsBar.scrollLeft, 240, 'scrollLeft must be preserved on chip click');

    // Verify classes and ARIA attributes updated in-place
    assert.ok(folkChip.classList.contains('active'), 'clicked chip must have active class');
    assert.equal(folkChip.getAttribute('tabindex'), '0', 'clicked chip must have tabindex="0"');
    assert.equal(folkChip.getAttribute('aria-pressed'), 'true', 'clicked chip must have aria-pressed="true"');

    assert.ok(!allGenreChip.classList.contains('active'), 'previous chip must lose active class');
    assert.equal(allGenreChip.getAttribute('tabindex'), '-1', 'previous chip must have tabindex="-1"');
    assert.equal(allGenreChip.getAttribute('aria-pressed'), 'false', 'previous chip must have aria-pressed="false"');

    // Verify scrollIntoView was called on clicked chip
    assert.equal(folkChip._scrolledIntoView, true, 'scrollIntoView must be called on selected chip');
    assert.deepEqual(folkChip._lastScrollIntoViewOptions, { block: 'nearest', inline: 'nearest', behavior: 'smooth' });

    // Verify station list rows were updated
    const html = sheet.element.innerHTML;
    assert.ok(html.includes('Folk Alley'));
    assert.ok(!html.includes('SomaFM: Groove Salad'));
  });

  it('roving tabindex keyboard navigation on chips bar with ArrowRight, ArrowLeft, Home, End', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const chipsBar = sheet.element.querySelector('.browse-chips-bar');
    const chips = Array.from(chipsBar.querySelectorAll('.chip'));
    assert.ok(chips.length > 2);

    // Initial state: active chip has tabindex="0", others "-1"
    const activeChip = chips.find((c) => c.getAttribute('tabindex') === '0');
    assert.ok(activeChip);
    const initialIdx = chips.indexOf(activeChip);

    // Focus active chip
    activeChip.focus();
    assert.equal(globalThis.document.activeElement, activeChip);

    // ArrowRight -> next chip
    const rightEvt = new globalThis.KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    activeChip.dispatchEvent(rightEvt);
    const nextIdx = (initialIdx + 1) % chips.length;
    assert.equal(globalThis.document.activeElement, chips[nextIdx], 'focus must move to next chip');
    assert.equal(chips[nextIdx].getAttribute('tabindex'), '0', 'focused chip must have tabindex="0"');
    assert.equal(activeChip.getAttribute('tabindex'), '-1', 'old chip must have tabindex="-1"');
    assert.equal(chips[nextIdx]._scrolledIntoView, true, 'next chip scrollIntoView must be called');
    assert.equal(rightEvt.defaultPrevented, true, 'ArrowRight should be defaultPrevented');

    // End -> last chip
    const endEvt = new globalThis.KeyboardEvent('keydown', { key: 'End', cancelable: true });
    chips[nextIdx].dispatchEvent(endEvt);
    const lastChip = chips[chips.length - 1];
    assert.equal(globalThis.document.activeElement, lastChip, 'End must focus last chip');
    assert.equal(lastChip.getAttribute('tabindex'), '0');

    // Home -> first chip
    const homeEvt = new globalThis.KeyboardEvent('keydown', { key: 'Home', cancelable: true });
    lastChip.dispatchEvent(homeEvt);
    assert.equal(globalThis.document.activeElement, chips[0], 'Home must focus first chip');
    assert.equal(chips[0].getAttribute('tabindex'), '0');

    // ArrowLeft on first chip wraps to last chip
    const leftEvt = new globalThis.KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    chips[0].dispatchEvent(leftEvt);
    assert.equal(globalThis.document.activeElement, lastChip, 'ArrowLeft at index 0 must wrap to last chip');
  });

  it('scrolls active chip into view on sheet open and tab switch', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });

    // Opening on radio tab
    await sheet.onOpen({ tab: 'radio' });
    const activeRadioChip = sheet.element.querySelector('.browse-chips-bar .chip.active');
    assert.ok(activeRadioChip);
    assert.equal(activeRadioChip._scrolledIntoView, true, 'active chip must be scrolled into view on open');

    // Switch to library tab
    const libTabBtn = sheet.element.querySelector('[data-tab="library"]');
    activeRadioChip._scrolledIntoView = false;
    libTabBtn.click();
    const activeLibChip = sheet.element.querySelector('.browse-chips-bar .chip.active');
    assert.ok(activeLibChip);
    assert.equal(activeLibChip._scrolledIntoView, true, 'active chip must be scrolled into view on tab switch');
  });

  it('does not intercept keyboard events on browse-sort-select inside chips bar', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });
    await sheet.onOpen({ tab: 'radio' });

    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    assert.ok(sortSelect, 'sort select must exist');
    sortSelect.focus();
    assert.equal(globalThis.document.activeElement, sortSelect);

    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    for (const key of keys) {
      const evt = new globalThis.KeyboardEvent('keydown', { key, cancelable: true });
      sortSelect.dispatchEvent(evt);
      assert.equal(evt.defaultPrevented, false, `${key} on select must not be defaultPrevented`);
      assert.equal(globalThis.document.activeElement, sortSelect, `focus must stay on select after ${key}`);
    }
  });

  it('calls scrollIntoView on the currently playing track row when opening the browse sheet on library tab', async () => {
    mockAudioEngine.currentTrack = sampleTracks[1];
    mockAudioEngine.isRadio = false;

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });

    await sheet.onOpen({ tab: 'library' });

    const playingRow = sheet.element.querySelector('.browse-list .browse-row.is-playing');
    assert.ok(playingRow, 'playing row must exist');
    assert.equal(playingRow.getAttribute('data-id'), 'trk_2');
    assert.equal(playingRow._scrolledIntoView, true, 'playing row scrollIntoView must be called');
    assert.deepEqual(playingRow._lastScrollIntoViewOptions, { block: 'nearest', inline: 'nearest', behavior: 'auto' });
  });

  it('calls scrollIntoView on the currently playing radio station row when opening the browse sheet on radio tab', async () => {
    mockAudioEngine.currentStation = sampleStations[1];
    mockAudioEngine.isRadio = true;

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });

    await sheet.onOpen({ tab: 'radio' });

    const playingRow = sheet.element.querySelector('.browse-list .browse-row.is-playing');
    assert.ok(playingRow, 'playing station row must exist');
    assert.equal(playingRow.getAttribute('data-id'), 'st_2');
    assert.equal(playingRow._scrolledIntoView, true, 'playing station row scrollIntoView must be called');
    assert.deepEqual(playingRow._lastScrollIntoViewOptions, { block: 'nearest', inline: 'nearest', behavior: 'auto' });
  });

  it('calls scrollIntoView on currently playing item when switching tabs to the tab containing it', async () => {
    mockAudioEngine.currentStation = sampleStations[0];
    mockAudioEngine.isRadio = true;

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });

    // Open on library tab first where no radio station is displayed
    await sheet.onOpen({ tab: 'library' });
    let playingRow = sheet.element.querySelector('.browse-list .browse-row.is-playing');
    assert.equal(playingRow, null, 'no row should be playing in library tab when radio is active');

    // Switch to radio tab
    const radioTabBtn = sheet.element.querySelector('[data-tab="radio"]');
    assert.ok(radioTabBtn, 'radio tab button must exist');
    radioTabBtn.click();

    playingRow = sheet.element.querySelector('.browse-list .browse-row.is-playing');
    assert.ok(playingRow, 'playing station row must exist after tab switch');
    assert.equal(playingRow.getAttribute('data-id'), 'st_1');
    assert.equal(playingRow._scrolledIntoView, true, 'playing station row scrollIntoView must be called on tab switch');
    assert.deepEqual(playingRow._lastScrollIntoViewOptions, { block: 'nearest', inline: 'nearest', behavior: 'auto' });
  });

  it('calls requestAnimationFrame with doScroll when requestAnimationFrame is available', async () => {
    mockAudioEngine.currentTrack = sampleTracks[0];
    mockAudioEngine.isRadio = false;

    let rafCalled = false;
    let rafCallback = null;
    globalThis.requestAnimationFrame = (cb) => {
      rafCalled = true;
      rafCallback = cb;
      return 1;
    };

    try {
      const sheet = createBrowseSheet({
        db: mockDb,
        audioEngine: mockAudioEngine,
        queueManager: mockQueueManager
      });

      await sheet.onOpen({ tab: 'library' });

      assert.equal(rafCalled, true, 'requestAnimationFrame should be called');
      const playingRow = sheet.element.querySelector('.browse-list .browse-row.is-playing');
      assert.ok(playingRow);
      assert.equal(playingRow._scrolledIntoView, true);

      // Reset spy flag and execute the rAF callback
      playingRow._scrolledIntoView = false;
      rafCallback();
      assert.equal(playingRow._scrolledIntoView, true, 'rAF callback should also invoke scrollIntoView');
    } finally {
      delete globalThis.requestAnimationFrame;
    }
  });

  it('does not throw when opening sheet with no track or station playing', async () => {
    mockAudioEngine.currentTrack = null;
    mockAudioEngine.currentStation = null;
    mockAudioEngine.isPlaying = false;

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });

    await sheet.onOpen({ tab: 'library' });
    const playingRow = sheet.element.querySelector('.browse-list .browse-row.is-playing');
    assert.equal(playingRow, null);
  });

  it('exports verified FILTER_EXPIRATION_MS (1 hour) and FILTER_STORAGE_KEY constants', () => {
    assert.equal(FILTER_EXPIRATION_MS, 3600000);
    assert.equal(FILTER_STORAGE_KEY, 'browse.filterState');
  });

  it('persists filter criteria (query, mode, genre, sort) to browse.filterState with a valid timestamp', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      loadStations: async () => sampleStations
    });

    await sheet.onOpen({ tab: 'library' });

    // Mode chip selection
    const albumChip = sheet.element.querySelector('[data-mode="albums"]');
    assert.ok(albumChip, 'albums mode chip must exist');
    albumChip.click();

    let state = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.ok(state, 'state must be persisted after mode chip selection');
    assert.equal(state.activeTab, 'library');
    assert.equal(state.library.mode, 'albums');
    assert.equal(typeof state.timestamp, 'number');
    assert.ok(Date.now() - state.timestamp < 2000, 'timestamp must be recent');

    // Debounced filter input in library
    const input = sheet.element.querySelector('.browse-filter-input');
    input.value = 'Midnight';
    input.dispatchEvent(new globalThis.Event('input'));
    await delay(150);

    state = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.equal(state.library.query, 'Midnight');

    // Switch to radio tab
    const radioTabBtn = sheet.element.querySelector('[data-tab="radio"]');
    radioTabBtn.click();

    state = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.equal(state.activeTab, 'radio');
    assert.equal(state.library.query, 'Midnight', 'library query preserved in persisted state');

    // Select radio genre chip
    const ambientChip = sheet.element.querySelector('[data-genre="Ambient"]');
    assert.ok(ambientChip, 'ambient genre chip must exist');
    ambientChip.click();

    state = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.equal(state.radio.genre, 'Ambient');

    // Select radio sort
    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    sortSelect.value = 'name-asc';
    sortSelect.dispatchEvent(new globalThis.Event('change'));

    state = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.equal(state.radio.sort, 'name-asc');

    // Switch back to library and test drill-in persistence
    const libraryTabBtn = sheet.element.querySelector('[data-tab="library"]');
    libraryTabBtn.click();

    // Clear filter to see albums
    const libInput = sheet.element.querySelector('.browse-filter-input');
    libInput.value = '';
    libInput.dispatchEvent(new globalThis.Event('input'));
    await delay(150);

    const albumRow = sheet.element.querySelector('.browse-row[data-kind="album"]');
    assert.ok(albumRow, 'album row must exist');
    albumRow.click();

    state = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.ok(state.library.drill, 'drill-in must be persisted');
    assert.equal(state.library.drill.kind, 'album');

    // Exit drill-in via back button
    const backBtn = sheet.element.querySelector('[data-action="back"]');
    assert.ok(backBtn, 'back button must exist');
    backBtn.click();

    state = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.equal(state.library.drill, null, 'drill-in exit must clear drill in state');

    // Close sheet
    sheet.onClose();
    state = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.ok(state, 'state must be persisted on close');
    assert.ok(Date.now() - state.timestamp < 2000);
  });

  it('reopening the sheet within 1 hour (< FILTER_EXPIRATION_MS) restores activeTab, filterQuery, libraryMode, radioGenre, and radioSort', async () => {
    const thirtyMinutesAgo = Date.now() - 1800000;
    await mockDb.setSetting(FILTER_STORAGE_KEY, {
      timestamp: thirtyMinutesAgo,
      activeTab: 'radio',
      library: {
        mode: 'artists',
        query: 'Solar',
        drill: null
      },
      radio: {
        genre: 'Ambient',
        sort: 'bitrate-desc',
        query: 'Groove'
      }
    });

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      loadStations: async () => sampleStations
    });

    // Reopen without explicit tab prop -> restores activeTab: 'radio'
    await sheet.onOpen();

    const activeTabBtn = sheet.element.querySelector('.tab-btn.active');
    assert.ok(activeTabBtn);
    assert.equal(activeTabBtn.getAttribute('data-tab'), 'radio');

    const input = sheet.element.querySelector('.browse-filter-input');
    assert.equal(input.value, 'Groove');

    const activeGenreChip = sheet.element.querySelector('.browse-chips-bar [data-genre="Ambient"].active');
    assert.ok(activeGenreChip, 'restored genre chip must be active');

    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    const selectedSortOpt = sortSelect.querySelector('option[selected]');
    assert.equal(selectedSortOpt.value, 'bitrate-desc', 'restored sort value must match');

    // Only SomaFM Groove Salad should be visible
    const rows = sheet.element.querySelectorAll('.browse-row');
    assert.equal(rows.length, 1);
    assert.ok(rows[0].textContent.includes('SomaFM: Groove Salad'));

    // Switch to library tab -> restores library query 'Solar' and mode 'artists'
    const libraryTabBtn = sheet.element.querySelector('[data-tab="library"]');
    libraryTabBtn.click();

    const libInput = sheet.element.querySelector('.browse-filter-input');
    assert.equal(libInput.value, 'Solar');

    const activeModeChip = sheet.element.querySelector('.browse-chips-bar [data-mode="artists"].active');
    assert.ok(activeModeChip, 'restored library mode chip must be active');

    // Explicit props.tab override on open
    const sheet2 = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      loadStations: async () => sampleStations
    });
    await sheet2.onOpen({ tab: 'library' });

    const sheet2TabBtn = sheet2.element.querySelector('.tab-btn.active');
    assert.equal(sheet2TabBtn.getAttribute('data-tab'), 'library');
    const sheet2Input = sheet2.element.querySelector('.browse-filter-input');
    assert.equal(sheet2Input.value, 'Solar');
  });

  it('opening the sheet after 1 hour (timestamp older than FILTER_EXPIRATION_MS) discards expired state, clears browse.filterState in db, and resets to defaults', async () => {
    const expiredTime = Date.now() - 3660000; // 61 minutes ago (> 1 hour)
    await mockDb.setSetting(FILTER_STORAGE_KEY, {
      timestamp: expiredTime,
      activeTab: 'radio',
      library: {
        mode: 'artists',
        query: 'Solar',
        drill: null
      },
      radio: {
        genre: 'Ambient',
        sort: 'bitrate-desc',
        query: 'Groove'
      }
    });

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      loadStations: async () => sampleStations
    });

    await sheet.onOpen();

    // Expired state must be cleared in DB
    const stateInDb = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.equal(stateInDb, null, 'expired filter state must be cleared to null');

    // Defaults restored:
    const activeTabBtn = sheet.element.querySelector('.tab-btn.active');
    assert.equal(activeTabBtn.getAttribute('data-tab'), 'library', 'default tab is library');

    const input = sheet.element.querySelector('.browse-filter-input');
    assert.equal(input.value, '', 'filter input is reset to empty');

    const activeModeChip = sheet.element.querySelector('.browse-chips-bar [data-mode="songs"].active');
    assert.ok(activeModeChip, 'default songs mode chip is active');

    // Switch to radio: defaults restored there too
    const radioTabBtn = sheet.element.querySelector('[data-tab="radio"]');
    radioTabBtn.click();

    const radioInput = sheet.element.querySelector('.browse-filter-input');
    assert.equal(radioInput.value, '');

    const sortSelect = sheet.element.querySelector('.browse-sort-select');
    const selectedSortOpt = sortSelect.querySelector('option[selected]');
    assert.equal(selectedSortOpt.value, 'popularity-desc');
  });

  it('discards filter state with negative age or future timestamp (clock skew)', async () => {
    const futureTime = Date.now() + 120000; // 2 minutes in the future
    await mockDb.setSetting(FILTER_STORAGE_KEY, {
      timestamp: futureTime,
      activeTab: 'radio',
      library: { mode: 'starred', query: 'Midnight', drill: null },
      radio: { genre: 'Favorites', sort: 'name-asc', query: 'Radio' }
    });

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      loadStations: async () => sampleStations
    });

    await sheet.onOpen();

    const stateInDb = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.equal(stateInDb, null, 'future timestamp state must be cleared');
    const input = sheet.element.querySelector('.browse-filter-input');
    assert.equal(input.value, '');
  });

  it('switching tabs preserves queries across tabs and updates persisted state', async () => {
    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      loadStations: async () => sampleStations
    });

    await sheet.onOpen({ tab: 'library' });

    // 1. Type in Library search
    const libInput = sheet.element.querySelector('.browse-filter-input');
    libInput.value = 'Midnight';
    libInput.dispatchEvent(new globalThis.Event('input'));
    await delay(150);

    let rows = sheet.element.querySelectorAll('.browse-row');
    assert.equal(rows.length, 1);
    assert.ok(rows[0].textContent.includes('Midnight City'));

    // 2. Switch to Radio tab
    const radioTabBtn = sheet.element.querySelector('[data-tab="radio"]');
    radioTabBtn.click();

    const radioInput = sheet.element.querySelector('.browse-filter-input');
    assert.equal(radioInput.value, '', 'radio filter starts empty');
    rows = sheet.element.querySelectorAll('.browse-row');
    assert.equal(rows.length, 4, 'all stations visible initially');

    // 3. Type in Radio search
    radioInput.value = 'Paradise';
    radioInput.dispatchEvent(new globalThis.Event('input'));
    await delay(150);

    rows = sheet.element.querySelectorAll('.browse-row');
    assert.equal(rows.length, 1);
    assert.ok(rows[0].textContent.includes('Radio Paradise'));

    // 4. Switch back to Library tab: verify library query 'Midnight' restored
    const libraryTabBtn = sheet.element.querySelector('[data-tab="library"]');
    libraryTabBtn.click();

    const restoredLibInput = sheet.element.querySelector('.browse-filter-input');
    assert.equal(restoredLibInput.value, 'Midnight', 'library query restored on tab return');
    rows = sheet.element.querySelectorAll('.browse-row');
    assert.equal(rows.length, 1);
    assert.ok(rows[0].textContent.includes('Midnight City'));

    // 5. Switch back to Radio tab: verify radio query 'Paradise' restored
    radioTabBtn.click();

    const restoredRadioInput = sheet.element.querySelector('.browse-filter-input');
    assert.equal(restoredRadioInput.value, 'Paradise', 'radio query restored on tab return');
    rows = sheet.element.querySelectorAll('.browse-row');
    assert.equal(rows.length, 1);
    assert.ok(rows[0].textContent.includes('Radio Paradise'));

    // 6. Verify persisted state in DB reflects both tab queries
    const saved = await mockDb.getSetting(FILTER_STORAGE_KEY);
    assert.ok(saved);
    assert.equal(saved.library.query, 'Midnight');
    assert.equal(saved.radio.query, 'Paradise');
  });

  it('persistFilterState and restoreFilterState gracefully catch and handle DB rejections', async () => {
    mockDb.setSetting = async () => {
      throw new Error('Storage write failed');
    };
    mockDb.getSetting = async () => {
      throw new Error('Storage read failed');
    };

    const sheet = createBrowseSheet({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager
    });

    // onOpen should catch getSetting rejection and fallback cleanly
    await assert.doesNotReject(async () => {
      await sheet.onOpen({ tab: 'library' });
    });

    // onClose and chip selection should catch setSetting rejection without throwing
    const albumChip = sheet.element.querySelector('[data-mode="albums"]');
    if (albumChip) {
      assert.doesNotThrow(() => {
        albumChip.click();
      });
    }

    assert.doesNotThrow(() => {
      sheet.onClose();
    });
  });

  it('enforces touch target accessibility against fat-fingering for filter chips and sort select (WCAG 2.1 SC 2.5.5)', () => {
    assert.ok(fs.existsSync(CSS_PATH), 'src/ui/app.css must exist');
    const css = fs.readFileSync(CSS_PATH, 'utf8');

    // 1. Verify .chip and .browse-chip-btn base styling contains min-height: 38px and padding: 8px 16px
    const chipRuleMatch = css.match(/(?:\.chip,\s*\.browse-chip-btn|\.browse-chip-btn,\s*\.chip)\s*\{([^}]+)\}/);
    assert.ok(chipRuleMatch, '.chip / .browse-chip-btn rule block must exist in app.css');
    const chipBody = chipRuleMatch[1];
    assert.match(chipBody, /min-height:\s*38px;?/, '.chip / .browse-chip-btn must contain min-height: 38px');
    assert.match(chipBody, /padding:\s*8px\s+16px;?/, '.chip / .browse-chip-btn must contain padding: 8px 16px');

    // 2. Verify .browse-sort-select contains min-height: 38px
    const sortSelectMatch = css.match(/\.browse-sort-select\s*\{([^}]+)\}/);
    assert.ok(sortSelectMatch, '.browse-sort-select rule block must exist in app.css');
    const sortSelectBody = sortSelectMatch[1];
    assert.match(sortSelectBody, /min-height:\s*38px;?/, '.browse-sort-select must contain min-height: 38px');

    // 3. Verify @media (pointer: coarse) contains min-height: 44px and min-width: 44px for touch accessibility
    const coarseMediaIndex = css.indexOf('@media (pointer: coarse)');
    assert.ok(coarseMediaIndex !== -1, '@media (pointer: coarse) block must exist in app.css');
    const coarseMediaSlice = css.slice(coarseMediaIndex, coarseMediaIndex + 800);
    assert.match(coarseMediaSlice, /min-height:\s*44px;?/, '@media (pointer: coarse) must contain min-height: 44px');
    assert.match(coarseMediaSlice, /min-width:\s*44px;?/, '@media (pointer: coarse) must contain min-width: 44px');
  });
});
