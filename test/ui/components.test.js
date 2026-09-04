import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerBar } from '../../src/ui/components/player-bar.js';
import { createEqModal } from '../../src/ui/components/eq-modal.js';
import { createVisualizerOverlay } from '../../src/ui/components/visualizer-overlay.js';
import { createQueueDrawer } from '../../src/ui/components/queue-drawer.js';

// Setup minimal mock DOM if running in headless node
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        id: '',
        style: {},
        attributes: {},
        innerHTML: '',
        classList: {
          classes: new Set(),
          add(c) {
            this.classes.add(c);
          },
          remove(c) {
            this.classes.delete(c);
          },
          contains(c) {
            return this.classes.has(c);
          },
          toggle(c, force) {
            if (force === undefined) {
              if (this.classes.has(c)) this.classes.delete(c);
              else this.classes.add(c);
            } else if (force) this.classes.add(c);
            else this.classes.delete(c);
          }
        },
        setAttribute(k, v) {
          this.attributes[k] = v;
        },
        getAttribute(k) {
          return this.attributes[k];
        },
        removeAttribute(k) {
          delete this.attributes[k];
        },
        querySelector(selector) {
          return createMockElement(selector);
        },
        querySelectorAll(selector) {
          return [createMockElement(selector), createMockElement(selector)];
        },
        addEventListener() {}
      };
      return el;
    }
  };
}

function createMockElement(selector) {
  return {
    className: '',
    id: selector.replace(/^[#.\[\]=]/g, ''),
    style: {},
    dataset: { band: '0', mode: 'bars' },
    attributes: {},
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    getAttribute(k) {
      return this.attributes[k];
    },
    addEventListener() {},
    querySelector() {
      return createMockElement('');
    },
    querySelectorAll() {
      return [];
    }
  };
}

test('UI Components - createPlayerBar renders player bar structure', () => {
  const bar = createPlayerBar();
  assert.equal(bar.className, 'player-bar');
  assert.equal(bar.getAttribute('role'), 'region');
  assert.equal(bar.getAttribute('aria-label'), 'Audio Player Controls');
  assert.ok(bar.innerHTML.includes('player-controls'));
  assert.ok(bar.innerHTML.includes('player-progress-bar'));
});

test('UI Components - createEqModal renders 10-band equalizer modal', () => {
  const eq = createEqModal();
  assert.equal(eq.element.id, 'eq-modal');
  assert.equal(eq.element.getAttribute('role'), 'dialog');
  assert.equal(typeof eq.open, 'function');
  assert.equal(typeof eq.close, 'function');
  assert.equal(typeof eq.toggle, 'function');
  assert.ok(eq.element.innerHTML.includes('Graphic Equalizer'));
});

test('UI Components - createVisualizerOverlay renders visualizer overlay', () => {
  const viz = createVisualizerOverlay();
  assert.equal(viz.element.id, 'visualizer-overlay');
  assert.equal(typeof viz.open, 'function');
  assert.equal(typeof viz.close, 'function');
  assert.equal(typeof viz.toggle, 'function');
  assert.ok(viz.element.innerHTML.includes('visualizer-canvas'));
});

test('UI Components - createQueueDrawer renders queue drawer component', () => {
  const queue = createQueueDrawer();
  assert.equal(queue.element.id, 'queue-drawer');
  assert.equal(typeof queue.open, 'function');
  assert.equal(typeof queue.close, 'function');
  assert.equal(typeof queue.toggle, 'function');
  assert.ok(queue.element.innerHTML.includes('Play Queue'));
});
