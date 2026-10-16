import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupMockDom, teardownMockDom } from '../helpers/mock-dom.js';
import { initTheme, setTheme } from '../../src/ui/theme.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const themeCss = fs.readFileSync(path.resolve(__dirname, '../../src/ui/theme.css'), 'utf-8');

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

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

describe('Theme Contrast & WCAG Compliance', () => {
  const rootBlockMatch = themeCss.match(/:root\s*\{([^}]+)\}/);
  const lightBlockMatch = themeCss.match(/html\[data-theme="light"\]\s*\{([^}]+)\}/);
  const mediaLightMatch = themeCss.match(/@media\s*\(prefers-color-scheme:\s*light\)\s*\{[\s\S]*?html:not\(\[data-theme="dark"\]\)\s*\{([^}]+)\}/);

  it('defines --text-muted: #94a3b8 in :root', () => {
    assert.ok(rootBlockMatch, ':root block exists in theme.css');
    assert.match(rootBlockMatch[1], /--text-muted:\s*#94a3b8;/);
  });

  it('defines --text-secondary: #cbd5e1 in :root', () => {
    assert.ok(rootBlockMatch, ':root block exists in theme.css');
    assert.match(rootBlockMatch[1], /--text-secondary:\s*#cbd5e1;/);
  });

  it('defines --text-muted: #475569 in light mode', () => {
    assert.ok(lightBlockMatch, 'html[data-theme="light"] block exists in theme.css');
    assert.match(lightBlockMatch[1], /--text-muted:\s*#475569;/);
    if (mediaLightMatch) {
      assert.match(mediaLightMatch[1], /--text-muted:\s*#475569;/);
    }
  });

  it('defines --text-secondary: #334155 in light mode', () => {
    assert.ok(lightBlockMatch, 'html[data-theme="light"] block exists in theme.css');
    assert.match(lightBlockMatch[1], /--text-secondary:\s*#334155;/);
    if (mediaLightMatch) {
      assert.match(mediaLightMatch[1], /--text-secondary:\s*#334155;/);
    }
  });

  it('calculates relative luminance and verifies WCAG contrast ratio for dark mode text tokens against surface backgrounds', () => {
    const bgBase = '#0a0e17';
    const bgSurface = '#111827';
    const bgElevated = '#1a2333';
    const bgHover = '#222e44';

    const textPrimary = '#f9fafb';
    const textSecondary = '#cbd5e1';
    const textMuted = '#94a3b8';

    // Primary text contrast exceeds 7:1 (AAA) across all dark surfaces
    for (const bg of [bgBase, bgSurface, bgElevated, bgHover]) {
      const ratio = contrastRatio(bg, textPrimary);
      assert.ok(ratio >= 7.0, `Primary text ${textPrimary} on ${bg} must exceed 7:1 AAA (got ${ratio.toFixed(2)})`);
    }

    // Secondary text contrast exceeds 7:1 (AAA) across all dark surfaces
    for (const bg of [bgBase, bgSurface, bgElevated, bgHover]) {
      const ratio = contrastRatio(bg, textSecondary);
      assert.ok(ratio >= 7.0, `Secondary text ${textSecondary} on ${bg} must exceed 7:1 AAA (got ${ratio.toFixed(2)})`);
    }

    // Muted text contrast exceeds 7:1 (AAA) on base, and exceeds 4.5:1 (AA) on all other surfaces
    const baseMutedRatio = contrastRatio(bgBase, textMuted);
    assert.ok(baseMutedRatio >= 7.0, `Muted text ${textMuted} on base ${bgBase} must exceed 7:1 AAA (got ${baseMutedRatio.toFixed(2)})`);

    for (const bg of [bgSurface, bgElevated, bgHover]) {
      const ratio = contrastRatio(bg, textMuted);
      assert.ok(ratio >= 4.5, `Muted text ${textMuted} on ${bg} must exceed 4.5:1 AA (got ${ratio.toFixed(2)})`);
    }
  });

  it('calculates relative luminance and verifies WCAG contrast ratio for light mode text tokens against surface backgrounds', () => {
    const bgSurface = '#ffffff';
    const bgBase = '#f8fafc';
    const bgElevated = '#f1f5f9';
    const bgHover = '#e2e8f0';

    const textPrimary = '#0f172a';
    const textSecondary = '#334155';
    const textMuted = '#475569';

    // Primary text contrast exceeds 7:1 (AAA) across all light surfaces
    for (const bg of [bgSurface, bgBase, bgElevated, bgHover]) {
      const ratio = contrastRatio(bg, textPrimary);
      assert.ok(ratio >= 7.0, `Light primary text ${textPrimary} on ${bg} must exceed 7:1 AAA (got ${ratio.toFixed(2)})`);
    }

    // Secondary text contrast exceeds 7:1 (AAA) across all light surfaces
    for (const bg of [bgSurface, bgBase, bgElevated, bgHover]) {
      const ratio = contrastRatio(bg, textSecondary);
      assert.ok(ratio >= 7.0, `Light secondary text ${textSecondary} on ${bg} must exceed 7:1 AAA (got ${ratio.toFixed(2)})`);
    }

    // Muted text contrast exceeds 7:1 (AAA) on surface and base, and exceeds 4.5:1 (AA) on all surfaces
    assert.ok(contrastRatio(bgSurface, textMuted) >= 7.0, `Light muted text on surface must exceed 7:1 AAA (got ${contrastRatio(bgSurface, textMuted).toFixed(2)})`);
    assert.ok(contrastRatio(bgBase, textMuted) >= 7.0, `Light muted text on base must exceed 7:1 AAA (got ${contrastRatio(bgBase, textMuted).toFixed(2)})`);

    for (const bg of [bgElevated, bgHover]) {
      const ratio = contrastRatio(bg, textMuted);
      assert.ok(ratio >= 4.5, `Light muted text ${textMuted} on ${bg} must exceed 4.5:1 AA (got ${ratio.toFixed(2)})`);
    }
  });
});
