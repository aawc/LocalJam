import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardManager } from '../../src/ui/keyboard.js';
import { audioEngine } from '../../src/player/audio-engine.js';
import { queueManager } from '../../src/player/queue.js';

test('KeyboardManager - handles playback and navigation shortcuts', () => {
  const km = new KeyboardManager();

  let playToggled = false;
  let seekOffset = 0;
  let prevCalled = false;
  let nextCalled = false;
  let muteToggled = false;
  let shuffleToggled = false;
  let repeatCycled = false;

  audioEngine.togglePlay = () => {
    playToggled = true;
  };
  audioEngine.seekRelative = (sec) => {
    seekOffset += sec;
  };
  audioEngine.previous = () => {
    prevCalled = true;
  };
  audioEngine.next = () => {
    nextCalled = true;
  };
  audioEngine.toggleMute = () => {
    muteToggled = true;
  };
  queueManager.toggleShuffle = () => {
    shuffleToggled = true;
  };
  queueManager.cycleRepeat = () => {
    repeatCycled = true;
  };

  // Mock event helper
  const createMockEvent = (code, shiftKey = false, ctrlKey = false, key = '') => {
    let prevented = false;
    return {
      code,
      key: key || code.replace('Key', ''),
      shiftKey,
      ctrlKey,
      metaKey: false,
      preventDefault: () => {
        prevented = true;
      },
      get isPrevented() {
        return prevented;
      }
    };
  };

  // Space -> Play/Pause
  const spaceEvt = createMockEvent('Space');
  km.handleKeyDown(spaceEvt);
  assert.equal(playToggled, true);
  assert.equal(spaceEvt.isPrevented, true);

  // ArrowLeft -> Seek backward
  const leftEvt = createMockEvent('ArrowLeft');
  km.handleKeyDown(leftEvt);
  assert.equal(seekOffset, -5);

  // Shift + ArrowLeft -> Previous Track
  const prevEvt = createMockEvent('ArrowLeft', true);
  km.handleKeyDown(prevEvt);
  assert.equal(prevCalled, true);

  // ArrowRight -> Seek forward
  const rightEvt = createMockEvent('ArrowRight');
  km.handleKeyDown(rightEvt);
  assert.equal(seekOffset, 0); // -5 + 5 = 0

  // Shift + ArrowRight -> Next Track
  const nextEvt = createMockEvent('ArrowRight', true);
  km.handleKeyDown(nextEvt);
  assert.equal(nextCalled, true);

  // KeyM -> Mute
  const muteEvt = createMockEvent('KeyM');
  km.handleKeyDown(muteEvt);
  assert.equal(muteToggled, true);

  // KeyS -> Shuffle
  const shuffleEvt = createMockEvent('KeyS');
  km.handleKeyDown(shuffleEvt);
  assert.equal(shuffleToggled, true);

  // KeyR -> Repeat
  const repeatEvt = createMockEvent('KeyR');
  km.handleKeyDown(repeatEvt);
  assert.equal(repeatCycled, true);

  // Setup mock document for UI shortcut buttons
  let queueClicked = false;
  let eqClicked = false;
  let vizClicked = false;
  let searchFocused = false;
  let escapeCloseClicked = false;

  globalThis.document = {
    activeElement: null,
    getElementById: (id) => {
      if (id === 'btn-toggle-queue') return { click: () => { queueClicked = true; } };
      if (id === 'btn-toggle-eq') return { click: () => { eqClicked = true; } };
      if (id === 'btn-toggle-viz') return { click: () => { vizClicked = true; } };
      if (id === 'global-search-input') return { focus: () => { searchFocused = true; }, select: () => {} };
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector.includes('.btn-close')) {
        return [{ click: () => { escapeCloseClicked = true; } }];
      }
      return [];
    }
  };

  // KeyQ -> Queue toggle
  const qEvt = createMockEvent('KeyQ');
  km.handleKeyDown(qEvt);
  assert.equal(queueClicked, true);

  // KeyE -> Equalizer toggle
  const eEvt = createMockEvent('KeyE');
  km.handleKeyDown(eEvt);
  assert.equal(eqClicked, true);

  // KeyV -> Visualizer toggle
  const vEvt = createMockEvent('KeyV');
  km.handleKeyDown(vEvt);
  assert.equal(vizClicked, true);

  // Slash -> Focus search
  const slashEvt = createMockEvent('Slash', false, false, '/');
  km.handleKeyDown(slashEvt);
  assert.equal(searchFocused, true);

  // Ctrl+K -> Focus search
  searchFocused = false;
  const ctrlKEvt = createMockEvent('', false, true, 'k');
  km.handleKeyDown(ctrlKEvt);
  assert.equal(searchFocused, true);

  // Escape -> Trigger close buttons
  const escEvt = createMockEvent('Escape', false, false, 'Escape');
  km.handleKeyDown(escEvt);
  assert.equal(escapeCloseClicked, true);
});
