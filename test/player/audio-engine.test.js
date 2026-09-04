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
});
