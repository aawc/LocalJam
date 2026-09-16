/**
 * LocalJam - L2 Overflow Menu Unit Test Suite
 * Asserts row inventory, bracketed state labels, store-name regression against db.js,
 * reset confirmation semantics, radio mode filtering, and focus management.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';
import {
  createOverflowMenu,
  RESET_STORE_NAMES
} from '../../src/ui/components/overflow-menu.js';
import { APP_VERSION } from '../../src/version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('Overflow Menu Component (L2)', () => {
  let container;

  beforeEach(() => {
    setupMockDom();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    teardownMockDom();
  });

  it('exports verified RESET_STORE_NAMES array matching db.js stores', () => {
    const expected = [
      'roots', 'tracks', 'artwork', 'playlists',
      'favorites', 'playHistory', 'playbackState', 'settings'
    ];
    assert.deepEqual(RESET_STORE_NAMES, expected);
    assert.equal(RESET_STORE_NAMES.includes('stations'), false, "RESET_STORE_NAMES must not include 'stations'");

    // Store-name regression test against src/storage/db.js
    const dbPath = path.join(REPO_ROOT, 'src', 'storage', 'db.js');
    const dbSource = fs.readFileSync(dbPath, 'utf8');

    const createdStores = new Set();
    const regex = /createObjectStore\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(dbSource)) !== null) {
      createdStores.add(match[1]);
    }

    assert.ok(createdStores.size >= 8, 'db.js should define object stores');
    for (const storeName of RESET_STORE_NAMES) {
      assert.ok(
        createdStores.has(storeName),
        `Store '${storeName}' in RESET_STORE_NAMES must exist in db.js created stores`
      );
    }
  });

  it('renders required rows with bracketed state labels and no inline handlers', () => {
    const menu = createOverflowMenu({
      onToast: () => {}
    });
    container.appendChild(menu.element);
    menu.onOpen();

    const html = menu.element.innerHTML;

    // SEC-06 / CSP: No inline event handlers
    assert.doesNotMatch(html, /onclick\s*=/i);
    assert.doesNotMatch(html, /onerror\s*=/i);

    // Required row labels
    assert.ok(html.includes('Star'), "Must contain 'Star'");
    assert.ok(html.includes('Shuffle'), "Must contain 'Shuffle'");
    assert.ok(html.includes('Repeat'), "Must contain 'Repeat'");
    assert.ok(html.includes('Volume'), "Must contain 'Volume'");
    assert.ok(html.includes('Equalizer'), "Must contain 'Equalizer'");
    assert.ok(html.includes('Visualizer'), "Must contain 'Visualizer'");
    assert.ok(html.includes('Add music folder'), "Must contain 'Add music folder'");
    assert.ok(html.includes('Rescan library'), "Must contain 'Rescan library'");
    assert.ok(html.includes('Reset library'), "Must contain 'Reset library'");
    assert.ok(html.includes(`LocalJam ${APP_VERSION}`), `Must contain 'LocalJam ${APP_VERSION}'`);

    // Explicit bracketed state labels
    assert.ok(html.includes('[NOT STARRED]') || html.includes('[STARRED]'));
    assert.ok(html.includes('[OFF]') || html.includes('[ON]'));
    assert.ok(html.includes('[IMPORT]'));
    assert.ok(html.includes('[RELEASE NOTES]'));
    assert.ok(html.includes('[DESTRUCTIVE]'));

    // Accessibility attributes
    assert.equal(menu.element.getAttribute('role'), 'dialog');
    assert.equal(menu.element.getAttribute('aria-modal'), 'true');
    assert.ok(menu.element.getAttribute('aria-label'));
  });

  it('hides Shuffle and Repeat rows when isRadio is true', () => {
    const menu = createOverflowMenu({
      audioEngine: { isRadio: true, volume: 0.8, muted: false },
      onToast: () => {}
    });
    container.appendChild(menu.element);
    menu.onOpen({ isRadio: true });

    const html = menu.element.innerHTML;
    assert.ok(!html.includes('Shuffle'), "Shuffle must not appear when playing radio");
    assert.ok(!html.includes('Repeat'), "Repeat must not appear when playing radio");
    assert.ok(html.includes('Star'), "Star must appear for radio");
    assert.ok(html.includes('Volume'), "Volume must appear for radio");
    assert.ok(html.includes('Equalizer'), "Equalizer must appear for radio");
  });

  it('confirmation prompt: cancels reset when confirm is rejected', async () => {
    let resetInvoked = false;
    const clearedStores = [];

    const mockDb = {
      clearStore: async (store) => {
        clearedStores.push(store);
      }
    };

    const originalConfirm = globalThis.confirm;
    globalThis.confirm = () => false;

    try {
      const menu = createOverflowMenu({
        db: mockDb,
        onReset: async () => {
          resetInvoked = true;
        },
        onToast: () => {}
      });
      container.appendChild(menu.element);
      menu.onOpen();

      const resetBtn = menu.element.querySelector('[data-action="reset"]');
      assert.ok(resetBtn, 'Reset button must exist');

      await resetBtn.dispatchEvent(new Event('click'));

      assert.equal(resetInvoked, false, 'onReset must not be called when confirmation is cancelled');
      assert.equal(clearedStores.length, 0, 'No stores should be cleared when cancelled');
    } finally {
      globalThis.confirm = originalConfirm;
    }
  });

  it('confirmation prompt: executes reset and wipes all 8 stores when confirmed', async () => {
    let resetInvoked = false;
    const clearedStores = [];
    let toastMessage = '';

    const mockDb = {
      clearStore: async (store) => {
        clearedStores.push(store);
      }
    };

    const originalConfirm = globalThis.confirm;
    globalThis.confirm = () => true;

    try {
      const menu = createOverflowMenu({
        db: mockDb,
        onReset: async () => {
          resetInvoked = true;
        },
        onToast: (msg) => {
          toastMessage = msg;
        }
      });
      container.appendChild(menu.element);
      menu.onOpen();

      const resetBtn = menu.element.querySelector('[data-action="reset"]');
      assert.ok(resetBtn, 'Reset button must exist');

      resetBtn.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(resetInvoked, true, 'onReset must be called when confirmed');
      assert.deepEqual(clearedStores, RESET_STORE_NAMES, 'All 8 RESET_STORE_NAMES must be cleared');
      assert.ok(toastMessage.includes('[RESET]'), 'Must announce reset via toast');
    } finally {
      globalThis.confirm = originalConfirm;
    }
  });

  it('toggles track star and updates label with toast feedback', async () => {
    let toggleFavoriteCalled = false;
    let toastMessage = '';

    const mockTrack = { id: 'track-1', title: 'Midnight City' };
    const mockDb = {
      isFavorite: async () => false,
      toggleFavorite: async () => {
        toggleFavoriteCalled = true;
        return true; // now starred
      }
    };

    const menu = createOverflowMenu({
      db: mockDb,
      audioEngine: { isRadio: false, currentTrack: mockTrack },
      onToast: (msg) => {
        toastMessage = msg;
      }
    });
    container.appendChild(menu.element);
    await menu.onOpen({ currentTrack: mockTrack, isStarred: false });

    const starBtn = menu.element.querySelector('[data-action="star"]');
    assert.ok(starBtn);
    assert.ok(starBtn.innerHTML.includes('[NOT STARRED]'));

    await starBtn.dispatchEvent(new Event('click'));

    assert.equal(toggleFavoriteCalled, true);
    assert.ok(starBtn.innerHTML.includes('[STARRED]'));
    assert.ok(toastMessage.includes('[STARRED]'));
  });

  it('toggles radio station star and updates label with toast feedback (F1/F3)', async () => {
    let toastMessage = '';
    const mockStation = { id: 'station-1', name: 'SomaFM Groove Salad', isFavorite: false };
    const mockDb = {
      isFavorite: async () => false,
      getStations: async () => [mockStation],
      saveStations: async (stations) => {
        const found = stations.find((s) => s.id === mockStation.id);
        if (found) mockStation.isFavorite = found.isFavorite;
      },
      getSetting: async () => null,
      setSetting: async () => {}
    };

    const menu = createOverflowMenu({
      db: mockDb,
      audioEngine: { isRadio: true, currentStation: mockStation },
      onToast: (msg) => {
        toastMessage = msg;
      }
    });
    container.appendChild(menu.element);
    menu.onOpen({ isRadio: true, currentStation: mockStation, isStarred: false });

    const starBtn = menu.element.querySelector('[data-action="star"]');
    assert.ok(starBtn);
    assert.ok(starBtn.innerHTML.includes('[NOT STARRED]'));

    starBtn.dispatchEvent(new Event('click'));
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(mockStation.isFavorite, true);
    assert.ok(starBtn.innerHTML.includes('[STARRED]'));
    assert.ok(toastMessage.includes('[STARRED] SomaFM Groove Salad'));
  });

  it('toggles shuffle via queueManager and announces state', async () => {
    let shuffleState = false;
    let toastMessage = '';

    const mockQueue = {
      get shuffle() { return shuffleState; },
      toggleShuffle: () => {
        shuffleState = !shuffleState;
        return shuffleState;
      },
      repeat: 'off',
      cycleRepeat: () => 'off'
    };

    const menu = createOverflowMenu({
      queueManager: mockQueue,
      audioEngine: { isRadio: false },
      onToast: (msg) => { toastMessage = msg; }
    });
    container.appendChild(menu.element);
    menu.onOpen();

    const shuffleBtn = menu.element.querySelector('[data-action="shuffle"]');
    assert.ok(shuffleBtn);
    assert.ok(shuffleBtn.innerHTML.includes('[OFF]'));

    await shuffleBtn.dispatchEvent(new Event('click'));
    assert.equal(shuffleState, true);
    assert.ok(shuffleBtn.innerHTML.includes('[ON]'));
    assert.equal(toastMessage, '[SHUFFLE ON]');
  });

  it('cycles repeat modes via queueManager and announces state', async () => {
    let repeatState = 'off';
    let toastMessage = '';

    const mockQueue = {
      shuffle: false,
      toggleShuffle: () => false,
      get repeat() { return repeatState; },
      cycleRepeat: () => {
        if (repeatState === 'off') repeatState = 'all';
        else if (repeatState === 'all') repeatState = 'one';
        else repeatState = 'off';
        return repeatState;
      }
    };

    const menu = createOverflowMenu({
      queueManager: mockQueue,
      audioEngine: { isRadio: false },
      onToast: (msg) => { toastMessage = msg; }
    });
    container.appendChild(menu.element);
    menu.onOpen();

    const repeatBtn = menu.element.querySelector('[data-action="repeat"]');
    assert.ok(repeatBtn);
    assert.ok(repeatBtn.innerHTML.includes('[OFF]'));

    await repeatBtn.dispatchEvent(new Event('click'));
    assert.equal(repeatState, 'all');
    assert.ok(repeatBtn.innerHTML.includes('[ALL]'));
    assert.equal(toastMessage, '[REPEAT ALL]');

    await repeatBtn.dispatchEvent(new Event('click'));
    assert.equal(repeatState, 'one');
    assert.ok(repeatBtn.innerHTML.includes('[ONE]'));
    assert.equal(toastMessage, '[REPEAT ONE]');
  });

  it('volume slider and mute button update audioEngine', async () => {
    let volumeSet = null;
    let muteToggled = false;

    const mockAudioEngine = {
      volume: 0.7,
      muted: false,
      setVolume: (v) => { volumeSet = v; },
      toggleMute: () => {
        muteToggled = true;
        mockAudioEngine.muted = !mockAudioEngine.muted;
      }
    };

    const menu = createOverflowMenu({
      audioEngine: mockAudioEngine,
      onToast: () => {}
    });
    container.appendChild(menu.element);
    menu.onOpen();

    const slider = menu.element.querySelector('.overflow-volume-slider');
    assert.ok(slider);

    slider.value = '0.85';
    await slider.dispatchEvent(new Event('input'));
    assert.equal(volumeSet, 0.85);

    const muteBtn = menu.element.querySelector('.overflow-volume-toggle');
    assert.ok(muteBtn);
    await muteBtn.dispatchEvent(new Event('click'));
    assert.equal(muteToggled, true);
  });

  it('action buttons invoke callbacks and close menu', async () => {
    let eqOpened = false;
    let notesOpened = false;
    let folderPicked = false;
    let rescanCalled = false;
    let closeCount = 0;

    const menu = createOverflowMenu({
      onOpenEq: () => { eqOpened = true; },
      onOpenNotes: () => { notesOpened = true; },
      onPickFolder: () => { folderPicked = true; },
      onRescan: () => { rescanCalled = true; },
      onClose: () => { closeCount++; },
      onToast: () => {}
    });
    container.appendChild(menu.element);
    menu.onOpen();

    const eqBtn = menu.element.querySelector('[data-action="eq"]');
    assert.ok(eqBtn);
    await eqBtn.dispatchEvent(new Event('click'));
    assert.equal(eqOpened, true);
    assert.equal(closeCount, 1);

    menu.onOpen();
    const folderBtn = menu.element.querySelector('[data-action="pick-folder"]');
    assert.ok(folderBtn);
    await folderBtn.dispatchEvent(new Event('click'));
    assert.equal(folderPicked, true);
    assert.equal(closeCount, 2);

    menu.onOpen();
    const rescanBtn = menu.element.querySelector('[data-action="rescan"]');
    assert.ok(rescanBtn);
    await rescanBtn.dispatchEvent(new Event('click'));
    assert.equal(rescanCalled, true);
    assert.equal(closeCount, 3);

    menu.onOpen();
    const notesBtn = menu.element.querySelector('[data-action="notes"]');
    assert.ok(notesBtn);
    await notesBtn.dispatchEvent(new Event('click'));
    assert.equal(notesOpened, true);
    assert.equal(closeCount, 4);
  });

  it('focusFirst directs focus to the first focusable element', () => {
    const menu = createOverflowMenu({
      onToast: () => {}
    });
    container.appendChild(menu.element);
    menu.onOpen();

    menu.focusFirst();
    const firstBtn = menu.element.querySelector('button');
    assert.equal(document.activeElement, firstBtn);
  });

  it('Escape key invokes onClose and restores focus to opener element', async () => {
    let closed = false;
    const opener = document.createElement('button');
    container.appendChild(opener);
    opener.focus();

    const menu = createOverflowMenu({
      onClose: () => { closed = true; },
      onToast: () => {}
    });
    container.appendChild(menu.element);
    menu.onOpen({ openerEl: opener });

    await menu.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(closed, true);
    assert.equal(document.activeElement, opener);
  });

  it('Tab and Shift+Tab wrap focus within the overflow dialog (F3)', () => {
    const menu = createOverflowMenu({
      onToast: () => {}
    });
    container.appendChild(menu.element);
    menu.onOpen();

    const focusables = Array.from(
      menu.element.querySelectorAll('button, input, select, [tabindex="0"]')
    ).filter((el) => !el.disabled && el.style.display !== 'none' && !el.hidden);

    assert.ok(focusables.length >= 2, 'Should have multiple focusable elements');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // Focus last element and press Tab -> wraps to first
    last.focus();
    assert.equal(document.activeElement, last);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    menu.element.dispatchEvent(tabEvent);
    assert.equal(document.activeElement, first);
    assert.equal(tabEvent.defaultPrevented, true);

    // Focus first element and press Shift+Tab -> wraps to last
    first.focus();
    assert.equal(document.activeElement, first);

    const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    menu.element.dispatchEvent(shiftTabEvent);
    assert.equal(document.activeElement, last);
    assert.equal(shiftTabEvent.defaultPrevented, true);
  });
});
