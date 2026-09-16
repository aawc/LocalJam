import test from 'node:test';
import assert from 'node:assert/strict';
import { createEqModal } from '../../src/ui/components/eq-modal.js';

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
        _childMap: new Map(),
        querySelector(selector) {
          if (!this._childMap.has(selector)) {
            this._childMap.set(selector, createMockElement(selector));
          }
          return this._childMap.get(selector);
        },
        querySelectorAll(selector) {
          return [this.querySelector(selector), createMockElement(selector)];
        },
        addEventListener() {}
      };
      return el;
    },
    addEventListener() {},
    removeEventListener() {}
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

test('UI Components - createEqModal renders 10-band equalizer modal', () => {
  const eq = createEqModal();
  assert.equal(eq.element.id, 'eq-modal');
  assert.equal(eq.element.getAttribute('role'), 'dialog');
  assert.equal(typeof eq.open, 'function');
  assert.equal(typeof eq.close, 'function');
  assert.equal(typeof eq.toggle, 'function');
  assert.ok(eq.element.innerHTML.includes('Graphic Equalizer'));
});
