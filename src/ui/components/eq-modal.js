/**
 * LocalJam - 10-Band Graphic Equalizer Modal Component
 */

import { equalizer, EQ_FREQUENCIES, EQ_PRESETS } from '../../player/equalizer.js';

export function createEqModal() {
  const modal = document.createElement('div');
  modal.id = 'eq-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '10-Band Graphic Equalizer');

  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h2 class="modal-title">Graphic Equalizer</h2>
        <button class="btn-close" aria-label="Close Equalizer">&times;</button>
      </div>

      <div class="modal-body">
        <div class="eq-controls-row">
          <label for="eq-preset-select" class="form-label" style="margin: 0; font-weight: 500;">Preset:</label>
          <select id="eq-preset-select" class="form-select" style="max-width: 200px;">
            ${Object.keys(EQ_PRESETS)
              .map((p) => `<option value="${p}">${p}</option>`)
              .join('')}
            <option value="Custom">Custom</option>
          </select>

          <button id="eq-reset-btn" class="btn btn-secondary" style="padding: 6px 14px; font-size: 13px;">
            Reset Flat
          </button>
        </div>

        <div class="eq-sliders-container">
          ${EQ_FREQUENCIES.map((freq, idx) => {
            const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
            return `
              <div class="eq-slider-col">
                <span class="eq-db-label" id="eq-val-${idx}">0dB</span>
                <div class="eq-slider-wrapper">
                  <input
                    type="range"
                    class="eq-slider"
                    id="eq-band-${idx}"
                    data-band="${idx}"
                    min="-12"
                    max="12"
                    step="0.5"
                    value="0"
                    orient="vertical"
                    aria-label="Equalizer band ${label} Hertz"
                  />
                </div>
                <span class="eq-freq-label">${label}Hz</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  const presetSelect = modal.querySelector('#eq-preset-select');
  const resetBtn = modal.querySelector('#eq-reset-btn');
  const closeBtn = modal.querySelector('.btn-close');
  const sliders = modal.querySelectorAll('.eq-slider');

  function updateUiFromGains() {
    const gains = equalizer.getGains();
    gains.forEach((gain, idx) => {
      const slider = modal.querySelector(`#eq-band-${idx}`);
      const valLabel = modal.querySelector(`#eq-val-${idx}`);
      if (slider) slider.value = gain;
      if (valLabel) valLabel.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
    });
    if (presetSelect) {
      presetSelect.value = equalizer.currentPreset;
    }
  }

  sliders.forEach((slider) => {
    slider.addEventListener('input', (e) => {
      const band = parseInt(e.target.dataset.band, 10);
      const val = parseFloat(e.target.value);
      equalizer.setGain(band, val);
      const valLabel = modal.querySelector(`#eq-val-${band}`);
      if (valLabel) valLabel.textContent = `${val > 0 ? '+' : ''}${val}dB`;
      if (presetSelect) presetSelect.value = 'Custom';
    });
  });

  presetSelect.addEventListener('change', (e) => {
    const selected = e.target.value;
    if (selected !== 'Custom') {
      equalizer.applyPreset(selected);
      updateUiFromGains();
    }
  });

  resetBtn.addEventListener('click', () => {
    equalizer.reset();
    updateUiFromGains();
  });

  function close() {
    modal.style.display = 'none';
  }

  function open() {
    updateUiFromGains();
    modal.style.display = 'flex';
  }

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  return {
    element: modal,
    open,
    close,
    toggle: () => {
      if (modal.style.display === 'none') open();
      else close();
    }
  };
}
