/**
 * LocalJam - Canvas Real-Time Audio Visualizer Engine
 * 4 High-Performance Visualizer Modes:
 * 1. 'bars': Frequency Spectrum with peak decay meters & colorblind-safe gradient.
 * 2. 'wave': Glowing Oscilloscope Waveform line.
 * 3. 'nebula': Radial Bass-Reactive Circular Frequency Nebula.
 * 4. 'starfield': Audio-Reactive Starfield particle engine.
 */

import { audioEngine } from '../player/audio-engine.js';

export class AudioVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    /** @type {CanvasRenderingContext2D} */
    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    this.mode = 'bars'; // 'bars' | 'wave' | 'nebula' | 'starfield'
    this.isRunning = false;
    this.animationFrameId = null;

    this.freqData = new Uint8Array(1024);
    this.timeData = new Uint8Array(1024);
    this.peakLevels = new Float32Array(128).fill(0);

    // Starfield particles
    this.stars = [];
    this.initStars(150);

    this.wasRunningBeforeHide = false;
    this.resize = this.resize.bind(this);
    this.render = this.render.bind(this);

    this.handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        if (this.isRunning) {
          this.wasRunningBeforeHide = true;
          this.pause();
        }
      } else if (this.wasRunningBeforeHide) {
        this.wasRunningBeforeHide = false;
        this.start();
      }
    };

    this.resize();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.resize);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  initStars(count) {
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 2000,
        z: Math.random() * 1000 + 1,
        pz: 1000
      });
    }
  }

  resize() {
    if (!this.canvas) return;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const width = this.canvas.clientWidth || 800;
    const height = this.canvas.clientHeight || 400;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    if (this.ctx && typeof this.ctx.scale === 'function') {
      this.ctx.scale(dpr, dpr);
    }
    this.width = width;
    this.height = height;
  }

  setMode(mode) {
    if (['bars', 'wave', 'nebula', 'starfield'].includes(mode)) {
      this.mode = mode;
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.render();
  }

  pause() {
    this.isRunning = false;
    if (this.animationFrameId) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animationFrameId);
      }
      this.animationFrameId = null;
    }
  }

  render() {
    if (!this.isRunning || !this.ctx) return;

    if (audioEngine) {
      audioEngine.getByteFrequencyData(this.freqData);
      audioEngine.getByteTimeDomainData(this.timeData);
    }

    const w = this.width || 800;
    const h = this.height || 400;

    // Clear background
    this.ctx.fillStyle = '#0b0f17';
    this.ctx.fillRect(0, 0, w, h);

    switch (this.mode) {
      case 'bars':
        this.renderBars(w, h);
        break;
      case 'wave':
        this.renderWave(w, h);
        break;
      case 'nebula':
        this.renderNebula(w, h);
        break;
      case 'starfield':
        this.renderStarfield(w, h);
        break;
      default:
        this.renderBars(w, h);
    }

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationFrameId = requestAnimationFrame(this.render);
    }
  }

  renderBars(w, h) {
    const barCount = Math.min(64, Math.floor(w / 8));
    const barWidth = (w / barCount) * 0.7;
    const gap = (w / barCount) * 0.3;
    const step = Math.floor(this.freqData.length / barCount / 2);

    let gradient = null;
    if (typeof this.ctx.createLinearGradient === 'function') {
      gradient = this.ctx.createLinearGradient(0, h, 0, 0);
      gradient.addColorStop(0, '#0072B2'); // Accessible Blue
      gradient.addColorStop(0.6, '#38bdf8'); // Cyan
      gradient.addColorStop(1, '#fbbf24'); // Amber
    }

    for (let i = 0; i < barCount; i++) {
      const val = this.freqData[i * step] || 0;
      const barHeight = (val / 255) * (h * 0.85);
      const x = i * (barWidth + gap) + gap / 2;
      const y = h - barHeight;

      // Draw Main Bar
      this.ctx.fillStyle = gradient || '#38bdf8';
      this.ctx.beginPath();
      if (typeof this.ctx.roundRect === 'function') {
        this.ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
      } else {
        this.ctx.rect(x, y, barWidth, barHeight);
      }
      this.ctx.fill();

      // Peak Decay Meter
      if (barHeight > this.peakLevels[i]) {
        this.peakLevels[i] = barHeight;
      } else {
        this.peakLevels[i] = Math.max(0, this.peakLevels[i] - 1.5);
      }

      const peakY = h - this.peakLevels[i] - 3;
      this.ctx.fillStyle = '#f8fafc';
      this.ctx.fillRect(x, peakY, barWidth, 2);
    }
  }

  renderWave(w, h) {
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = '#0072B2';

    this.ctx.beginPath();
    const sliceWidth = w / this.timeData.length;
    let x = 0;

    for (let i = 0; i < this.timeData.length; i++) {
      const v = this.timeData[i] / 128.0;
      const y = (v * h) / 2;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    this.ctx.lineTo(w, h / 2);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  renderNebula(w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.22;

    // Calculate low bass energy
    let bassSum = 0;
    for (let i = 0; i < 16; i++) bassSum += this.freqData[i];
    const bassAvg = bassSum / 16 / 255;

    // Inner Pulsing Core
    if (typeof this.ctx.createRadialGradient === 'function') {
      const glowGradient = this.ctx.createRadialGradient(cx, cy, 5, cx, cy, radius * (1 + bassAvg * 0.4));
      glowGradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
      glowGradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.4)');
      glowGradient.addColorStop(1, 'rgba(11, 15, 23, 0)');
      this.ctx.fillStyle = glowGradient;
    } else {
      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
    }

    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius * (1 + bassAvg * 0.4), 0, Math.PI * 2);
    this.ctx.fill();

    // Outer Radial Frequency Ring
    const points = 72;
    const angleStep = (Math.PI * 2) / points;
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 2;

    this.ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const val = this.freqData[i * 4] || 0;
      const r = radius + (val / 255) * (radius * 0.8);
      const angle = i * angleStep;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;

      if (i === 0) {
        this.ctx.moveTo(px, py);
      } else {
        this.ctx.lineTo(px, py);
      }
    }
    this.ctx.closePath();
    this.ctx.stroke();
  }

  renderStarfield(w, h) {
    const cx = w / 2;
    const cy = h / 2;

    let energySum = 0;
    for (let i = 0; i < 32; i++) energySum += this.freqData[i];
    const speed = 2 + (energySum / 32 / 255) * 15;

    this.ctx.fillStyle = '#f8fafc';

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      star.pz = star.z;
      star.z -= speed;

      if (star.z <= 0) {
        star.z = 1000;
        star.pz = 1000;
        star.x = (Math.random() - 0.5) * 2000;
        star.y = (Math.random() - 0.5) * 2000;
      }

      const k = 250 / star.z;
      const px = star.x * k + cx;
      const py = star.y * k + cy;

      const pk = 250 / star.pz;
      const prevX = star.x * pk + cx;
      const prevY = star.y * pk + cy;

      const size = Math.max(1, (1 - star.z / 1000) * 3);

      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = size;
      this.ctx.beginPath();
      this.ctx.moveTo(prevX, prevY);
      this.ctx.lineTo(px, py);
      this.ctx.stroke();
    }
  }

  destroy() {
    this.pause();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resize);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }
}
