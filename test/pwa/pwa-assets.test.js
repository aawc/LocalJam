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
  assert.ok(content.includes("const CACHE_NAME = 'localjam-v2026.09.051';"), 'Cache version must be localjam-v2026.09.051');
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
  assert.ok(
    content.includes("name.startsWith('localjam-') && name !== CACHE_NAME"),
    'Must scope cache deletion on activate strictly to localjam- caches to protect origin sharing'
  );
});

test('PWA - index.html contains correct relative links and meta tags for GitHub Pages', () => {
  const indexPath = path.join(ROOT_DIR, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  assert.ok(html.includes('<link rel="manifest" href="./manifest.webmanifest" />'), 'Relative manifest link');
  assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="./favicon.svg" />'), 'Relative favicon link');
  assert.ok(html.includes('<meta name="theme-color" content="#0b0f17" />'), 'Theme color meta');
  assert.ok(html.includes('<script type="module" src="./src/main.js"></script>'), 'Relative main.js module script');
});

test('PWA - index.html is the sole authoritative application shell and legacy artifacts are eliminated', () => {
  const v2Path = path.join(ROOT_DIR, 'v2');
  const notFoundPath = path.join(ROOT_DIR, '404.html');

  assert.equal(fs.existsSync(v2Path), false, 'v2/ directory must not exist');
  assert.equal(fs.existsSync(notFoundPath), false, '404.html must not exist');

  const indexPath = path.join(ROOT_DIR, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.ok(html.includes('id="stage-root"'), 'Must contain stage-root container');
  assert.ok(html.includes('id="layer-root"'), 'Must contain layer-root container');
  assert.ok(html.includes('id="toast-root"'), 'Must contain toast-root container');
  assert.ok(html.includes('id="aria-live-region"'), 'Must contain aria-live-region container');
  assert.ok(html.includes('<script type="module" src="./src/main.js"></script>'), 'Must mount main.js module script');
});

test('PWA - sw.js provides clean single-shell offline navigation fallback', () => {
  const swPath = path.join(ROOT_DIR, 'sw.js');
  const content = fs.readFileSync(swPath, 'utf8');

  assert.ok(!content.includes('./v2/index.html'), 'Must not cache obsolete v2 shell');
  assert.ok(!content.includes('./404.html'), 'Must not cache obsolete 404 page');
  assert.ok(content.includes("caches.match('./index.html')"), 'Must fall back directly to ./index.html');
});

test('PWA - sw.js sanitizes Permissions-Policy header for navigation responses', async () => {
  const swPath = path.join(ROOT_DIR, 'sw.js');
  const content = fs.readFileSync(swPath, 'utf8');

  // 1. Verify sw.js declares the clean standard permissions policy constant and helper
  const expectedPolicy = 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()';
  assert.ok(content.includes(expectedPolicy), 'Must define standard clean permissions policy');
  assert.ok(content.includes('function sanitizeNavigationResponse'), 'Must define sanitizeNavigationResponse helper');
  assert.ok(content.includes("request.mode === 'navigate'"), 'Must check request.mode === "navigate"');
  assert.ok(content.includes('sanitizeNavigationResponse(cachedResponse)'), 'Must sanitize cached navigation responses');
  assert.ok(content.includes('sanitizeNavigationResponse(networkResponse)'), 'Must sanitize network navigation responses');

  // 2. Extract and evaluate the sanitizeNavigationResponse function from sw.js
  const helperMatch = content.match(/(function sanitizeNavigationResponse[\s\S]*?^})/m);
  assert.ok(helperMatch, 'Must find sanitizeNavigationResponse definition');

  const sanitizeFn = new Function(
    'PERMISSIONS_POLICY',
    `
    ${helperMatch[1]}
    return sanitizeNavigationResponse;
    `
  )(expectedPolicy);

  // Test 2a: Null response pass-through
  assert.equal(sanitizeFn(null), null, 'Null response must pass through');

  // Test 2b: Sanitize GitHub Pages edge-injected Permissions-Policy header
  const githubEdgePolicy =
    'interest-cohort=(), browsing-topics=(), run-ad-auction=(), join-ad-interest-group=(), private-state-token-redemption=(), private-state-token-issuance=(), private-aggregation=(), attribution-reporting=()';
  const initialHeaders = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Permissions-Policy': githubEdgePolicy,
    'X-Custom-Header': 'preserve-me'
  });
  const mockOriginalResponse = new Response('<!DOCTYPE html><html><head><title>LocalJam</title></head></html>', {
    status: 200,
    statusText: 'OK',
    headers: initialHeaders
  });

  const sanitized = sanitizeFn(mockOriginalResponse);
  assert.equal(sanitized.status, 200);
  assert.equal(sanitized.statusText, 'OK');
  assert.equal(sanitized.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(sanitized.headers.get('x-custom-header'), 'preserve-me');
  assert.equal(sanitized.headers.get('permissions-policy'), expectedPolicy);

  // Verify none of the unrecognized features exist in the sanitized header
  const unrecognizedFeatures = [
    'browsing-topics',
    'run-ad-auction',
    'join-ad-interest-group',
    'private-state-token-redemption',
    'private-state-token-issuance',
    'private-aggregation',
    'attribution-reporting',
    'interest-cohort'
  ];
  const resultingPolicy = sanitized.headers.get('permissions-policy');
  for (const feature of unrecognizedFeatures) {
    assert.ok(!resultingPolicy.includes(feature), `Policy must not include unrecognized feature: ${feature}`);
  }

  // Verify response body is intact
  const text = await sanitized.text();
  assert.equal(text, '<!DOCTYPE html><html><head><title>LocalJam</title></head></html>');

  // Test 2c: Verify null-body status codes (204, 304) and out-of-range pass-through
  const res204 = new Response(null, { status: 204, statusText: 'No Content' });
  const sanitized204 = sanitizeFn(res204);
  assert.equal(sanitized204.status, 204);
  assert.equal(sanitized204.body, null);
  assert.equal(sanitized204.headers.get('permissions-policy'), expectedPolicy);

  const res304 = new Response(null, { status: 304, statusText: 'Not Modified' });
  const sanitized304 = sanitizeFn(res304);
  assert.equal(sanitized304.status, 304);
  assert.equal(sanitized304.body, null);
  assert.equal(sanitized304.headers.get('permissions-policy'), expectedPolicy);

  // Out-of-range (e.g., opaque status 0 or network error) passes through untouched
  const mockOpaque = { status: 0, statusText: '', headers: new Headers() };
  assert.equal(sanitizeFn(mockOpaque), mockOpaque, 'Out-of-range status must pass through untouched');
});
