/**
 * LocalJam - Standalone Live Stream Validation Script
 * High-performance, early-abort HTTP/HTTPS probe for radio stream verification.
 *
 * Features:
 * - Built-in Node.js http and https modules (zero external dependencies)
 * - Byte-range request ('Range: bytes=0-4096')
 * - Early socket destruction upon receiving first audio chunk
 * - 5000ms timeout with AbortController
 * - Redirect following up to 5 hops (301, 302, 303, 307, 308)
 * - Robust Content-Type validation (accepts audio/*, application/ogg, video/mp2t; rejects text/html)
 * - Programmatic API: validateStream(url, options) and validateStationCatalog(stations, options)
 * - CLI invocation: node scripts/validate-streams.js [--all | --id=<station_id>]
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { CURATED_STATIONS } from '../src/radio/stations.js';

export const ACCEPTED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/aac',
  'audio/aacp',
  'audio/x-aac',
  'audio/ogg',
  'audio/vorbis',
  'audio/opus',
  'audio/x-wav',
  'audio/wav',
  'audio/wave',
  'audio/flac',
  'audio/x-flac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/webm',
  'audio/x-mpegurl',
  'audio/mpegurl',
  'application/ogg',
  'application/x-ogg',
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'video/mp2t'
]);

/**
 * Validates whether a given HTTP Content-Type header corresponds to an audio stream.
 * @param {string} [contentType]
 * @returns {boolean}
 */
export function isAudioContentType(contentType) {
  if (!contentType || typeof contentType !== 'string') {
    return false;
  }
  // Strip optional parameters (e.g. "audio/mpeg; charset=utf-8" -> "audio/mpeg")
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') {
    return false;
  }
  if (ACCEPTED_AUDIO_MIME_TYPES.has(mime)) {
    return true;
  }
  if (mime.startsWith('audio/')) {
    return true;
  }
  return false;
}

/**
 * Validates an individual audio stream URL.
 *
 * @param {string} targetUrl The stream URL to validate.
 * @param {Object} [options] Probe options.
 * @param {number} [options.timeout=5000] Timeout in milliseconds.
 * @param {number} [options.maxRedirects=5] Maximum redirect hops allowed.
 * @param {string} [options.range='bytes=0-4096'] HTTP Range header value.
 * @param {string} [options.userAgent='LocalJam-StreamValidator/1.0'] User-Agent string.
 * @param {Object} [options.headers={}] Additional custom request headers.
 * @returns {Promise<{
 *   url: string,
 *   finalUrl: string,
 *   valid: boolean,
 *   statusCode: number|null,
 *   contentType: string|null,
 *   redirectCount: number,
 *   firstChunkBytes?: number,
 *   durationMs: number,
 *   error: string|null
 * }>}
 */
export async function validateStream(targetUrl, options = {}) {
  const timeout = typeof options.timeout === 'number' ? options.timeout : 5000;
  const maxRedirects = typeof options.maxRedirects === 'number' ? options.maxRedirects : 5;
  const range = typeof options.range === 'string' ? options.range : 'bytes=0-4096';
  const userAgent = options.userAgent || 'LocalJam-StreamValidator/1.0';
  const customHeaders = options.headers || {};

  const startTime = Date.now();
  let currentUrl = targetUrl;
  let redirectCount = 0;

  while (true) {
    let parsedUrl;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      return {
        url: targetUrl,
        finalUrl: currentUrl,
        valid: false,
        statusCode: null,
        contentType: null,
        redirectCount,
        durationMs: Date.now() - startTime,
        error: `Invalid URL format: "${currentUrl}"`
      };
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        url: targetUrl,
        finalUrl: currentUrl,
        valid: false,
        statusCode: null,
        contentType: null,
        redirectCount,
        durationMs: Date.now() - startTime,
        error: `Unsupported protocol "${parsedUrl.protocol}" (expected http: or https:)`
      };
    }

    const hopResult = await probeSingleHop(parsedUrl, {
      timeout,
      range,
      userAgent,
      customHeaders,
      startTime,
      redirectCount,
      targetUrl
    });

    if (hopResult.isRedirect) {
      redirectCount++;
      if (redirectCount > maxRedirects) {
        return {
          url: targetUrl,
          finalUrl: currentUrl,
          valid: false,
          statusCode: hopResult.statusCode,
          contentType: hopResult.contentType,
          redirectCount,
          durationMs: Date.now() - startTime,
          error: `Too many redirects (exceeded limit of ${maxRedirects})`
        };
      }

      try {
        currentUrl = new URL(hopResult.redirectLocation, currentUrl).href;
      } catch {
        return {
          url: targetUrl,
          finalUrl: currentUrl,
          valid: false,
          statusCode: hopResult.statusCode,
          contentType: hopResult.contentType,
          redirectCount,
          durationMs: Date.now() - startTime,
          error: `Invalid redirect Location header: "${hopResult.redirectLocation}"`
        };
      }
      continue;
    }

    return hopResult;
  }
}

