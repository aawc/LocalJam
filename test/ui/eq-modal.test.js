import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEqModal } from '../../src/ui/components/eq-modal.js';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const CSS_PATH = path.join(ROOT_DIR, 'src/ui/app.css');

test('Equalizer UI & Styling Suite', async (t) => {
  await t.test('CSS - .eq-slider uses standard writing-mode/direction and eliminates slider-vertical', () => {
    assert.ok(fs.existsSync(CSS_PATH), 'src/ui/app.css must exist');
    const css = fs.readFileSync(CSS_PATH, 'utf8');

    // Extract the .eq-slider CSS rule block
    const eqSliderRuleMatch = css.match(/\.eq-slider\s*\{([^}]+)\}/);
    assert.ok(eqSliderRuleMatch, '.eq-slider rule block must exist in app.css');
    const eqSliderBody = eqSliderRuleMatch[1];

    // Assert standard vertical range input properties are preserved
    assert.match(
      eqSliderBody,
      /writing-mode:\s*vertical-lr;/,
      '.eq-slider must retain standardized writing-mode: vertical-lr;'
    );
    assert.match(
      eqSliderBody,
      /direction:\s*rtl;/,
      '.eq-slider must retain standardized direction: rtl;'
    );

    // Assert non-standard slider-vertical appearance is completely removed
    assert.equal(
      /slider-vertical/.test(eqSliderBody),
      false,
      '.eq-slider must NOT contain non-standard slider-vertical keyword'
    );
    assert.equal(
      /-webkit-appearance:\s*slider-vertical;/.test(eqSliderBody),
      false,
      '.eq-slider must NOT declare -webkit-appearance: slider-vertical;'
    );

    // Assert whole stylesheet does not contain deprecated slider-vertical keyword
    assert.equal(
      css.includes('slider-vertical'),
      false,
      'src/ui/app.css must NOT contain slider-vertical anywhere'
    );
  });

  await t.test('DOM - createEqModal constructs 10 vertical range sliders with class eq-slider', () => {
    setupMockDom();
    try {
      const eqModal = createEqModal();
      assert.ok(eqModal.element, 'createEqModal must return element');
      assert.equal(eqModal.element.id, 'eq-modal');
      assert.equal(eqModal.element.getAttribute('role'), 'dialog');

      const sliders = eqModal.element.querySelectorAll('.eq-slider');
      assert.equal(sliders.length, 10, 'Must render 10 EQ band sliders');

      for (let i = 0; i < sliders.length; i++) {
        const slider = sliders[i];
        assert.equal(slider.getAttribute('type'), 'range');
        assert.equal(slider.getAttribute('data-band'), String(i));
        assert.equal(slider.getAttribute('min'), '-12');
        assert.equal(slider.getAttribute('max'), '12');
        assert.equal(slider.getAttribute('step'), '0.5');
        assert.ok(slider.classList.contains('eq-slider'), 'Slider must have eq-slider class');
      }

      // Check modal open / close toggle methods
      assert.equal(typeof eqModal.open, 'function');
      assert.equal(typeof eqModal.close, 'function');
      assert.equal(typeof eqModal.toggle, 'function');

      eqModal.open();
      assert.equal(eqModal.element.style.display, 'flex');

      eqModal.close();
      assert.equal(eqModal.element.style.display, 'none');
    } finally {
      teardownMockDom();
    }
  });
});
