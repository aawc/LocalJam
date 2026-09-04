/**
 * LocalJam - Fullscreen Audio Visualizer Overlay Component
 */

import { audioVisualizer, VISUALIZER_MODES } from '../../visualizer/visualizer.js';

export function createVisualizerOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'visualizer-overlay';
  overlay.className = 'visualizer-overlay';
  overlay.style.display = 'none';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Audio Visualizer');

  overlay.innerHTML = `
    <div class="visualizer-header">
      <div class="visualizer-title">Audio Visualizer</div>
      <div class="visualizer-modes">
        ${VISUALIZER_MODES.map(
          (m) => `
          <button class="btn-mode-pill ${m.id === 'bars' ? 'active' : ''}" data-mode="${m.id}" aria-label="Visualizer mode ${m.name}">
            ${m.name}
          </button>
        `
        ).join('')}
      </div>
      <button class="btn-close" aria-label="Close Visualizer">&times;</button>
    </div>

    <div class="visualizer-canvas-container">
      <canvas id="visualizer-canvas"></canvas>
    </div>
  `;

  const canvas = overlay.querySelector('#visualizer-canvas');
  const closeBtn = overlay.querySelector('.btn-close');
  const modePills = overlay.querySelectorAll('.btn-mode-pill');

  modePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const mode = pill.dataset.mode;
      audioVisualizer.setMode(mode);
      modePills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  function close() {
    overlay.style.display = 'none';
    audioVisualizer.stop();
  }

  function open() {
    overlay.style.display = 'flex';
    audioVisualizer.init(canvas);
    audioVisualizer.start();
  }

  closeBtn.addEventListener('click', close);

  return {
    element: overlay,
    open,
    close,
    toggle: () => {
      if (overlay.style.display === 'none') open();
      else close();
    }
  };
}
