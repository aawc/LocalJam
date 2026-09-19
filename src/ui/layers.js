/**
 * LocalJam - Layer Stack Coordinator (L1/L2)
 * Manages modal sheet overlays (L1 Browse Sheet, L2 Overflow Menu, L2' Equalizer, L2" Release Notes),
 * maintaining a LIFO stack, backdrop dimming, browser hash synchronization (#/browse?tab=...),
 * keyboard and gesture dismissal, focus restoration, and error boundary sanitization (SEC-07).
 */

import { escapeHtml } from '../utils/sanitize.js';

export class LayerController {
  constructor() {
    this.rootEl = null;
    this._stack = [];
    this._factories = new Map();
    this._previousFocus = null;
    this._currentHash = typeof window !== 'undefined' && window.location ? (window.location.hash || '#/') : '#/';
    this._boundOnHashChange = null;
    this._boundOnKeyDown = null;
    this._isClosing = false;
  }

  /**
   * Initializes the layer controller with a root container element
   * and attaches global hashchange and Escape key listeners.
   *
   * @param {HTMLElement} rootEl
   */
  init(rootEl) {
    if (this._boundOnHashChange || this._boundOnKeyDown) {
      this.destroy();
    }

    this.rootEl = rootEl;
    this._currentHash = typeof window !== 'undefined' && window.location ? (window.location.hash || '#/') : '#/';

    // Hash synchronization listener (back/forward button navigation)
    this._boundOnHashChange = () => {
      if (typeof window === 'undefined' || !window.location) return;

      const hash = window.location.hash || '';
      if (hash === this._currentHash) return;
      this._currentHash = hash;

      if (hash.startsWith('#/browse')) {
        let tab = 'library';
        const queryIndex = hash.indexOf('?');
        if (queryIndex !== -1) {
          const params = new URLSearchParams(hash.slice(queryIndex + 1));
          const t = params.get('tab');
          if (t === 'radio' || t === 'library') {
            tab = t;
          }
        }

        if (this.top === 'browse') {
          const topEntry = this._stack[this._stack.length - 1];
          if (typeof topEntry.instance?.onOpen === 'function') {
            topEntry.instance.onOpen({ tab });
          }
        } else {
          this.open('browse', { tab });
        }
      } else if (hash === '#/' || hash === '' || hash === '#') {
        if (this.top === 'browse') {
          this.close();
        } else {
          // If browse is anywhere in stack, close down through browse
          const browseIndex = this._stack.findIndex((s) => s.name === 'browse');
          if (browseIndex !== -1) {
            while (this._stack.length > browseIndex) {
              this.close();
            }
          }
        }
      }
    };

    // Keyboard dismissal (Escape key closes topmost layer)
    this._boundOnKeyDown = (e) => {
      if (!e.defaultPrevented && e.key === 'Escape' && this.top) {
        e.preventDefault();
        this.close();
      }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('hashchange', this._boundOnHashChange);
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('keydown', this._boundOnKeyDown);
    }
  }

  /**
   * Registers a layer factory by name.
   *
   * @param {string} name e.g. 'browse', 'overflow', 'eq', 'notes'
   * @param {(props?: object) => {
   *   element: HTMLElement,
   *   onOpen?: (props?: object) => void,
   *   onClose?: () => void,
   *   focusFirst?: () => void
   * }} factory
   */
  register(name, factory) {
    this._factories.set(name, factory);
  }

  /**
   * Returns the name of the topmost open layer, or null if empty.
   * @returns {string|null}
   */
  get top() {
    if (this._stack.length === 0) return null;
    return this._stack[this._stack.length - 1].name;
  }

  /**
   * Opens a layer by name, placing it atop the stack.
   *
   * @param {'browse'|'overflow'|'eq'|'notes'|string} name
   * @param {object} [props]
   * @returns {object|null} The layer instance
   */
  open(name, props = {}) {
    if (!this.rootEl) {
      console.warn('[Layers] open called before init');
      return null;
    }

    // If layer of the same name is already topmost, update its props and return
    if (this.top === name) {
      const topEntry = this._stack[this._stack.length - 1];
      if (typeof topEntry.instance?.onOpen === 'function') {
        topEntry.instance.onOpen(props);
      }
      this._syncHashOnOpen(name, props);
      return topEntry.instance;
    }

    // Capture previous active element on opening the first modal layer
    if (this._stack.length === 0 && typeof document !== 'undefined') {
      this._previousFocus = document.activeElement;
    }

    const factory = this._factories.get(name);
    if (!factory) {
      console.error(`[Layers] No factory registered for layer: ${name}`);
      return null;
    }

    // Create backdrop container
    const wrapper = document.createElement('div');
    wrapper.className = `layer-backdrop layer-${name}`;
    wrapper.setAttribute('data-layer', name);

    // Backdrop click dismisses topmost layer
    wrapper.addEventListener('click', (e) => {
      if (e.target === wrapper) {
        this.close();
      }
    });

    // Custom dismissal events from child components
    wrapper.addEventListener('browse-sheet-close', () => {
      if (this.top === name) {
        this.close();
      }
    });
    wrapper.addEventListener('layer-close', () => {
      if (this.top === name) {
        this.close();
      }
    });

    let instance;
    try {
      instance = factory(props);
    } catch (err) {
      console.error(`[Layers] Failed to render layer "${name}":`, err);
      instance = this._createErrorLayer(name, err);
    }

    if (!instance || !instance.element) {
      console.error(`[Layers] Factory for "${name}" did not return a valid element`);
      return null;
    }

    wrapper.appendChild(instance.element);
    this.rootEl.appendChild(wrapper);

    this._stack.push({
      name,
      instance,
      wrapper,
      props
    });

    if (typeof instance.onOpen === 'function') {
      instance.onOpen(props);
    }

    this._syncHashOnOpen(name, props);

    // Direct focus to the newly opened layer
    if (typeof instance.focusFirst === 'function') {
      instance.focusFirst();
    } else if (typeof instance.element?.focus === 'function') {
      instance.element.focus();
    }

    return instance;
  }

