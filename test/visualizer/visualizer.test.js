import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioVisualizer } from '../../src/visualizer/visualizer.js';

// Mock Canvas and 2D Context for Node.js environment
function createMockCanvas(width = 800, height = 400) {
  const operations = [];

  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowBlur: 0,
    shadowColor: '',
    fillRect: (x, y, w, h) => operations.push(['fillRect', x, y, w, h]),
    beginPath: () => operations.push(['beginPath']),
    closePath: () => operations.push(['closePath']),
    moveTo: (x, y) => operations.push(['moveTo', x, y]),
    lineTo: (x, y) => operations.push(['lineTo', x, y]),
    arc: (x, y, r, sa, ea) => operations.push(['arc', x, y, r, sa, ea]),
    roundRect: (x, y, w, h, radii) => operations.push(['roundRect', x, y, w, h, radii]),
    rect: (x, y, w, h) => operations.push(['rect', x, y, w, h]),
    fill: () => operations.push(['fill']),
    stroke: () => operations.push(['stroke']),
    scale: (sx, sy) => operations.push(['scale', sx, sy]),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} })
  };

  const canvas = {
    clientWidth: width,
    clientHeight: height,
    width,
    height,
    getContext: (type) => (type === '2d' ? ctx : null)
  };

  return { canvas, ctx, operations };
}

