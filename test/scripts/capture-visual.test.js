import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import {
  IDENTIFIER_REGEX,
  parseArgs,
  VIEWPORT_PRESETS,
  buildArtifactPath,
  findChromeBinary,
  setupProfileDir,
  createEphemeralServer,
  createCdpClient,
  waitForDevToolsActivePort,
  waitForHydration
} from '../../scripts/capture-visual.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('Visual Artifact Capture Runner Suite', async (t) => {
  await t.test('parseArgs applies default arguments when none are provided', () => {
    const opts = parseArgs([]);
    assert.equal(opts.feature, 'stage');
    assert.equal(opts.phase, 'before');
    assert.equal(opts.scope, 'stage');
    assert.equal(opts.state, 'idle');
    assert.equal(opts.viewport, 'all');
    assert.equal(opts.timeout, 30000);
    assert.equal(opts.delay, 500);
    assert.equal(opts.route, '#/');
    assert.equal(opts.chromePath, null);
    assert.equal(opts.help, false);
  });

  await t.test('parseArgs parses custom CLI flags accurately', () => {
    const opts = parseArgs([
      '--feature=browse-sheet',
      '--phase=after',
      '--scope=browse-sheet-radio',
      '--state=buffering',
      '--viewport=mobile-390x844',
      '--timeout=15000',
      '--delay=1200',
      '--route=#/browse?tab=radio',
      '--chrome-path=/usr/bin/google-chrome'
    ]);

    assert.equal(opts.feature, 'browse-sheet');
    assert.equal(opts.phase, 'after');
    assert.equal(opts.scope, 'browse-sheet-radio');
    assert.equal(opts.state, 'buffering');
    assert.equal(opts.viewport, 'mobile-390x844');
    assert.equal(opts.timeout, 15000);
    assert.equal(opts.delay, 1200);
    assert.equal(opts.route, '#/browse?tab=radio');
    assert.equal(opts.chromePath, '/usr/bin/google-chrome');
    assert.equal(opts.help, false);
  });

  await t.test('parseArgs parses short and long help flags', () => {
    assert.equal(parseArgs(['--help']).help, true);
    assert.equal(parseArgs(['-h']).help, true);
  });

  await t.test('parseArgs rejects invalid phase', () => {
    assert.throws(
      () => parseArgs(['--phase=invalid']),
      /Invalid --phase: "invalid"\. Must be "before" or "after"\./
    );
  });

  await t.test('parseArgs rejects invalid viewport', () => {
    assert.throws(
      () => parseArgs(['--viewport=tablet-1024x768']),
      /Invalid --viewport: "tablet-1024x768"\./
    );
  });

  await t.test('VIEWPORT_PRESETS defines exact desktop and mobile specifications', () => {
    assert.deepEqual(VIEWPORT_PRESETS['desktop-1280x800'], {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
      hasTouch: false
    });

    assert.deepEqual(VIEWPORT_PRESETS['mobile-390x844'], {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      hasTouch: true
    });
  });

  await t.test('buildArtifactPath formats deterministic repository-relative path', () => {
    const relPath = buildArtifactPath({
      feature: 'stage',
      scope: 'stage',
      state: 'idle',
      viewportKey: 'desktop-1280x800',
      phase: 'before'
    });

    assert.equal(
      relPath,
      'docs/artifacts/visual/stage/stage-idle-desktop-1280x800-before.png'
    );
  });

  await t.test('findChromeBinary validates custom path or auto-detects system Chrome', () => {
    assert.throws(
      () => findChromeBinary('/nonexistent/chrome/binary'),
      /Specified --chrome-path does not exist/
    );

    const binary = findChromeBinary();
    assert.ok(binary, 'Must detect Chrome or Chromium binary on test system');
    assert.ok(fs.existsSync(binary), 'Detected binary path must exist');
  });

  await t.test('setupProfileDir creates isolated directories under runDir and CBCM bypass token (F4)', () => {
    const scratchDir = path.join(ROOT_DIR, 'scratch', 'test-setup-profile');
    try {
      const paths = setupProfileDir(scratchDir);

      assert.ok(fs.existsSync(paths.runDir), 'runDir must exist');
      assert.ok(fs.existsSync(paths.profileDir), 'profileDir must exist');
      assert.ok(fs.existsSync(paths.homeDir), 'homeDir must exist');
      assert.ok(fs.existsSync(paths.configDir), 'configDir must exist');
      assert.ok(fs.existsSync(paths.cacheDir), 'cacheDir must exist');
      assert.ok(fs.existsSync(paths.tmpDir), 'tmpDir must exist');

      assert.equal(path.dirname(paths.profileDir), paths.runDir, 'profileDir must be scoped under runDir');
      assert.equal(path.dirname(paths.homeDir), paths.runDir, 'homeDir must be scoped under runDir');
      assert.equal(path.dirname(paths.tmpDir), paths.runDir, 'tmpDir must be scoped under runDir');

      const policyDir = path.join(paths.profileDir, 'Policy', 'Enrollment');
      assert.ok(fs.existsSync(policyDir), 'Policy/Enrollment must exist');

      const tokenFiles = fs.readdirSync(policyDir);
      assert.ok(tokenFiles.length > 0, 'At least one CBCM bypass token file must be written');
      const content = fs.readFileSync(path.join(policyDir, tokenFiles[0]), 'utf8');
      assert.equal(content, 'INVALID_DM_TOKEN');
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  await t.test('createEphemeralServer starts, serves index.html, and shuts down cleanly', async () => {
    const serverInstance = await createEphemeralServer(ROOT_DIR);
    assert.ok(serverInstance.port > 0, 'Port must be a positive integer');
    assert.equal(serverInstance.baseUrl, `http://127.0.0.1:${serverInstance.port}`);

    // Verify HTTP response
    const res = await new Promise((resolve, reject) => {
      http.get(`${serverInstance.baseUrl}/index.html`, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => resolve({ statusCode: response.statusCode, body }));
      }).on('error', reject);
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('LocalJam'), 'Response body must include LocalJam');

    // Close server
    await serverInstance.close();
  });

  await t.test('waitForDevToolsActivePort reads port and path from active port file', async () => {
    const tempDir = path.join(ROOT_DIR, 'scratch', 'test-active-port');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const portPromise = waitForDevToolsActivePort(tempDir, 1000);

      // Write mock file after 50ms
      setTimeout(() => {
        fs.writeFileSync(
          path.join(tempDir, 'DevToolsActivePort'),
          '9222\n/devtools/browser/abc-123\n'
        );
      }, 50);

      const res = await portPromise;
      assert.equal(res.port, 9222);
      assert.equal(res.browserPath, '/devtools/browser/abc-123');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('waitForDevToolsActivePort times out if file is not found', async () => {
    const tempDir = path.join(ROOT_DIR, 'scratch', 'test-port-timeout');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      await assert.rejects(
        () => waitForDevToolsActivePort(tempDir, 100),
        /Timed out waiting for DevToolsActivePort/
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('createCdpClient sends commands, resolves results, and handles errors', async () => {
    // Mock WebSocket implementation for unit test
    class MockWebSocket {
      constructor() {
        this.listeners = new Map();
        this.sent = [];
      }

      addEventListener(event, fn) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(fn);
      }

      removeEventListener(event, fn) {
        const arr = this.listeners.get(event) || [];
        this.listeners.set(event, arr.filter(f => f !== fn));
      }

      emit(event, data) {
        const arr = this.listeners.get(event) || [];
        for (const fn of arr) fn(data);
      }

      send(str) {
        const parsed = JSON.parse(str);
        this.sent.push(parsed);

        // Echo back based on method
        setTimeout(() => {
          if (parsed.method === 'Error.method') {
            this.emit('message', { data: JSON.stringify({ id: parsed.id, error: { message: 'Method failed' } }) });
          } else {
            this.emit('message', { data: JSON.stringify({ id: parsed.id, result: { success: true, method: parsed.method } }) });
          }
        }, 10);
      }

      close() {
        this.emit('close', {});
      }
    }

    const mockWs = new MockWebSocket();
    const cdp = createCdpClient(mockWs);

    const res = await cdp.send('Page.enable');
    assert.deepEqual(res, { success: true, method: 'Page.enable' });

    await assert.rejects(
      () => cdp.send('Error.method'),
      /CDP Error \[Error\.method\]: Method failed/
    );

    assert.equal(mockWs.sent.length, 2);
    assert.equal(mockWs.sent[0].id, 1);
    assert.equal(mockWs.sent[1].id, 2);
  });

  await t.test('parseArgs rejects directory traversal and invalid identifiers (F1)', () => {
    const traversalInputs = [
      '../../etc',
      '..\\windows',
      '/absolute/path',
      'path/traversal',
      'path\\traversal',
      '-leading-dash',
      'trailing-dash-',
      'double--dash',
      'special@char',
      'space char',
      'dot.segment',
      ''
    ];

    for (const input of traversalInputs) {
      assert.throws(
        () => parseArgs([`--feature=${input}`]),
        /Invalid --feature:/,
        `Must reject invalid feature: "${input}"`
      );
      assert.throws(
        () => parseArgs([`--scope=${input}`]),
        /Invalid --scope:/,
        `Must reject invalid scope: "${input}"`
      );
      assert.throws(
        () => parseArgs([`--state=${input}`]),
        /Invalid --state:/,
        `Must reject invalid state: "${input}"`
      );
    }
  });

  await t.test('buildArtifactPath rejects directory traversal and invalid identifiers (F1, F7)', () => {
    const invalidInputs = ['../../etc', '..\\windows', 'path/sub', '-leading', 'trailing-', 'bad@char'];
    for (const invalid of invalidInputs) {
      assert.throws(
        () => buildArtifactPath({
          feature: invalid,
          scope: 'stage',
          state: 'idle',
          viewportKey: 'desktop-1280x800',
          phase: 'before'
        }),
        /Invalid feature:/
      );
      assert.throws(
        () => buildArtifactPath({
          feature: 'stage',
          scope: invalid,
          state: 'idle',
          viewportKey: 'desktop-1280x800',
          phase: 'before'
        }),
        /Invalid scope:/
      );
      assert.throws(
        () => buildArtifactPath({
          feature: 'stage',
          scope: 'stage',
          state: invalid,
          viewportKey: 'desktop-1280x800',
          phase: 'before'
        }),
        /Invalid state:/
      );
    }
  });

  await t.test('canonical path containment verifies valid artifact directory placement (F1, F7)', () => {
    const targetBase = path.resolve(ROOT_DIR, 'docs', 'artifacts', 'visual');
    const validRelPath = buildArtifactPath({
      feature: 'browse-sheet',
      scope: 'browse-sheet-radio',
      state: 'buffering',
      viewportKey: 'mobile-390x844',
      phase: 'after'
    });
    const fullPath = path.resolve(ROOT_DIR, validRelPath);
    assert.ok(
      fullPath.startsWith(targetBase + path.sep),
      `Canonical path "${fullPath}" must be contained within "${targetBase + path.sep}"`
    );

    // Simulated path traversal outside targetBase
    const escapingPath = path.resolve(targetBase, '..', '..', 'evil.png');
    assert.equal(
      escapingPath.startsWith(targetBase + path.sep),
      false,
      'Escaping path must fail containment verification'
    );
  });

  await t.test('waitForDevToolsActivePort fast-fails immediately on premature Chrome exit (F6)', async () => {
    const tempDir = path.join(ROOT_DIR, 'scratch', 'test-fast-fail');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const mockChrome = new EventEmitter();
      mockChrome.exitCode = null;
      mockChrome.signalCode = null;
      mockChrome.stderr = new EventEmitter();

      const waitPromise = waitForDevToolsActivePort(tempDir, 5000, mockChrome);

      // Simulate stderr and premature exit
      setTimeout(() => {
        mockChrome.stderr.emit('data', 'Fatal error: swiftshader initialization failure\n');
        mockChrome.emit('exit', 1, null);
      }, 50);

      await assert.rejects(
        () => waitPromise,
        /Chrome process exited prematurely with code 1 before DevToolsActivePort was written\.\s+Chrome stderr: Fatal error: swiftshader initialization failure/
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('waitForDevToolsActivePort fast-fails immediately if Chrome has already exited (F6)', async () => {
    const tempDir = path.join(ROOT_DIR, 'scratch', 'test-already-exited');
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const mockChrome = new EventEmitter();
      mockChrome.exitCode = 127;
      mockChrome.signalCode = null;
      mockChrome.stderr = new EventEmitter();

      await assert.rejects(
        () => waitForDevToolsActivePort(tempDir, 5000, mockChrome),
        /Chrome process already exited with code 127 before waiting for DevToolsActivePort\./
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('waitForHydration polls for mounted stage-viewport and resolves after paint (F3)', async () => {
    let callCount = 0;
    const mockPageClient = {
      send: async (method, params) => {
        if (method === 'Runtime.evaluate') {
          if (params.expression.includes('.stage-viewport')) {
            callCount++;
            // Return false on first poll, true on second
            return { result: { type: 'boolean', value: callCount >= 2 } };
          }
          if (params.expression.includes('document.fonts')) {
            return { result: { type: 'undefined' } };
          }
        }
        return { result: {} };
      }
    };

    const res = await waitForHydration(mockPageClient, 2000);
    assert.equal(res, true, 'waitForHydration must resolve true once mounted');
    assert.ok(callCount >= 2, 'Must have polled multiple times until component appeared');
  });

  await t.test('waitForHydration throws descriptive error when hydration times out (F3)', async () => {
    const mockPageClient = {
      send: async (method, params) => {
        if (method === 'Runtime.evaluate' && params.expression.includes('.stage-viewport')) {
          return { result: { type: 'boolean', value: false } };
        }
        return { result: {} };
      }
    };

    await assert.rejects(
      () => waitForHydration(mockPageClient, 80),
      /Component hydration timed out after 80ms waiting for mounted \.stage-viewport element\./
    );
  });
});
