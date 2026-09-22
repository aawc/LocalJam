/**
 * LocalJam - Stage Viewport (L0) Unit Test Suite
 * Asserts 6-row layout, local track seeking, radio stream status double-coding,
 * Tier 2 re-auth prompt, empty library states, wheel volume control, and artwork gestures.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';
import { createStage } from '../../src/ui/stage.js';

describe('Stage Viewport Component (L0)', () => {
  let container;

  beforeEach(() => {
    setupMockDom();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    teardownMockDom();
  });

  it('renders local track layout with 6 rows, seek slider, and Dual-Source Handle Bar', () => {
    const mockTrack = {
      id: 'track-1',
      title: 'Midnight City',
      artist: 'M83',
      album: "Hurry Up, We're Dreaming",
      duration: 243
    };

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      currentTrack: mockTrack,
      currentStation: null,
      currentTime: 102,
      duration: 243,
      volume: 0.75,
      muted: false,
      streamState: 'playing',
      subscribe: (listener) => {
        listener({
          isRadio: false,
          isPlaying: true,
          currentTrack: mockTrack,
          currentStation: null,
          currentTime: 102,
          duration: 243,
          volume: 0.75,
          muted: false,
          streamState: 'playing'
        });
        return () => {};
      },
      setVolume: () => {},
      togglePlay: () => {},
      next: () => {},
      previous: () => {},
      seek: () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      hasFSAA: true,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);
    const html = stage.element.innerHTML;

    // Metadata
    assert.ok(html.includes('Midnight City'), "Must contain track title");
    assert.ok(html.includes('M83'), "Must contain artist");

    // Seek slider
    const seekSlider = stage.element.querySelector('.stage-seek-slider');
    assert.ok(seekSlider, "Seek slider input must exist for local track");
    assert.equal(seekSlider.getAttribute('type'), 'range');

    // Row 1 Overflow pill
    const overflowBtn = stage.element.querySelector('.btn-stage-overflow');
    assert.ok(overflowBtn, "Row 1 overflow button must exist");

    // Row 5 Transport
    const playBtn = stage.element.querySelector('.btn-stage-play');
    const prevBtn = stage.element.querySelector('.btn-stage-prev');
    const nextBtn = stage.element.querySelector('.btn-stage-next');
    assert.ok(playBtn && prevBtn && nextBtn, "Transport buttons must exist");

    // Row 6 Dual-Source Handle Bar
    const localPill = stage.element.querySelector('[data-source="local"]');
    const radioPill = stage.element.querySelector('[data-source="radio"]');
    assert.ok(localPill && radioPill, "Both Local and Radio pills must exist in Row 6");
    assert.ok(localPill.innerHTML.includes('Local'));
    assert.ok(radioPill.innerHTML.includes('Radio'));

    stage.destroy();
  });

  it('renders radio station with streamState: error as [OFFLINE] and ✖ without seek slider', () => {
    const mockStation = {
      id: 'station-1',
      name: 'SomaFM Secret Agent',
      genre: 'Spy / Lounge',
      country: 'US',
      bitrate: '128'
    };

    const mockAudioEngine = {
      isRadio: true,
      isPlaying: false,
      currentTrack: null,
      currentStation: mockStation,
      streamState: 'error',
      subscribe: (listener) => {
        listener({
          isRadio: true,
          isPlaying: false,
          currentTrack: null,
          currentStation: mockStation,
          streamState: 'error',
          volume: 0.8
        });
        return () => {};
      },
      setVolume: () => {},
      togglePlay: () => {},
      next: () => {},
      previous: () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);
    const html = stage.element.innerHTML;

    assert.ok(html.includes('[OFFLINE]'), "Must display [OFFLINE] tag");
    assert.ok(html.includes('✖'), "Must display ✖ glyph");
    assert.equal(stage.element.querySelector('.stage-seek-slider'), null, "Radio must NOT have seek slider");

    stage.destroy();
  });

  it('dispatches [STREAM OFFLINE] toast when streamState transitions to error', () => {
    let capturedToast = null;
    let registeredListener = null;

    const mockStation = {
      id: 'station-err-test',
      name: 'Stream Error Test',
      genre: 'Alternative',
      country: 'UK',
      bitrate: '128'
    };

    const mockAudioEngine = {
      isRadio: true,
      isPlaying: false,
      currentTrack: null,
      currentStation: mockStation,
      streamState: 'connecting',
      subscribe: (listener) => {
        registeredListener = listener;
        return () => {};
      },
      setVolume: () => {},
      togglePlay: () => {},
      next: () => {},
      previous: () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: (msg) => {
        capturedToast = msg;
      }
    });

    container.appendChild(stage.element);
    assert.equal(capturedToast, null, 'No toast before error transition');

    // Simulate transition to error
    registeredListener?.({
      isRadio: true,
      isPlaying: false,
      currentTrack: null,
      currentStation: mockStation,
      streamState: 'error',
      volume: 0.8
    });

    assert.equal(capturedToast, '[STREAM OFFLINE]', 'Must announce [STREAM OFFLINE] toast upon error transition');
    stage.destroy();
  });

  it('renders radio station with streamState: playing and isPlaying: false as [READY], not [LIVE]', () => {
    const mockStation = {
      id: 'station-1',
      name: 'FIP Radio',
      genre: 'Eclectic Jazz',
      country: 'FR',
      bitrate: '128'
    };

    const mockAudioEngine = {
      isRadio: true,
      isPlaying: false,
      currentTrack: null,
      currentStation: mockStation,
      streamState: 'playing',
      subscribe: (listener) => {
        listener({
          isRadio: true,
          isPlaying: false,
          currentTrack: null,
          currentStation: mockStation,
          streamState: 'playing',
          volume: 0.8
        });
        return () => {};
      },
      setVolume: () => {},
      togglePlay: () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);
    const html = stage.element.innerHTML;

    assert.ok(html.includes('[READY]'), "Must display [READY] when streamState is playing but isPlaying is false");
    assert.ok(!html.includes('[LIVE]'), "Must NOT display [LIVE] when paused");

    stage.destroy();
  });

  it('renders Tier 2 session-file missing state as Re-open music folder to play prompt', () => {
    const mockTrack = {
      id: 'track-reauth',
      title: 'Offline Song',
      artist: 'Artist',
      handle: null
    };

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: false,
      currentTrack: mockTrack,
      currentStation: null,
      subscribe: (listener) => {
        listener({
          isRadio: false,
          isPlaying: false,
          currentTrack: mockTrack,
          currentStation: null
        });
        return () => {};
      }
    };

    const mockSessionRegistry = {
      getFile: () => null // no file in memory
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      sessionRegistry: mockSessionRegistry,
      hasFSAA: false, // Tier 2 browser simulation
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);
    const html = stage.element.innerHTML;

    assert.ok(html.includes('Re-open music folder to play'), "Must render re-open folder prompt on Tier 2");

    stage.destroy();
  });

  it('renders empty library state with Nothing playing and Open music folder', () => {
    const mockAudioEngine = {
      isRadio: false,
      isPlaying: false,
      currentTrack: null,
      currentStation: null,
      subscribe: (listener) => {
        listener({
          isRadio: false,
          isPlaying: false,
          currentTrack: null,
          currentStation: null
        });
        return () => {};
      }
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);
    const html = stage.element.innerHTML;

    assert.ok(html.includes('Nothing playing'));
    assert.ok(html.includes('Open music folder'));

    stage.destroy();
  });

  it('renders Row 1 interactive chip [SHUFFLE] when shuffle is active', () => {
    let shuffleToggled = false;
    const mockQueue = {
      shuffle: true,
      repeat: 'off',
      toggleShuffle: () => {
        shuffleToggled = true;
      }
    };

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      currentTrack: { id: 't1', title: 'Track 1' },
      subscribe: (listener) => {
        listener({
          isRadio: false,
          isPlaying: true,
          currentTrack: { id: 't1', title: 'Track 1' }
        });
        return () => {};
      }
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      queueManager: mockQueue,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const shuffleChip = stage.element.querySelector('[data-chip="shuffle"]');
    assert.ok(shuffleChip, "[SHUFFLE] chip must exist in Row 1 when active");
    assert.ok(shuffleChip.textContent.includes('[SHUFFLE]'));

    shuffleChip.dispatchEvent(new Event('click'));
    assert.equal(shuffleToggled, true);

    stage.destroy();
  });

  it('wheel event on Stage updates audioEngine volume and displays toast', () => {
    let volumeSet = null;
    let toastMessage = '';

    const mockAudioEngine = {
      volume: 0.5,
      isRadio: false,
      isPlaying: true,
      subscribe: (listener) => {
        listener({ volume: 0.5, isPlaying: true });
        return () => {};
      },
      setVolume: (v) => {
        volumeSet = v;
        mockAudioEngine.volume = v;
      }
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: (msg) => {
        toastMessage = msg;
      }
    });

    container.appendChild(stage.element);

    // Wheel up: +5%
    stage.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
    assert.equal(volumeSet, 0.55);
    assert.equal(toastMessage, '[VOLUME 55%]');

    stage.destroy();
  });

  it('double-tap on artwork calls toggleFavorite and shows [STARRED] toast', async () => {
    let starToggled = false;
    let toastMessage = '';

    const mockTrack = { id: 'track-star', title: 'Midnight City' };
    const mockDb = {
      isFavorite: async () => false,
      toggleFavorite: async () => {
        starToggled = true;
        return true;
      }
    };

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      currentTrack: mockTrack,
      subscribe: (listener) => {
        listener({ isRadio: false, isPlaying: true, currentTrack: mockTrack });
        return () => {};
      }
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      db: mockDb,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: (msg) => {
        toastMessage = msg;
      }
    });

    container.appendChild(stage.element);

    const artworkEl = stage.element.querySelector('.stage-artwork-container');
    assert.ok(artworkEl);

    // Simulate double-tap
    await artworkEl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }));
    await artworkEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 100 }));
    await artworkEl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }));
    await artworkEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 100 }));

    await new Promise((r) => setTimeout(r, 20));

    assert.equal(starToggled, true);
    assert.ok(toastMessage.includes('[STARRED]'));

    stage.destroy();
  });

  it('single tap on artwork toggles and cycles visualizer mode', async () => {
    let toastMessage = '';
    const mockVisualizer = {
      isRunning: false,
      mode: 'bars',
      start: () => { mockVisualizer.isRunning = true; },
      pause: () => { mockVisualizer.isRunning = false; },
      setMode: (m) => { mockVisualizer.mode = m; },
      resize: () => {}
    };

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      currentTrack: { id: 't1', title: 'Track 1' },
      subscribe: (listener) => {
        listener({ isRadio: false, isPlaying: true, currentTrack: { id: 't1', title: 'Track 1' } });
        return () => {};
      }
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      visualizer: mockVisualizer,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: (msg) => {
        toastMessage = msg;
      }
    });

    container.appendChild(stage.element);

    const artworkEl = stage.element.querySelector('.stage-artwork-container');
    assert.ok(artworkEl);

    // Tap 1: enables visualizer (bars)
    await artworkEl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }));
    await artworkEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 100 }));
    await new Promise((r) => setTimeout(r, 350)); // wait past double-tap window

    assert.equal(mockVisualizer.isRunning, true);
    assert.equal(mockVisualizer.mode, 'bars');
    assert.ok(toastMessage.includes('BARS'));

    stage.destroy();
  });

  it('auxclick middle-click on stage toggles mute and shows [MUTED] toast', () => {
    let muteToggled = false;
    let toastMessage = '';

    const mockAudioEngine = {
      volume: 0.8,
      muted: false,
      isRadio: false,
      isPlaying: true,
      subscribe: () => () => {},
      toggleMute: () => {
        muteToggled = true;
        mockAudioEngine.muted = !mockAudioEngine.muted;
      }
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: (msg) => { toastMessage = msg; }
    });

    container.appendChild(stage.element);

    // Mousedown on button 1 should prevent default
    const mdEvt = new MouseEvent('mousedown', { button: 1, cancelable: true });
    stage.element.dispatchEvent(mdEvt);
    assert.equal(mdEvt.defaultPrevented, true);

    // Auxclick on button 1
    const auxEvt = new MouseEvent('auxclick', { button: 1, cancelable: true });
    stage.element.dispatchEvent(auxEvt);

    assert.equal(muteToggled, true);
    assert.equal(toastMessage, '[MUTED]');

    stage.destroy();
  });

  it('renders Row 1 [REPEAT ONE] and [EQ] chips and handles repeat cycle', () => {
    let repeatCycled = false;
    let overflowOpened = false;

    const mockQueue = {
      shuffle: false,
      repeat: 'one',
      cycleRepeat: () => {
        repeatCycled = true;
        mockQueue.repeat = 'all';
        return 'all';
      },
      subscribe: () => () => {}
    };

    const mockEqualizer = {
      gains: [3, 2, 0, 0, 0, 0, 0, 0, 0, 0]
    };

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      currentTrack: { id: 't-eq', title: 'EQ Track' },
      subscribe: (listener) => {
        listener({ isRadio: false, isPlaying: true, currentTrack: { id: 't-eq', title: 'EQ Track' } });
        return () => {};
      }
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      queueManager: mockQueue,
      equalizer: mockEqualizer,
      onOpenBrowse: () => {},
      onOpenOverflow: () => { overflowOpened = true; },
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const repeatChip = stage.element.querySelector('[data-chip="repeat"]');
    assert.ok(repeatChip, "[REPEAT ONE] chip must exist");
    assert.ok(repeatChip.textContent.includes('[REPEAT ONE]'));

    repeatChip.dispatchEvent(new Event('click'));
    assert.equal(repeatCycled, true);

    const eqChip = stage.element.querySelector('[data-chip="eq"]');
    assert.ok(eqChip, "[EQ] chip must exist when equalizer has custom gains");
    assert.ok(eqChip.textContent.includes('[EQ]'));

    eqChip.dispatchEvent(new Event('click'));
    assert.equal(overflowOpened, true);

    stage.destroy();
  });

  it('horizontal swipe on Row 6 source bar triggers onToggleSource', async () => {
    let sourceToggled = false;

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: false,
      subscribe: () => () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => { sourceToggled = true; },
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const sourceBar = stage.element.querySelector('.stage-source-bar');
    assert.ok(sourceBar);

    // Swipe left: start at 250, move to 50
    await sourceBar.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 250, clientY: 100 }));
    await sourceBar.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 50, clientY: 100 }));

    assert.equal(sourceToggled, true, "Horizontal swipe must invoke onToggleSource");

    stage.destroy();
  });

  it('long-press on artwork triggers onOpenOverflow', async () => {
    let overflowOpened = false;

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: false,
      subscribe: () => () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => { overflowOpened = true; },
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const artworkEl = stage.element.querySelector('.stage-artwork-container');
    assert.ok(artworkEl);

    await artworkEl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }));
    await new Promise((r) => setTimeout(r, 550)); // wait for long-press timer (500ms)
    await artworkEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 100 }));

    assert.equal(overflowOpened, true, "Long press on artwork must trigger onOpenOverflow");

    stage.destroy();
  });

  it('clicking inactive Radio pill when Local is active triggers onToggleSource', () => {
    let sourceToggled = false;
    let browseOpenedWith = null;

    const mockTrack = { id: 't1', title: 'Local Song', artist: 'Artist' };
    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      currentTrack: mockTrack,
      currentStation: null,
      subscribe: () => () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      hasFSAA: true,
      onOpenBrowse: (tab) => { browseOpenedWith = tab; },
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => { sourceToggled = true; },
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const radioPill = stage.element.querySelector('[data-source="radio"]');
    assert.ok(radioPill, "Radio pill must exist");
    radioPill.click();

    assert.equal(sourceToggled, true, "Clicking inactive Radio option must trigger onToggleSource");
    assert.equal(browseOpenedWith, null, "Clicking inactive Radio option must not open browse sheet");

    stage.destroy();
  });

  it('clicking active Local pill when Local is active opens library browse sheet', () => {
    let sourceToggled = false;
    let browseOpenedWith = null;

    const mockTrack = { id: 't1', title: 'Local Song', artist: 'Artist' };
    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      currentTrack: mockTrack,
      currentStation: null,
      subscribe: () => () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      hasFSAA: true,
      onOpenBrowse: (tab) => { browseOpenedWith = tab; },
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => { sourceToggled = true; },
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const localPill = stage.element.querySelector('[data-source="local"]');
    assert.ok(localPill, "Local pill must exist");
    localPill.click();

    assert.equal(sourceToggled, false, "Clicking active Local option must not trigger onToggleSource");
    assert.equal(browseOpenedWith, 'library', "Clicking active Local option must open library browse sheet");

    stage.destroy();
  });

  it('clicking inactive Local pill when Radio is active triggers onToggleSource', () => {
    let sourceToggled = false;
    let browseOpenedWith = null;

    const mockStation = { id: 's1', name: 'NTS Radio 1' };
    const mockAudioEngine = {
      isRadio: true,
      isPlaying: true,
      currentTrack: null,
      currentStation: mockStation,
      subscribe: () => () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: (tab) => { browseOpenedWith = tab; },
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => { sourceToggled = true; },
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const localPill = stage.element.querySelector('[data-source="local"]');
    assert.ok(localPill, "Local pill must exist");
    localPill.click();

    assert.equal(sourceToggled, true, "Clicking inactive Local option must trigger onToggleSource");
    assert.equal(browseOpenedWith, null, "Clicking inactive Local option must not open browse sheet");

    stage.destroy();
  });

  it('clicking active Radio pill when Radio is active opens radio browse sheet', () => {
    let sourceToggled = false;
    let browseOpenedWith = null;

    const mockStation = { id: 's1', name: 'NTS Radio 1' };
    const mockAudioEngine = {
      isRadio: true,
      isPlaying: true,
      currentTrack: null,
      currentStation: mockStation,
      subscribe: () => () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: (tab) => { browseOpenedWith = tab; },
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => { sourceToggled = true; },
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const radioPill = stage.element.querySelector('[data-source="radio"]');
    assert.ok(radioPill, "Radio pill must exist");
    radioPill.click();

    assert.equal(sourceToggled, false, "Clicking active Radio option must not trigger onToggleSource");
    assert.equal(browseOpenedWith, 'radio', "Clicking active Radio option must open radio browse sheet");

    stage.destroy();
  });

  it('clicking sourceBar separator dot triggers onToggleSource', () => {
    let sourceToggled = false;

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      currentTrack: { id: 't1' },
      currentStation: null,
      subscribe: () => () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => { sourceToggled = true; },
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const separator = stage.element.querySelector('.stage-source-separator');
    assert.ok(separator, "Separator dot must exist");
    separator.click();

    assert.equal(sourceToggled, true, "Clicking separator must trigger onToggleSource");

    stage.destroy();
  });

  it('renders stage feedback button in Row 1 and triggers onOpenFeedback callback on click', () => {
    let feedbackOpened = false;
    const mockAudioEngine = {
      isRadio: false,
      isPlaying: false,
      currentTrack: null,
      subscribe: () => () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onOpenFeedback: () => {
        feedbackOpened = true;
      },
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const feedbackBtn = stage.element.querySelector('.stage-btn-feedback');
    assert.ok(feedbackBtn, 'Stage feedback button must exist in Row 1');
    feedbackBtn.click();

    assert.equal(feedbackOpened, true, 'Clicking feedback button must invoke onOpenFeedback callback');
    stage.destroy();
  });

  it('initializes visualizer canvas and reflects isVisualizerEnabled state accurately', () => {
    let initializedCanvas = null;
    const mockVisualizer = {
      canvas: null,
      isRunning: false,
      mode: 'bars',
      init: (c) => {
        mockVisualizer.canvas = c;
        initializedCanvas = c;
      },
      start: () => { mockVisualizer.isRunning = true; },
      pause: () => { mockVisualizer.isRunning = false; },
      setMode: (m) => { mockVisualizer.mode = m; },
      resize: () => {}
    };

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: false,
      currentTrack: null,
      subscribe: () => () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      visualizer: mockVisualizer,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const canvas = stage.element.querySelector('.stage-visualizer-canvas');
    assert.ok(canvas, 'Canvas must exist');
    assert.equal(initializedCanvas, canvas, 'visualizer.init must be called with stage canvas');
    assert.equal(stage.isVisualizerEnabled(), false, 'Visualizer must be disabled initially');

    stage.setVisualizer(true, 'wave');
    assert.equal(stage.isVisualizerEnabled(), true, 'isVisualizerEnabled must be true when enabled');
    assert.equal(mockVisualizer.isRunning, true, 'Visualizer must start even when isPlaying is false');
    assert.equal(mockVisualizer.mode, 'wave');
    assert.equal(canvas.hidden, false, 'Canvas must not be hidden when visualizer is enabled');

    stage.setVisualizer(false);
    assert.equal(stage.isVisualizerEnabled(), false, 'isVisualizerEnabled must be false when disabled');
    assert.equal(mockVisualizer.isRunning, false, 'Visualizer must pause when disabled');
    assert.equal(canvas.hidden, true, 'Canvas must be hidden when visualizer is disabled');

    stage.destroy();
  });

  it('renders forward and rewind buttons in local playing mode and moves +/-15 seconds on click', () => {
    let seekRelativeArg = null;

    const mockTrack = {
      id: 'track-seek-15',
      title: 'Time Travel',
      artist: 'Retro Synth',
      album: 'Chronos',
      duration: 300
    };

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      currentTrack: mockTrack,
      currentStation: null,
      currentTime: 60,
      duration: 300,
      volume: 0.8,
      muted: false,
      streamState: 'playing',
      subscribe: (listener) => {
        listener({
          isRadio: false,
          isPlaying: true,
          currentTrack: mockTrack,
          currentStation: null,
          currentTime: 60,
          duration: 300,
          volume: 0.8,
          muted: false,
          streamState: 'playing'
        });
        return () => {};
      },
      seekRelative: (delta) => {
        seekRelativeArg = delta;
      },
      seek: () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const rewindBtn = stage.element.querySelector('.btn-stage-rewind');
    const forwardBtn = stage.element.querySelector('.btn-stage-forward');

    assert.ok(rewindBtn, 'Rewind button must exist in local playing mode');
    assert.ok(forwardBtn, 'Forward button must exist in local playing mode');
    assert.ok(rewindBtn.classList.contains('stage-btn-rewind'), 'Rewind button must have stage-btn-rewind class');
    assert.ok(forwardBtn.classList.contains('stage-btn-forward'), 'Forward button must have stage-btn-forward class');
    assert.equal(rewindBtn.getAttribute('aria-label'), 'Rewind 15 seconds');
    assert.equal(forwardBtn.getAttribute('aria-label'), 'Forward 15 seconds');
    assert.equal(rewindBtn.disabled, false, 'Rewind button must be enabled when track is loaded');
    assert.equal(forwardBtn.disabled, false, 'Forward button must be enabled when track is loaded');

    // Test clicking rewind button -> moves -15s
    rewindBtn.click();
    assert.equal(seekRelativeArg, -15, 'Clicking rewind button must call seekRelative(-15)');

    // Test clicking forward button -> moves +15s
    forwardBtn.click();
    assert.equal(seekRelativeArg, 15, 'Clicking forward button must call seekRelative(15)');

    stage.destroy();
  });

  it('omits forward and rewind buttons when in radio mode', () => {
    const mockStation = {
      id: 'station-radio-seek',
      name: 'Worldwide FM',
      genre: 'World',
      country: 'UK',
      bitrate: '128'
    };

    const mockAudioEngine = {
      isRadio: true,
      isPlaying: true,
      currentTrack: null,
      currentStation: mockStation,
      streamState: 'playing',
      subscribe: (listener) => {
        listener({
          isRadio: true,
          isPlaying: true,
          currentTrack: null,
          currentStation: mockStation,
          streamState: 'playing',
          volume: 0.8
        });
        return () => {};
      },
      seekRelative: () => {},
      seek: () => {}
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const rewindBtn = stage.element.querySelector('.btn-stage-rewind');
    const forwardBtn = stage.element.querySelector('.btn-stage-forward');

    assert.equal(rewindBtn, null, 'Rewind button must NOT exist in radio mode');
    assert.equal(forwardBtn, null, 'Forward button must NOT exist in radio mode');

    stage.destroy();
  });

  it('disables forward and rewind buttons in local mode when no track is loaded', () => {
    const mockAudioEngine = {
      isRadio: false,
      isPlaying: false,
      currentTrack: null,
      currentStation: null,
      currentTime: 0,
      duration: 0,
      subscribe: (listener) => {
        listener({
          isRadio: false,
          isPlaying: false,
          currentTrack: null,
          currentStation: null
        });
        return () => {};
      }
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);

    const rewindBtn = stage.element.querySelector('.btn-stage-rewind');
    const forwardBtn = stage.element.querySelector('.btn-stage-forward');

    assert.ok(rewindBtn, 'Rewind button exists in local mode even without active track');
    assert.ok(forwardBtn, 'Forward button exists in local mode even without active track');
    assert.equal(rewindBtn.disabled, true, 'Rewind button must be disabled when no track is loaded');
    assert.equal(forwardBtn.disabled, true, 'Forward button must be disabled when no track is loaded');
    assert.equal(rewindBtn.getAttribute('aria-disabled'), 'true');
    assert.equal(forwardBtn.getAttribute('aria-disabled'), 'true');

    stage.destroy();
  });

  it('dynamically adds or removes forward and rewind buttons when transitioning between local and radio modes', () => {
    let registeredListener = null;

    const mockTrack = {
      id: 'track-switch',
      title: 'Switch Track',
      artist: 'Artist',
      duration: 180
    };

    const mockStation = {
      id: 'station-switch',
      name: 'Switch Station',
      genre: 'Jazz'
    };

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      currentTrack: mockTrack,
      currentStation: null,
      subscribe: (listener) => {
        registeredListener = listener;
        return () => {};
      }
    };

    const stage = createStage({
      audioEngine: mockAudioEngine,
      onOpenBrowse: () => {},
      onOpenOverflow: () => {},
      onPickFolder: async () => true,
      onToggleSource: async () => {},
      onToast: () => {}
    });

    container.appendChild(stage.element);

    // Initially in local mode: rewind and forward buttons present
    assert.ok(stage.element.querySelector('.btn-stage-rewind'), 'Rewind button present in local mode');
    assert.ok(stage.element.querySelector('.btn-stage-forward'), 'Forward button present in local mode');

    // Switch to radio mode
    registeredListener({
      isRadio: true,
      isPlaying: true,
      currentTrack: null,
      currentStation: mockStation,
      streamState: 'playing'
    });

    assert.equal(stage.element.querySelector('.btn-stage-rewind'), null, 'Rewind button removed in radio mode');
    assert.equal(stage.element.querySelector('.btn-stage-forward'), null, 'Forward button removed in radio mode');

    // Switch back to local mode
    registeredListener({
      isRadio: false,
      isPlaying: true,
      currentTrack: mockTrack,
      currentStation: null,
      streamState: 'playing'
    });

    const restoredRewind = stage.element.querySelector('.btn-stage-rewind');
    const restoredForward = stage.element.querySelector('.btn-stage-forward');
    assert.ok(restoredRewind, 'Rewind button restored in local mode');
    assert.ok(restoredForward, 'Forward button restored in local mode');

    // Verify ordering in Row 5: prev, rewind, play, forward, next
    const row5 = stage.element.querySelector('.stage-row-5');
    const childClasses = row5.children.map((c) => c.className);
    assert.ok(childClasses[0].includes('btn-stage-prev'), '1st button is prev');
    assert.ok(childClasses[1].includes('btn-stage-rewind'), '2nd button is rewind');
    assert.ok(childClasses[2].includes('btn-stage-play'), '3rd button is play');
    assert.ok(childClasses[3].includes('btn-stage-forward'), '4th button is forward');
    assert.ok(childClasses[4].includes('btn-stage-next'), '5th button is next');

    stage.destroy();
  });
});
