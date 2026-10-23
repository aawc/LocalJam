import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';
import { AudioEngine } from '../../src/player/audio-engine.js';
import { queueManager } from '../../src/player/queue.js';

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

  await t.test('currentTime getter and setter operate correctly with and without active audio', () => {
    const engine = new AudioEngine();
    // 1. Without active audio element
    engine.audioA = null;
    engine.audioB = null;

    engine.currentTime = 42.5;
    assert.equal(engine.currentTime, 42.5, 'Getter should return _savedTime when no active audio');

    // Clamping & validation
    engine.currentTime = -10;
    assert.equal(engine.currentTime, 0, 'Negative value should clamp to 0');

    engine.currentTime = NaN;
    assert.equal(engine.currentTime, 0, 'NaN should clamp to 0');

    engine.currentTime = Infinity;
    assert.equal(engine.currentTime, 0, 'Infinity should clamp to 0');

    // 2. With active audio element
    const mockAudio = { currentTime: 0, src: 'blob:test' };
    engine.audioA = mockAudio;
    engine.activePlayer = 'A';
    engine.isRadio = false;

    // Verify Defect 1: when mockAudio.currentTime = 0 with active src,
    // engine.currentTime must return 0 (not falling back to _savedTime).
    engine._savedTime = 55.5;
    mockAudio.currentTime = 0;
    assert.equal(engine.currentTime, 0, 'engine.currentTime must return 0 when active audio has src, not falling back to _savedTime');

    engine.currentTime = 88.5;
    assert.equal(mockAudio.currentTime, 88.5, 'Setter should update active audio.currentTime');
    assert.equal(engine.currentTime, 88.5, 'Getter should return active audio.currentTime');

    mockAudio.currentTime = 120;
    assert.equal(engine.currentTime, 120, 'Getter should track active audio currentTime changes');

    // When mockAudio.currentTime is reset back to 0 with valid src, it must return 0 even if _savedTime > 0
    mockAudio.currentTime = 0;
    engine._savedTime = 99.9;
    assert.equal(engine.currentTime, 0, 'engine.currentTime must return 0 when mockAudio.currentTime is 0 with valid src');
  });

  await t.test('duration getter and setter operate correctly', () => {
    const engine = new AudioEngine();
    engine.audioA = null;
    engine.audioB = null;

    engine.duration = 195.4;
    assert.equal(engine.duration, 195.4, 'Getter should return _savedDuration when no audio or track');

    // Clamping
    engine.duration = -20;
    assert.equal(engine.duration, 0, 'Negative duration should clamp to 0');

    engine.duration = NaN;
    assert.equal(engine.duration, 0, 'NaN duration should clamp to 0');

    // Radio returns 0 duration
    engine.duration = 300;
    engine.isRadio = true;
    assert.equal(engine.duration, 0, 'Radio must always return 0 duration');
    engine.isRadio = false;

    // Track duration precedence over saved duration when audio has no duration
    engine.currentTrack = { duration: 250 };
    assert.equal(engine.duration, 250, 'Track duration should take precedence over _savedDuration');

    // Active audio duration takes precedence
    engine.audioA = { duration: 320 };
    engine.activePlayer = 'A';
    assert.equal(engine.duration, 320, 'Active audio duration should take highest precedence');

    // Non-finite duration (Infinity / NaN) should be sanitized and fall back to track duration
    engine.audioA = { duration: Infinity };
    engine.currentTrack = { duration: 250 };
    assert.equal(engine.duration, 250, 'Non-finite audio.duration should fall back to track duration');

    // When both audio and track have non-finite duration, fallback to saved duration or 0
    engine.currentTrack = { duration: 0 };
    engine.duration = 100;
    assert.equal(engine.duration, 100, 'Non-finite audio and track duration should fall back to _savedDuration');

    engine.duration = Infinity;
    assert.equal(engine._savedDuration, 0, 'setter must not accept Infinity');
  });

  await t.test('engine.play() passes saved time to playTrack and resets saved time', async () => {
    const engine = new AudioEngine();
    engine.audioA = null;
    engine.audioB = null;
    engine.isRadio = false;

    // Set saved time
    engine.currentTime = 73.5;
    assert.equal(engine.currentTime, 73.5);

    let playedTrack = null;
    let playedStartPosition = null;
    engine.playTrack = async (track, startPosition) => {
      playedTrack = track;
      playedStartPosition = startPosition;
    };

    // Set up queue with a mock track
    const mockTrack = { id: 'trk-cold', title: 'Cold Resume Track', duration: 200 };
    queueManager.setQueue([mockTrack], 0);

    await engine.play();

    assert.deepEqual(playedTrack, mockTrack, 'play() should pass queue item track to playTrack');
    assert.equal(playedStartPosition, 73.5, 'play() should pass saved start position to playTrack');
    assert.equal(engine._savedTime, 0, '_savedTime must be reset to 0 after starting playback');
  });

  await t.test('_savedTime lifecycle across playTrack(), seek(), and stop()', async () => {
    const { sessionRegistry } = await import('../../src/storage/session-registry.js');
    const engine = new AudioEngine();
    assert.equal(engine._savedTime, 0, '_savedTime initializes to 0');

    engine.audioB = {
      src: '',
      currentTime: 0,
      duration: 180,
      play: async () => Promise.resolve(),
      pause: () => {},
      removeAttribute: () => {},
      load: () => {}
    };
    engine.audioA = {
      src: '',
      currentTime: 0,
      duration: 180,
      play: async () => Promise.resolve(),
      pause: () => {},
      removeAttribute: () => {},
      load: () => {}
    };

    const mockFile = { name: 'lifecycle.mp3', size: 2048, lastModified: Date.now() };
    const trackId = sessionRegistry.registerFile(mockFile, 'lifecycle.mp3');
    const track = { id: trackId, title: 'Lifecycle Song', relativePath: 'lifecycle.mp3', duration: 180 };

    const prevCreateObjectURL = globalThis.URL?.createObjectURL;
    if (!globalThis.URL) globalThis.URL = {};
    globalThis.URL.createObjectURL = () => 'blob:http://localhost/lifecycle-blob-url';

    try {
      // 1. playTrack with startPosition updates _savedTime
      await engine.playTrack(track, 42.5);
      assert.equal(engine._savedTime, 42.5, 'playTrack(track, 42.5) sets _savedTime to startPosition');

      // 2. seek(target) updates _savedTime to target
      engine.seek(85);
      assert.equal(engine._savedTime, 85, 'seek(85) updates _savedTime to 85');

      // 3. stop() resets _savedTime to 0
      engine.stop();
      assert.equal(engine._savedTime, 0, 'stop() resets _savedTime to 0');
    } finally {
      globalThis.URL.createObjectURL = prevCreateObjectURL;
    }
  });

  await t.test('MediaSession registers standard action handlers including stop', () => {
    const { navigator } = setupMockDom();
    try {
      const engine = new AudioEngine();
      let stopCalled = false;
      engine.stop = () => { stopCalled = true; };

      assert.ok(navigator.mediaSession, 'navigator.mediaSession is present');
      const registered = Array.from(navigator.mediaSession.actionHandlers.keys());
      assert.ok(registered.includes('play'), 'registers play');
      assert.ok(registered.includes('pause'), 'registers pause');
      assert.ok(registered.includes('stop'), 'registers stop');
      assert.ok(registered.includes('previoustrack'), 'registers previoustrack');
      assert.ok(registered.includes('nexttrack'), 'registers nexttrack');
      assert.ok(registered.includes('seekbackward'), 'registers seekbackward');
      assert.ok(registered.includes('seekforward'), 'registers seekforward');
      assert.ok(registered.includes('seekto'), 'registers seekto');

      const stopHandler = navigator.mediaSession.actionHandlers.get('stop');
      assert.equal(typeof stopHandler, 'function');
      stopHandler();
      assert.equal(stopCalled, true, 'stop handler delegates to engine.stop()');

      engine.destroy();
    } finally {
      teardownMockDom();
    }
  });

  await t.test('MediaSession playbackState updates reactively across play, pause, and stop', () => {
    const { navigator } = setupMockDom();
    try {
      const engine = new AudioEngine();
      engine.currentTrack = { id: 't1', title: 'Test Track', duration: 120 };

      // 1. Initial state without playback
      engine.notifyState();
      assert.equal(navigator.mediaSession.playbackState, 'paused');

      // 2. Playing state
      engine.isPlaying = true;
      engine.notifyState();
      assert.equal(navigator.mediaSession.playbackState, 'playing');

      // 3. Pause
      engine.pause();
      assert.equal(navigator.mediaSession.playbackState, 'paused');

      // 4. Stop
      engine.stop();
      assert.equal(navigator.mediaSession.playbackState, 'none');

      engine.destroy();
      assert.equal(navigator.mediaSession.playbackState, 'none');
    } finally {
      teardownMockDom();
    }
  });

  await t.test('syncMediaSessionPosition safely handles finite durations and ignores non-finite values', () => {
    const { navigator } = setupMockDom();
    try {
      const engine = new AudioEngine();
      engine.currentTrack = { id: 't1', title: 'Test Track', duration: 180 };
      engine.audioA = { currentTime: 45, duration: 180, playbackRate: 1 };
      engine.activePlayer = 'A';

      // Finite duration sync
      engine.syncMediaSessionPosition();
      assert.ok(navigator.mediaSession.positionState, 'positionState was set');
      assert.equal(navigator.mediaSession.positionState.duration, 180);
      assert.equal(navigator.mediaSession.positionState.position, 45);

      // Reset and test with Infinity duration (should not crash with TypeError or pass Infinity)
      navigator.mediaSession.positionState = null;
      engine.audioA.duration = Infinity;
      engine.currentTrack.duration = 0;
      engine._savedDuration = 0;
      assert.doesNotThrow(() => {
        engine.syncMediaSessionPosition();
      }, 'Must not throw TypeError on non-finite duration');
      assert.equal(navigator.mediaSession.positionState, null, 'positionState remains null when duration is indeterminate');

      engine.destroy();
    } finally {
      teardownMockDom();
    }
  });

  await t.test('AudioContext statechange auto-resumes when suspended during active playback', async () => {
    const prevWindow = globalThis.window;
    let resumeCalled = false;
    let stateChangeHandler = null;

    globalThis.window = {
      AudioContext: class {
        constructor() {
          this.state = 'running';
          this.destination = {};
        }
        createGain() { return { gain: { value: 1 }, connect: () => {} }; }
        createAnalyser() { return { fftSize: 2048, smoothingTimeConstant: 0.85, connect: () => {} }; }
        createBiquadFilter() { return { connect: () => {}, frequency: { value: 0 }, gain: { value: 0 }, Q: { value: 0 } }; }
        createMediaElementSource() { return { connect: () => {} }; }
        addEventListener(event, handler) {
          if (event === 'statechange') {
            stateChangeHandler = handler;
          }
        }
        removeEventListener() {}
        resume() {
          resumeCalled = true;
          this.state = 'running';
          return Promise.resolve();
        }
      }
    };

    try {
      const engine = new AudioEngine();
      await engine.initWebAudio();
      assert.ok(stateChangeHandler, 'statechange listener registered on AudioContext');

      // If engine is not playing, statechange should not auto-resume
      engine.isPlaying = false;
      engine.audioCtx.state = 'suspended';
      resumeCalled = false;
      stateChangeHandler();
      assert.equal(resumeCalled, false, 'Does not resume when engine is not playing');

      // If engine IS playing and state becomes suspended, auto-resumes
      engine.isPlaying = true;
      stateChangeHandler();
      assert.equal(resumeCalled, true, 'Auto-resumes AudioContext when suspended during active playback');

      engine.destroy();
    } finally {
      globalThis.window = prevWindow;
    }
  });

  await t.test('visibilitychange foreground event ensures AudioContext is active and recovers paused audio', () => {
    const { document } = setupMockDom();
    try {
      const engine = new AudioEngine();
      engine.isPlaying = true;
      let playTriggered = false;
      let ensureAudioContextCalled = false;

      engine.ensureAudioContextActive = async () => {
        ensureAudioContextCalled = true;
      };

      const mockAudio = {
        paused: true,
        play: async () => {
          playTriggered = true;
        }
      };
      engine.audioA = mockAudio;
      engine.activePlayer = 'A';

      // Simulate app coming to foreground
      document.visibilityState = 'visible';
      document.dispatchEvent(new globalThis.Event('visibilitychange'));

      assert.equal(ensureAudioContextCalled, true, 'Calls ensureAudioContextActive on foregrounding');
      assert.equal(playTriggered, true, 'Calls audio.play() to recover paused audio element');

      engine.destroy();
    } finally {
      teardownMockDom();
    }
  });

  await t.test('probeTrackDuration uses an isolated probe and never modifies active playback element currentTime', () => {
    const prevAudio = globalThis.Audio;
    let probeInstantiated = false;
    let probeSeekedTo = null;
    let probeMuted = false;
    let probeSrc = null;

    globalThis.Audio = class {
      constructor() {
        probeInstantiated = true;
        this.muted = false;
        this.preload = '';
        this.duration = Infinity;
        this._listeners = {};
      }
      set muted(val) {
        probeMuted = val;
      }
      get muted() {
        return probeMuted;
      }
      set src(val) {
        probeSrc = val;
        // Simulate loadedmetadata
        if (this._listeners['loadedmetadata']) {
          this._listeners['loadedmetadata']();
        }
      }
      set currentTime(val) {
        probeSeekedTo = val;
        this.duration = 7656.321;
        // Simulate seeked
        if (this._listeners['seeked']) {
          this._listeners['seeked']();
        }
      }
      addEventListener(event, handler) {
        this._listeners[event] = handler;
      }
      removeEventListener(event) {
        delete this._listeners[event];
      }
      load() {}
    };

    try {
      const engine = new AudioEngine();
      const mockActiveAudio = { currentTime: 0, duration: Infinity, paused: false, src: 'blob:active-media' };
      engine.audioA = mockActiveAudio;
      engine.activePlayer = 'A';
      engine.isPlaying = true;

      const track = { id: 'trk_long', title: 'Long Song', duration: 0 };
      engine.currentTrack = track;

      engine.probeTrackDuration('blob:active-media', track);

      assert.equal(probeInstantiated, true, 'Probe Audio element was instantiated');
      assert.equal(probeMuted, true, 'Probe element must be muted');
      assert.equal(probeSeekedTo, 1e101, 'Probe sought to 1e101 to force duration calculation');
      assert.equal(track.duration, 7656.321, 'Target track duration resolved to 7656.321');
      assert.equal(mockActiveAudio.currentTime, 0, 'Active playback audio.currentTime must remain 0 and NEVER be seeked by probe');
      assert.equal(track._isProbingDuration, false, '_isProbingDuration flag cleared after probe completion');

      // Concurrent invocation while _isProbingDuration is true should skip probe
      probeInstantiated = false;
      track._isProbingDuration = true;
      track.duration = 0;
      engine.probeTrackDuration('blob:active-media', track);
      assert.equal(probeInstantiated, false, 'probeTrackDuration skips probing when probe is already in-flight');

      // Subsequent call when track.duration is already positive should skip probe
      track._isProbingDuration = false;
      track.duration = 7656.321;
      probeInstantiated = false;
      engine.probeTrackDuration('blob:active-media', track);
      assert.equal(probeInstantiated, false, 'probeTrackDuration skips probing when track already has duration');
    } finally {
      globalThis.Audio = prevAudio;
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

