import test from 'node:test';
import assert from 'node:assert/strict';
import { Equalizer, EQ_FREQUENCIES, EQ_PRESETS } from '../../src/player/equalizer.js';

test('10-Band Graphic Equalizer Suite', async (t) => {
  await t.test('Initializes with 10 standard ISO frequency bands and zero gains', () => {
    const eq = new Equalizer();
    assert.equal(eq.frequencies.length, 10);
    assert.deepEqual(eq.frequencies, [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
    assert.deepEqual(eq.getGains(), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  await t.test('Clamps gain adjustments within -12 dB to +12 dB range', () => {
    const eq = new Equalizer();
    eq.setGain(0, 18); // Exceeds +12
    assert.equal(eq.getGains()[0], 12);

    eq.setGain(1, -25); // Below -12
    assert.equal(eq.getGains()[1], -12);

    eq.setGain(2, 4.5);
    assert.equal(eq.getGains()[2], 4.5);
  });

  await t.test('Applies audio presets accurately', () => {
    const eq = new Equalizer();
    assert.equal(eq.applyPreset('Bass Boost'), true);
    assert.deepEqual(eq.getGains(), EQ_PRESETS['Bass Boost']);
    assert.equal(eq.currentPreset, 'Bass Boost');

    assert.equal(eq.applyPreset('Rock'), true);
    assert.deepEqual(eq.getGains(), EQ_PRESETS['Rock']);

    assert.equal(eq.applyPreset('NonExistentPreset'), false);
  });

  await t.test('Resets to Flat preset', () => {
    const eq = new Equalizer();
    eq.applyPreset('Electronic');
    eq.reset();
    assert.deepEqual(eq.getGains(), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(eq.currentPreset, 'Flat');
  });
});
