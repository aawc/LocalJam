/**
 * LocalJam - 10-Band Graphic Equalizer
 * Standard ISO center frequencies: 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz
 */

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
  Rock: [4, 3, 1, 0, -1, -1, 1, 3, 4, 5],
  Pop: [-1, 1, 3, 4, 3, 0, -1, 1, 2, 3],
  Jazz: [3, 2, 0, 2, -1, -1, 0, 2, 3, 4],
  Vocal: [-2, -2, -1, 2, 4, 4, 3, 1, 0, -1],
  Electronic: [5, 4, 1, 0, -2, 2, 1, 3, 4, 4]
};

export class Equalizer {
  constructor() {
    this.frequencies = [...EQ_FREQUENCIES];
    this.gains = new Array(EQ_FREQUENCIES.length).fill(0);
    /** @type {BiquadFilterNode[]} */
    this.filters = [];
    /** @type {AudioContext|null} */
    this.audioCtx = null;
    this.inputNode = null;
    this.outputNode = null;
    this.currentPreset = 'Flat';
  }

  /**
   * Build BiquadFilterNodes within the provided Web Audio context
   * @param {AudioContext} audioCtx
   * @param {AudioNode} sourceNode
   * @param {AudioNode} destinationNode
   */
  connect(audioCtx, sourceNode, destinationNode) {
    this.audioCtx = audioCtx;
    this.filters = [];

    // Create 10 BiquadFilter nodes
    for (let i = 0; i < this.frequencies.length; i++) {
      const freq = this.frequencies[i];
      const filter = audioCtx.createBiquadFilter();

      if (i === 0) {
        filter.type = 'lowshelf';
      } else if (i === this.frequencies.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.value = 1.414;
      }

      filter.frequency.value = freq;
      filter.gain.value = this.gains[i];
      this.filters.push(filter);
    }

    // Connect filters in series: source -> filter[0] -> ... -> filter[9] -> destination
    sourceNode.connect(this.filters[0]);
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1]);
    }
    this.filters[this.filters.length - 1].connect(destinationNode);

    this.inputNode = this.filters[0];
    this.outputNode = this.filters[this.filters.length - 1];
  }

  setGain(bandIndex, gainDb) {
    if (bandIndex < 0 || bandIndex >= this.frequencies.length) return;
    const clampedGain = Math.max(-12, Math.min(12, gainDb));
    this.gains[bandIndex] = clampedGain;
    this.currentPreset = 'Custom';

    if (this.filters[bandIndex] && this.audioCtx) {
      this.filters[bandIndex].gain.setTargetAtTime(clampedGain, this.audioCtx.currentTime, 0.05);
    }
  }

  setGains(gainsArray) {
    if (!Array.isArray(gainsArray)) return;
    for (let i = 0; i < Math.min(gainsArray.length, this.frequencies.length); i++) {
      this.setGain(i, gainsArray[i]);
    }
  }

  applyPreset(name) {
    const preset = EQ_PRESETS[name];
    if (!preset) return false;
    this.currentPreset = name;
    for (let i = 0; i < preset.length; i++) {
      this.setGain(i, preset[i]);
    }
    this.currentPreset = name;
    return true;
  }

  getGains() {
    return [...this.gains];
  }

  getPresets() {
    return Object.keys(EQ_PRESETS);
  }

  reset() {
    this.applyPreset('Flat');
  }
}

export const equalizer = new Equalizer();