/**
 * Internal single-hop network probe execution with early socket destruction.
 */
function probeSingleHop(parsedUrl, ctx) {
  return new Promise((resolve) => {
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const controller = new AbortController();
    let settled = false;

    const timer = setTimeout(() => {
      controller.abort();
    }, ctx.timeout);

    function finish(resObj, req, res) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (res) {
        try {
          res.destroy();
        } catch {}
      }
      if (req) {
        try {
          req.destroy();
        } catch {}
      }
      resolve(resObj);
    }

    // Abort controller listener guarantees immediate timeout settlement
    controller.signal.addEventListener('abort', () => {
      if (!settled) {
        finish({
          url: ctx.targetUrl,
          finalUrl: parsedUrl.href,
          valid: false,
          statusCode: null,
          contentType: null,
          redirectCount: ctx.redirectCount,
          durationMs: Date.now() - ctx.startTime,
          error: `Connection timed out after ${ctx.timeout}ms`
        }, req, null);
      }
    });

    const reqOptions = {
      method: 'GET',
      headers: {
        'Range': ctx.range,
        'User-Agent': ctx.userAgent,
        'Accept': '*/*',
        'Icy-MetaData': '1',
        ...ctx.customHeaders
      },
      signal: controller.signal
    };

    let req;
    try {
      req = client.request(parsedUrl, reqOptions, (res) => {
        const statusCode = res.statusCode || 0;
        const rawContentType = res.headers['content-type'] || '';
        const location = res.headers['location'];

        // Handle redirects (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
          finish({
            isRedirect: true,
            redirectLocation: location,
            statusCode,
            contentType: rawContentType
          }, req, res);
          return;
        }

        // Accept 200 OK or 206 Partial Content
        if (statusCode !== 200 && statusCode !== 206) {
          finish({
            url: ctx.targetUrl,
            finalUrl: parsedUrl.href,
            valid: false,
            statusCode,
            contentType: rawContentType,
            redirectCount: ctx.redirectCount,
            durationMs: Date.now() - ctx.startTime,
            error: `HTTP status ${statusCode} (expected 200 or 206)`
          }, req, res);
          return;
        }

        // Validate audio content-type
        if (!isAudioContentType(rawContentType)) {
          finish({
            url: ctx.targetUrl,
            finalUrl: parsedUrl.href,
            valid: false,
            statusCode,
            contentType: rawContentType,
            redirectCount: ctx.redirectCount,
            durationMs: Date.now() - ctx.startTime,
            error: `Rejected non-audio content-type: "${rawContentType || 'empty'}"`
          }, req, res);
          return;
        }

        // Early socket destroy: We verified headers and await only the first audio chunk
        res.once('data', (chunk) => {
          finish({
            url: ctx.targetUrl,
            finalUrl: parsedUrl.href,
            valid: true,
            statusCode,
            contentType: rawContentType,
            firstChunkBytes: chunk.length,
            redirectCount: ctx.redirectCount,
            durationMs: Date.now() - ctx.startTime,
            error: null
          }, req, res);
        });

        res.on('end', () => {
          if (!settled) {
            finish({
              url: ctx.targetUrl,
              finalUrl: parsedUrl.href,
              valid: false,
              statusCode,
              contentType: rawContentType,
              redirectCount: ctx.redirectCount,
              durationMs: Date.now() - ctx.startTime,
              error: 'Stream closed before transmitting audio data'
            }, req, res);
          }
        });

        res.on('error', (err) => {
          if (!settled) {
            finish({
              url: ctx.targetUrl,
              finalUrl: parsedUrl.href,
              valid: false,
              statusCode,
              contentType: rawContentType,
              redirectCount: ctx.redirectCount,
              durationMs: Date.now() - ctx.startTime,
              error: err.message
            }, req, res);
          }
        });
      });
    } catch (err) {
      finish({
        url: ctx.targetUrl,
        finalUrl: parsedUrl.href,
        valid: false,
        statusCode: null,
        contentType: null,
        redirectCount: ctx.redirectCount,
        durationMs: Date.now() - ctx.startTime,
        error: err.message
      }, null, null);
      return;
    }

    req.on('error', (err) => {
      if (!settled) {
        const isTimeout = controller.signal.aborted || err.name === 'AbortError' || err.code === 'ABORT_ERR';
        finish({
          url: ctx.targetUrl,
          finalUrl: parsedUrl.href,
          valid: false,
          statusCode: null,
          contentType: null,
          redirectCount: ctx.redirectCount,
          durationMs: Date.now() - ctx.startTime,
          error: isTimeout
            ? `Connection timed out after ${ctx.timeout}ms`
            : (err.message || 'Network request failed')
        }, req, null);
      }
    });

    req.end();
  });
}

