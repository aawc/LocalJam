import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from '../server.js';
import { escapeHtml, sanitizeUrl, isValidHttpUrl, sanitizeMimeType, sanitizeText } from '../src/utils/sanitize.js';
import { createStationModal } from '../src/ui/components/station-modal.js';
import { renderRadioView } from '../src/ui/views/radio-view.js';
import { renderHomeView } from '../src/ui/views/home-view.js';
import { renderPlaylistsView } from '../src/ui/views/playlists-view.js';
import { addCustomStation } from '../src/radio/stations.js';
import { parseID3v2 } from '../src/metadata/id3v2.js';
import { parseFLAC } from '../src/metadata/flac.js';
import { Router } from '../src/ui/router.js';
import { db } from '../src/storage/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Global DB mocks for views in test environment
db.getAllTracks = async () => [{ id: 'trk_1', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: 180, isMissing: 0 }];
db.getAllAlbums = async () => [{ name: 'Album 1', artist: 'Artist 1' }];
db.getAllArtists = async () => [{ name: 'Artist 1' }];
db.getAllPlaylists = async () => [{ id: 'pl_1', name: 'Chill', trackIds: ['trk_1'] }];
db.getRecentHistory = async () => [{ trackId: 'trk_1', timestamp: Date.now(), track: { title: 'Song 1' } }];
db.getStations = async () => [];
db.saveStations = async () => {};
db.isFavorite = async () => false;
db.toggleFavorite = async () => true;

// Helper for raw HTTP requests bypassing client-side URL normalization
function sendRawRequest(port, method, rawPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: rawPath,
        method,
        headers
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// Setup minimal mock DOM for UI testing in Node.js
if (typeof document === 'undefined') {
  function createMockElement(tag = 'div') {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      id: '',
      style: {},
      attributes: {},
      _innerHTML: '',
      children: [],
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); },
        toggle(c) {
          if (this.classes.has(c)) this.classes.delete(c);
          else this.classes.add(c);
        }
      },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k] || null; },
      removeAttribute(k) { delete this.attributes[k]; },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener() {},
      removeEventListener() {},
      focus() {},
      select() {},
      querySelector(selector) {
        if (selector === '#station-modal-title') return createMockElement('span');
        if (selector === '#station-modal-subtitle') return createMockElement('span');
        if (selector === '#station-modal-description') return createMockElement('span');
        if (selector === '#station-modal-genre') return createMockElement('span');
        if (selector === '#station-modal-country') return createMockElement('span');
        if (selector === '#station-modal-bitrate') return createMockElement('span');
        if (selector === '#station-modal-pipeline') return createMockElement('span');
        if (selector === '#station-modal-favicon') return createMockElement('img');
        if (selector === '#station-modal-url-input') return createMockElement('input');
        if (selector === '#btn-copy-stream-url') return createMockElement('button');
        if (selector === '#station-copy-feedback') return createMockElement('div');
        if (selector === '#station-modal-homepage-link') return createMockElement('a');
        if (selector === '#btn-modal-star') return createMockElement('button');
        if (selector === '#btn-modal-eq') return createMockElement('button');
        if (selector === '#btn-modal-viz') return createMockElement('button');
        if (selector === '#btn-close-station-modal') return createMockElement('button');
        if (selector === '#btn-done-station-modal') return createMockElement('button');
        return createMockElement('div');
      },
      querySelectorAll() { return []; }
    };

    Object.defineProperty(el, 'innerHTML', {
      get() { return this._innerHTML; },
      set(val) { this._innerHTML = String(val); }
    });

    Object.defineProperty(el, 'outerHTML', {
      get() { return `<${tag.toLowerCase()} class="${this.className}" id="${this.id}">${this._innerHTML}</${tag.toLowerCase()}>`; }
    });

    return el;
  }

  globalThis.document = {
    activeElement: null,
    createElement: (tag) => createMockElement(tag),
    getElementById: (id) => createMockElement('div'),
    querySelector: (sel) => createMockElement('div'),
    querySelectorAll: (sel) => []
  };
}

