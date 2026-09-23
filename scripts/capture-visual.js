/**
 * LocalJam - Zero-Dependency Headless Visual Artifact Capture Runner
 * Drives headless Chrome with SwiftShader software WebGL/rasterization
 * via Chrome DevTools Protocol (CDP) over native WebSocket.
 * Produces before/after screenshot artifacts in docs/artifacts/visual/<feature>/
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Standard Viewport Presets (§Task Execution & Verification Standards)
 */
export const VIEWPORT_PRESETS = Object.freeze({
  'desktop-1280x800': Object.freeze({
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
    hasTouch: false
  }),
  'mobile-390x844': Object.freeze({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    hasTouch: true
  })
});

/**
 * Regex for strictly validating kebab-case alphanumeric identifiers
 * to prevent directory traversal and invalid path segments.
 */
export const IDENTIFIER_REGEX = /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/;

/**
 * Parses and validates CLI arguments.
 * @param {string[]} argv
 * @returns {Record<string, any>}
 */
export function parseArgs(argv = []) {
  const options = {
    feature: 'stage',
    phase: 'before',
    scope: 'stage',
    state: 'idle',
    viewport: 'all',
    timeout: 30000,
    delay: 500,
    route: '#/',
    chromePath: null,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('--feature=')) {
      options.feature = arg.slice(10).trim();
    } else if (arg === '--feature' && i + 1 < argv.length) {
      options.feature = argv[++i].trim();
    } else if (arg.startsWith('--phase=')) {
      options.phase = arg.slice(8).trim();
    } else if (arg === '--phase' && i + 1 < argv.length) {
      options.phase = argv[++i].trim();
    } else if (arg.startsWith('--scope=')) {
      options.scope = arg.slice(8).trim();
    } else if (arg === '--scope' && i + 1 < argv.length) {
      options.scope = argv[++i].trim();
    } else if (arg.startsWith('--state=')) {
      options.state = arg.slice(8).trim();
    } else if (arg === '--state' && i + 1 < argv.length) {
      options.state = argv[++i].trim();
    } else if (arg.startsWith('--viewport=')) {
      options.viewport = arg.slice(11).trim();
    } else if (arg === '--viewport' && i + 1 < argv.length) {
      options.viewport = argv[++i].trim();
    } else if (arg.startsWith('--timeout=')) {
      options.timeout = parseInt(arg.slice(10).trim(), 10) || options.timeout;
    } else if (arg === '--timeout' && i + 1 < argv.length) {
      options.timeout = parseInt(argv[++i].trim(), 10) || options.timeout;
    } else if (arg.startsWith('--delay=')) {
      options.delay = parseInt(arg.slice(8).trim(), 10) || options.delay;
    } else if (arg === '--delay' && i + 1 < argv.length) {
      options.delay = parseInt(argv[++i].trim(), 10) || options.delay;
    } else if (arg.startsWith('--route=')) {
      options.route = arg.slice(8).trim();
    } else if (arg === '--route' && i + 1 < argv.length) {
      options.route = argv[++i].trim();
    } else if (arg.startsWith('--chrome-path=')) {
      options.chromePath = arg.slice(14).trim();
    } else if (arg === '--chrome-path' && i + 1 < argv.length) {
      options.chromePath = argv[++i].trim();
    }
  }

  // Validate phase
  if (options.phase !== 'before' && options.phase !== 'after') {
    throw new Error(`Invalid --phase: "${options.phase}". Must be "before" or "after".`);
  }

  // Validate viewport
  const validViewports = ['all', ...Object.keys(VIEWPORT_PRESETS)];
  if (!validViewports.includes(options.viewport)) {
    throw new Error(`Invalid --viewport: "${options.viewport}". Must be "all" or one of: ${Object.keys(VIEWPORT_PRESETS).join(', ')}.`);
  }

  // Strictly validate feature, scope, and state against IDENTIFIER_REGEX (F1)
  for (const field of ['feature', 'scope', 'state']) {
    if (!IDENTIFIER_REGEX.test(options[field])) {
      throw new Error(
        `Invalid --${field}: "${options[field]}". Must match /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/ (alphanumeric kebab-case, no traversal or special characters).`
      );
    }
  }

  return options;
}

