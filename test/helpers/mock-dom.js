/**
 * LocalJam - Headless Mock DOM Test Helper
 * Provides a lightweight, zero-dependency mock DOM for Node.js unit tests.
 * Supports element hierarchy, classList, style, attributes, dataset,
 * event dispatch/listeners, innerHTML parsing, and CSS selector queries.
 */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

export class MockClassList {
  constructor(el) {
    this._el = el;
    this._classes = new Set();
    this._syncFromClassName();
  }

  _syncFromClassName() {
    this._classes.clear();
    const str = this._el.className || '';
    for (const c of str.split(/\s+/)) {
      if (c) this._classes.add(c);
    }
  }

  _syncToClassName() {
    this._el.className = Array.from(this._classes).join(' ');
  }

  add(...classes) {
    for (const c of classes) {
      if (c) this._classes.add(c);
    }
    this._syncToClassName();
  }

  remove(...classes) {
    for (const c of classes) {
      this._classes.delete(c);
    }
    this._syncToClassName();
  }

  contains(c) {
    this._syncFromClassName();
    return this._classes.has(c);
  }

  toggle(c, force) {
    this._syncFromClassName();
    let result;
    if (force === undefined) {
      result = !this._classes.has(c);
    } else {
      result = Boolean(force);
    }
    if (result) this._classes.add(c);
    else this._classes.delete(c);
    this._syncToClassName();
    return result;
  }
}

function detachSubtree(el) {
  if (!el) return;
  if (globalThis.document && globalThis.document.activeElement === el) {
    globalThis.document.activeElement = globalThis.document.body ?? null;
  }
  for (const child of el.children || []) {
    detachSubtree(child);
  }
}

export class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this._className = '';
    this.id = '';
    this.style = {};
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.parentElement = null;
    this._listeners = new Map();
    this._value = '';
    this._innerHTML = '';
    this._disabled = false;
    this.classList = new MockClassList(this);
  }

  get className() {
    return this._className;
  }

  set className(val) {
    this._className = String(val || '').trim();
    if (this.classList) {
      this.classList._syncFromClassName();
    }
  }

  get value() {
    return this._value;
  }

  set value(val) {
    this._value = String(val ?? '');
  }

  get type() {
    return this.getAttribute('type') || '';
  }

  set type(val) {
    this.setAttribute('type', val);
  }

  get disabled() {
    return this._disabled;
  }

  set disabled(val) {
    this._disabled = Boolean(val);
    if (this._disabled) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  get lastElementChild() {
    return this.children[this.children.length - 1] || null;
  }

  get childElementCount() {
    return this.children.length;
  }

  setAttribute(name, value) {
    const valStr = String(value);
    this.attributes.set(name, valStr);
    if (name === 'class') {
      this.className = valStr;
    } else if (name === 'id') {
      this.id = valStr;
    } else if (name === 'value') {
      this.value = valStr;
    } else if (name === 'disabled') {
      this._disabled = true;
    } else if (name === 'style') {
      for (const rule of valStr.split(';')) {
        const [prop, val] = rule.split(':');
        if (prop && val) {
          const camel = prop.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          this.style[camel] = val.trim();
        }
      }
    } else if (name.startsWith('data-')) {
      const prop = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[prop] = valStr;
    }
  }

  getAttribute(name) {
    if (name === 'class') return this.className || null;
    if (name === 'id') return this.id || null;
    if (name === 'value') return this.value;
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    if (name === 'class') return Boolean(this.className);
    if (name === 'id') return Boolean(this.id);
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'class') this.className = '';
    else if (name === 'id') this.id = '';
    else if (name === 'disabled') this._disabled = false;
    else if (name.startsWith('data-')) {
      const prop = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      delete this.dataset[prop];
    }
  }

  appendChild(child) {
    if (child) {
      if (child.parentElement) {
        child.parentElement.removeChild(child);
      }
      child.parentElement = this;
      this.children.push(child);
    }
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      detachSubtree(child);
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  replaceChildren(...newChildren) {
    for (const c of this.children) {
      detachSubtree(c);
      c.parentElement = null;
    }
    this.children = [];
    for (const c of newChildren) {
      if (c && typeof c === 'object') {
        this.appendChild(c);
      }
    }
  }

  get textContent() {
    if (this.children.length === 0) {
      return this._textContent || '';
    }
    return this.children.map((c) => c.textContent).join('');
  }

  set textContent(val) {
    this._textContent = String(val ?? '');
    for (const c of this.children) {
      detachSubtree(c);
      c.parentElement = null;
    }
    this.children = [];
    this._innerHTML = escapeTextForHtml(this._textContent);
  }

  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    let attrs = '';
    for (const [k, v] of this.attributes.entries()) {
      attrs += ` ${k}="${escapeTextForHtml(v)}"`;
    }
    const isVoid = VOID_TAGS.has(tag);
    if (isVoid) {
      return `<${tag}${attrs} />`;
    }
    return `<${tag}${attrs}>${this.innerHTML}</${tag}>`;
  }

  get innerHTML() {
    if (this.children.length > 0) {
      return this.children.map((c) => c.outerHTML).join('');
    }
    if (this._textContent) {
      return escapeTextForHtml(this._textContent);
    }
    return this._innerHTML || '';
  }

  set innerHTML(html) {
    this._innerHTML = String(html || '');
    for (const c of this.children) {
      detachSubtree(c);
      c.parentElement = null;
    }
    this.children = [];
    parseHtmlIntoElement(this._innerHTML, this);
  }

  addEventListener(type, handler) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    if (this._listeners.has(type)) {
      this._listeners.get(type).delete(handler);
    }
  }

  dispatchEvent(event) {
    if (!event) return true;
    event.target = event.target || this;
    event.currentTarget = this;

    const handlers = this._listeners.get(event.type);
    if (handlers) {
      for (const h of Array.from(handlers)) {
        h.call(this, event);
      }
    }

    if (event.bubbles !== false && this.parentElement && !event._propagationStopped) {
      this.parentElement.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    const event = {
      type: 'click',
      target: this,
      currentTarget: this,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this._propagationStopped = true; }
    };
    return this.dispatchEvent(event);
  }

  focus() {
    if (globalThis.document) {
      globalThis.document.activeElement = this;
    }
    this.dispatchEvent({
      type: 'focus',
      bubbles: false,
      target: this,
      currentTarget: this
    });
  }

  blur() {
    if (globalThis.document && globalThis.document.activeElement === this) {
      globalThis.document.activeElement = null;
    }
    this.dispatchEvent({
      type: 'blur',
      bubbles: false,
      target: this,
      currentTarget: this
    });
  }

  contains(other) {
    if (!other) return false;
    if (other === this) return true;
    let curr = other.parentElement;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  querySelector(selector) {
    return queryDescendants(this, selector, true)[0] || null;
  }

  querySelectorAll(selector) {
    return queryDescendants(this, selector, false);
  }
}

function escapeTextForHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeHtmlEntities(str) {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseHtmlIntoElement(html, rootElement) {
  if (!html || typeof html !== 'string') return;

  const tagRegex = /<(\/)?([a-zA-Z0-9-]+)((?:\s+[^=>\s]+(?:=(?:"[^"]*"|'[^']*'|[^>\s]+))?)*)\s*(\/)?>/g;
  const stack = [rootElement];
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const [fullMatch, isClosing, rawTagName, rawAttrs, isSelfClosing] = match;
    const tagName = rawTagName.toLowerCase();
    const textBefore = html.slice(lastIndex, match.index).trim();
    lastIndex = tagRegex.lastIndex;

    const currentParent = stack[stack.length - 1];

    if (textBefore && currentParent && currentParent !== rootElement) {
      const decoded = decodeHtmlEntities(textBefore);
      currentParent._textContent = (currentParent._textContent || '') + (currentParent._textContent ? ' ' : '') + decoded;
    }

    if (isClosing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName.toLowerCase() === tagName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const child = new MockElement(tagName);
    if (rawAttrs) {
      parseAttributes(rawAttrs, child);
    }

    if (currentParent) {
      currentParent.appendChild(child);
    }

    const isVoid = VOID_TAGS.has(tagName) || Boolean(isSelfClosing);
    if (!isVoid) {
      stack.push(child);
    }
  }

  const trailingText = html.slice(lastIndex).trim();
  const currentParent = stack[stack.length - 1];
  if (trailingText && currentParent && currentParent !== rootElement) {
    const decoded = decodeHtmlEntities(trailingText);
    currentParent._textContent = (currentParent._textContent || '') + (currentParent._textContent ? ' ' : '') + decoded;
  }
}

function parseAttributes(rawAttrs, element) {
  const attrRegex = /([a-zA-Z0-9_:.-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = attrRegex.exec(rawAttrs)) !== null) {
    const key = match[1];
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    element.setAttribute(key, decodeHtmlEntities(val));
  }
}

function matchesSingleSelector(el, selector) {
  if (!el || !selector) return false;
  selector = selector.trim();

  const attrRegex = /\[([a-zA-Z0-9_:.-]+)(?:=([^\],]+))?\]/g;
  let remaining = selector;
  let match;
  while ((match = attrRegex.exec(selector)) !== null) {
    const key = match[1];
    let val = match[2];
    if (val !== undefined) {
      val = val.replace(/^["']|["']$/g, '');
      if (el.getAttribute(key) !== val) return false;
    } else {
      if (!el.hasAttribute(key)) return false;
    }
  }
  remaining = remaining.replace(attrRegex, '');
  if (!remaining) return true;

  const parts = remaining.match(/([.#]?[a-zA-Z0-9_-]+)/g) || [];
  for (const part of parts) {
    if (part.startsWith('#')) {
      const expectedId = part.slice(1);
      if (el.id !== expectedId && el.getAttribute('id') !== expectedId) return false;
    } else if (part.startsWith('.')) {
      const expectedClass = part.slice(1);
      if (!el.classList.contains(expectedClass)) return false;
    } else {
      if (el.tagName.toLowerCase() !== part.toLowerCase()) return false;
    }
  }
  return true;
}

function splitSelector(selector) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let inBrackets = false;

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if ((char === '"' || char === "'") && !inBrackets) {
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
      } else if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      }
    } else if (char === '[' && !inQuotes) {
      inBrackets = true;
    } else if (char === ']' && !inQuotes) {
      inBrackets = false;
    }

    if (/\s/.test(char) && !inQuotes && !inBrackets) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function queryDescendants(root, selector, firstOnly = false) {
  if (!root || !selector) return [];
  selector = selector.trim();

  if (selector.includes(',')) {
    const parts = selector.split(',').map((p) => p.trim());
    const matched = new Set();
    for (const p of parts) {
      for (const m of queryDescendants(root, p, false)) {
        matched.add(m);
        if (firstOnly) return [m];
      }
    }
    return Array.from(matched);
  }

  const segments = splitSelector(selector);
  let candidates = [root];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const nextCandidates = [];

    for (const parent of candidates) {
      function walk(node) {
        for (const child of node.children) {
          if (matchesSingleSelector(child, segment)) {
            if (!nextCandidates.includes(child)) nextCandidates.push(child);
          }
          walk(child);
        }
      }
      walk(parent);
    }
    candidates = nextCandidates;
    if (candidates.length === 0) break;
  }

  return firstOnly && candidates.length > 0 ? [candidates[0]] : candidates;
}

let savedGlobals = null;

export function setupMockDom(options = {}) {
  savedGlobals = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    KeyboardEvent: globalThis.KeyboardEvent,
    MouseEvent: globalThis.MouseEvent,
    PointerEvent: globalThis.PointerEvent,
    WheelEvent: globalThis.WheelEvent
  };

  const body = new MockElement('body');
  const liveRegion = new MockElement('div');
  liveRegion.id = 'aria-live-region';
  body.appendChild(liveRegion);

  const doc = {
    body,
    activeElement: null,
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => {
      if (id === 'aria-live-region') return liveRegion;
      return body.querySelector(`#${id}`);
    },
    querySelector: (sel) => body.querySelector(sel),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const win = {
    document: doc,
    location: {
      hash: '#/',
      href: 'http://localhost:3000/#/'
    },
    confirm: options.confirm || (() => true),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true
  };

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.HTMLElement = MockElement;

  globalThis.Event = class Event {
    constructor(type, options = {}) {
      this.type = type;
      this.bubbles = options.bubbles ?? false;
      this.cancelable = options.cancelable ?? false;
      this.defaultPrevented = false;
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._propagationStopped = true; }
  };

  globalThis.CustomEvent = class CustomEvent extends globalThis.Event {
    constructor(type, options = {}) {
      super(type, options);
      this.detail = options.detail ?? null;
    }
  };

  globalThis.KeyboardEvent = class KeyboardEvent extends globalThis.Event {
    constructor(type, options = {}) {
      super(type, options);
      this.key = options.key || '';
      this.code = options.code || '';
      this.shiftKey = Boolean(options.shiftKey);
      this.ctrlKey = Boolean(options.ctrlKey);
      this.altKey = Boolean(options.altKey);
      this.metaKey = Boolean(options.metaKey);
    }
  };

  globalThis.MouseEvent = class MouseEvent extends globalThis.Event {
    constructor(type, options = {}) {
      super(type, options);
      this.clientX = options.clientX || 0;
      this.clientY = options.clientY || 0;
      this.button = options.button || 0;
    }
  };

  globalThis.PointerEvent = class PointerEvent extends globalThis.MouseEvent {
    constructor(type, options = {}) {
      super(type, options);
      this.pointerId = options.pointerId || 1;
      this.pointerType = options.pointerType || 'mouse';
    }
  };

  globalThis.WheelEvent = class WheelEvent extends globalThis.MouseEvent {
    constructor(type, options = {}) {
      super(type, options);
      this.deltaX = options.deltaX || 0;
      this.deltaY = options.deltaY || 0;
      this.deltaZ = options.deltaZ || 0;
      this.deltaMode = options.deltaMode || 0;
    }
  };

  return { document: doc, window: win, body };
}

export function teardownMockDom() {
  if (savedGlobals) {
    globalThis.document = savedGlobals.document;
    globalThis.window = savedGlobals.window;
    globalThis.HTMLElement = savedGlobals.HTMLElement;
    globalThis.Event = savedGlobals.Event;
    globalThis.CustomEvent = savedGlobals.CustomEvent;
    globalThis.KeyboardEvent = savedGlobals.KeyboardEvent;
    globalThis.MouseEvent = savedGlobals.MouseEvent;
    globalThis.PointerEvent = savedGlobals.PointerEvent;
    globalThis.WheelEvent = savedGlobals.WheelEvent;
    savedGlobals = null;
  }
}
