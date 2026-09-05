/**
 * LocalJam - Fullscreen Audio Visualizer Overlay Component
 */

import { audioVisualizer, VISUALIZER_MODES } from '../../visualizer/visualizer.js';
import { audioEngine } from '../../player/audio-engine.js';

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
      <div class="visualizer-header-actions" style="display: flex; align-items: center; gap: 8px;">
        <button id="btn-toggle-visualizer-fullscreen" class="btn-icon" aria-label="Enter Fullscreen" title="Toggle Fullscreen (F)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
          </svg>
        </button>
        <button class="btn-close" aria-label="Close Visualizer">&times;</button>
      </div>
    </div>

    <div class="visualizer-canvas-container">
      <canvas id="visualizer-canvas"></canvas>
    </div>
  `;

  const canvas = overlay.querySelector('#visualizer-canvas');
  const closeBtn = overlay.querySelector('.btn-close');
  const fullscreenBtn = overlay.querySelector('#btn-toggle-visualizer-fullscreen');
  const modePills = overlay.querySelectorAll('.btn-mode-pill');

  modePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const mode = pill.dataset.mode;
      audioVisualizer.setMode(mode);
      modePills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  function isFullscreenActive() {
    return Boolean(
      (typeof document !== 'undefined') &&
      (document.fullscreenElement === overlay ||
       document.webkitFullscreenElement === overlay ||
       document.mozFullScreenElement === overlay ||
       document.msFullscreenElement === overlay)
    );
  }

  function updateFullscreenButtonState() {
    if (!fullscreenBtn) return;
    const isFs = isFullscreenActive();
    fullscreenBtn.setAttribute('aria-label', isFs ? 'Exit Fullscreen' : 'Enter Fullscreen');
    fullscreenBtn.setAttribute('title', isFs ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)');
    fullscreenBtn.innerHTML = isFs
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
        </svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
        </svg>`;
  }

  async function toggleFullscreen() {
    try {
      if (!isFullscreenActive()) {
        if (overlay.requestFullscreen) {
          await overlay.requestFullscreen();
        } else if (overlay.webkitRequestFullscreen) {
          await overlay.webkitRequestFullscreen();
        } else if (overlay.msRequestFullscreen) {
          await overlay.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn(`[Visualizer] Fullscreen toggle failed: ${err?.message}`);
    }
    updateFullscreenButtonState();
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
  }

  if (canvas) {
    canvas.addEventListener('dblclick', toggleFullscreen);
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('fullscreenchange', updateFullscreenButtonState);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButtonState);
    document.addEventListener('keydown', (e) => {
      if (overlay.style.display !== 'none' && (e.key === 'f' || e.key === 'F')) {
        const tag = document.activeElement?.tagName;
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
          e.preventDefault();
          toggleFullscreen();
        }
      }
    });
  }

  function close() {
    if (isFullscreenActive()) {
      try {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(() => {});
      } catch (_) {}
    }
    overlay.style.display = 'none';
    audioVisualizer.stop();
    updateFullscreenButtonState();
  }

  function open() {
    overlay.style.display = 'flex';
    if (audioEngine && typeof audioEngine.initWebAudio === 'function') {
      audioEngine.initWebAudio().catch(() => {});
    }
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
    },
    toggleFullscreen,
    isFullscreenActive
  };
}
