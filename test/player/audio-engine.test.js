import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine, getRetryStreamUrl } from '../../src/player/audio-engine.js';

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

  await t.test('playRadio resets isUsingRadioFallback when switching to a new station', async () => {
    const engine = new AudioEngine();
    engine.isUsingRadioFallback = true;
    let webAudioPlayCalled = false;

    engine.audioB = {
      src: '',
      crossOrigin: '',
      play: async () => {
        webAudioPlayCalled = true;
        return Promise.resolve();
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

    const station = {
      id: 'cors_friendly_stream',
      name: 'CORS Friendly Radio',
      streamUrl: 'https://stream.example.com/cors.mp3'
    };

    await engine.playRadio(station);
    assert.equal(engine.isUsingRadioFallback, false, 'isUsingRadioFallback must be reset to false on new station');
    assert.equal(webAudioPlayCalled, true, 'New station must attempt Web Audio player first');
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

  await t.test('playRadio aborts cleanly without playing if paused during in-flight stream connection', async () => {
    const engine = new AudioEngine();
    let resolvePlay;
    const playPromise = new Promise((resolve) => {
      resolvePlay = resolve;
    });

    let pauseCalled = false;
    engine.audioB = {
      src: '',
      crossOrigin: '',
      play: () => playPromise,
      pause: () => { pauseCalled = true; },
      load: () => {},
      removeAttribute: () => {}
    };

    const station = {
      id: 'race_station',
      name: 'Race Condition Station',
      streamUrl: 'https://stream.example.com/race.mp3'
    };

    const radioPromise = engine.playRadio(station);
    // User pauses while stream connection is in flight
    engine.pause();
    assert.equal(engine.isPlaying, false);

    // Stream connection finishes afterwards
    resolvePlay();
    await radioPromise;

    assert.equal(pauseCalled, true, 'Audio element must be paused immediately when resolving after pause()');
    assert.equal(engine.isPlaying, false, 'isPlaying must remain false');
    assert.equal(engine.streamState, 'idle', 'streamState must remain idle');
    assert.equal(engine.stallWatchdogTimer, null, 'Stall watchdog must not be running');
  });

  await t.test('playRadio aborts cleanly if switched to local track during in-flight stream connection', async () => {
    const engine = new AudioEngine();
    let resolvePlay;
    const playPromise = new Promise((resolve) => {
      resolvePlay = resolve;
    });

    let pauseCalled = false;
    engine.audioB = {
      src: '',
      crossOrigin: '',
      play: () => playPromise,
      pause: () => { pauseCalled = true; },
      load: () => {},
      removeAttribute: () => {}
    };

    const station = {
      id: 'station_switch_race',
      name: 'Station Switch Race',
      streamUrl: 'https://stream.example.com/race.mp3'
    };

    const radioPromise = engine.playRadio(station);

    // Switch to local mode / track while stream is connecting
    engine.isRadio = false;
    engine.currentStation = null;
    engine.currentTrack = { id: 'local_1', title: 'Local Song' };

    resolvePlay();
    await radioPromise;

    assert.equal(pauseCalled, true, 'Audio element must be paused when resolving after switching away from radio');
    assert.equal(engine.isRadio, false, 'isRadio must remain false');
    assert.equal(engine.currentStation, null, 'currentStation must remain null');
    assert.equal(engine.stallWatchdogTimer, null, 'Stall watchdog must not be running');
  });

  await t.test('doReconnect aborts if isPlaying is false', async () => {
    const engine = new AudioEngine();
    let playbackExecuted = false;
    engine._executeRadioPlayback = async () => {
      playbackExecuted = true;
    };

    engine.isRadio = true;
    engine.currentStation = { id: 'st_reconnect', name: 'Station' };
    engine.isPlaying = false; // user has paused

    await engine.reconnectRadioStream({ force: true, immediate: true });
    assert.equal(playbackExecuted, false, 'doReconnect must not execute playback when isPlaying is false');
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

  await t.test('getRetryStreamUrl appends, formats, and updates _lj_retry query parameter', () => {
    assert.equal(typeof getRetryStreamUrl, 'function');

    // Standard URL without query parameters
    const url1 = getRetryStreamUrl('https://stream.example.com/live.mp3', 1710000000000);
    assert.equal(url1, 'https://stream.example.com/live.mp3?_lj_retry=1710000000000');

    // URL with existing query parameters
    const url2 = getRetryStreamUrl('https://stream.example.com/live?format=mp3&bitrate=128', 1710000000000);
    assert.ok(url2.includes('format=mp3'));
    assert.ok(url2.includes('bitrate=128'));
    assert.ok(url2.includes('_lj_retry=1710000000000'));

    // URL with preexisting _lj_retry parameter updates in-place without duplicating
    const url3 = getRetryStreamUrl('https://stream.example.com/live?_lj_retry=99999', 1710000000000);
    assert.equal(url3, 'https://stream.example.com/live?_lj_retry=1710000000000');
    assert.equal((url3.match(/_lj_retry/g) || []).length, 1, 'Must not duplicate _lj_retry parameter');
  });

  await t.test('Stall watchdog detects frozen currentTime and triggers stream reconnection', async () => {
    const engine = new AudioEngine();
    let reconnectCalled = false;
    engine.reconnectRadioStream = async () => {
      reconnectCalled = true;
    };

    const mockAudio = {
      currentTime: 14.5,
      paused: false,
      pause: () => {},
      load: () => {},
      removeAttribute: () => {}
    };

    engine.isRadio = true;
    engine.isPlaying = true;
    engine.streamState = 'playing';
    engine.currentStation = { id: 'soma_groove', name: 'SomaFM Groove Salad', streamUrl: 'https://stream.somafm.com/groove' };
    engine.activePlayer = 'A';
    engine.audioA = mockAudio;

    // Normal state: recent position update
    engine.lastPlaybackPosition = 14.5;
    engine.lastPositionUpdateTime = Date.now();
    engine.checkStall();
    assert.equal(reconnectCalled, false, 'Should not trigger reconnect when stream position is active');

    // Stalled state: position timestamp older than stall threshold (8000ms)
    engine.lastPositionUpdateTime = Date.now() - 9000;
    engine.checkStall();
    assert.equal(reconnectCalled, true, 'Must trigger stream reconnection when currentTime is frozen beyond threshold');
  });

  await t.test('Stall watchdog detects frozen currentTime and triggers reconnection when streamState is buffering', async () => {
    const engine = new AudioEngine();
    let reconnectCalled = false;
    engine.reconnectRadioStream = async () => {
      reconnectCalled = true;
    };

    const mockAudio = {
      currentTime: 22.0,
      paused: false,
      pause: () => {},
      load: () => {},
      removeAttribute: () => {}
    };

    engine.isRadio = true;
    engine.isPlaying = true;
    engine.streamState = 'buffering';
    engine.currentStation = { id: 'soma_groove', name: 'SomaFM Groove Salad', streamUrl: 'https://stream.somafm.com/groove' };
    engine.activePlayer = 'A';
    engine.audioA = mockAudio;

    // Frozen beyond stall threshold (8000ms)
    engine.lastPlaybackPosition = 22.0;
    engine.lastPositionUpdateTime = Date.now() - 9000;
    engine.checkStall();
    assert.equal(reconnectCalled, true, 'Must trigger stream reconnection when streamState is buffering and currentTime is frozen');
  });

  await t.test('Exponential backoff stream reconnection cycles up to 5 attempts, applies cache-busting, and marks error on 5th failure', async () => {
    const engine = new AudioEngine();
    let playedUrls = [];

    const mockAudio = {
      src: '',
      paused: false,
      pause: () => {},
      load: () => {},
      removeAttribute: () => {},
      play: async () => {
        playedUrls.push(mockAudio.src);
        throw new Error('Network stream disconnect');
      }
    };

    engine.isRadio = true;
    engine.isPlaying = true;
    engine.streamState = 'playing';
    engine.currentStation = { id: 'test_reconnect', name: 'Reconnect Station', streamUrl: 'https://stream.test.org/live' };
    engine.radioAudio = mockAudio;
    engine.isUsingRadioFallback = true;

    // First reconnect attempt (immediate)
    assert.equal(engine.reconnectAttempts, 0);
    await engine.reconnectRadioStream({ force: true, immediate: true });

    assert.equal(playedUrls.length, 1, 'First attempt must execute immediately');
    assert.ok(playedUrls[0].includes('_lj_retry='), 'Reconnection URL must include cache-busting query parameter');
    assert.equal(engine.reconnectAttempts, 2, 'Attempt 2 must be scheduled');
    assert.ok(engine.reconnectTimer !== null, 'Reconnection timer must be active for attempt 2');

    // Simulate scheduled attempts 2, 3, 4, 5 by executing the timer callback
    for (let attempt = 2; attempt <= 5; attempt++) {
      assert.ok(engine.reconnectTimer !== null, `Reconnection timer must be active for attempt ${attempt}`);
      const fn = engine.reconnectTimer._onTimeout;
      clearTimeout(engine.reconnectTimer);
      engine.reconnectTimer = null;
      await fn();
      assert.equal(playedUrls.length, attempt, `Attempt ${attempt} must have executed`);
    }

    // 5 attempts have now executed and failed
    assert.equal(engine.streamState, 'error', 'streamState must transition to error after max attempts');
    assert.equal(engine.isPlaying, false, 'isPlaying must be false when reconnection fails completely');
    assert.equal(engine.reconnectTimer, null, 'reconnectTimer must be null after error state');

    // Exceeding max attempts triggers permanent error without attempting playback
    await engine.reconnectRadioStream({ immediate: true });
    assert.equal(playedUrls.length, 5, 'No further playback attempts should occur after reaching max attempts');
    assert.equal(engine.streamState, 'error', 'streamState must remain error');

    // Resetting on successful playback
    engine.resetReconnection();
    assert.equal(engine.reconnectAttempts, 0);
  });

  await t.test('reconnectRadioStream schedules exponential backoff retries when immediate reconnection fails', async () => {
    const engine = new AudioEngine();
    let scheduledImmediate = null;

    const originalReconnect = engine.reconnectRadioStream.bind(engine);
    engine.reconnectRadioStream = async (opts = {}) => {
      scheduledImmediate = opts.immediate;
      return originalReconnect(opts);
    };

    engine.isRadio = true;
    engine.isPlaying = true;
    engine.streamState = 'playing';
    engine.currentStation = { id: 'test_immediate_retry', name: 'Immediate Retry Station', streamUrl: 'https://stream.test.org/live' };
    engine.isUsingRadioFallback = true;
    engine.radioAudio = {
      src: '',
      paused: false,
      pause: () => {},
      load: () => {},
      removeAttribute: () => {},
      play: async () => {
        throw new Error('Connection refused');
      }
    };

    // Trigger immediate reconnect (as happens on onNetworkOnline)
    await engine.reconnectRadioStream({ force: true, immediate: true });

    // When the immediate attempt failed, it must have called reconnectRadioStream with immediate: false
    assert.equal(scheduledImmediate, false, 'Subsequent retry must be called with immediate: false');
    assert.ok(engine.reconnectTimer !== null, 'reconnectTimer must be scheduled after immediate failure');
    assert.equal(engine.streamState, 'connecting', 'streamState must remain connecting');

    engine.stop();
  });

  await t.test('Online and offline window events pause and recover radio stream seamlessly', async () => {
    const engine = new AudioEngine();
    let reconnectTriggered = false;
    engine.reconnectRadioStream = async (opts) => {
      reconnectTriggered = true;
    };

    engine.isRadio = true;
    engine.isPlaying = true;
    engine.streamState = 'playing';
    engine.currentStation = { id: 'test_net', name: 'Network Station', streamUrl: 'https://stream.net.org/live' };

    // Offline event occurs
    engine.onNetworkOffline();
    assert.equal(engine.streamState, 'buffering', 'Offline event must transition streamState to buffering');

    // Online event occurs
    engine.onNetworkOnline();
    assert.equal(reconnectTriggered, true, 'Online event must trigger stream reconnection');

    // Streams in permanent error state must NOT auto-reconnect on online event
    reconnectTriggered = false;
    engine.streamState = 'error';
    engine.isPlaying = false;
    engine.onNetworkOnline();
    assert.equal(reconnectTriggered, false, 'Online event must not auto-reconnect stream in permanent error state');
  });

  await t.test('Teardown and recovery cleans up timers and listeners', () => {
    const engine = new AudioEngine();
    engine.isRadio = true;
    engine.isPlaying = true;
    engine.streamState = 'playing';
    engine.reconnectAttempts = 3;
    engine.reconnectTimer = setTimeout(() => {}, 10000);
    engine.stallWatchdogTimer = setInterval(() => {}, 2000);

    // stop() cleans up
    engine.stop();
    assert.equal(engine.reconnectTimer, null, 'reconnectTimer must be cleared on stop()');
    assert.equal(engine.stallWatchdogTimer, null, 'stallWatchdogTimer must be cleared on stop()');
    assert.equal(engine.reconnectAttempts, 0, 'reconnectAttempts must reset to 0 on stop()');

    // destroy() cleans up
    engine.reconnectTimer = setTimeout(() => {}, 10000);
    engine.stallWatchdogTimer = setInterval(() => {}, 2000);
    engine.destroy();
    assert.equal(engine.reconnectTimer, null);
    assert.equal(engine.stallWatchdogTimer, null);
    assert.equal(engine.reconnectAttempts, 0);
  });
});