/**
 * Builds the deterministic repository-relative artifact path.
 * Validates identifiers and verifies canonical path containment.
 * @param {object} params
 * @param {string} params.feature
 * @param {string} params.scope
 * @param {string} params.state
 * @param {string} params.viewportKey
 * @param {string} params.phase
 * @returns {string}
 */
export function buildArtifactPath({ feature, scope, state, viewportKey, phase }) {
  for (const [field, value] of Object.entries({ feature, scope, state })) {
    if (!IDENTIFIER_REGEX.test(value)) {
      throw new Error(
        `Invalid ${field}: "${value}". Must match /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/ (alphanumeric kebab-case, no traversal or special characters).`
      );
    }
  }
  const fileName = `${scope}-${state}-${viewportKey}-${phase}.png`;
  const relPath = path.posix.join('docs', 'artifacts', 'visual', feature, fileName);
  const normalized = path.posix.normalize(relPath);
  if (!normalized.startsWith('docs/artifacts/visual/')) {
    throw new Error(`Path traversal attempt detected: "${relPath}"`);
  }
  return normalized;
}

/**
 * Discovers the Chrome or Chromium binary executable.
 * @param {string|null} [overridePath]
 * @returns {string}
 */
export function findChromeBinary(overridePath = null) {
  if (overridePath) {
    if (fs.existsSync(overridePath)) {
      return overridePath;
    }
    throw new Error(`Specified --chrome-path does not exist: "${overridePath}"`);
  }

  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  if (process.env.GOOGLE_CHROME_BIN && fs.existsSync(process.env.GOOGLE_CHROME_BIN)) {
    return process.env.GOOGLE_CHROME_BIN;
  }

  const platform = process.platform;
  let candidates = [];

  if (platform === 'linux') {
    candidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
  } else if (platform === 'darwin') {
    candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
  } else if (platform === 'win32') {
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    candidates = [
      path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe')
    ];
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'No Chrome/Chromium binary found. Please specify --chrome-path or set CHROME_PATH environment variable.'
  );
}

/**
 * Prepares an isolated scratch directory structure and writes CBCM bypass token
 * to prevent enterprise cloud policy enrollment from stalling headless launch.
 * Scopes all temporary folders under a single unique run directory.
 * @param {string} scratchDir
 * @returns {{ runDir: string, profileDir: string, homeDir: string, configDir: string, cacheDir: string, tmpDir: string }}
 */
export function setupProfileDir(scratchDir) {
  const rand = Math.random().toString(36).slice(2, 8);
  const runDir = path.join(scratchDir, `chrome-run-${Date.now()}-${rand}`);
  const profileDir = path.join(runDir, 'profile');
  const homeDir = path.join(runDir, 'home');
  const configDir = path.join(homeDir, '.config');
  const cacheDir = path.join(homeDir, '.cache');
  const tmpDir = path.join(runDir, 'tmp');

  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  // Chrome Browser Cloud Management (CBCM) Bypass:
  // On Linux hosts with managed enterprise enrollment tokens (/etc/opt/chrome/policies/enrollment),
  // Chrome headless blocks during startup waiting for token enrollment. Writing an INVALID_DM_TOKEN
  // into <profileDir>/Policy/Enrollment/<clientId> causes Chrome to skip the blocking enrollment wait.
  const policyEnrollDir = path.join(profileDir, 'Policy', 'Enrollment');
  fs.mkdirSync(policyEnrollDir, { recursive: true });

  const clientIds = new Set(['pN3hlGkuGdu2aHHmrvYgBtiOdG0']);
  try {
    if (fs.existsSync('/etc/machine-id')) {
      const machineId = fs.readFileSync('/etc/machine-id', 'utf8').trim();
      if (machineId) {
        clientIds.add(crypto.createHash('sha1').update(machineId).digest('base64url'));
      }
    }
  } catch {
    // Non-fatal if machine-id is inaccessible
  }

  for (const id of clientIds) {
    fs.writeFileSync(path.join(policyEnrollDir, id), 'INVALID_DM_TOKEN');
  }

  return { runDir, profileDir, homeDir, configDir, cacheDir, tmpDir };
}

/**
 * Spawns an ephemeral instance of the local server on 127.0.0.1:0.
 * @param {string} rootDir
 * @returns {Promise<{ server: http.Server, port: number, baseUrl: string, close: () => Promise<void> }>}
 */
