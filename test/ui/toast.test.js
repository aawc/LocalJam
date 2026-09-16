import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createToastHost, showToast, TOAST_DURATION_MS } from '../../src/ui/components/toast.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const occurrences = (html, needle) => html.split(needle).length - 1;

let prevDocument;
let ariaRegion;

function setupMockDom() {
  ariaRegion = { id: 'aria-live-region', textContent: '' };
  prevDocument = globalThis.document;

  globalThis.document = {
    createElement: (tag) => {
      const attributes = {};
      return {
        tagName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        setAttribute(k, v) { attributes[k] = String(v); },
        getAttribute(k) { return attributes[k] ?? null; }
      };
    },
    getElementById: (id) => {
      if (id === 'aria-live-region') return ariaRegion;
      return null;
    }
  };
}

function teardownMockDom() {
  globalThis.document = prevDocument;
}

describe('Toast Notification Host & Announcement Engine', () => {
  beforeEach(() => {
    setupMockDom();
  });

  afterEach(() => {
    teardownMockDom();
  });

  it('exports verified toast duration of 1600ms', () => {
    assert.equal(TOAST_DURATION_MS, 1600);
  });

  it('createToastHost creates an aria-hidden visual container to prevent double-speaking with aria-live', () => {
    const host = createToastHost();
    try {
      assert.ok(host.element);
      assert.equal(host.element.className, 'toast-host');
      assert.equal(host.element.getAttribute('aria-hidden'), 'true');
      assert.equal(host.element.getAttribute('role'), null, 'visual container must not duplicate role="status"');
      assert.equal(host.element.getAttribute('aria-live'), null, 'visual container must not duplicate aria-live');
    } finally {
      host.destroy();
    }
  });

  it('escapes HTML in toast messages to prevent XSS (SEC-06)', () => {
    const host = createToastHost();
    try {
      host.show('<script>alert("xss")</script>');
      assert.ok(host.element.innerHTML.includes('&lt;script&gt;'));
      assert.equal(host.element.innerHTML.includes('<script>'), false);

      host.show('<img src=x onerror=alert(1)>');
      assert.ok(host.element.innerHTML.includes('&lt;img'));
      assert.equal(host.element.innerHTML.includes('<img'), false);
    } finally {
      host.destroy();
    }
  });

  it('replaces rather than stacks on rapid calls, leaving exactly one toast item', async () => {
    const host = createToastHost();
    try {
      host.show('[SHUFFLE ON]');
      host.show('[VOLUME 75%]');

      assert.equal(occurrences(host.element.innerHTML, 'class="toast-item"'), 1, 'second toast must replace, not stack');
      assert.ok(host.element.innerHTML.includes('[VOLUME 75%]'));
      assert.equal(host.element.innerHTML.includes('[SHUFFLE ON]'), false);

      // Auto-dismisses after TOAST_DURATION_MS
      await delay(TOAST_DURATION_MS + 50);
      assert.equal(host.element.innerHTML, '', 'auto-dismisses after TOAST_DURATION_MS');
    } finally {
      host.destroy();
    }
  });

  it('showToast module-level function writes to aria-live region and updates active host', () => {
    const host = createToastHost();
    try {
      showToast('[VOLUME 80%]');
      assert.equal(ariaRegion.textContent, '[VOLUME 80%]', 'announces to #aria-live-region');
      assert.ok(host.element.innerHTML.includes('[VOLUME 80%]'), 'updates active host element');
    } finally {
      host.destroy();
    }
  });

  it('destroy cancels the pending dismissal timer and releases the active singleton', async () => {
    const host = createToastHost();
    host.show('[PENDING DISMISSAL]');
    assert.ok(host.element.innerHTML.includes('[PENDING DISMISSAL]'));

    host.destroy();
    assert.equal(host.element.innerHTML, '', 'destroy clears innerHTML immediately');

    // A cancelled timer must not clobber content written after destroy().
    host.element.innerHTML = '[SENTINEL]';
    await delay(TOAST_DURATION_MS + 50);
    assert.equal(host.element.innerHTML, '[SENTINEL]', 'pending dismissal timer was cancelled');

    showToast('[AFTER DESTROY]');
    assert.equal(host.element.innerHTML, '[SENTINEL]', 'destroyed host is no longer the active host');
    assert.equal(ariaRegion.textContent, '[AFTER DESTROY]', 'screen reader still receives announcement');
  });
});
