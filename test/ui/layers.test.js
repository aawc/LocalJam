/**
 * LocalJam - Layer Stack Coordinator (L1/L2) Test Suite
 * Asserts layer stack management, hash synchronization with browser history,
 * dismiss rules (backdrop click, Escape key), focus restoration, and error boundary (SEC-07).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';
import { LayerController, layers } from '../../src/ui/layers.js';

describe('Layer Stack Coordinator (src/ui/layers.js)', () => {
  let rootEl;
  let controller;

  beforeEach(() => {
    setupMockDom();
    rootEl = document.createElement('div');
    rootEl.id = 'layer-root';
    document.body.appendChild(rootEl);
    controller = new LayerController();
    controller.init(rootEl);
  });

  afterEach(() => {
    controller.destroy();
    teardownMockDom();
  });

  it('registers factories and manages LIFO layer stack with top getter', () => {
    let browseOpened = false;
    let overflowOpened = false;
    let overflowClosed = false;

    controller.register('browse', () => {
      const el = document.createElement('div');
      el.className = 'mock-browse-sheet';
      return {
        element: el,
        onOpen: () => { browseOpened = true; },
        onClose: () => {}
      };
    });

    controller.register('overflow', () => {
      const el = document.createElement('div');
      el.className = 'mock-overflow-menu';
      return {
        element: el,
        onOpen: () => { overflowOpened = true; },
        onClose: () => { overflowClosed = true; }
      };
    });

    assert.equal(controller.top, null, "Initially top should be null");

    // Open browse (L1)
    controller.open('browse');
    assert.equal(controller.top, 'browse');
    assert.equal(browseOpened, true);
    assert.ok(rootEl.querySelector('.mock-browse-sheet'));

    // Open overflow on top of browse (L2)
    controller.open('overflow');
    assert.equal(controller.top, 'overflow');
    assert.equal(overflowOpened, true);
    assert.ok(rootEl.querySelector('.mock-overflow-menu'));

    // Close topmost (overflow)
    controller.close();
    assert.equal(overflowClosed, true);
    assert.equal(controller.top, 'browse');
    assert.equal(rootEl.querySelector('.mock-overflow-menu'), null);
    assert.ok(rootEl.querySelector('.mock-browse-sheet'));

    // Close remaining (browse)
    controller.close();
    assert.equal(controller.top, null);
    assert.equal(rootEl.querySelector('.mock-browse-sheet'), null);
  });

  it('synchronizes browse sheet opening and closing with window.location.hash', () => {
    controller.register('browse', () => {
      const el = document.createElement('div');
      return { element: el, onOpen: () => {}, onClose: () => {} };
    });

    // Opening browse with tab: radio sets hash to #/browse?tab=radio
    controller.open('browse', { tab: 'radio' });
    assert.equal(window.location.hash, '#/browse?tab=radio');

    // Opening browse with tab: library sets hash to #/browse?tab=library
    controller.open('browse', { tab: 'library' });
    assert.equal(window.location.hash, '#/browse?tab=library');

    // Closing browse resets hash to #/
    controller.close();
    assert.equal(window.location.hash, '#/');
  });

  it('non-browse layers (overflow, eq, notes) do not modify window.location.hash', () => {
    window.location.hash = '#/';

    controller.register('overflow', () => {
      return { element: document.createElement('div'), onOpen: () => {}, onClose: () => {} };
    });

    controller.open('overflow');
    assert.equal(window.location.hash, '#/', "Overflow must not modify hash");

    controller.close();
    assert.equal(window.location.hash, '#/', "Closing overflow must not modify hash");
  });

  it('hashchange event to #/ automatically dismisses browse sheet', () => {
    let closed = false;
    controller.register('browse', () => {
      return { element: document.createElement('div'), onOpen: () => {}, onClose: () => { closed = true; } };
    });

    controller.open('browse');
    assert.equal(controller.top, 'browse');

    // Simulate browser back button (hashchange to #/)
    window.location.hash = '#/';
    window.dispatchEvent(new Event('hashchange'));

    assert.equal(closed, true);
    assert.equal(controller.top, null);
  });

  it('hashchange event to #/browse?tab=radio automatically opens browse sheet', () => {
    let openedTab = null;
    controller.register('browse', () => {
      return {
        element: document.createElement('div'),
        onOpen: (props) => { openedTab = props?.tab; },
        onClose: () => {}
      };
    });

    window.location.hash = '#/browse?tab=radio';
    window.dispatchEvent(new Event('hashchange'));

    assert.equal(controller.top, 'browse');
    assert.equal(openedTab, 'radio');
  });

  it('closeAll closes all stacked layers in LIFO order and restores top to null', () => {
    const closedOrder = [];

    controller.register('layerA', () => ({
      element: document.createElement('div'),
      onOpen: () => {},
      onClose: () => { closedOrder.push('layerA'); }
    }));
    controller.register('layerB', () => ({
      element: document.createElement('div'),
      onOpen: () => {},
      onClose: () => { closedOrder.push('layerB'); }
    }));

    controller.open('layerA');
    controller.open('layerB');
    assert.equal(controller.top, 'layerB');

    controller.closeAll();
    assert.equal(controller.top, null);
    assert.deepEqual(closedOrder, ['layerB', 'layerA']);
  });

  it('renders sanitized error boundary when layer factory throws (SEC-07 replacement)', () => {
    const maliciousPayload = '<script>alert("layer-xss")</script><img src=x onerror=alert(1)>';

    controller.register('broken-layer', () => {
      throw new Error(maliciousPayload);
    });

    controller.open('broken-layer');

    const errorEl = rootEl.querySelector('.layer-error');
    assert.ok(errorEl, "Error boundary element .layer-error must be rendered");
    assert.equal(errorEl.getAttribute('role'), 'alert');

    const html = errorEl.innerHTML;
    // Malicious tags must be escaped
    assert.ok(html.includes('&lt;script&gt;alert('), "Must escape script tag");
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), "Must escape img onerror tag");
    assert.ok(!html.includes('<script>'), "Must NOT contain unescaped script tag");

    // Close button dismisses the error boundary
    const closeBtn = errorEl.querySelector('.btn-layer-error-close');
    assert.ok(closeBtn);
    closeBtn.dispatchEvent(new Event('click'));
    assert.equal(rootEl.querySelector('.layer-error'), null);
    assert.equal(controller.top, null);
  });

  it('backdrop click and Escape key dismiss the topmost layer', () => {
    let closedCount = 0;
    controller.register('test-layer', () => {
      const dialog = document.createElement('div');
      dialog.className = 'test-dialog';
      return {
        element: dialog,
        onOpen: () => {},
        onClose: () => { closedCount++; }
      };
    });

    controller.open('test-layer');
    assert.equal(controller.top, 'test-layer');

    // Backdrop is the layer container wrapper
    const wrapper = rootEl.querySelector('.layer-backdrop');
    assert.ok(wrapper, "Layer wrapper should carry .layer-backdrop class");

    // Clicking directly on the backdrop wrapper triggers close
    wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.equal(closedCount, 1);
    assert.equal(controller.top, null);

    // Reopen and test Escape key
    controller.open('test-layer');
    assert.equal(controller.top, 'test-layer');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(closedCount, 2);
    assert.equal(controller.top, null);
  });

  it('manages focus restoration on layer close', () => {
    const triggerBtn = document.createElement('button');
    document.body.appendChild(triggerBtn);
    document.activeElement = triggerBtn;

    let focusCalled = false;
    controller.register('focus-layer', () => {
      const el = document.createElement('div');
      return {
        element: el,
        onOpen: () => {},
        onClose: () => {},
        focusFirst: () => { focusCalled = true; }
      };
    });

    controller.open('focus-layer');
    assert.equal(focusCalled, true, "Should call focusFirst when opened");

    controller.close();
    assert.equal(document.activeElement, triggerBtn, "Should restore focus to trigger element");
  });

  it('dismisses layer on layer-close and browse-sheet-close custom events', () => {
    let closedCount = 0;
    let childEl;
    controller.register('event-layer', () => {
      childEl = document.createElement('div');
      return {
        element: childEl,
        onOpen: () => {},
        onClose: () => { closedCount++; }
      };
    });

    controller.open('event-layer');
    assert.equal(controller.top, 'event-layer');

    // Child dispatches layer-close event
    childEl.dispatchEvent(new CustomEvent('layer-close', { bubbles: true }));
    assert.equal(closedCount, 1);
    assert.equal(controller.top, null, 'layer should be dismissed on layer-close event');

    // Reopen and test browse-sheet-close
    controller.open('event-layer');
    assert.equal(controller.top, 'event-layer');
    childEl.dispatchEvent(new CustomEvent('browse-sheet-close', { bubbles: true }));
    assert.equal(closedCount, 2);
    assert.equal(controller.top, null, 'layer should be dismissed on browse-sheet-close event');
  });

  it('prevents recursive re-entrancy when onClose callback invokes controller.close()', () => {
    let closeCallCount = 0;
    controller.register('bottom-layer', () => ({
      element: document.createElement('div'),
      onOpen: () => {},
      onClose: () => {}
    }));

    controller.register('top-layer', () => ({
      element: document.createElement('div'),
      onOpen: () => {},
      onClose: () => {
        closeCallCount++;
        // Child triggers controller.close() during its own onClose execution
        controller.close();
      }
    }));

    controller.open('bottom-layer');
    controller.open('top-layer');
    assert.equal(controller.top, 'top-layer');

    // Dismiss top-layer
    controller.close();
    assert.equal(closeCallCount, 1);
    // bottom-layer must NOT be popped by re-entrant call!
    assert.equal(controller.top, 'bottom-layer', 're-entrant close() call must not pop the underlying layer');
  });

  it('exports singleton layers instance', () => {
    assert.ok(layers instanceof LayerController);
  });
});
