/**
 * LocalJam - Keyboard Shortcut Manager Test Suite
 * Asserts all 16 keyboard shortcuts (§5.2), removal of legacy shortcuts (Q, Ctrl+K),
 * layer stack toggles (L, Shift+L, E, Period, Slash), source switch (X),
 * and typing suppression in text fields.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';
import { KeyboardManager } from '../../src/ui/keyboard.js';

describe('Keyboard Shortcut Manager (src/ui/keyboard.js)', () => {
  let mockAudioEngine;
  let mockQueueManager;
  let mockLayers;
  let toastMessages;
  let sourceToggled;
  let vizToggled;
  let favToggled;

  const createMockEvent = (code, { shiftKey = false, ctrlKey = false, metaKey = false, key = '' } = {}) => {
    let prevented = false;
    return {
      code,
      key: key || code.replace('Key', ''),
      shiftKey,
      ctrlKey,
      metaKey,
      defaultPrevented: false,
      preventDefault: () => {
        prevented = true;
      },
      get isPrevented() {
        return prevented;
      }
    };
  };

  beforeEach(() => {
    setupMockDom();
    toastMessages = [];
    sourceToggled = false;
    vizToggled = false;
    favToggled = false;

    mockAudioEngine = {
      isPlaying: false,
      volume: 0.5,
      muted: false,
      isRadio: false,
      togglePlay: () => { mockAudioEngine.isPlaying = !mockAudioEngine.isPlaying; },
      seekRelative: (delta) => { mockAudioEngine.seekOffset = (mockAudioEngine.seekOffset || 0) + delta; },
      previous: () => { mockAudioEngine.prevCalled = true; },
      next: () => { mockAudioEngine.nextCalled = true; },
      setVolume: (v) => { mockAudioEngine.volume = Math.max(0, Math.min(1, v)); },
      toggleMute: () => { mockAudioEngine.muted = !mockAudioEngine.muted; }
    };

    mockQueueManager = {
      shuffle: false,
      repeat: 'off',
      toggleShuffle: () => {
        mockQueueManager.shuffle = !mockQueueManager.shuffle;
        return mockQueueManager.shuffle;
      },
      cycleRepeat: () => {
        mockQueueManager.repeat = mockQueueManager.repeat === 'off' ? 'all' : (mockQueueManager.repeat === 'all' ? 'one' : 'off');
        return mockQueueManager.repeat;
      }
    };

    const layerStack = [];
    mockLayers = {
      get top() {
        return layerStack.length > 0 ? layerStack[layerStack.length - 1].name : null;
      },
      open: (name, props) => {
        layerStack.push({ name, props });
        return { name, props };
      },
      close: () => {
        return layerStack.pop() || null;
      },
      _stack: layerStack
    };
  });

  afterEach(() => {
    teardownMockDom();
  });

  it('handles playback transport: Space, ArrowLeft/Right, Shift+ArrowLeft/Right', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers
    });

    // Space -> Toggle Play
    const spaceEvt = createMockEvent('Space');
    km.handleKeyDown(spaceEvt);
    assert.equal(mockAudioEngine.isPlaying, true);
    assert.equal(spaceEvt.isPrevented, true);

    // ArrowLeft -> Seek -5s
    const leftEvt = createMockEvent('ArrowLeft');
    km.handleKeyDown(leftEvt);
    assert.equal(mockAudioEngine.seekOffset, -5);
    assert.equal(leftEvt.isPrevented, true);

    // ArrowRight -> Seek +5s
    const rightEvt = createMockEvent('ArrowRight');
    km.handleKeyDown(rightEvt);
    assert.equal(mockAudioEngine.seekOffset, 0);
    assert.equal(rightEvt.isPrevented, true);

    // Shift + ArrowLeft -> Previous
    const prevEvt = createMockEvent('ArrowLeft', { shiftKey: true });
    km.handleKeyDown(prevEvt);
    assert.equal(mockAudioEngine.prevCalled, true);

    // Shift + ArrowRight -> Next
    const nextEvt = createMockEvent('ArrowRight', { shiftKey: true });
    km.handleKeyDown(nextEvt);
    assert.equal(mockAudioEngine.nextCalled, true);
  });

  it('handles volume and mute: ArrowUp/Down, KeyM with toasts', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers,
      onToast: (msg) => { toastMessages.push(msg); }
    });

    // ArrowUp -> Volume +5%
    const upEvt = createMockEvent('ArrowUp');
    km.handleKeyDown(upEvt);
    assert.equal(mockAudioEngine.volume, 0.55);
    assert.ok(toastMessages.some((m) => m.includes('55%')));

    // ArrowDown -> Volume -5%
    const downEvt = createMockEvent('ArrowDown');
    km.handleKeyDown(downEvt);
    assert.equal(mockAudioEngine.volume, 0.50);
    assert.ok(toastMessages.some((m) => m.includes('50%')));

    // KeyM -> Toggle Mute
    const muteEvt = createMockEvent('KeyM');
    km.handleKeyDown(muteEvt);
    assert.equal(mockAudioEngine.muted, true);
    assert.ok(toastMessages.some((m) => m.includes('[MUTED]')));
  });

  it('handles shuffle and repeat: KeyS, KeyR with toasts', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers,
      onToast: (msg) => { toastMessages.push(msg); }
    });

    // KeyS -> Shuffle toggle
    const shuffleEvt = createMockEvent('KeyS');
    km.handleKeyDown(shuffleEvt);
    assert.equal(mockQueueManager.shuffle, true);
    assert.ok(toastMessages.some((m) => m.includes('[SHUFFLE ON]')));

    // KeyR -> Cycle repeat
    const repeatEvt = createMockEvent('KeyR');
    km.handleKeyDown(repeatEvt);
    assert.equal(mockQueueManager.repeat, 'all');
    assert.ok(toastMessages.some((m) => m.includes('[REPEAT ALL]')));
  });

  it('handles source toggle: KeyX invokes onToggleSource', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers,
      onToggleSource: () => { sourceToggled = true; }
    });

    const xEvt = createMockEvent('KeyX');
    km.handleKeyDown(xEvt);
    assert.equal(sourceToggled, true);
    assert.equal(xEvt.isPrevented, true);
  });

  it('handles star/favorite: KeyF invokes onToggleFavorite', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers,
      onToggleFavorite: () => { favToggled = true; }
    });

    const fEvt = createMockEvent('KeyF');
    km.handleKeyDown(fEvt);
    assert.equal(favToggled, true);
    assert.equal(fEvt.isPrevented, true);
  });

  it('handles visualizer toggle: KeyV invokes onToggleVisualizer', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers,
      onToggleVisualizer: () => { vizToggled = true; }
    });

    const vEvt = createMockEvent('KeyV');
    km.handleKeyDown(vEvt);
    assert.equal(vizToggled, true);
    assert.equal(vEvt.isPrevented, true);
  });

  it('handles layer toggles: KeyL (library), Shift+KeyL (radio), KeyE (eq), Period (overflow), Slash (search)', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers
    });

    // KeyL -> Opens browse on library tab
    const lEvt = createMockEvent('KeyL');
    km.handleKeyDown(lEvt);
    assert.equal(mockLayers.top, 'browse');
    assert.equal(mockLayers._stack[mockLayers._stack.length - 1].props?.tab, 'library');

    // KeyL when browse is top -> Closes browse
    const lCloseEvt = createMockEvent('KeyL');
    km.handleKeyDown(lCloseEvt);
    assert.equal(mockLayers.top, null);

    // Shift + KeyL -> Opens browse on radio tab
    const shiftLEvt = createMockEvent('KeyL', { shiftKey: true });
    km.handleKeyDown(shiftLEvt);
    assert.equal(mockLayers.top, 'browse');
    assert.equal(mockLayers._stack[mockLayers._stack.length - 1].props?.tab, 'radio');
    mockLayers.close();

    // KeyE -> Toggles EQ layer
    const eEvt = createMockEvent('KeyE');
    km.handleKeyDown(eEvt);
    assert.equal(mockLayers.top, 'eq');
    km.handleKeyDown(createMockEvent('KeyE'));
    assert.equal(mockLayers.top, null);

    // Period -> Toggles Overflow menu
    const dotEvt = createMockEvent('Period', { key: '.' });
    km.handleKeyDown(dotEvt);
    assert.equal(mockLayers.top, 'overflow');
    km.handleKeyDown(createMockEvent('Period', { key: '.' }));
    assert.equal(mockLayers.top, null);

    // Slash -> Opens browse on library tab with focusSearch
    const slashEvt = createMockEvent('Slash', { key: '/' });
    km.handleKeyDown(slashEvt);
    assert.equal(mockLayers.top, 'browse');
    assert.equal(mockLayers._stack[mockLayers._stack.length - 1].props?.focusSearch, true);
    mockLayers.close();

    // KeyD -> Toggles feedback layer
    const keyDEvt = createMockEvent('KeyD', { key: 'd' });
    km.handleKeyDown(keyDEvt);
    assert.equal(mockLayers.top, 'feedback', 'KeyD must open feedback layer');
    km.handleKeyDown(createMockEvent('KeyD', { key: 'd' }));
    assert.equal(mockLayers.top, null, 'KeyD must close feedback layer if already open');

    // Shift+Slash (?) -> Toggles feedback layer
    const questionEvt = createMockEvent('Slash', { shiftKey: true, key: '?' });
    km.handleKeyDown(questionEvt);
    assert.equal(mockLayers.top, 'feedback', 'Shift+Slash (?) must open feedback layer');
    km.handleKeyDown(createMockEvent('Slash', { shiftKey: true, key: '?' }));
    assert.equal(mockLayers.top, null, 'Shift+Slash (?) must close feedback layer if already open');
  });

  it('handles Escape: blurs active input or closes topmost layer', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers
    });

    // When typing in an input, Escape blurs the input and does NOT close layer
    let blurred = false;
    const mockInput = {
      tagName: 'INPUT',
      blur: () => { blurred = true; }
    };
    document.activeElement = mockInput;
    mockLayers.open('browse');

    const escTyping = createMockEvent('Escape', { key: 'Escape' });
    km.handleKeyDown(escTyping);
    assert.equal(blurred, true);
    assert.equal(mockLayers.top, 'browse', "Must not close layer when blurring active text input");

    // When not typing, Escape closes the topmost layer
    document.activeElement = null;
    const escClose = createMockEvent('Escape', { key: 'Escape' });
    km.handleKeyDown(escClose);
    assert.equal(mockLayers.top, null);
  });

  it('removes legacy shortcuts: KeyQ and Ctrl+K do nothing', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers
    });

    // KeyQ -> No-op
    const qEvt = createMockEvent('KeyQ');
    km.handleKeyDown(qEvt);
    assert.equal(qEvt.isPrevented, false);
    assert.equal(mockLayers.top, null);

    // Ctrl+K -> No-op
    const ctrlKEvt = createMockEvent('KeyK', { ctrlKey: true, key: 'k' });
    km.handleKeyDown(ctrlKEvt);
    assert.equal(ctrlKEvt.isPrevented, false);
    assert.equal(mockLayers.top, null);
  });

  it('suppresses all shortcuts while user is typing in text fields', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers
    });

    const textInput = { tagName: 'TEXTAREA' };
    document.activeElement = textInput;

    // Space, X, L, F, etc. should be suppressed
    km.handleKeyDown(createMockEvent('Space'));
    assert.equal(mockAudioEngine.isPlaying, false);

    km.handleKeyDown(createMockEvent('KeyX'));
    assert.equal(sourceToggled, false);

    km.handleKeyDown(createMockEvent('KeyL'));
    assert.equal(mockLayers.top, null);

    km.handleKeyDown(createMockEvent('KeyF'));
    assert.equal(favToggled, false);

    // Also suppressed inside SELECT elements
    const selectEl = { tagName: 'SELECT' };
    document.activeElement = selectEl;

    km.handleKeyDown(createMockEvent('Space'));
    assert.equal(mockAudioEngine.isPlaying, false);
  });

  it('suppresses seek, shuffle, and repeat when playing radio', () => {
    mockAudioEngine.isRadio = true;
    mockAudioEngine.seekOffset = 0;

    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers,
      onToast: (msg) => { toastMessages.push(msg); }
    });

    // Seek is no-op on radio
    km.handleKeyDown(createMockEvent('ArrowLeft'));
    assert.equal(mockAudioEngine.seekOffset, 0);

    km.handleKeyDown(createMockEvent('ArrowRight'));
    assert.equal(mockAudioEngine.seekOffset, 0);

    // Shuffle and repeat are no-op on radio
    const initShuffle = mockQueueManager.shuffle;
    const initRepeat = mockQueueManager.repeat;

    km.handleKeyDown(createMockEvent('KeyS'));
    assert.equal(mockQueueManager.shuffle, initShuffle);

    km.handleKeyDown(createMockEvent('KeyR'));
    assert.equal(mockQueueManager.repeat, initRepeat);
  });

  it('ignores event when defaultPrevented is true', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers
    });

    const evt = createMockEvent('Space');
    evt.defaultPrevented = true;
    km.handleKeyDown(evt);

    assert.equal(mockAudioEngine.isPlaying, false, "Must ignore already prevented events");
  });

  it('manages window listener lifecycle via init and destroy', () => {
    const km = new KeyboardManager({
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      layers: mockLayers
    });

    km.init();
    assert.equal(km.active, true);

    // Dispatching real Event through mock window
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    assert.equal(mockAudioEngine.isPlaying, true);

    km.destroy();
    assert.equal(km.active, false);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    assert.equal(mockAudioEngine.isPlaying, true, "Should not toggle after destroy");
  });
});