  /**
   * Closes the topmost layer on the stack.
   *
   * @returns {object|null} The closed stack entry, or null if already empty
   */
  close() {
    if (this._isClosing) return null;
    if (this._stack.length === 0) return null;

    this._isClosing = true;
    try {
      const entry = this._stack.pop();

      if (typeof entry.instance?.onClose === 'function') {
        entry.instance.onClose();
      }
      if (typeof entry.instance?.destroy === 'function') {
        entry.instance.destroy();
      }

      if (entry.wrapper && entry.wrapper.parentElement) {
        entry.wrapper.parentElement.removeChild(entry.wrapper);
      }

      // If browse was closed, reset hash to #/
      if (entry.name === 'browse') {
        this._syncHashOnClose();
      }

      // Focus restoration
      if (this._stack.length > 0) {
        const nextTop = this._stack[this._stack.length - 1];
        if (typeof nextTop.instance?.focusFirst === 'function') {
          nextTop.instance.focusFirst();
        }
      } else if (this._previousFocus) {
        try {
          this._previousFocus.focus?.();
        } catch (_) {}
        this._previousFocus = null;
      }

      return entry;
    } finally {
      this._isClosing = false;
    }
  }

  /**
   * Closes all open layers in LIFO order.
   */
  closeAll() {
    while (this._stack.length > 0) {
      this.close();
    }
  }

  /**
   * Cleans up all DOM elements, global event listeners, and registered factories.
   */
  destroy() {
    this.closeAll();

    if (typeof window !== 'undefined' && this._boundOnHashChange) {
      window.removeEventListener('hashchange', this._boundOnHashChange);
      this._boundOnHashChange = null;
    }
    if (typeof document !== 'undefined' && this._boundOnKeyDown) {
      document.removeEventListener('keydown', this._boundOnKeyDown);
      this._boundOnKeyDown = null;
    }

    this._factories.clear();
    this.rootEl = null;
    this._previousFocus = null;
  }

  /**
   * Creates an error boundary element for unhandled factory failures (SEC-07).
   *
   * @private
   * @param {string} name
   * @param {Error|any} err
   * @returns {object}
   */
  _createErrorLayer(name, err) {
    const errorEl = document.createElement('div');
    errorEl.className = 'layer-error';
    errorEl.setAttribute('role', 'alert');

    const content = document.createElement('div');
    content.className = 'layer-error-content';
    errorEl.appendChild(content);

    const title = document.createElement('p');
    title.className = 'layer-error-title';
    title.textContent = `[ERROR] Failed to load ${name || 'Unknown Layer'}`;
    content.appendChild(title);

    const message = document.createElement('p');
    message.className = 'layer-error-message';
    message.innerHTML = escapeHtml(err?.message || String(err));
    content.appendChild(message);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-layer-error-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      this.close();
    });
    content.appendChild(closeBtn);

    return {
      element: errorEl,
      onOpen: () => {},
      onClose: () => {},
      focusFirst: () => {
        closeBtn?.focus?.();
      }
    };
  }

  /**
   * Updates window.location.hash when opening the browse sheet.
   *
   * @private
   * @param {string} name
   * @param {object} [props]
   */
  _syncHashOnOpen(name, props) {
    if (name !== 'browse') return;
    if (typeof window === 'undefined' || !window.location) return;

    const tab = props?.tab === 'radio' ? 'radio' : 'library';
    const targetHash = `#/browse?tab=${tab}`;

    if (window.location.hash !== targetHash) {
      this._currentHash = targetHash;
      window.location.hash = targetHash;
    }
  }

  /**
   * Resets window.location.hash to #/ when the browse sheet is closed.
   *
   * @private
   */
  _syncHashOnClose() {
    if (typeof window === 'undefined' || !window.location) return;

    if (window.location.hash.startsWith('#/browse')) {
      this._currentHash = '#/';
      window.location.hash = '#/';
    }
  }
}

export const layers = new LayerController();
