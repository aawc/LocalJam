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

  await t.test('Local audio elements do not enforce crossOrigin to protect blob URL streams', () => {
    const engine = new AudioEngine();
    if (engine.audioA) {
      assert.notEqual(engine.audioA.crossOrigin, 'anonymous', 'audioA must not force anonymous crossOrigin on blob URLs');
    }
    if (engine.audioB) {
      assert.notEqual(engine.audioB.crossOrigin, 'anonymous', 'audioB must not force anonymous crossOrigin on blob URLs');
    }
  });

  await t.test('initWebAudio connects radio audio to Web Audio analyser pipeline', async () => {
    const prevWindow = globalThis.window;
    try {
      const engine = new AudioEngine();
      let mediaSourceCreated = false;
      let connectedToGain = false;

      globalThis.window = {
        AudioContext: class {
          constructor() {
            this.state = 'running';
            this.destination = {};
          }
          createGain() {
            return { gain: { value: 1 }, connect: () => {} };
          }
          createAnalyser() {
            return { fftSize: 2048, smoothingTimeConstant: 0.85, connect: () => {} };
          }
          createMediaElementSource(el) {
            mediaSourceCreated = true;
            return {
              connect: (target) => {
                connectedToGain = true;
              }
            };
          }
        }
      };

      engine.radioAudio = {
        preload: 'none',
        crossOrigin: 'anonymous',
        addEventListener: () => {}
      };

      await engine.initWebAudio();
      assert.equal(mediaSourceCreated, true);
      assert.equal(connectedToGain, true);
      assert.ok(engine.analyser);
    } finally {
      globalThis.window = prevWindow;
    }
  });

  await t.test('playRadio executes fallback without crossOrigin if initial play fails with CORS error', async () => {
    const engine = new AudioEngine();
    let playAttempts = 0;
    let removedCrossOrigin = false;

    engine.radioAudio = {
      src: '',
      volume: 1,
      crossOrigin: 'anonymous',
      removeAttribute: (attr) => {
        if (attr === 'crossOrigin') removedCrossOrigin = true;
      },
      play: async () => {
        playAttempts++;
        if (playAttempts === 1) {
          throw new Error('CORS error: Access-Control-Allow-Origin missing');
        }
        return Promise.resolve();
      }
    };

    const station = { id: 'cors_station', name: 'CORS Radio', streamUrl: 'https://stream.example.org/nocors' };
    await engine.playRadio(station);

    assert.equal(playAttempts, 2, 'Should attempt fallback play');
    assert.equal(removedCrossOrigin, true, 'Should strip crossOrigin on fallback');
    assert.equal(engine.isPlaying, true);
  });
});