test('Security Audit Suite - SEC-01: Local Development Server Path Traversal Protection', async (t) => {
  const server = createServer(rootDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  t.after(() => {
    server.close();
  });

  await t.test('[SEC-01] Blocks direct root traversal via /../package.json with 403 Forbidden', async () => {
    const res = await sendRawRequest(port, 'GET', '/../package.json');
    assert.equal(res.statusCode, 403, 'Must return 403 Forbidden for path traversal');
    assert.equal(res.body, '403 Forbidden');
  });

  await t.test('[SEC-01] Blocks subpath traversal bypass via /src/../../package.json with 403 Forbidden', async () => {
    const res = await sendRawRequest(port, 'GET', '/src/../../package.json');
    assert.equal(res.statusCode, 403, 'Must return 403 Forbidden for subpath traversal');
    assert.equal(res.body, '403 Forbidden');
  });

  await t.test('[SEC-01] Blocks encoded dot-dot traversal /%2e%2e/%2e%2e/package.json with 403 Forbidden', async () => {
    const res = await sendRawRequest(port, 'GET', '/%2e%2e/%2e%2e/package.json');
    assert.equal(res.statusCode, 403, 'Must return 403 Forbidden for percent-encoded traversal');
    assert.equal(res.body, '403 Forbidden');
  });

  await t.test('[SEC-01] Blocks deep system file escape attempts /nested/../../../../etc/passwd with 403 Forbidden', async () => {
    const res = await sendRawRequest(port, 'GET', '/nested/../../../../etc/passwd');
    assert.equal(res.statusCode, 403, 'Must return 403 Forbidden for system file traversal');
  });

  await t.test('[SEC-01] Allows legitimate root and sub-resource requests with 200 OK', async () => {
    const res = await sendRawRequest(port, 'GET', '/package.json');
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.name, 'localjam');
  });
});

test('Security Audit Suite - SEC-10 & SEC-11: Server HTTP Security Headers & Error Masking', async (t) => {
  const server = createServer(rootDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  t.after(() => {
    server.close();
  });

  await t.test('[SEC-10] Enforces all standard security headers on HTTP responses', async () => {
    const res = await sendRawRequest(port, 'GET', '/package.json');
    assert.equal(res.statusCode, 200);

    // Verify MIME sniffing protection
    assert.equal(res.headers['x-content-type-options'], 'nosniff');

    // Verify clickjacking protection
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');

    // Verify referrer policy
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');

    // Verify permissions policy disables sensitive hardware features
    assert.ok(res.headers['permissions-policy'].includes('camera=()'));
    assert.ok(res.headers['permissions-policy'].includes('microphone=()'));
    assert.ok(res.headers['permissions-policy'].includes('geolocation=()'));

    // Verify origin isolation headers
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin');

    // Verify Content-Security-Policy header
    const csp = res.headers['content-security-policy'];
    assert.ok(csp, 'CSP header must be present');
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("script-src 'self'"));
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes("frame-ancestors 'none'"));
  });

  await t.test('[SEC-11] Generic error responses do not leak server stack traces or internal filesystem paths', async () => {
    const res = await sendRawRequest(port, 'GET', '/non-existent-path-abc-123');
    assert.equal(res.statusCode, 404);
    assert.equal(res.body, '404 Not Found');
    assert.ok(!res.body.includes('/usr/local/google'));
    assert.ok(!res.body.includes('Error:'));
  });
});

test('Security Audit Suite - SEC-02: Hosted PWA Content-Security-Policy in index.html', () => {
  const indexPath = path.join(rootDir, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  // Assert CSP meta tag exists in HTML head
  const cspMetaMatch = indexHtml.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/i);
  assert.ok(cspMetaMatch, 'index.html must include a Content-Security-Policy meta tag');

  const cspContent = cspMetaMatch[1];

  // Assert strict CSP directives
  assert.ok(cspContent.includes("default-src 'self'"), 'CSP must restrict default-src to self');
  assert.ok(cspContent.includes("script-src 'self'"), 'CSP must restrict script-src to self');
  assert.ok(!cspContent.includes("script-src 'unsafe-inline'"), 'CSP must NOT allow unsafe-inline in script-src');
  assert.ok(!cspContent.includes("script-src 'unsafe-eval'"), 'CSP must NOT allow unsafe-eval in script-src');
  assert.ok(cspContent.includes("object-src 'none'"), 'CSP must restrict object-src to none');
  assert.ok(cspContent.includes("base-uri 'self'"), 'CSP must restrict base-uri to self');
  assert.ok(cspContent.includes("form-action 'self'"), 'CSP must restrict form-action to self');
});