/**
 * Validates a list of radio station objects against their stream URLs.
 *
 * @param {Array<Object>} [stations=null] Station catalog list (defaults to CURATED_STATIONS).
 * @param {Object} [options] Configuration options.
 * @param {number} [options.concurrency=3] Maximum concurrent probe requests.
 * @param {Function} [options.onProgress] Progress callback: ({ index, total, station, result }) => void.
 * @returns {Promise<{
 *   total: number,
 *   passed: number,
 *   failed: number,
 *   results: Array<{ station: Object, result: Object }>
 * }>}
 */
export async function validateStationCatalog(stations = null, options = {}) {
  const stationList = Array.isArray(stations) ? stations : CURATED_STATIONS;
  const concurrency = typeof options.concurrency === 'number' && options.concurrency > 0
    ? options.concurrency
    : 3;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const results = [];
  let passed = 0;
  let failed = 0;

  const queue = [...stationList];
  let processedCount = 0;

  async function worker() {
    while (queue.length > 0) {
      const station = queue.shift();
      processedCount++;
      const currentIndex = processedCount;

      let result;
      try {
        result = await validateStream(station.streamUrl, options);
      } catch (err) {
        result = {
          url: station.streamUrl,
          finalUrl: station.streamUrl,
          valid: false,
          statusCode: null,
          contentType: null,
          redirectCount: 0,
          durationMs: 0,
          error: err.message
        };
      }

      if (result.valid) {
        passed++;
      } else {
        failed++;
      }

      const item = { station, result };
      results.push(item);

      if (onProgress) {
        try {
          onProgress({
            index: currentIndex,
            total: stationList.length,
            station,
            result
          });
        } catch {}
      }
    }
  }

  const workers = [];
  const workerCount = Math.min(concurrency, stationList.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return {
    total: stationList.length,
    passed,
    failed,
    results
  };
}

/**
 * CLI runner function.
 * @param {string[]} [args] Command line arguments.
 * @returns {Promise<boolean>} True if all validated stations passed; false otherwise.
 */
export async function runCli(args = process.argv.slice(2)) {
  let mode = 'all';
  let stationId = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') {
      mode = 'all';
    } else if (arg.startsWith('--id=')) {
      mode = 'id';
      stationId = arg.slice(5);
    } else if (arg === '--id' && args[i + 1]) {
      mode = 'id';
      stationId = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
LocalJam Live Audio Stream Validator

Usage:
  node scripts/validate-streams.js [options]

Options:
  --all               Validate all stations in curated catalog (default)
  --id=<station_id>   Validate a specific station by its ID
  --help, -h          Show this help message
`);
      return true;
    }
  }

  console.log('[INFO] LocalJam Audio Stream Validator initialized.');
  console.log(`[INFO] Mode: ${mode}${stationId ? ` (Station ID: ${stationId})` : ''}`);

  if (mode === 'id') {
    const station = CURATED_STATIONS.find((s) => s.id === stationId);
    if (!station) {
      console.error(`[FAIL] Station with id "${stationId}" not found in curated catalog.`);
      return false;
    }
    console.log(`[INFO] Probing station "${station.name}" (${station.id}) at ${station.streamUrl}...`);
    const result = await validateStream(station.streamUrl);
    if (result.valid) {
      console.log(`[PASS] ${station.name} (${station.id})`);
      console.log(`       Status: ${result.statusCode} | Content-Type: ${result.contentType} | Duration: ${result.durationMs}ms`);
      return true;
    } else {
      console.error(`[FAIL] ${station.name} (${station.id})`);
      console.error(`       Error: ${result.error} | Status: ${result.statusCode ?? 'N/A'} | Content-Type: ${result.contentType ?? 'N/A'}`);
      return false;
    }
  }

  console.log(`[INFO] Validating all ${CURATED_STATIONS.length} curated stations...`);
  const catalogResult = await validateStationCatalog(CURATED_STATIONS, {
    concurrency: 4,
    onProgress: ({ index, total, station, result }) => {
      const prefix = result.valid ? '[PASS]' : '[FAIL]';
      const detail = result.valid
        ? `${result.contentType} (${result.durationMs}ms)`
        : `${result.error || 'Invalid'} (${result.durationMs}ms)`;
      console.log(`  ${prefix} [${index}/${total}] ${station.name} -> ${detail}`);
    }
  });

  console.log('\n========================================');
  console.log('Stream Validation Summary:');
  console.log(`Total: ${catalogResult.total} | Passed: [PASS] ${catalogResult.passed} | Failed: [FAIL] ${catalogResult.failed}`);
  console.log('========================================');

  return catalogResult.failed === 0;
}

// Auto-run CLI when invoked directly from command line
const isDirectCli = process.argv[1] && (
  process.argv[1].endsWith('validate-streams.js') ||
  (import.meta.url && import.meta.url === `file://${process.argv[1]}`)
);

if (isDirectCli) {
  runCli().then((success) => {
    process.exit(success ? 0 : 1);
  }).catch((err) => {
    console.error(`[FAIL] Uncaught CLI exception: ${err?.message}`);
    process.exit(1);
  });
}
