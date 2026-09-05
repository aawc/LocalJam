/**
 * LocalJam - Zero-Dependency Local Development Server
 * Supports HTTP Range requests for audio streaming and correct PWA MIME types.
 * Fully RFC 9110 compliant for byte-range serving.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg; codecs=opus',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

export function createServer(rootDirectory = __dirname) {
  return http.createServer(async (req, res) => {
    // Security & Access Control Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; media-src 'self' data: https: http: blob:; connect-src 'self' https: http:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';");

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    let filePath = '';
    try {
      const rawPath = (req.url || '/').split('?')[0];
      let pathname;
      try {
        pathname = decodeURIComponent(rawPath);
      } catch (uriErr) {
        console.error(`[LocalJam Server] URI decode error: ${uriErr.message} for path ${rawPath}`);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('400 Bad Request');
        return;
      }

      if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
      }

      // Canonical root and path normalization to strictly prevent directory traversal (SEC-01)
      const canonicalRoot = path.resolve(rootDirectory);
      const cleanRelPath = pathname.replace(/^[/\\]+/, '');
      const resolvedPath = path.resolve(canonicalRoot, cleanRelPath || 'index.html');

      // Verify that the target path is strictly contained within the canonical root directory
      if (resolvedPath !== canonicalRoot && !resolvedPath.startsWith(canonicalRoot + path.sep)) {
        console.warn(`[LocalJam Server] Forbidden path traversal attempt blocked: ${pathname} -> ${resolvedPath}`);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
      }

      filePath = resolvedPath;

      // Check file existence and stats
      let stat;
      try {
        stat = await fs.promises.stat(filePath);
        if (stat.isDirectory()) {
          filePath = path.join(filePath, 'index.html');
          const indexResolved = path.resolve(filePath);
          if (!indexResolved.startsWith(canonicalRoot + path.sep)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('403 Forbidden');
            return;
          }
          stat = await fs.promises.stat(filePath);
        }
      } catch (statErr) {
        if (statErr.code !== 'ENOENT') {
          console.error(`[LocalJam Server] File access error (${statErr.code || statErr.name}): ${statErr.message} [path: ${filePath}]`);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 Internal Server Error');
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileSize = stat.size;

      // Handle Range request for audio/video streaming per RFC 9110
      const range = req.headers.range;
      if (range) {
        const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (!rangeMatch) {
          res.writeHead(416, { 'Content-Range': `bytes */${fileSize}`, 'Content-Type': 'text/plain' });
          res.end('Requested Range Not Satisfiable');
          return;
        }

        let start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : undefined;
        let end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : undefined;

        if (start === undefined && end !== undefined) {
          // Suffix range: bytes=-N (last N bytes)
          if (end === 0 || fileSize === 0) {
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}`, 'Content-Type': 'text/plain' });
            res.end('Requested Range Not Satisfiable');
            return;
          }
          start = Math.max(0, fileSize - end);
          end = fileSize - 1;
        } else if (start !== undefined) {
          // Normal or open-ended range
          if (end === undefined || end >= fileSize) {
            end = fileSize - 1;
          }
        }

        if (start === undefined || isNaN(start) || isNaN(end) || start >= fileSize || start > end) {
          res.writeHead(416, {
            'Content-Range': `bytes */${fileSize}`,
            'Content-Type': 'text/plain'
          });
          res.end('Requested Range Not Satisfiable');
          return;
        }

        const chunkSize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache'
        });

        if (req.method === 'HEAD') {
          res.end();
          return;
        }

        const stream = fs.createReadStream(filePath, { start, end });
        stream.on('error', (streamErr) => {
          console.error(`[LocalJam Server] Stream error (${streamErr.code || streamErr.name}): ${streamErr.message} [path: ${filePath}]`);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
          }
          res.end('500 Internal Server Error');
        });
        stream.pipe(res);
        return;
      }

      // Standard Full Content Response
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': ext === '.html' || ext === '.webmanifest' ? 'no-cache' : 'public, max-age=3600'
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.on('error', (streamErr) => {
        console.error(`[LocalJam Server] Stream error (${streamErr.code || streamErr.name}): ${streamErr.message} [path: ${filePath}]`);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
        }
        res.end('500 Internal Server Error');
      });
      stream.pipe(res);
    } catch (err) {
      console.error(`[LocalJam Server] Request error (${err.name}): ${err.message}`, err.stack);
      if (!res.headersSent) {
        const isClientError = err instanceof URIError;
        const statusCode = isClientError ? 400 : 500;
        res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
        res.end(isClientError ? '400 Bad Request' : '500 Internal Server Error');
      } else {
        res.end();
      }
    }
  });
}

// Start server when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`[LocalJam Server] Listening on http://${HOST}:${PORT}`);
  });
}
