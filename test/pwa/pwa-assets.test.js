import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('PWA - manifest.webmanifest is valid and properly configured', () => {
  const manifestPath = path.join(ROOT_DIR, 'manifest.webmanifest');
  assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist');

  const content = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(content);

  assert.equal(manifest.name, 'LocalJam - Local Audio Player');
  assert.equal(manifest.short_name, 'LocalJam');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#0b0f17');
  assert.equal(manifest.theme_color, '#0b0f17');

  assert.ok(Array.isArray(manifest.icons), 'icons must be an array');
  assert.ok(manifest.icons.length >= 2, 'must have at least 2 icons');

  for (const icon of manifest.icons) {
    const iconRelative = icon.src.replace(/^\.\//, '');
    const iconPath = path.join(ROOT_DIR, iconRelative);
    assert.ok(fs.existsSync(iconPath), `Icon file ${icon.src} must exist at ${iconPath}`);
  }
});

test('PWA - sw.js caches all declared app shell assets and excludes audio streams', () => {
  const swPath = path.join(ROOT_DIR, 'sw.js');
  assert.ok(fs.existsSync(swPath), 'sw.js must exist');

  const content = fs.readFileSync(swPath, 'utf8');

  // Verify cache name and assets array
  assert.ok(content.includes("const CACHE_NAME = 'localjam-"), 'Cache version must be declared');
  assert.ok(content.includes('APP_SHELL_ASSETS = ['), 'App shell assets array must be declared');

  // Verify all files in APP_SHELL_ASSETS actually exist on disk
  const assetsMatch = content.match(/APP_SHELL_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(assetsMatch, 'Must match APP_SHELL_ASSETS array');

  const assetList = eval(`[${assetsMatch[1]}]`);
  for (const asset of assetList) {
    if (asset === './') continue;
    const cleanPath = asset.replace(/^\.\//, '');
    const fullPath = path.join(ROOT_DIR, cleanPath);
    assert.ok(fs.existsSync(fullPath), `App shell asset ${asset} must exist at ${fullPath}`);
  }

  // Verify stream exclusions
  assert.ok(content.includes("request.destination === 'audio'"), 'Must bypass audio destination');
  assert.ok(content.includes("request.headers.has('range')"), 'Must bypass HTTP range requests');
  assert.ok(content.includes("url.protocol === 'blob:'"), 'Must bypass blob: URLs');
  assert.ok(content.includes("url.protocol === 'data:'"), 'Must bypass data: URLs');

  // Verify critical utilities and lifecycle handlers
  assert.ok(assetList.includes('./src/utils/sanitize.js'), 'Must precache ./src/utils/sanitize.js');
  assert.ok(!content.includes("then(() => self.skipWaiting())"), 'Must not automatically skipWaiting during install');
  assert.ok(content.includes("event.data.type === 'SKIP_WAITING'"), 'Must handle SKIP_WAITING message');
  assert.ok(content.includes("self.clients.claim()"), 'Must claim clients on activate');
});

test('PWA - index.html contains correct relative links and meta tags for GitHub Pages', () => {
  const indexPath = path.join(ROOT_DIR, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  assert.ok(html.includes('<link rel="manifest" href="./manifest.webmanifest" />'), 'Relative manifest link');
  assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="./favicon.svg" />'), 'Relative favicon link');
  assert.ok(html.includes('<meta name="theme-color" content="#0b0f17" />'), 'Theme color meta');
  assert.ok(html.includes('<script type="module" src="./src/main.js"></script>'), 'Relative main.js module script');
});

test('PWA - v2/index.html exists and renders the v2 player application shell', () => {
  const v2Path = path.join(ROOT_DIR, 'v2', 'index.html');
  assert.ok(fs.existsSync(v2Path), 'v2/index.html must exist on disk');

  const html = fs.readFileSync(v2Path, 'utf8');
  assert.ok(!html.includes('window.location.replace'), 'Must not redirect away from v2');
  assert.ok(!html.includes('http-equiv="refresh"'), 'Must not include meta http-equiv refresh redirect');
  assert.ok(html.includes('<base href="../" />'), 'Must include base tag pointing to parent root');
  assert.ok(html.includes('id="stage-root"'), 'Must contain stage-root container');
  assert.ok(html.includes('id="layer-root"'), 'Must contain layer-root container');
  assert.ok(html.includes('id="toast-root"'), 'Must contain toast-root container');
  assert.ok(html.includes('id="aria-live-region"'), 'Must contain aria-live-region container');
  assert.ok(html.includes('<script type="module" src="./src/main.js"></script>'), 'Must mount main.js module script');
  assert.ok(html.includes('Content-Security-Policy'), 'Must include CSP meta tag');
});

test('PWA - 404.html exists and preserves v2 routing', () => {
  const notFoundPath = path.join(ROOT_DIR, '404.html');
  assert.ok(fs.existsSync(notFoundPath), '404.html must exist on disk');

  const html = fs.readFileSync(notFoundPath, 'utf8');
  assert.ok(html.includes('http-equiv="refresh"'), 'Must include meta http-equiv refresh');
  assert.ok(html.includes('window.location.replace'), 'Must include fallback routing script');
  assert.ok(html.includes('/v2'), 'Must preserve /v2 route on deep link fallback');
});