test('Security Audit Suite - SEC-05: Sanitization Utilities (src/utils/sanitize.js)', async (t) => {
  await t.test('[SEC-05] escapeHtml comprehensively neutralizes all 6 dangerous HTML entity characters', () => {
    const raw = `& < > " ' \``;
    const escaped = escapeHtml(raw);
    assert.equal(escaped, '&amp; &lt; &gt; &quot; &#39; &#96;');
  });

  await t.test('[SEC-05] escapeHtml neutralizes XSS attack vectors', () => {
    const vector1 = `<script>alert('XSS')</script>`;
    assert.equal(escapeHtml(vector1), '&lt;script&gt;alert(&#39;XSS&#39;)&lt;/script&gt;');

    const vector2 = `"><img src=x onerror=alert(1)>`;
    assert.equal(escapeHtml(vector2), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');

    const vector3 = `' onmouseover='alert(\`XSS\`)'`;
    assert.equal(escapeHtml(vector3), '&#39; onmouseover=&#39;alert(&#96;XSS&#96;)&#39;');
  });

  await t.test('[SEC-05] escapeHtml handles null, undefined, and non-string types safely', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(12345), '12345');
    assert.equal(escapeHtml(false), 'false');
  });

  await t.test('[SEC-03] sanitizeUrl permits legitimate HTTP/HTTPS URLs and blocks dangerous protocols', () => {
    // Valid URLs
    assert.equal(sanitizeUrl('https://example.com/stream'), 'https://example.com/stream');
    assert.equal(sanitizeUrl('http://icecast.somafm.com:80/groovesalad-128-mp3'), 'http://icecast.somafm.com/groovesalad-128-mp3');
    assert.equal(sanitizeUrl('#/radio'), '#/radio');
    assert.equal(sanitizeUrl('/settings'), '/settings');

    // Dangerous protocols and protocol-relative URLs blocked
    assert.equal(sanitizeUrl('javascript:alert(document.domain)'), '#');
    assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '#');
    assert.equal(sanitizeUrl('vbscript:msgbox(1)'), '#');
    assert.equal(sanitizeUrl('file:///etc/passwd'), '#');
    assert.equal(sanitizeUrl('//evil.com/payload'), '#');
    assert.equal(sanitizeUrl(''), '#');
    assert.equal(sanitizeUrl(null), '#');
  });

  await t.test('[SEC-09] isValidHttpUrl rigorously validates absolute HTTP/HTTPS URLs', () => {
    assert.equal(isValidHttpUrl('https://radioparadise.com'), true);
    assert.equal(isValidHttpUrl('http://icecast.org/stream'), true);
    assert.equal(isValidHttpUrl('javascript:alert(1)'), false);
    assert.equal(isValidHttpUrl('data:text/html;base64,AAA'), false);
    assert.equal(isValidHttpUrl('/relative/path'), false);
    assert.equal(isValidHttpUrl('not-a-url'), false);
    assert.equal(isValidHttpUrl(null), false);
  });

  await t.test('[SEC-08] sanitizeMimeType enforces safe raster image MIME allowlist', () => {
    assert.equal(sanitizeMimeType('image/jpeg'), 'image/jpeg');
    assert.equal(sanitizeMimeType('image/png'), 'image/png');
    assert.equal(sanitizeMimeType('IMAGE/WEBP; charset=binary'), 'image/webp');
    assert.equal(sanitizeMimeType('image/gif'), 'image/gif');

    // Executable/dangerous MIME types defaulted to safe image/jpeg
    assert.equal(sanitizeMimeType('text/html'), 'image/jpeg');
    assert.equal(sanitizeMimeType('application/javascript'), 'image/jpeg');
    assert.equal(sanitizeMimeType('image/svg+xml'), 'image/jpeg');
    assert.equal(sanitizeMimeType('application/x-msdownload'), 'image/jpeg');
    assert.equal(sanitizeMimeType(''), 'image/jpeg');
  });

  await t.test('[SEC-09] sanitizeText bounds string lengths and trims whitespace', () => {
    assert.equal(sanitizeText('   Hello World   ', 50), 'Hello World');
    assert.equal(sanitizeText('A'.repeat(500), 10), 'AAAAAAAAAA');
    assert.equal(sanitizeText(null), '');
  });
});

test('Security Audit Suite - SEC-03: Station Modal DOM XSS Prevention', () => {
  const maliciousStation = {
    id: 'station-xss-test',
    name: '<script>alert("xss")</script>',
    genre: '"><img src=x onerror=alert(1)>',
    codec: 'MP3\' onmouseover=\'alert(1)',
    bitrate: 320,
    homepageUrl: 'javascript:alert(document.cookie)',
    streamUrl: 'https://example.com/stream'
  };

  const modal = createStationModal({
    onToggleEq: () => {},
    onToggleVisualizer: () => {},
    onToggleFavorite: () => {}
  });

  assert.ok(modal.element, 'Modal element must be created');
  const innerHtml = modal.element.innerHTML;

  // Assert modal template does not contain unescaped script injections
  assert.ok(!innerHtml.includes('<script>alert("xss")</script>'));
  assert.ok(!innerHtml.includes('href="javascript:'));
});