export function createEphemeralServer(rootDir = REPO_ROOT) {
  return new Promise((resolve, reject) => {
    const server = createServer(rootDir);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res))
      });
    });
    server.on('error', reject);
  });
}

/**
 * Spawns Chrome in headless SwiftShader mode with environment isolation.
 * @param {string} chromePath
 * @param {ReturnType<typeof setupProfileDir>} profilePaths
 * @returns {import('node:child_process').ChildProcess}
 */
export function launchChrome(chromePath, profilePaths) {
  const flags = [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--no-zygote',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--allow-file-access-from-files',
    '--disable-web-security',
    '--no-proxy-server',
    '--proxy-bypass-list=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${profilePaths.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-client-side-phishing-detection',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--disable-translate',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--metrics-recording-only',
    '--safebrowsing-disable-auto-update',
    '--mute-audio',
    '--hide-scrollbars',
    'about:blank'
  ];

  // Chromium's ProcessSingletonPosix creates a UNIX domain socket in TMPDIR
  // with format: <TMPDIR>/com.google.Chrome.XXXXXX/SingletonSocket (up to 42 extra chars).
  // On Linux, sockaddr_un.sun_path is strictly limited to 108 bytes (107 chars + NUL).
  // If profilePaths.tmpDir is too long, using it as TMPDIR causes Chrome to fatal crash with SIGABRT.
  const maxSafeTmpLen = 107 - 45;
  const safeTmpDir = (profilePaths.tmpDir && profilePaths.tmpDir.length <= maxSafeTmpLen)
    ? profilePaths.tmpDir
    : (process.env.TMPDIR || '/tmp');

  const env = {
    ...process.env,
    HOME: profilePaths.homeDir,
    XDG_CONFIG_HOME: profilePaths.configDir,
    XDG_CACHE_HOME: profilePaths.cacheDir,
    TMPDIR: safeTmpDir
  };
  delete env.http_proxy;
  delete env.https_proxy;
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
  delete env.all_proxy;
  delete env.ALL_PROXY;

  return spawn(chromePath, flags, {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

/**
 * Polls for the DevToolsActivePort file written by Chrome when --remote-debugging-port=0.
 * Fast-fails immediately if chromeProcess terminates prematurely during startup.
 * @param {string} profileDir
 * @param {number} [timeoutMs]
 * @param {import('node:child_process').ChildProcess|any} [chromeProcess]
 * @returns {Promise<{ port: number, browserPath: string }>}
 */
export function waitForDevToolsActivePort(profileDir, timeoutMs = 10000, chromeProcess = null) {
  if (typeof timeoutMs === 'object' && timeoutMs !== null && typeof timeoutMs.on === 'function') {
    chromeProcess = timeoutMs;
    timeoutMs = 10000;
  }

  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    let checkTimer = null;
    let stderrOutput = '';

    const cleanupListeners = () => {
      if (checkTimer) {
        clearTimeout(checkTimer);
        checkTimer = null;
      }
      if (chromeProcess && typeof chromeProcess.removeListener === 'function') {
        chromeProcess.removeListener('exit', onProcessExit);
        chromeProcess.removeListener('error', onProcessError);
        if (chromeProcess.stderr && typeof chromeProcess.stderr.removeListener === 'function') {
          chromeProcess.stderr.removeListener('data', onStderrData);
        }
      }
    };

    const onStderrData = (chunk) => {
      stderrOutput += chunk.toString();
      if (stderrOutput.length > 4096) {
        stderrOutput = stderrOutput.slice(-4096);
      }
    };

    const onProcessExit = (code, signal) => {
      cleanupListeners();
      const exitInfo = code !== null ? `code ${code}` : `signal ${signal}`;
      const stderrMsg = stderrOutput.trim() ? `\nChrome stderr: ${stderrOutput.trim()}` : '';
      reject(new Error(`Chrome process exited prematurely with ${exitInfo} before DevToolsActivePort was written.${stderrMsg}`));
    };

    const onProcessError = (err) => {
      cleanupListeners();
      reject(new Error(`Chrome process failed to spawn: ${err.message}`));
    };

    if (chromeProcess) {
      if (chromeProcess.exitCode !== null || chromeProcess.signalCode !== null) {
        const exitInfo = chromeProcess.exitCode !== null
          ? `code ${chromeProcess.exitCode}`
          : `signal ${chromeProcess.signalCode}`;
        return reject(new Error(`Chrome process already exited with ${exitInfo} before waiting for DevToolsActivePort.`));
      }
      if (typeof chromeProcess.once === 'function') {
        chromeProcess.once('exit', onProcessExit);
        chromeProcess.once('error', onProcessError);
      }
      if (chromeProcess.stderr && typeof chromeProcess.stderr.on === 'function') {
        chromeProcess.stderr.on('data', onStderrData);
      }
    }

    const check = () => {
      if (fs.existsSync(portFile)) {
        try {
          const content = fs.readFileSync(portFile, 'utf8');
          const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length >= 2) {
            const port = parseInt(lines[0], 10);
            const browserPath = lines[1];
            if (port > 0 && browserPath) {
              cleanupListeners();
              return resolve({ port, browserPath });
            }
          }
        } catch {
          // File might be mid-write; retry
        }
      }

      if (Date.now() - startTime >= timeoutMs) {
        cleanupListeners();
        return reject(new Error(`Timed out waiting for DevToolsActivePort after ${timeoutMs}ms`));
      }

      checkTimer = setTimeout(check, 50);
    };

    check();
  });
}

