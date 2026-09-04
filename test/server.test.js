import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

test('LocalJam Dev Server - Comprehensive RFC 9110 & Static Serving Tests', async (t) => {
  const server = createServer(rootDir);
  
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(() => {
    server.close();
  });

  await t.test('Serves package.json with application/json MIME type', async () => {
    const res = await fetch(`${baseUrl}/package.json`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/json'));
    const body = await res.json();
    assert.equal(body.name, 'localjam');
  });

  await t.test('Returns 404 for non-existent files', async () => {
    const res = await fetch(`${baseUrl}/non-existent-file-123.xyz`);
    assert.equal(res.status, 404);
  });

  await t.test('Handles standard HTTP Range requests with 206 Partial Content', async () => {
    const res = await fetch(`${baseUrl}/package.json`, {
      headers: {
        'Range': 'bytes=0-15'
      }
    });
    assert.equal(res.status, 206);
    assert.ok(res.headers.get('content-range').startsWith('bytes 0-15/'));
    const text = await res.text();
    assert.equal(text.length, 16);
  });

  await t.test('Handles suffix HTTP Range requests (bytes=-N)', async () => {
    const res = await fetch(`${baseUrl}/package.json`, {
      headers: {
        'Range': 'bytes=-10'
      }
    });
    assert.equal(res.status, 206);
    const text = await res.text();
    assert.equal(text.length, 10);
    assert.ok(res.headers.get('content-range').includes('/'));
  });

  await t.test('Handles open-ended HTTP Range requests (bytes=10-)', async () => {
    const res = await fetch(`${baseUrl}/package.json`, {
      headers: {
        'Range': 'bytes=10-'
      }
    });
    assert.equal(res.status, 206);
    assert.ok(res.headers.get('content-range').startsWith('bytes 10-'));
    const text = await res.text();
    assert.ok(text.length > 0);
  });

  await t.test('Clamps oversized range requests to EOF per RFC 9110', async () => {
    const res = await fetch(`${baseUrl}/package.json`, {
      headers: {
        'Range': 'bytes=0-999999'
      }
    });
    assert.equal(res.status, 206);
    const text = await res.text();
    assert.ok(text.length > 0);
  });

  await t.test('Returns 416 for unsatisfiable range requests', async () => {
    const res = await fetch(`${baseUrl}/package.json`, {
      headers: {
        'Range': 'bytes=100000-200000'
      }
    });
    assert.equal(res.status, 416);
    assert.ok(res.headers.get('content-range').startsWith('bytes */'));
  });

  await t.test('Handles HEAD requests with zero body length but correct headers', async () => {
    const res = await fetch(`${baseUrl}/package.json`, { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.ok(parseInt(res.headers.get('content-length'), 10) > 0);
    const text = await res.text();
    assert.equal(text.length, 0);
  });

  await t.test('Handles OPTIONS preflight with 204 No Content', async () => {
    const res = await fetch(`${baseUrl}/package.json`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
  });

  await t.test('Returns 405 Method Not Allowed for unsupported methods', async () => {
    const res = await fetch(`${baseUrl}/package.json`, { method: 'POST' });
    assert.equal(res.status, 405);
  });

  await t.test('Returns 400 Bad Request for malformed percent-encoded URIs', async () => {
    const res = await fetch(`${baseUrl}/%c0%ae%c0%ae`);
    assert.equal(res.status, 400);
  });

  await t.test('Prevents directory traversal attacks', async () => {
    const res = await fetch(`${baseUrl}/../../../../etc/passwd`);
    assert.equal(res.status, 404);
  });

  await t.test('Handles CORS and Service-Worker-Allowed headers', async () => {
    const res = await fetch(`${baseUrl}/README.md`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(res.headers.get('service-worker-allowed'), '/');
  });
});
