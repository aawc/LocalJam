import test from 'node:test';
import assert from 'node:assert/strict';
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
});