/**
 * Creates a lightweight Chrome DevTools Protocol (CDP) client over a WebSocket instance.
 * @param {WebSocket|any} ws
 * @param {number} [defaultTimeoutMs]
 * @returns {{ ws: any, send: (method: string, params?: object, timeoutMs?: number) => Promise<any>, close: () => void }}
 */
export function createCdpClient(ws, defaultTimeoutMs = 15000) {
  let messageId = 1;

  function send(method, params = {}, timeoutMs = defaultTimeoutMs) {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      let timer = null;

      const onMessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            if (timer) clearTimeout(timer);
            ws.removeEventListener('message', onMessage);
            if (data.error) {
              reject(new Error(`CDP Error [${method}]: ${data.error.message || JSON.stringify(data.error)}`));
            } else {
              resolve(data.result);
            }
          }
        } catch {
          // Ignore parse errors from unrelated frames
        }
      };

      ws.addEventListener('message', onMessage);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          ws.removeEventListener('message', onMessage);
          reject(new Error(`CDP command "${method}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  return {
    ws,
    send,
    close: () => {
      try {
        ws.close();
      } catch {
        // Ignore close error
      }
    }
  };
}

/**
 * Waits for the DOM to hydrate and mount the Stage viewport element,
 * awaiting document fonts and a double requestAnimationFrame paint cycle.
 * @param {ReturnType<typeof createCdpClient>} pageClient
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export async function waitForHydration(pageClient, timeoutMs = 10000) {
  const startTime = Date.now();
  const pollInterval = 50;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const evalResult = await pageClient.send('Runtime.evaluate', {
        expression: `(() => {
          const stage = document.querySelector('#stage-root > .stage-viewport') || document.querySelector('.stage-viewport');
          return Boolean(stage);
        })()`,
        returnByValue: true
      });

      const isMounted = evalResult?.result?.value === true || evalResult?.value === true;
      if (isMounted) {
        // Stage component is mounted. Await fonts and double requestAnimationFrame paint cycle.
        await pageClient.send('Runtime.evaluate', {
          expression: `(async () => {
            if (document.fonts && document.fonts.ready) {
              try {
                await document.fonts.ready;
              } catch {}
            }
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          })()`,
          awaitPromise: true,
          returnByValue: true
        });
        return true;
      }
    } catch {
      // Execution context may be reloading/navigating; continue polling until timeout
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error(
    `Component hydration timed out after ${timeoutMs}ms waiting for mounted .stage-viewport element.`
  );
}

/**
 * Executes visual artifact capture for the requested scope, state, and viewports.
 * @param {Record<string, any>} options
 * @param {string} [rootDir]
 * @returns {Promise<Array<{ path: string, fullPath: string, bytes: number, viewport: string }>>}
 */
export async function captureArtifacts(options, rootDir = REPO_ROOT) {
  const scratchDir = path.join(rootDir, 'scratch');
  fs.mkdirSync(scratchDir, { recursive: true });

  const chromePath = findChromeBinary(options.chromePath);
  const profilePaths = setupProfileDir(scratchDir);

  let ephemeralServer = null;
  let chromeProcess = null;
  let browserClient = null;
  let pageClient = null;

  const capturedArtifacts = [];

  let cleanupPromise = null;
  const safeCleanup = async () => {
    if (cleanupPromise) {
      return cleanupPromise;
    }
    cleanupPromise = (async () => {
      if (pageClient) {
        try { pageClient.close(); } catch {}
        pageClient = null;
      }
      if (browserClient) {
        try { browserClient.close(); } catch {}
        browserClient = null;
      }
      if (chromeProcess && chromeProcess.exitCode === null && chromeProcess.signalCode === null) {
        await new Promise((resolve) => {
          const timer = setTimeout(() => {
            try {
              if (chromeProcess.exitCode === null && chromeProcess.signalCode === null) {
                chromeProcess.kill('SIGKILL');
              }
            } catch {}
            resolve();
          }, 1500);
          chromeProcess.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          try {
            chromeProcess.kill('SIGTERM');
          } catch {
            clearTimeout(timer);
            resolve();
          }
        });
        chromeProcess = null;
      }
      if (ephemeralServer) {
        try {
          await ephemeralServer.close();
        } catch {
          // Ignore server close errors
        }
        ephemeralServer = null;
      }
      try {
        if (profilePaths?.runDir && fs.existsSync(profilePaths.runDir)) {
          fs.rmSync(profilePaths.runDir, { recursive: true, force: true });
        } else if (profilePaths?.profileDir && fs.existsSync(profilePaths.profileDir)) {
          fs.rmSync(profilePaths.profileDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore directory removal race conditions
      }
    })();
    return cleanupPromise;
  };

  const sigintHandler = async () => {
    await safeCleanup();
    process.exit(130);
  };

  const sigtermHandler = async () => {
    await safeCleanup();
    process.exit(143);
  };

  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);

  try {
    // 1. Start local dev server on dynamic ephemeral port
    ephemeralServer = await createEphemeralServer(rootDir);

    // 2. Launch headless Chrome with SwiftShader
    chromeProcess = launchChrome(chromePath, profilePaths);

    // 3. Discover dynamic remote debugging port (with fast-fail on premature exit)
    const { port, browserPath } = await waitForDevToolsActivePort(
      profilePaths.profileDir,
      options.timeout,
      chromeProcess
    );

    // 4. Connect to browser WebSocket
    const browserWsUrl = `ws://127.0.0.1:${port}${browserPath}`;
    const browserWs = new globalThis.WebSocket(browserWsUrl);
    await new Promise((resolve, reject) => {
      browserWs.addEventListener('open', resolve, { once: true });
      browserWs.addEventListener('error', reject, { once: true });
    });
    browserClient = createCdpClient(browserWs, options.timeout);

    // 5. Create and attach to a new page target
    const { targetId } = await browserClient.send('Target.createTarget', { url: 'about:blank' });

    // Discover page WebSocket from /json/list
    const targetsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.id === targetId || (t.type === 'page' && t.webSocketDebuggerUrl));

    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error(`Failed to locate page target WebSocket for targetId ${targetId}`);
    }

    const pageWs = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      pageWs.addEventListener('open', resolve, { once: true });
      pageWs.addEventListener('error', reject, { once: true });
    });
    pageClient = createCdpClient(pageWs, options.timeout);

    await pageClient.send('Page.enable');
    await pageClient.send('Runtime.enable');

    // Determine target viewports
    const viewportKeys = options.viewport === 'all'
      ? Object.keys(VIEWPORT_PRESETS)
      : [options.viewport];

    for (const vpKey of viewportKeys) {
      const preset = VIEWPORT_PRESETS[vpKey];
      if (!preset) {
        throw new Error(`Unknown viewport preset: "${vpKey}"`);
      }

      // Emulate device metrics & touch
      await pageClient.send('Emulation.setDeviceMetricsOverride', {
        width: preset.width,
        height: preset.height,
        deviceScaleFactor: preset.deviceScaleFactor,
        mobile: preset.mobile,
        screenWidth: preset.width,
        screenHeight: preset.height
      });

      await pageClient.send('Emulation.setTouchEmulationEnabled', {
        enabled: Boolean(preset.hasTouch)
      });

      // Construct and navigate to target URL.
      // We attempt ephemeral server URL first, falling back to file:// URL if loopback network
      // is constrained in the sandbox environment.
      const cleanRoute = options.route.replace(/^#?\/?/, '#/');
      const httpUrl = `${ephemeralServer.baseUrl}/${cleanRoute}`;
      const fileUrl = `file://${path.resolve(rootDir, 'index.html')}${cleanRoute}`;

      let navSuccess = false;
      try {
        await pageClient.send('Page.navigate', { url: httpUrl }, 3000);
        navSuccess = true;
      } catch {
        // Fallback to direct file loading
      }
      if (!navSuccess) {
        await pageClient.send('Page.navigate', { url: fileUrl }, options.timeout);
      }

      // Wait for component hydration (F3)
      await waitForHydration(pageClient, options.timeout);

      if (options.delay > 0) {
        await new Promise(r => setTimeout(r, options.delay));
      }

      // Capture screenshot
      const shot = await pageClient.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false
      });

      const buffer = Buffer.from(shot.data, 'base64');
      const relPath = buildArtifactPath({
        feature: options.feature,
        scope: options.scope,
        state: options.state,
        viewportKey: vpKey,
        phase: options.phase
      });

      // Canonical path containment verification (F1)
      const targetBase = path.resolve(rootDir, 'docs', 'artifacts', 'visual');
      const fullPath = path.resolve(rootDir, relPath);
      if (!fullPath.startsWith(targetBase + path.sep)) {
        throw new Error(`Security Error: Path traversal attempt detected outside target directory: "${fullPath}"`);
      }

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, buffer);

      capturedArtifacts.push({
        path: `./${relPath}`,
        fullPath,
        bytes: buffer.length,
        viewport: vpKey
      });
    }

    return capturedArtifacts;
  } finally {
    process.removeListener('SIGINT', sigintHandler);
    process.removeListener('SIGTERM', sigtermHandler);
    await safeCleanup();
  }
}

