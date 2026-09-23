import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';
import { initTheme, setTheme } from '../../src/ui/theme.js';

describe('Theme Engine', () => {

  let mockDb;
  let settings;

  beforeEach(() => {
    setupMockDom();
    globalThis.matchMedia = (query) => ({
      matches: query === '(prefers-color-scheme: dark)',
      addEventListener: () => {},
      removeEventListener: () => {}
    });

    settings = new Map();
    mockDb = {
      async getSetting(key) {
        return settings.get(key) || null;
      },
      async setSetting(key, val) {
        settings.set(key, val);
      }
    };
    globalThis.document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    teardownMockDom();
  });

  it('initTheme resolves to "auto" by default when db has no setting, applying system preference', async () => {
    await initTheme(mockDb);
    assert.equal(globalThis.document.documentElement.getAttribute('data-theme'), 'dark');
  });

  it('initTheme applies light theme when prefers-color-scheme is light and setting is auto', async () => {
    globalThis.matchMedia = (query) => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    });
    await initTheme(mockDb);
    assert.equal(globalThis.document.documentElement.getAttribute('data-theme'), 'light');
  });

  it('initTheme respects saved dark theme from db, overriding system preference', async () => {
    await mockDb.setSetting('theme', 'dark');
    await initTheme(mockDb);
    assert.equal(globalThis.document.documentElement.getAttribute('data-theme'), 'dark');
  });
  
  it('initTheme respects saved light theme from db, overriding system preference', async () => {
    await mockDb.setSetting('theme', 'light');
    await initTheme(mockDb);
    assert.equal(globalThis.document.documentElement.getAttribute('data-theme'), 'light');
  });

  it('setTheme updates db and applies theme instantly', async () => {
    await initTheme(mockDb);
    await setTheme('light', mockDb);
    assert.equal(globalThis.document.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(settings.get('theme'), 'light');

    await setTheme('dark', mockDb);
    assert.equal(globalThis.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(settings.get('theme'), 'dark');

    await setTheme('auto', mockDb);
    assert.equal(globalThis.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(settings.get('theme'), 'auto');
  });
});