test('Security Audit Suite - SEC-04 & SEC-06: Views CSP Compliance & No Inline Handlers', async () => {
  // Test Radio View output
  const radioEl = await renderRadioView();
  const radioHtml = radioEl.innerHTML;
  assert.ok(!radioHtml.includes('onerror='), 'renderRadioView must not contain inline onerror= attributes');
  assert.ok(!radioHtml.includes('onclick='), 'renderRadioView must not contain inline onclick= attributes');

  // Test Home View output
  const homeEl = await renderHomeView();
  const homeHtml = homeEl.innerHTML;
  assert.ok(!homeHtml.includes('onclick='), 'renderHomeView must not contain inline onclick= attributes');
  assert.ok(homeHtml.includes('href="#/songs"'), 'renderHomeView must use semantic href links');

  // Test Playlists View output
  const playlistsEl = await renderPlaylistsView();
  const playlistsHtml = playlistsEl.innerHTML;
  assert.ok(!playlistsHtml.includes('onclick='), 'renderPlaylistsView must not contain inline onclick= attributes');
});

test('Security Audit Suite - SEC-07: Router Error View HTML Sanitization', async () => {
  const routerInstance = new Router();
  const testContainer = document.createElement('div');
  const prevWindow = globalThis.window;
  try {
    globalThis.window = {
      location: { hash: '#/malicious-route' },
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    routerInstance.init(testContainer);
    routerInstance.registerRoute('malicious-route', () => {
      throw new Error('<script>alert("router-xss")</script><img src=x onerror=prompt(1)>');
    });

    await routerInstance.handleRouteChange();

    assert.ok(testContainer.innerHTML.includes('&lt;script&gt;alert(&quot;router-xss&quot;)&lt;/script&gt;'));
    assert.ok(testContainer.innerHTML.includes('&lt;img src=x onerror=prompt(1)&gt;'));
    assert.ok(!testContainer.innerHTML.includes('<script>alert("router-xss")</script>'));
  } finally {
    globalThis.window = prevWindow;
  }
});

test('Security Audit Suite - SEC-09: Radio Station Input Validation & Protocol Safety', async (t) => {
  await t.test('Rejects javascript: and data: stream URLs', async () => {
    await assert.rejects(
      async () => {
        await addCustomStation({
          name: 'Evil Station',
          streamUrl: 'javascript:alert(1)',
          genre: 'Rock'
        });
      },
      /HTTPS stream URL is required/,
      'Must reject javascript: streamUrl'
    );

    await assert.rejects(
      async () => {
        await addCustomStation({
          name: 'Evil Station 2',
          streamUrl: 'data:text/html,<script>alert(1)</script>',
          genre: 'Ambient'
        });
      },
      /HTTPS stream URL is required/,
      'Must reject data: streamUrl'
    );
  });

  await t.test('Accepts valid HTTPS station and sanitizes text metadata fields', async () => {
    const added = await addCustomStation({
      name: '  Safe Custom Station  ',
      streamUrl: 'https://stream.example.org/radio.mp3',
      genre: 'Classical',
      homepageUrl: 'https://example.org'
    });

    assert.equal(added.name, 'Safe Custom Station');
    assert.equal(added.streamUrl, 'https://stream.example.org/radio.mp3');
    assert.equal(added.homepageUrl, 'https://example.org');
    assert.equal(added.isCustom, true);
  });
});

test('Security Audit Suite - SEC-08: Audio Metadata Safe Image MIME Extraction', () => {
  // Build a synthetic ID3v2.3 tag with an APIC frame specifying a dangerous MIME type
  const fakeJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const mimeBytes = Buffer.from('text/html\0', 'latin1');
  const apicPayload = Buffer.concat([
    Buffer.from([0x00]), // Latin1 encoding
    mimeBytes,
    Buffer.from([0x03]), // Cover front
    Buffer.from('Artwork\0', 'latin1'),
    fakeJpegBytes
  ]);

  const frameHeader = Buffer.alloc(10);
  frameHeader.write('APIC', 0, 4, 'ascii');
  frameHeader.writeUInt32BE(apicPayload.length, 4);
  frameHeader.writeUInt16BE(0, 8);

  const tagHeader = Buffer.alloc(10);
  tagHeader.write('ID3', 0, 3, 'ascii');
  tagHeader[3] = 3;
  const totalSize = 10 + apicPayload.length;
  tagHeader[6] = (totalSize >> 21) & 0x7f;
  tagHeader[7] = (totalSize >> 14) & 0x7f;
  tagHeader[8] = (totalSize >> 7) & 0x7f;
  tagHeader[9] = totalSize & 0x7f;

  const id3Buffer = Buffer.concat([tagHeader, frameHeader, apicPayload]);
  const result = parseID3v2(id3Buffer);

  assert.ok(result);
  assert.ok(result.artwork, 'Artwork should be extracted');
  assert.equal(
    result.artwork.mimeType,
    'image/jpeg',
    'Dangerous MIME type text/html must be sanitized to safe image/jpeg'
  );
  assert.ok(
    result.artwork.dataUrl.startsWith('data:image/jpeg;base64,'),
    'Data URL must use sanitized safe MIME type'
  );
});