/**
 * Main CLI runner.
 * @param {string[]} argv
 */
export async function runCli(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`[FAIL] Argument Error: ${err.message}`);
    process.exit(1);
  }

  if (opts.help) {
    console.log(`
LocalJam Visual Artifact Capture Runner
Usage:
  npm run capture -- [options]
  node scripts/capture-visual.js [options]

Options:
  --feature=<name>     Feature/component directory (default: stage)
  --phase=<before|after> Phase of visual verification (default: before)
  --scope=<name>       Component scope in kebab-case (default: stage)
  --state=<name>       Interaction state (default: idle)
  --viewport=<preset>  Viewport preset: desktop-1280x800, mobile-390x844, or all (default: all)
  --route=<hash>       App hash route (default: #/)
  --delay=<ms>         Settling delay before capture in milliseconds (default: 500)
  --timeout=<ms>       DevTools timeout in milliseconds (default: 30000)
  --chrome-path=<path> Custom Chrome/Chromium binary path
  -h, --help           Show this help message

Presets:
  desktop-1280x800     1280x800, 1x DPR, desktop
  mobile-390x844       390x844, 3x DPR, mobile with touch

Artifact Placement:
  ./docs/artifacts/visual/<feature>/<scope>-<state>-<viewport>-<phase>.png
`);
    process.exit(0);
  }

  console.log(`[START] Capturing [${opts.phase.toUpperCase()}] visual artifacts for [${opts.scope}] (state: ${opts.state})...`);

  try {
    const results = await captureArtifacts(opts, REPO_ROOT);
    for (const item of results) {
      console.log(`[PASS] Captured ${opts.phase.toUpperCase()} artifact: ${item.path} (${item.bytes} bytes, ${item.viewport})`);
    }
    console.log(`[SUCCESS] Captured ${results.length} visual artifact(s) successfully.`);
    process.exit(0);
  } catch (err) {
    console.error(`[FAIL] Visual capture failed: ${err.message}`);
    process.exit(1);
  }
}

// Execute CLI directly when invoked as script entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
