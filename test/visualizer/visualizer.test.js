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

  await t.test('Dynamically resizes canvas, applies DPR transforms, and generates ambient waves when idle', () => {
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

    // Verifies ambient idle waves populated frequency and time domain data
    let nonZeroFreq = 0;
    for (let i = 0; i < visualizer.freqData.length; i++) {
      if (visualizer.freqData[i] > 0) nonZeroFreq++;
    }
    assert.ok(nonZeroFreq > 0, 'Idle mode should synthesize non-zero ambient frequency values');
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
});
