import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';
import { AudioEngine } from '../../src/player/audio-engine.js';

test('Audio Engine State & Control Suite', async (t) => {
  await t.test('Initializes with default volume and inactive state', () => {
    const engine = new AudioEngine();
    assert.equal(engine.volume, 0.8);
    assert.equal(engine.muted, false);
    assert.equal(engine.isPlaying, false);
    assert.equal(engine.isRadio, false);
  });

  await t.test('Clamps volume between 0.0 and 1.0', () => {
    const engine = new AudioEngine();
    engine.setVolume(1.5);
    assert.equal(engine.volume, 1.0);

    engine.setVolume(-0.5);
    assert.equal(engine.volume, 0.0);

    engine.setVolume(0.42);
    assert.equal(engine.volume, 0.42);
  });

  await t.test('Toggles mute accurately while preserving volume level', () => {
    const engine = new AudioEngine();
    engine.setVolume(0.75);
    assert.equal(engine.muted, false);

    engine.toggleMute();
    assert.equal(engine.muted, true);
    assert.equal(engine.volume, 0.75);

    engine.toggleMute();
    assert.equal(engine.muted, false);
    assert.equal(engine.volume, 0.75);
  });

  await t.test('Notifies state listeners on state modifications', () => {
    const engine = new AudioEngine();
    let listenerState = null;
    const unsubscribe = engine.subscribe((state) => {
      listenerState = state;
    });

    engine.setVolume(0.6);
    assert.ok(listenerState);
    assert.equal(listenerState.volume, 0.6);
    assert.equal(listenerState.muted, false);

    unsubscribe();
    engine.setVolume(0.3);
    assert.equal(listenerState.volume, 0.6); // Listener no longer called
  });

  await t.test('Tracks and revokes Object URLs to prevent browser memory leaks', () => {
    const engine = new AudioEngine();
    // Simulate active URL tracking
    const fakeUrl1 = 'blob:http://localhost/fake-audio-1';
    engine.currentObjectUrl = fakeUrl1;
    engine.activeObjectUrls.add(fakeUrl1);

    assert.equal(engine.activeObjectUrls.has(fakeUrl1), true);

    // Switching to radio clears active local Object URLs
    engine.playRadio({ streamUrl: 'https://stream.radioparadise.com/mp3-320', name: 'Radio Paradise' });
    assert.equal(engine.currentObjectUrl, null);
    assert.equal(engine.isRadio, true);
  });

  await t.test('Returns silence for frequency and time-domain data when not actively playing', () => {
    const engine = new AudioEngine();
    const freqBuf = new Uint8Array(64).fill(255);
    const timeBuf = new Uint8Array(64).fill(0);

    engine.isPlaying = false;
    engine.getByteFrequencyData(freqBuf);
    engine.getByteTimeDomainData(timeBuf);

    assert.ok(freqBuf.every((v) => v === 0), 'Frequency data should be zero when stopped/paused');
    assert.ok(timeBuf.every((v) => v === 128), 'Time-domain data should be 128 (center line) when stopped/paused');
  });

  await t.test('Delegates to analyser when actively playing and analyser is connected', () => {
    const engine = new AudioEngine();
    let freqCalled = false;
    let timeCalled = false;

    engine.analyser = {
      getByteFrequencyData: (arr) => {
        freqCalled = true;
        arr.fill(150);
      },
      getByteTimeDomainData: (arr) => {
        timeCalled = true;
        arr.fill(75);
      }
    };
    engine.isPlaying = true;

    const freqBuf = new Uint8Array(32);
    const timeBuf = new Uint8Array(32);

    engine.getByteFrequencyData(freqBuf);
    engine.getByteTimeDomainData(timeBuf);

    assert.equal(freqCalled, true);
    assert.equal(timeCalled, true);
    assert.equal(freqBuf[0], 150);
    assert.equal(timeBuf[0], 75);
  });

  await t.test('playRadio updates radio state and notifies subscribers', async () => {
    const engine = new AudioEngine();
    let receivedState = null;
    engine.subscribe((state) => {
      receivedState = state;
    });

    const station = { id: 'test_station', name: 'Test Radio', streamUrl: 'https://stream.example.org/test' };
    await engine.playRadio(station);

    assert.equal(engine.isRadio, true);
    assert.equal(engine.currentStation.name, 'Test Radio');
    assert.equal(engine.currentStation.id, 'test_station');
  });

  await t.test('playRadio handles AbortError gracefully during rapid station switching', async () => {
    const engine = new AudioEngine();
    if (engine.radioAudio) {
      engine.radioAudio.play = async () => {
        const err = new Error('The play() request was interrupted by a new load request.');
        err.name = 'AbortError';
        throw err;
      };
    }

    const station = { id: 'abort_station', name: 'Abort Radio', streamUrl: 'https://stream.example.org/abort' };
    await engine.playRadio(station);
    assert.equal(engine.isRadio, true);
  });

  await t.test('Local and radio audio elements configure playsInline and do not enforce crossOrigin', () => {
    const engine = new AudioEngine();
    if (engine.audioA) {
      assert.equal(engine.audioA.playsInline, true);
      assert.notEqual(engine.audioA.crossOrigin, 'anonymous', 'audioA must not force anonymous crossOrigin on blob URLs');
    }
    if (engine.audioB) {
      assert.equal(engine.audioB.playsInline, true);
      assert.notEqual(engine.audioB.crossOrigin, 'anonymous', 'audioB must not force anonymous crossOrigin on blob URLs');
    }
    if (engine.radioAudio) {
      assert.equal(engine.radioAudio.playsInline, true);
      assert.notEqual(engine.radioAudio.crossOrigin, 'anonymous', 'radioAudio must not force anonymous crossOrigin');
    }
  });

  await t.test('unlock method resumes suspended AudioContext or initializes WebAudio', async () => {
    const prevWindow = globalThis.window;
    try {
      let resumed = false;
      globalThis.window = {
        AudioContext: class {
          constructor() {
            this.state = 'suspended';
            this.destination = {};
          }
          createGain() { return { gain: { value: 1 }, connect: () => {} }; }
          createAnalyser() { return { fftSize: 2048, smoothingTimeConstant: 0.85, connect: () => {} }; }
          createMediaElementSource() { return { connect: () => {} }; }
          resume() {
            resumed = true;
            this.state = 'running';
            return Promise.resolve();
          }
        }
      };

      const engine = new AudioEngine();
      await engine.initWebAudio();
      assert.equal(resumed, true);

      engine.audioCtx.state = 'suspended';
      resumed = false;
      engine.unlock();
      assert.equal(resumed, true);
    } finally {
      globalThis.window = prevWindow;
    }
  });

  await t.test('playRadio streams audio directly without crossOrigin blockers', async () => {
    const engine = new AudioEngine();
    let playCalled = false;

    engine.radioAudio = {
      src: '',
      volume: 1,
      removeAttribute: () => {},
      play: async () => {
        playCalled = true;
        return Promise.resolve();
      }
    };

    const station = { id: 'clean_station', name: 'Clean Radio', streamUrl: 'https://stream.example.org/live' };
    await engine.playRadio(station);

    assert.equal(playCalled, true);
    assert.equal(engine.isPlaying, true);
    assert.equal(engine.radioAudio.src, 'https://stream.example.org/live');
  });

  await t.test('playTrack resolves File from sessionRegistry and initiates playback', async () => {
    const { sessionRegistry } = await import('../../src/storage/session-registry.js');
    const engine = new AudioEngine();
    let playCalled = false;

    engine.audioB = {
      src: '',
      play: async () => {
        playCalled = true;
        return Promise.resolve();
      },
      pause: () => {}
    };
    engine.audioA = {
      src: '',
      play: async () => Promise.resolve(),
      pause: () => {}
    };

    const mockFile = { name: 'song.mp3', size: 1024, lastModified: Date.now() };
    const trackId = sessionRegistry.registerFile(mockFile, 'song.mp3');
    const track = { id: trackId, title: 'Local Song', relativePath: 'song.mp3' };

    // Mock URL.createObjectURL
    const prevCreateObjectURL = globalThis.URL?.createObjectURL;
    if (!globalThis.URL) globalThis.URL = {};
    globalThis.URL.createObjectURL = (f) => 'blob:http://localhost/song-blob-url';

    try {
      await engine.playTrack(track);
      assert.equal(playCalled, true);
      assert.equal(engine.isPlaying, true);
      assert.equal(engine.currentTrack.id, trackId);
    } finally {
      globalThis.URL.createObjectURL = prevCreateObjectURL;
    }
  });

  await t.test('playTrack queries and requests permission for stored FileSystemFileHandle', async () => {
    const engine = new AudioEngine();
    let playCalled = false;
    let queryCalled = false;
    let requestCalled = false;

    engine.audioB = {
      src: '',
      play: async () => {
        playCalled = true;
        return Promise.resolve();
      },
      pause: () => {}
    };
    engine.audioA = {
      src: '',
      play: async () => Promise.resolve(),
      pause: () => {}
    };

    const mockHandle = {
      queryPermission: async () => {
        queryCalled = true;
        return 'prompt';
      },
      requestPermission: async () => {
        requestCalled = true;
        return 'granted';
      },
      getFile: async () => ({ name: 'track.flac', size: 5000, lastModified: Date.now() })
    };

    const track = { id: 'trk_fsaa_1', title: 'FSAA Track', handle: mockHandle, relativePath: 'track.flac' };

    const prevCreateObjectURL = globalThis.URL?.createObjectURL;
    if (!globalThis.URL) globalThis.URL = {};
    globalThis.URL.createObjectURL = () => 'blob:http://localhost/fsaa-blob';

    try {
      await engine.playTrack(track);
      assert.equal(queryCalled, true);
      assert.equal(requestCalled, true);
      assert.equal(playCalled, true);
      assert.equal(engine.isPlaying, true);
    } finally {
      globalThis.URL.createObjectURL = prevCreateObjectURL;
    }
  });

  await t.test('play auto-populates queue from DB when queue is empty and starts playback', async () => {
    const { queueManager } = await import('../../src/player/queue.js');
    const { db } = await import('../../src/storage/db.js');
    const engine = new AudioEngine();
    let trackPlayed = null;

    queueManager.clear();
    engine.playTrack = async (t) => {
      trackPlayed = t;
      engine.isPlaying = true;
    };

    const prevGetAllTracks = db.getAllTracks;
    db.getAllTracks = async () => [
      { id: 'db_trk_1', title: 'DB Song 1', isMissing: 0 },
      { id: 'db_trk_2', title: 'DB Song 2', isMissing: 0 }
    ];

    try {
      await engine.play();
      assert.ok(trackPlayed);
      assert.equal(trackPlayed.id, 'db_trk_1');
      assert.equal(queueManager.items.length, 2);
    } finally {
      db.getAllTracks = prevGetAllTracks;
    }
  });

  await t.test('playRadio falls back to radioAudio when Web Audio player rejects with CORS/media error', async () => {
    const engine = new AudioEngine();
    let radioPlayCalled = false;

    engine.audioB = {
      src: '',
      crossOrigin: '',
      play: async () => {
        throw new Error('MEDIA_ELEMENT_ERROR: Format error');
      },
      pause: () => {},
      load: () => {},
      removeAttribute: () => {}
    };
    engine.audioA = {
      src: '',
      play: async () => Promise.resolve(),
      pause: () => {},
      load: () => {},
      removeAttribute: () => {}
    };
    engine.radioAudio = {
      src: '',
      crossOrigin: '',
      volume: 1,
      play: async () => {
        radioPlayCalled = true;
        return Promise.resolve();
      },
      pause: () => {},
      load: () => {},
      removeAttribute: () => {}
    };

    const station = {
      id: 'test_stream',
      name: 'Test Radio',
      streamUrl: 'https://stream.example.com/live.mp3'
    };

    await engine.playRadio(station);
    assert.equal(radioPlayCalled, true, 'radioAudio.play must be invoked as direct fallback');
    assert.equal(engine.isUsingRadioFallback, true, 'isUsingRadioFallback flag must be true');
    assert.equal(engine.getActiveAudio(), engine.radioAudio, 'getActiveAudio must return radioAudio');
    assert.equal(engine.isPlaying, true, 'isPlaying must be true');
    assert.equal(engine.streamState, 'playing', 'streamState must be playing');
    assert.equal(engine.audioB.src, '', 'audioB.src must be cleared after Web Audio failure');
  });

  await t.test('playRadio unloads radioAudio and sets streamState=error when both Web Audio and direct fallback fail', async () => {
    const engine = new AudioEngine();

    engine.audioB = {
      src: '',
      play: async () => {
        throw new Error('CORS blocked');
      },
      pause: () => {},
      load: () => {},
      removeAttribute: () => {}
    };
    engine.radioAudio = {
      src: '',
      play: async () => {
        throw new Error('Format error');
      },
      pause: () => {},
      load: () => {},
      removeAttribute: () => {}
    };

    const station = {
      id: 'failing_stream',
      name: 'Failing Radio',
      streamUrl: 'https://stream.example.com/fail.mp3'
    };

    await engine.playRadio(station);
    assert.equal(engine.isUsingRadioFallback, false, 'isUsingRadioFallback must be false');
    assert.equal(engine.isPlaying, false, 'isPlaying must be false');
    assert.equal(engine.streamState, 'error', 'streamState must be error');
    assert.equal(engine.radioAudio.src, '', 'radioAudio.src must be cleared on failure');
  });

  await t.test('play() re-invokes playRadio when isRadio is true', async () => {
    const engine = new AudioEngine();
    let playRadioStation = null;
    engine.isRadio = true;
    engine.currentStation = { id: 'station_play_test', name: 'Play Test', streamUrl: 'https://example.com/play.mp3' };
    engine.playRadio = async (st) => {
      playRadioStation = st;
      engine.isPlaying = true;
    };

    await engine.play();
    assert.ok(playRadioStation);
    assert.equal(playRadioStation.id, 'station_play_test');
    assert.equal(engine.isPlaying, true);
  });

  await t.test('stop() cleanly pauses and unloads all audio elements and resets state', () => {
    const engine = new AudioEngine();
    let pauseACalled = false;
    let pauseBCalled = false;
    let pauseRadioCalled = false;

    engine.audioA = { src: 'blob:a', pause: () => { pauseACalled = true; }, load: () => {}, removeAttribute: () => {} };
    engine.audioB = { src: 'blob:b', pause: () => { pauseBCalled = true; }, load: () => {}, removeAttribute: () => {} };
    engine.radioAudio = { src: 'https://radio', pause: () => { pauseRadioCalled = true; }, load: () => {}, removeAttribute: () => {} };
    engine.isPlaying = true;
    engine.streamState = 'playing';
    engine.isUsingRadioFallback = true;

    engine.stop();
    assert.equal(pauseACalled, true);
    assert.equal(pauseBCalled, true);
    assert.equal(pauseRadioCalled, true);
    assert.equal(engine.audioA.src, '');
    assert.equal(engine.audioB.src, '');
    assert.equal(engine.radioAudio.src, '');
    assert.equal(engine.isPlaying, false);
    assert.equal(engine.streamState, 'idle');
    assert.equal(engine.isUsingRadioFallback, false);
  });

  await t.test('seekRelative(+15) and seekRelative(-15) adjust playback position with boundary clamping', () => {
    const engine = new AudioEngine();
    let notifiedState = null;
    engine.subscribe((s) => { notifiedState = s; });

    const mockAudio = {
      currentTime: 30,
      duration: 120
    };
    engine.activePlayer = 'A';
    engine.audioA = mockAudio;

    // Test getters
    assert.equal(engine.currentTime, 30, 'engine.currentTime must reflect active audio currentTime');
    assert.equal(engine.duration, 120, 'engine.duration must reflect active audio duration');

    // Forward 15s
    engine.seekRelative(15);
    assert.equal(mockAudio.currentTime, 45, 'seekRelative(15) must advance currentTime by 15s');
    assert.equal(notifiedState.currentTime, 45, 'notifyState must broadcast updated currentTime');

    // Rewind 15s
    engine.seekRelative(-15);
    assert.equal(mockAudio.currentTime, 30, 'seekRelative(-15) must rewind currentTime by 15s');

    // Rewind past 0 clamps to 0
    engine.seekRelative(-40);
    assert.equal(mockAudio.currentTime, 0, 'seekRelative beyond start must clamp to 0');

    // Forward past duration clamps to duration
    engine.seekRelative(200);
    assert.equal(mockAudio.currentTime, 120, 'seekRelative beyond duration must clamp to duration');

    // In radio mode, seekRelative is a no-op
    engine.isRadio = true;
    engine.seekRelative(15);
    assert.equal(mockAudio.currentTime, 120, 'seekRelative in radio mode must not alter position');
    assert.equal(engine.duration, 0, 'engine.duration in radio mode must be 0');

    // Non-finite values safely no-op without mutating currentTime or throwing TypeError
    engine.isRadio = false;
    engine.seek(NaN);
    assert.equal(mockAudio.currentTime, 120, 'seek(NaN) must not alter position');
    engine.seek(Infinity);
    assert.equal(mockAudio.currentTime, 120, 'seek(Infinity) must not alter position');
    engine.seek(-Infinity);
    assert.equal(mockAudio.currentTime, 120, 'seek(-Infinity) must not alter position');
    engine.seekRelative(undefined);
    assert.equal(mockAudio.currentTime, 120, 'seekRelative(undefined) must not alter position');
    engine.seekRelative(NaN);
    assert.equal(mockAudio.currentTime, 120, 'seekRelative(NaN) must not alter position');
  });

  // =========================================================================
  // Passive Event-Driven Radio Resilience Suite (Design Doc Specification)
  // =========================================================================

  class MockAudioElement {
    constructor() {
      this.src = '';
      this.preload = 'metadata';
      this.playsInline = true;
      this.currentTime = 0;
      this.duration = 0;
      this.volume = 1;
      this.error = null;
      this._listeners = new Map();
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      if (this._listeners.has(type)) this._listeners.get(type).delete(fn);
    }
    dispatchEvent(type, eventObj = {}) {
      const handlers = this._listeners.get(type);
      if (handlers) {
        for (const h of Array.from(handlers)) {
          h({ type, target: this, ...eventObj });
        }
      }
    }
    play() {
      return Promise.resolve();
    }
    pause() {}
    load() {}
    removeAttribute() {}
    setAttribute() {}
  }

  function createMockClock() {
    const origSetTimeout = globalThis.setTimeout;
    const origClearTimeout = globalThis.clearTimeout;
    let now = 0;
    let nextId = 1;
    const timers = new Map();

    globalThis.setTimeout = (fn, delay = 0, ...args) => {
      const id = nextId++;
      const timerObj = {
        id,
        fn,
        delay: Math.max(0, delay),
        due: now + Math.max(0, delay),
        args,
        unref() { return this; }
      };
      timers.set(id, timerObj);
      return timerObj;
    };

    globalThis.clearTimeout = (timerObj) => {
      if (!timerObj) return;
      const id = typeof timerObj === 'object' ? timerObj.id : timerObj;
      timers.delete(id);
    };

    return {
      get now() { return now; },
      get timers() { return timers; },
      async tick(ms) {
        now += ms;
        let ranAny = true;
        while (ranAny) {
          ranAny = false;
          let earliest = null;
          for (const timer of timers.values()) {
            if (timer.due <= now) {
              if (!earliest || timer.due < earliest.due || (timer.due === earliest.due && timer.id < earliest.id)) {
                earliest = timer;
              }
            }
          }
          if (earliest) {
            timers.delete(earliest.id);
            earliest.fn(...earliest.args);
            await Promise.resolve();
            ranAny = true;
          }
        }
        await Promise.resolve();
      },
      restore() {
        globalThis.setTimeout = origSetTimeout;
        globalThis.clearTimeout = origClearTimeout;
      }
    };
  }

  await t.test('waiting event sets streamState = buffering and arms 20s dead-socket timer', () => {
    const engine = new AudioEngine();
    engine.audioA = new MockAudioElement();
    engine.audioB = new MockAudioElement();
    engine.radioAudio = new MockAudioElement();
    engine.initAudioElements();

    engine.isRadio = true;
    engine.isPlaying = true;
    engine.isUsingRadioFallback = true;
    engine.streamState = 'playing';

    engine.getActiveAudio().dispatchEvent('waiting');
    assert.equal(engine.streamState, 'buffering', 'streamState must transition to buffering');
    assert.ok(engine.deadSocketTimer, 'dead-socket timer must be armed');
  });

  await t.test('playing event sets streamState = playing, clears dead-socket timer, and resets retry counter', () => {
    const engine = new AudioEngine();
    engine.audioA = new MockAudioElement();
    engine.audioB = new MockAudioElement();
    engine.radioAudio = new MockAudioElement();
    engine.initAudioElements();

    engine.isRadio = true;
    engine.isPlaying = true;
    engine.isUsingRadioFallback = true;
    engine.streamState = 'buffering';
    engine.startDeadSocketTimer();
    engine.reconnectAttempts = 3;

    assert.ok(engine.deadSocketTimer, 'dead-socket timer should be active before playing');

    engine.getActiveAudio().dispatchEvent('playing');
    assert.equal(engine.streamState, 'playing', 'streamState must transition to playing');
    assert.equal(engine.deadSocketTimer, null, 'dead-socket timer must be cleared');
    assert.equal(engine.reconnectAttempts, 0, 'reconnectAttempts must be reset to 0');
  });

  await t.test('canplay event clears dead-socket timer, resets reconnectAttempts, and sets streamState = playing when playing', () => {
    const engine = new AudioEngine();
    engine.audioA = new MockAudioElement();
    engine.audioB = new MockAudioElement();
    engine.radioAudio = new MockAudioElement();
    engine.initAudioElements();

    engine.isRadio = true;
    engine.isPlaying = true;
    engine.isUsingRadioFallback = true;
    engine.streamState = 'buffering';
    engine.startDeadSocketTimer();
    engine.reconnectAttempts = 3;

    engine.getActiveAudio().dispatchEvent('canplay');
    assert.equal(engine.streamState, 'playing', 'streamState must transition to playing on canplay');
    assert.equal(engine.deadSocketTimer, null, 'dead-socket timer must be cleared on canplay');
    assert.equal(engine.reconnectAttempts, 0, 'reconnectAttempts must be reset to 0 on canplay');
  });

  await t.test('playRadio successfully falls back to radioAudio when Web Audio play rejection dispatches DOM error event', async () => {
    const engine = new AudioEngine();
    engine.audioA = new MockAudioElement();
    engine.audioB = new MockAudioElement();
    engine.radioAudio = new MockAudioElement();
    engine.initAudioElements();

    let radioAudioPlayCalled = false;
    // When Web Audio element (audioB) plays, simulate CORS / format failure
    // where the browser dispatches a DOM 'error' event and rejects play()
    engine.audioB.play = async () => {
      engine.audioB.error = { code: 4, message: 'MEDIA_ELEMENT_ERROR: Format error / CORS' };
      engine.audioB.dispatchEvent('error');
      throw new Error('MEDIA_ELEMENT_ERROR: Format error / CORS');
    };

    engine.radioAudio.play = async () => {
      radioAudioPlayCalled = true;
      return Promise.resolve();
    };

    const station = {
      id: 'cors_station',
      name: 'CORS Radio',
      streamUrl: 'https://stream.example.com/cors.mp3'
    };

    await engine.playRadio(station);

    assert.equal(radioAudioPlayCalled, true, 'radioAudio.play must be invoked as direct fallback');
    assert.equal(engine.isUsingRadioFallback, true, 'isUsingRadioFallback flag must be true');
    assert.equal(engine.getActiveAudio(), engine.radioAudio, 'getActiveAudio must return radioAudio');
    assert.equal(engine.isPlaying, true, 'isPlaying must be true');
    assert.equal(engine.streamState, 'playing', 'streamState must transition to playing');
  });

  await t.test('20s dead-socket expiration triggers reconnect with immediate: true', async () => {
    const clock = createMockClock();
    try {
      const engine = new AudioEngine();
      engine.audioA = new MockAudioElement();
      engine.audioB = new MockAudioElement();
      engine.radioAudio = new MockAudioElement();
      engine.initAudioElements();

      engine.isRadio = true;
      engine.isPlaying = true;
      engine.isUsingRadioFallback = true;
      engine.streamState = 'buffering';
      engine.currentStation = { id: 's1', name: 'Station 1', streamUrl: 'https://stream.example.com/live' };

      let reconnectCalledWith = null;
      engine.reconnectRadioStream = (opts) => {
        reconnectCalledWith = opts;
      };

      engine.startDeadSocketTimer();

      await clock.tick(19999);
      assert.equal(reconnectCalledWith, null, 'reconnect must not fire before 20s');

      await clock.tick(1);
      assert.ok(reconnectCalledWith, 'reconnect must fire at exactly 20s');
      assert.equal(reconnectCalledWith.immediate, true, 'dead-socket reconnect must be immediate');
    } finally {
      clock.restore();
    }
  });

  await t.test('error event triggers exponential backoff reconnect with up to 5 retries (1s, 2s, 4s, 8s, 16s) and cache-busting', async () => {
    const clock = createMockClock();
    try {
      const engine = new AudioEngine();
      engine.audioA = new MockAudioElement();
      engine.audioB = new MockAudioElement();
      engine.radioAudio = new MockAudioElement();
      engine.initAudioElements();

      engine.isRadio = true;
      engine.isPlaying = true;
      engine.isUsingRadioFallback = true;
      engine.streamState = 'playing';
      engine.currentStation = { id: 'test_s', name: 'Test', streamUrl: 'https://stream.example.com/live' };

      const attemptedUrls = [];
      engine.executeStreamPlayback = async (station, url) => {
        attemptedUrls.push(url);
        throw new Error('Network stream failed');
      };

      // Trigger error on active element
      engine.getActiveAudio().dispatchEvent('error');

      // Attempt 1: backoff delay = 1000ms (1s)
      assert.equal(engine.streamState, 'reconnecting', 'State should be reconnecting');
      assert.equal(engine.reconnectAttempts, 1, 'Attempt 1');
      await clock.tick(999);
      assert.equal(attemptedUrls.length, 0, 'Should not execute playback before 1s');
      await clock.tick(1);
      assert.equal(attemptedUrls.length, 1, 'Attempt 1 executed after 1s');
      assert.ok(attemptedUrls[0].includes('_lj_retry='), 'Retry URL must include cache-busting _lj_retry');

      // Attempt 2: backoff delay = 2000ms (2s)
      assert.equal(engine.reconnectAttempts, 2, 'Attempt 2 scheduled');
      await clock.tick(1999);
      assert.equal(attemptedUrls.length, 1);
      await clock.tick(1);
      assert.equal(attemptedUrls.length, 2, 'Attempt 2 executed after 2s');

      // Attempt 3: backoff delay = 4000ms (4s)
      assert.equal(engine.reconnectAttempts, 3, 'Attempt 3 scheduled');
      await clock.tick(4000);
      assert.equal(attemptedUrls.length, 3, 'Attempt 3 executed after 4s');

      // Attempt 4: backoff delay = 8000ms (8s)
      assert.equal(engine.reconnectAttempts, 4, 'Attempt 4 scheduled');
      await clock.tick(8000);
      assert.equal(attemptedUrls.length, 4, 'Attempt 4 executed after 8s');

      // Attempt 5: backoff delay = 16000ms (16s)
      assert.equal(engine.reconnectAttempts, 5, 'Attempt 5 scheduled');
      await clock.tick(16000);
      assert.equal(attemptedUrls.length, 5, 'Attempt 5 executed after 16s');
    } finally {
      clock.restore();
    }
  });

  await t.test('5 failed retries transitions to streamState = error and halts playback', async () => {
    const clock = createMockClock();
    try {
      const engine = new AudioEngine();
      engine.audioA = new MockAudioElement();
      engine.audioB = new MockAudioElement();
      engine.radioAudio = new MockAudioElement();
      engine.initAudioElements();

      engine.isRadio = true;
      engine.isPlaying = true;
      engine.isUsingRadioFallback = true;
      engine.streamState = 'playing';
      engine.currentStation = { id: 'fail_s', name: 'Fail Station', streamUrl: 'https://stream.example.com/fail' };

      engine.executeStreamPlayback = async () => {
        throw new Error('Always fail');
      };

      engine.getActiveAudio().dispatchEvent('error');

      // Tick through all 5 retries: 1s + 2s + 4s + 8s + 16s = 31000ms
      await clock.tick(1000); // retry 1
      await clock.tick(2000); // retry 2
      await clock.tick(4000); // retry 3
      await clock.tick(8000); // retry 4
      await clock.tick(16000); // retry 5 (fails)

      assert.equal(engine.streamState, 'error', 'Must transition to error state after 5 failed retries');
      assert.equal(engine.isPlaying, false, 'Playback must be halted after 5 failed retries');
      assert.equal(engine.reconnectTimer, null, 'Reconnect timer must be cleared');
      assert.equal(engine.deadSocketTimer, null, 'Dead socket timer must be cleared');
    } finally {
      clock.restore();
    }
  });

  await t.test('offline window event sets buffering and suspends timers', () => {
    setupMockDom();
    try {
      const engine = new AudioEngine();
      engine.isRadio = true;
      engine.isPlaying = true;
      engine.streamState = 'playing';
      engine.startDeadSocketTimer();
      engine.reconnectTimer = { id: 99 };

      assert.ok(engine.deadSocketTimer, 'Dead socket timer should be set');
      assert.ok(engine.reconnectTimer, 'Reconnect timer should be set');

      window.dispatchEvent(new Event('offline'));

      assert.equal(engine.streamState, 'buffering', 'offline event must set streamState to buffering');
      assert.equal(engine.deadSocketTimer, null, 'offline event must suspend/clear dead socket timer');
      assert.equal(engine.reconnectTimer, null, 'offline event must suspend/clear reconnect timer');
    } finally {
      teardownMockDom();
    }
  });

  await t.test('online window event debounces 800ms and recovers active playback without retriggering on error state', async () => {
    setupMockDom();
    const clock = createMockClock();
    try {
      const engine = new AudioEngine();
      engine.isRadio = true;
      engine.isPlaying = true;
      engine.streamState = 'buffering';
      engine.currentStation = { id: 'online_s', name: 'Online Radio', streamUrl: 'https://stream.example.com/live' };

      let reconnectCount = 0;
      engine.reconnectRadioStream = ({ force, immediate }) => {
        reconnectCount++;
        assert.equal(force, true);
        assert.equal(immediate, true);
      };

      // First online event
      window.dispatchEvent(new Event('online'));
      await clock.tick(400);
      assert.equal(reconnectCount, 0, 'Should not reconnect before 800ms debounce');

      // Second online event before 800ms expires (debounce reset)
      window.dispatchEvent(new Event('online'));
      await clock.tick(799);
      assert.equal(reconnectCount, 0, 'Debounced timer should reset on subsequent online event');

      await clock.tick(1);
      assert.equal(reconnectCount, 1, 'Should trigger reconnect at exactly 800ms after last online event');

      // If streamState was explicitly error, online event must NOT auto-reconnect
      reconnectCount = 0;
      engine.streamState = 'error';
      window.dispatchEvent(new Event('online'));
      await clock.tick(1000);
      assert.equal(reconnectCount, 0, 'online event must NOT auto-reconnect if streamState is error');
    } finally {
      clock.restore();
      teardownMockDom();
    }
  });

  await t.test('Concurrency guards: pause(), stop(), and track switches cancel in-flight playback and clear all timers', async () => {
    const clock = createMockClock();
    try {
      const engine = new AudioEngine();
      engine.audioA = new MockAudioElement();
      engine.audioB = new MockAudioElement();
      engine.radioAudio = new MockAudioElement();
      engine.initAudioElements();

      engine.isRadio = true;
      engine.isPlaying = true;
      engine.streamState = 'reconnecting';
      engine.startDeadSocketTimer();
      engine.reconnectAttempts = 3;

      const genBeforePause = engine.playbackGeneration;
      engine.pause();

      assert.equal(engine.deadSocketTimer, null, 'pause() must clear deadSocketTimer');
      assert.equal(engine.reconnectTimer, null, 'pause() must clear reconnectTimer');
      assert.equal(engine.reconnectAttempts, 0, 'pause() must reset reconnectAttempts');
      assert.ok(engine.playbackGeneration > genBeforePause, 'pause() must increment playbackGeneration');
      assert.equal(engine.isPlaying, false, 'pause() must set isPlaying = false');
      assert.equal(engine.streamState, 'idle', 'pause() must set streamState = idle');

      // Test stop()
      engine.isRadio = true;
      engine.isPlaying = true;
      engine.streamState = 'buffering';
      engine.startDeadSocketTimer();
      engine.reconnectAttempts = 2;
      const genBeforeStop = engine.playbackGeneration;

      engine.stop();
      assert.equal(engine.deadSocketTimer, null, 'stop() must clear deadSocketTimer');
      assert.equal(engine.reconnectTimer, null, 'stop() must clear reconnectTimer');
      assert.equal(engine.reconnectAttempts, 0, 'stop() must reset reconnectAttempts');
      assert.ok(engine.playbackGeneration > genBeforeStop, 'stop() must increment playbackGeneration');
      assert.equal(engine.streamState, 'idle', 'stop() must set streamState = idle');

      // Test track switch (playTrack)
      engine.isRadio = true;
      engine.isPlaying = true;
      engine.currentStation = { id: 's1' };
      engine.startDeadSocketTimer();
      engine.reconnectAttempts = 4;
      const genBeforeTrack = engine.playbackGeneration;

      await engine.playTrack({ id: 't1', title: 'Local Track' });
      assert.equal(engine.deadSocketTimer, null, 'playTrack must clear deadSocketTimer');
      assert.equal(engine.reconnectTimer, null, 'playTrack must clear reconnectTimer');
      assert.equal(engine.reconnectAttempts, 0, 'playTrack must reset reconnectAttempts');
      assert.ok(engine.playbackGeneration > genBeforeTrack, 'playTrack must increment playbackGeneration');
      assert.equal(engine.isRadio, false, 'playTrack must switch isRadio to false');
    } finally {
      clock.restore();
    }
  });

  await t.test('Verification that zero setInterval polling loops exist in audio-engine.js', () => {
    const enginePath = new URL('../../src/player/audio-engine.js', import.meta.url);
    const sourceCode = fs.readFileSync(enginePath, 'utf8');
    assert.equal(
      sourceCode.includes('setInterval'),
      false,
      'audio-engine.js must NOT contain any setInterval polling loops (zero synthetic polling)'
    );
  });
});
