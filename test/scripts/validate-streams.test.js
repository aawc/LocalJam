import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  validateStream,
  validateStationCatalog,
  isAudioContentType,
  ACCEPTED_AUDIO_MIME_TYPES,
  runCli
} from '../../scripts/validate-streams.js';

/**
 * Creates an ephemeral local mock HTTP server.
 * @param {(req: http.IncomingMessage, res: http.ServerResponse) => void} handler
 * @returns {Promise<{ server: http.Server, port: number, url: string, close: () => Promise<void> }>}
 */
function createMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res))
      });
    });
  });
}

test('Live Stream Validator Suite', async (t) => {
  await t.test('isAudioContentType classifies standard and edge-case MIME types accurately', () => {
    // Standard audio MIME types
    assert.equal(isAudioContentType('audio/mpeg'), true, 'audio/mpeg must be valid');
    assert.equal(isAudioContentType('audio/aacp'), true, 'audio/aacp must be valid');
    assert.equal(isAudioContentType('audio/aac'), true, 'audio/aac must be valid');
    assert.equal(isAudioContentType('audio/ogg'), true, 'audio/ogg must be valid');
    assert.equal(isAudioContentType('audio/x-wav'), true, 'audio/x-wav must be valid');
    assert.equal(isAudioContentType('audio/flac'), true, 'audio/flac must be valid');

    // Streaming & container types
    assert.equal(isAudioContentType('application/ogg'), true, 'application/ogg must be valid');
    assert.equal(isAudioContentType('video/mp2t'), true, 'video/mp2t must be valid');
    assert.equal(isAudioContentType('application/vnd.apple.mpegurl'), true, 'HLS mpegurl must be valid');

    // Parameters in header
    assert.equal(isAudioContentType('audio/mpeg; charset=utf-8'), true, 'audio/mpeg with charset must be valid');
    assert.equal(isAudioContentType('audio/aacp; bitrate=64'), true, 'audio/aacp with bitrate must be valid');

    // Rejected non-audio types
    assert.equal(isAudioContentType('text/html'), false, 'text/html must be rejected');
    assert.equal(isAudioContentType('text/html; charset=utf-8'), false, 'text/html with charset must be rejected');
    assert.equal(isAudioContentType('text/plain'), false, 'text/plain must be rejected');
    assert.equal(isAudioContentType('application/json'), false, 'application/json must be rejected');
    assert.equal(isAudioContentType('image/png'), false, 'image/png must be rejected');
    assert.equal(isAudioContentType(''), false, 'empty content type must be rejected');
    assert.equal(isAudioContentType(null), false, 'null content type must be rejected');
    assert.equal(isAudioContentType(undefined), false, 'undefined content type must be rejected');
  });

  await t.test('Valid audio stream response (200 OK, Content-Type: audio/mpeg)', async (t) => {
    let connectionDestroyedEarly = false;
    const mock = await createMockServer((req, res) => {
      assert.equal(req.headers['range'], 'bytes=0-4096', 'Must send Range: bytes=0-4096');
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked'
      });
      // Emit audio chunk
      res.write(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x11, 0x22, 0x33]));
      req.on('close', () => {
        connectionDestroyedEarly = true;
      });
    });
    t.after(() => mock.close());

    const result = await validateStream(mock.url, { timeout: 1000 });
    assert.equal(result.valid, true, 'Stream must be marked valid');
    assert.equal(result.statusCode, 200, 'Status code must be 200');
    assert.equal(result.contentType, 'audio/mpeg', 'Content-Type must be audio/mpeg');
    assert.ok(result.firstChunkBytes > 0, 'First chunk bytes must be recorded');
    assert.equal(result.redirectCount, 0, 'Redirect count must be 0');
    assert.equal(result.error, null, 'Error must be null');
    assert.ok(result.durationMs >= 0, 'Duration must be non-negative');
  });

  await t.test('Partial content response (206 Partial Content, Content-Type: audio/aacp)', async (t) => {
    const mock = await createMockServer((req, res) => {
      assert.equal(req.headers['range'], 'bytes=0-4096');
      res.writeHead(206, {
        'Content-Type': 'audio/aacp',
        'Content-Range': 'bytes 0-4095/1048576'
      });
      res.write(Buffer.alloc(4096, 0xaa));
    });
    t.after(() => mock.close());

    const result = await validateStream(mock.url, { timeout: 1000 });
    assert.equal(result.valid, true, '206 response must be valid');
    assert.equal(result.statusCode, 206, 'Status code must be 206');
    assert.equal(result.contentType, 'audio/aacp', 'Content-Type must be audio/aacp');
    assert.equal(result.firstChunkBytes, 4096, 'Must receive 4096 chunk bytes');
    assert.equal(result.error, null);
  });

  await t.test('HTTP redirects (302 redirecting to mock audio server)', async (t) => {
    const mock = await createMockServer((req, res) => {
      if (req.url === '/initial-stream') {
        res.writeHead(302, {
          'Location': '/target-audio'
        });
        res.end();
      } else if (req.url === '/target-audio') {
        res.writeHead(200, {
          'Content-Type': 'audio/ogg'
        });
        res.write(Buffer.from([0x4f, 0x67, 0x67, 0x53])); // OggS magic header
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    t.after(() => mock.close());

    const result = await validateStream(`${mock.url}/initial-stream`, { timeout: 1000 });
    assert.equal(result.valid, true, 'Stream with redirect must be valid');
    assert.equal(result.statusCode, 200);
    assert.equal(result.contentType, 'audio/ogg');
    assert.equal(result.redirectCount, 1, 'Redirect count must be 1');
    assert.equal(result.finalUrl, `${mock.url}/target-audio`, 'Final URL must point to target');
  });

  await t.test('Multiple redirect hops (301, 307, 308) up to 3 hops', async (t) => {
    const mock = await createMockServer((req, res) => {
      if (req.url === '/hop1') {
        res.writeHead(301, { 'Location': '/hop2' });
        res.end();
      } else if (req.url === '/hop2') {
        res.writeHead(307, { 'Location': '/hop3' });
        res.end();
      } else if (req.url === '/hop3') {
        res.writeHead(308, { 'Location': '/final-audio' });
        res.end();
      } else if (req.url === '/final-audio') {
        res.writeHead(200, { 'Content-Type': 'audio/flac' });
        res.write(Buffer.from([0x66, 0x4c, 0x61, 0x43])); // fLaC magic header
      }
    });
    t.after(() => mock.close());

    const result = await validateStream(`${mock.url}/hop1`, { timeout: 1000 });
    assert.equal(result.valid, true);
    assert.equal(result.redirectCount, 3);
    assert.equal(result.contentType, 'audio/flac');
    assert.equal(result.finalUrl, `${mock.url}/final-audio`);
  });

  await t.test('Non-audio error response (200 OK, Content-Type: text/html)', async (t) => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      res.end('<!DOCTYPE html><html><body>Landing Page</body></html>');
    });
    t.after(() => mock.close());

    const result = await validateStream(mock.url, { timeout: 1000 });
    assert.equal(result.valid, false, 'text/html response must be marked invalid');
    assert.equal(result.statusCode, 200);
    assert.equal(result.contentType, 'text/html; charset=utf-8');
    assert.ok(result.error.includes('Rejected non-audio content-type'), `Expected error message, got: ${result.error}`);
  });

  await t.test('Timeout handling and socket cleanup on stalled server', async (t) => {
    const mock = await createMockServer((req, res) => {
      // Connects but stalls indefinitely without sending headers
    });
    t.after(() => mock.close());

    const startTime = Date.now();
    const result = await validateStream(mock.url, { timeout: 120 });
    const elapsed = Date.now() - startTime;

    assert.equal(result.valid, false, 'Stalled connection must fail validation');
    assert.ok(result.error.includes('timed out'), `Error must mention timeout, got: ${result.error}`);
    assert.ok(elapsed < 1000, `Timeout must resolve promptly, took ${elapsed}ms`);
  });

  await t.test('Exceeded redirect limit terminates cleanly', async (t) => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(302, { 'Location': '/loop' });
      res.end();
    });
    t.after(() => mock.close());

    const result = await validateStream(`${mock.url}/loop`, { maxRedirects: 2, timeout: 1000 });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Too many redirects'), `Expected redirect error, got: ${result.error}`);
    assert.ok(result.redirectCount > 2);
  });

  await t.test('HTTP 404 Not Found returns invalid result', async (t) => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
    t.after(() => mock.close());

    const result = await validateStream(`${mock.url}/not-found`, { timeout: 1000 });
    assert.equal(result.valid, false);
    assert.equal(result.statusCode, 404);
    assert.ok(result.error.includes('HTTP status 404'));
  });

  await t.test('HTTP 503 Service Unavailable returns invalid result', async (t) => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Service Unavailable');
    });
    t.after(() => mock.close());

    const result = await validateStream(mock.url, { timeout: 1000 });
    assert.equal(result.valid, false);
    assert.equal(result.statusCode, 503);
    assert.ok(result.error.includes('HTTP status 503'));
  });

  await t.test('Malformed URL input returns invalid result without throwing uncaught exceptions', async (t) => {
    const result1 = await validateStream('not-a-valid-url');
    assert.equal(result1.valid, false);
    assert.ok(result1.error.includes('Invalid URL format'));

    const result2 = await validateStream('ftp://audio.example.com/stream.mp3');
    assert.equal(result2.valid, false);
    assert.ok(result2.error.includes('Unsupported protocol'));
  });

  await t.test('Stream closed before transmitting audio data is handled gracefully', async (t) => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      res.end(); // Closed immediately with 0 bytes of audio
    });
    t.after(() => mock.close());

    const result = await validateStream(mock.url, { timeout: 1000 });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('before transmitting audio data'));
  });

  await t.test('validateStationCatalog validates station collections and invokes onProgress', async (t) => {
    const validMock = await createMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      res.write(Buffer.from([0xff, 0xfb]));
    });
    const invalidMock = await createMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Error</h1>');
    });
    t.after(() => Promise.all([validMock.close(), invalidMock.close()]));

    const mockStations = [
      { id: 'station_pass', name: 'Valid Stream Station', streamUrl: validMock.url },
      { id: 'station_fail', name: 'Invalid Stream Station', streamUrl: invalidMock.url }
    ];

    const progressEvents = [];
    const report = await validateStationCatalog(mockStations, {
      concurrency: 2,
      onProgress: (info) => progressEvents.push(info)
    });

    assert.equal(report.total, 2);
    assert.equal(report.passed, 1);
    assert.equal(report.failed, 1);
    assert.equal(report.results.length, 2);
    assert.equal(progressEvents.length, 2);
    assert.equal(progressEvents[0].total, 2);
  });

  await t.test('runCli handles --help and missing station ID flags gracefully', async () => {
    const helpResult = await runCli(['--help']);
    assert.equal(helpResult, true, '--help must exit with true');

    const missingIdResult = await runCli(['--id=non_existent_stream_9999']);
    assert.equal(missingIdResult, false, 'Missing station ID must return false');
  });
});