test('Audio Visualizer Engine Suite', async (t) => {
  await t.test('Initializes with default bars mode and particle starfield', () => {
    const { canvas } = createMockCanvas();
    const visualizer = new AudioVisualizer(canvas);
    assert.equal(visualizer.mode, 'bars');
    assert.equal(visualizer.isRunning, false);
    assert.ok(visualizer.stars.length >= 100);
  });

  await t.test('Allows switching between all 4 rendering modes', () => {
    const { canvas } = createMockCanvas();
    const visualizer = new AudioVisualizer(canvas);

    visualizer.setMode('wave');
    assert.equal(visualizer.mode, 'wave');

    visualizer.setMode('nebula');
    assert.equal(visualizer.mode, 'nebula');

    visualizer.setMode('starfield');
    assert.equal(visualizer.mode, 'starfield');

    visualizer.setMode('bars');
    assert.equal(visualizer.mode, 'bars');

    // Rejects invalid modes
    visualizer.setMode('invalid_mode');
    assert.equal(visualizer.mode, 'bars');
  });

  await t.test('Renders frame for bars mode without errors', () => {
    const { canvas, operations } = createMockCanvas();
    const visualizer = new AudioVisualizer(canvas);
    visualizer.isRunning = true;
    visualizer.render();

    assert.ok(operations.some((op) => op[0] === 'fillRect'));
    assert.ok(operations.some((op) => op[0] === 'fill'));
  });

  await t.test('Renders frame for wave mode without errors', () => {
    const { canvas, operations } = createMockCanvas();
    const visualizer = new AudioVisualizer(canvas);
    visualizer.setMode('wave');
    visualizer.isRunning = true;
    visualizer.render();

    assert.ok(operations.some((op) => op[0] === 'stroke'));
    assert.ok(operations.some((op) => op[0] === 'lineTo'));
  });

  await t.test('Renders frame for nebula and starfield modes without errors', () => {
    const { canvas, operations } = createMockCanvas();
    const visualizer = new AudioVisualizer(canvas);

    visualizer.setMode('nebula');
    visualizer.isRunning = true;
    visualizer.render();
    assert.ok(operations.some((op) => op[0] === 'arc'));

    visualizer.setMode('starfield');
    visualizer.render();
    assert.ok(visualizer.stars.length > 0);
  });

  await t.test('Dynamically resizes canvas, applies DPR transforms, and preserves calm state when idle', () => {
    let transformArgs = null;
    const { canvas, ctx } = createMockCanvas(400, 200);
    ctx.setTransform = (a, b, c, d, e, f) => {
      transformArgs = [a, b, c, d, e, f];
    };
    canvas.getBoundingClientRect = () => ({ width: 600, height: 350 });

    const visualizer = new AudioVisualizer(canvas);
    visualizer.isRunning = true;
    visualizer.render();

    // Verifies canvas dimensions were dynamically updated
    assert.equal(visualizer.width, 600);
    assert.equal(visualizer.height, 350);
    assert.ok(transformArgs !== null);

    // Verifies no fake ambient waves are synthesized when idle/stopped
    let nonZeroFreq = 0;
    for (let i = 0; i < visualizer.freqData.length; i++) {
      if (visualizer.freqData[i] > 0) nonZeroFreq++;
    }
    assert.equal(nonZeroFreq, 0, 'Idle mode must not synthesize fake frequency oscillations');
  });

  await t.test('Accurately reflects real audio frequency and time domain data during playback', () => {
    const { canvas, operations } = createMockCanvas(800, 400);
    const visualizer = new AudioVisualizer(canvas);
    visualizer.isRunning = true;

    // Simulate real audio frequency input
    visualizer.freqData.fill(180);
    visualizer.timeData.fill(200);
    visualizer.setMode('bars');
    visualizer.renderBars(800, 400);

    // Peak levels should reflect the active bar heights
    assert.ok(visualizer.peakLevels[0] > 10, 'Peak levels should track audio bar heights');
    assert.ok(operations.some((op) => op[0] === 'fillRect'));

    // Wave mode should use real time-domain data
    operations.length = 0;
    visualizer.setMode('wave');
    visualizer.renderWave(800, 400);
    assert.ok(operations.some((op) => op[0] === 'lineTo' && op[2] > 200));
  });

  await t.test('Handles start, pause, and destroy lifecycle cleanly', () => {
    const { canvas } = createMockCanvas();
    const visualizer = new AudioVisualizer(canvas);

    visualizer.start();
    assert.equal(visualizer.isRunning, true);

    visualizer.pause();
    assert.equal(visualizer.isRunning, false);

    visualizer.destroy();
    assert.equal(visualizer.isRunning, false);
  });

  await t.test('Resilient against zero-dimension canvas and layout transitions without throwing IndexSizeError', () => {
    let gradientCreated = false;
    const { canvas, ctx } = createMockCanvas(0, 0);
    ctx.createRadialGradient = (x0, y0, r0, x1, y1, r1) => {
      if (r0 < 0 || r1 <= 0 || isNaN(r0) || isNaN(r1)) {
        throw new Error('IndexSizeError: The provided radius is non-finite or negative');
      }
      gradientCreated = true;
      return { addColorStop: () => {} };
    };

    const visualizer = new AudioVisualizer(canvas);
    visualizer.width = 0;
    visualizer.height = 0;
    visualizer.setMode('nebula');
    visualizer.isRunning = true;

    // Must not throw IndexSizeError
    assert.doesNotThrow(() => {
      visualizer.render();
    });
    assert.ok(gradientCreated, 'createRadialGradient must be invoked with valid positive radii');
  });

  await t.test('Routes real AnalyserNode FFT data to visualizer during playback and stays calm when stopped', async () => {
    const { audioEngine } = await import('../../src/player/audio-engine.js');
    audioEngine.isPlaying = true;
    audioEngine.analyser = {
      getByteFrequencyData: (arr) => arr.fill(175),
      getByteTimeDomainData: (arr) => arr.fill(160)
    };

    const freqData = new Uint8Array(1024);
    const timeData = new Uint8Array(1024);

    audioEngine.getByteFrequencyData(freqData);
    audioEngine.getByteTimeDomainData(timeData);

    assert.equal(freqData[0], 175, 'Visualizer must receive genuine FFT data from AnalyserNode');
    assert.equal(timeData[0], 160, 'Visualizer must receive genuine time-domain data from AnalyserNode');

    // When stopped / paused, data must be clean zero / calm state (no fake fixed synthetic patterns)
    audioEngine.isPlaying = false;
    audioEngine.getByteFrequencyData(freqData);
    audioEngine.getByteTimeDomainData(timeData);

    assert.equal(freqData[0], 0, 'Idle mode must not output frequency energy');
    assert.equal(timeData[0], 128, 'Idle mode must return centered calm time-domain baseline');

    // Clean up
    audioEngine.analyser = null;
  });

  await t.test('AudioEngine ensureAudioContextActive initializes and resumes suspended AudioContext', async () => {
    const { audioEngine } = await import('../../src/player/audio-engine.js');
    let resumed = false;

    audioEngine.webAudioInitialized = true;
    audioEngine.audioCtx = {
      state: 'suspended',
      resume: async () => {
        resumed = true;
        audioEngine.audioCtx.state = 'running';
      }
    };

    await audioEngine.ensureAudioContextActive();
    assert.equal(resumed, true, 'ensureAudioContextActive must call resume on suspended AudioContext');
    assert.equal(audioEngine.audioCtx.state, 'running');
  });

  await t.test('Properly scales high DPI displays on macOS Retina (dpr=2) and Android (dpr=3)', () => {
    let transformA = null;
    let transformB = null;

    // Retina (macOS) dpr=2
    globalThis.window = { devicePixelRatio: 2, innerWidth: 1440, innerHeight: 900 };
    const canvasRetina = createMockCanvas(800, 400);
    canvasRetina.ctx.setTransform = (a, b, c, d, e, f) => {
      transformA = [a, b, c, d, e, f];
    };
    canvasRetina.canvas.getBoundingClientRect = () => ({ width: 800, height: 400 });
    const vizRetina = new AudioVisualizer(canvasRetina.canvas);
    vizRetina.isRunning = true;
    vizRetina.render();
    assert.equal(canvasRetina.canvas.width, 1600);
    assert.equal(canvasRetina.canvas.height, 800);
    assert.deepEqual(transformA, [2, 0, 0, 2, 0, 0]);

    // High-DPI Android phone dpr=3
    globalThis.window = { devicePixelRatio: 3, innerWidth: 390, innerHeight: 844 };
    const canvasAndroid = createMockCanvas(390, 600);
    canvasAndroid.ctx.setTransform = (a, b, c, d, e, f) => {
      transformB = [a, b, c, d, e, f];
    };
    canvasAndroid.canvas.getBoundingClientRect = () => ({ width: 390, height: 600 });
    const vizAndroid = new AudioVisualizer(canvasAndroid.canvas);
    vizAndroid.isRunning = true;
    vizAndroid.render();
    assert.equal(canvasAndroid.canvas.width, 1170);
    assert.equal(canvasAndroid.canvas.height, 1800);
    assert.deepEqual(transformB, [3, 0, 0, 3, 0, 0]);

    // Reset window
    delete globalThis.window;
  });
});
