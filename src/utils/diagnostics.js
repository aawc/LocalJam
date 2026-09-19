/**
 * LocalJam - PWA Diagnostic State Collector & Report Generator
 * Captures comprehensive browser, Service Worker, storage, audio engine,
 * and playback telemetry to assist with troubleshooting and issue diagnosis.
 */

import { APP_VERSION } from '../version.js';
import { db as defaultDb } from '../storage/db.js';
import { audioEngine as defaultAudioEngine } from '../player/audio-engine.js';
import { queueManager as defaultQueueManager } from '../player/queue.js';
import { equalizer as defaultEqualizer } from '../player/equalizer.js';
import { audioVisualizer as defaultVisualizer } from '../visualizer/visualizer.js';

const MAX_ERROR_LOGS = 25;
const errorLogRingBuffer = [];

/**
 * Records a runtime diagnostic warning or error into an in-memory ring buffer.
 * @param {Error|string} error
 * @param {string} [context]
 */
export function recordDiagnosticError(error, context = '') {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      message: error?.message || String(error),
      name: error?.name || 'Error',
      stack: error?.stack ? String(error.stack).slice(0, 300) : null,
      context: context || null
    };

    errorLogRingBuffer.push(entry);
    if (errorLogRingBuffer.length > MAX_ERROR_LOGS) {
      errorLogRingBuffer.shift();
    }
  } catch (_) {}
}

/**
 * Returns a copy of recent recorded diagnostic errors.
 * @returns {Array<object>}
 */
export function getDiagnosticErrors() {
  return [...errorLogRingBuffer];
}

/**
 * Clears the diagnostic error ring buffer.
 */
export function clearDiagnosticErrors() {
  errorLogRingBuffer.length = 0;
}

/**
 * Converts a byte count into a human-readable size string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i] || 'B'}`;
}

/**
 * Detects the current PWA display mode.
 * @returns {'standalone'|'browser'|'minimal-ui'|'fullscreen'|'unknown'}
 */
export function detectDisplayMode() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'unknown';
  }
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return 'standalone';
  }
  if (window.matchMedia('(display-mode: minimal-ui)').matches) {
    return 'minimal-ui';
  }
  if (window.matchMedia('(display-mode: fullscreen)').matches) {
    return 'fullscreen';
  }
  if (window.matchMedia('(display-mode: browser)').matches) {
    return 'browser';
  }
  if (navigator?.standalone) {
    return 'standalone';
  }
  return 'browser';
}

/**
 * Captures comprehensive PWA local state across storage, audio, Service Worker, and environment.
 *
 * @param {{
 *   db?: object,
 *   audioEngine?: object,
 *   queueManager?: object,
 *   equalizer?: object,
 *   visualizer?: object
 * }} [deps]
 * @returns {Promise<object>}
 */
export async function captureDiagnostics(deps = {}) {
  const {
    db = defaultDb,
    audioEngine = defaultAudioEngine,
    queueManager = defaultQueueManager,
    equalizer = defaultEqualizer,
    visualizer = defaultVisualizer
  } = deps;

  const now = new Date();
  const result = {
    timestamp: now.toISOString(),
    localTime: now.toLocaleString(),
    app: {
      version: APP_VERSION,
      remoteVersion: typeof window !== 'undefined' ? (window.localjamRemoteVersionData?.version || null) : null,
      releaseDate: typeof window !== 'undefined' ? (window.localjamRemoteVersionData?.releaseDate || null) : null,
      isPwa: detectDisplayMode() === 'standalone',
      displayMode: detectDisplayMode(),
      online: typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : true,
      url: typeof window !== 'undefined' && window.location ? (window.location.origin + window.location.pathname + window.location.hash) : 'localhost'
    },
    environment: {
      userAgent: typeof navigator !== 'undefined' ? (navigator.userAgent || 'unknown') : 'Node.js',
      platform: typeof navigator !== 'undefined' ? (navigator.platform || navigator.userAgentData?.platform || 'unknown') : 'unknown',
      language: typeof navigator !== 'undefined' ? (navigator.language || 'en') : 'en',
      screen: typeof window !== 'undefined' && window.screen ? `${window.screen.width}x${window.screen.height} (DPR ${window.devicePixelRatio || 1})` : 'headless',
      viewport: typeof window !== 'undefined' ? `${window.innerWidth || 0}x${window.innerHeight || 0}` : 'headless',
      touch: typeof navigator !== 'undefined' && navigator.maxTouchPoints ? navigator.maxTouchPoints > 0 : false,
      maxTouchPoints: typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0
    },
    storage: {
      tier: typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' ? 'Tier 1 (FileSystemAccess API)' : 'Tier 2 (Session File Registry)',
      indexedDbSupported: typeof indexedDB !== 'undefined',
      quotaEstimate: null,
      storeCounts: {
        tracks: 0,
        missingTracks: 0,
        roots: 0,
        playlists: 0,
        favorites: 0,
        history: 0,
        stations: 0
      }
    },
    audio: {
      source: audioEngine?.isRadio ? 'Radio' : 'Local',
      playbackState: audioEngine?.isPlaying ? 'Playing' : (audioEngine?.isPaused ? 'Paused' : 'Stopped'),
      audioContextState: audioEngine?.audioCtx?.state || 'not_initialized',
      sampleRate: audioEngine?.audioCtx?.sampleRate || null,
      volume: typeof audioEngine?.volume === 'number' ? `${Math.round(audioEngine.volume * 100)}%` : '100%',
      muted: Boolean(audioEngine?.muted),
      equalizer: {
        preset: equalizer?.currentPreset || 'Flat',
        isCustom: Array.isArray(equalizer?.gains) ? equalizer.gains.some((g) => g !== 0) : false,
        gains: Array.isArray(equalizer?.gains) ? [...equalizer.gains] : []
      },
      visualizer: {
        running: Boolean(visualizer?.isRunning),
        mode: visualizer?.mode || 'bars'
      },
      currentTrack: null,
      currentStation: null,
      queue: {
        size: queueManager?.tracks ? queueManager.tracks.length : 0,
        currentIndex: queueManager?.currentIndex ?? -1,
        shuffle: Boolean(queueManager?.shuffle),
        repeat: queueManager?.repeat || 'off'
      }
    },
    serviceWorker: {
      supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      controllerPresent: typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller),
      controllerState: typeof navigator !== 'undefined' ? (navigator.serviceWorker?.controller?.state || 'none') : 'none',
      registrationScope: null,
      activeWorkerState: null,
      waitingWorkerState: null,
      installingWorkerState: null,
      caches: []
    },
    recentErrors: getDiagnosticErrors()
  };

  // 1. Storage Quota Estimation
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const pct = quota > 0 ? ((usage / quota) * 100).toFixed(1) : '0';
      result.storage.quotaEstimate = {
        usageBytes: usage,
        quotaBytes: quota,
        usageFormatted: formatBytes(usage),
        quotaFormatted: formatBytes(quota),
        percentUsed: `${pct}%`
      };
    } catch (_) {}
  }

  // 2. IndexedDB Store Counts
  if (db) {
    try {
      if (typeof db.getAllTracks === 'function') {
        const tracks = (await db.getAllTracks()) || [];
        result.storage.storeCounts.tracks = tracks.length;
        result.storage.storeCounts.missingTracks = tracks.filter((t) => t.isMissing).length;
      }
    } catch (_) {}

    try {
      if (typeof db.getDirectoryHandles === 'function') {
        const roots = (await db.getDirectoryHandles()) || [];
        result.storage.storeCounts.roots = roots.length;
      }
    } catch (_) {}

    try {
      if (typeof db.getAllPlaylists === 'function') {
        const playlists = (await db.getAllPlaylists()) || [];
        result.storage.storeCounts.playlists = playlists.length;
      }
    } catch (_) {}

    try {
      if (typeof db.getFavorites === 'function') {
        const favs = (await db.getFavorites()) || [];
        result.storage.storeCounts.favorites = favs.length;
      }
    } catch (_) {}

    try {
      if (typeof db.getRecentHistory === 'function') {
        const hist = (await db.getRecentHistory(100)) || [];
        result.storage.storeCounts.history = hist.length;
      }
    } catch (_) {}

    try {
      if (typeof db.getStations === 'function') {
        const stations = (await db.getStations()) || [];
        result.storage.storeCounts.stations = stations.length;
      }
    } catch (_) {}
  }

  // 3. Current Track / Station Details
  if (audioEngine?.currentTrack) {
    const t = audioEngine.currentTrack;
    result.audio.currentTrack = {
      id: t.id || 'unknown',
      title: t.title || t.filename || 'Unknown Title',
      artist: t.artist || 'Unknown Artist',
      album: t.album || 'Unknown Album',
      durationSec: t.duration || 0,
      format: t.format || t.container || 'unknown'
    };
  }

  if (audioEngine?.currentStation) {
    const s = audioEngine.currentStation;
    result.audio.currentStation = {
      id: s.id || 'unknown',
      name: s.name || 'Unknown Station',
      genre: s.genre || 'unknown',
      bitrate: s.bitrate || 'unknown',
      streamState: audioEngine.streamState || 'idle',
      streamUrl: s.streamUrl ? s.streamUrl.replace(/\?.*$/, '') : 'unknown'
    };
  }

  // 4. Service Worker Details
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        result.serviceWorker.registrationScope = reg.scope || null;
        result.serviceWorker.activeWorkerState = reg.active?.state || null;
        result.serviceWorker.waitingWorkerState = reg.waiting?.state || null;
        result.serviceWorker.installingWorkerState = reg.installing?.state || null;
      }
    } catch (_) {}
  }

  // 5. Cache Names
  if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
    try {
      result.serviceWorker.caches = (await caches.keys()) || [];
    } catch (_) {}
  }

  return result;
}

/**
 * Formats a diagnostic payload into a clean Markdown report suitable for clipboard copying and issue creation.
 * @param {object} diag
 * @param {string} [userNotes=""]
 * @returns {string}
 */
export function formatDiagnosticsMarkdown(diag, userNotes = '') {
  if (!diag) return '# LocalJam Diagnostic Report\n\n[NO DATA AVAILABLE]';

  const notesSection = userNotes?.trim()
    ? `### User Feedback & Observations\n${userNotes.trim()}\n\n`
    : '';

  const quota = diag.storage?.quotaEstimate;
  const storageStr = quota
    ? `${quota.usageFormatted} / ${quota.quotaFormatted} (${quota.percentUsed})`
    : 'Not available';

  const swStatus = diag.serviceWorker?.controllerPresent
    ? `[ACTIVE] (State: ${diag.serviceWorker.controllerState || 'active'})`
    : (diag.serviceWorker?.supported ? '[INACTIVE / UNCONTROLLED]' : '[NOT SUPPORTED]');

  const nowPlaying = diag.audio?.source === 'Radio'
    ? (diag.audio?.currentStation?.name ? `Radio: ${diag.audio.currentStation.name} [${diag.audio.currentStation.streamState}]` : 'Radio: None')
    : (diag.audio?.currentTrack?.title ? `Track: ${diag.audio.currentTrack.title} (${diag.audio.currentTrack.artist})` : 'Track: None');

  return `## LocalJam Diagnostic Report
**Generated:** \`${diag.timestamp || new Date().toISOString()}\`  
**App Version:** \`${diag.app?.version || 'unknown'}\` (Remote: \`${diag.app?.remoteVersion || 'synced'}\`)  
**Status:** \`[PASS]\` Diagnostics Captured  

${notesSection}### Summary Metrics
| Dimension | Status / Telemetry |
| :--- | :--- |
| **PWA Display Mode** | \`${diag.app?.displayMode || 'browser'}\` (Online: \`${diag.app?.online ? 'Yes' : 'No'}\`) |
| **Storage Architecture** | \`${diag.storage?.tier || 'Tier 2'}\` |
| **Storage Usage** | \`${storageStr}\` |
| **Library Records** | \`${diag.storage?.storeCounts?.tracks ?? 0}\` tracks (\`${diag.storage?.storeCounts?.missingTracks ?? 0}\` missing), \`${diag.storage?.storeCounts?.playlists ?? 0}\` playlists |
| **Service Worker** | \`${swStatus}\` |
| **SW Caches** | \`${(diag.serviceWorker?.caches || []).join(', ') || 'None'}\` |
| **Audio Engine** | \`${diag.audio?.source || 'Local'}\` — \`${diag.audio?.playbackState || 'Stopped'}\` (AudioContext: \`${diag.audio?.audioContextState || 'idle'}\`) |
| **Now Playing** | \`${nowPlaying}\` |
| **Volume & EQ** | \`${diag.audio?.volume || '100%'}\` (Muted: \`${diag.audio?.muted ? 'Yes' : 'No'}\`, Preset: \`${diag.audio?.equalizer?.preset || 'Flat'}\`) |
| **Browser / OS** | \`${diag.environment?.platform || 'unknown'}\` — \`${diag.environment?.screen || 'unknown'}\` |

### Environment Details
- **User Agent:** \`${diag.environment?.userAgent || 'unknown'}\`
- **Viewport:** \`${diag.environment?.viewport || 'unknown'}\` (Touch: \`${diag.environment?.touch ? 'Yes' : 'No'}\`)
- **Active URL:** \`${diag.app?.url || 'unknown'}\`

${diag.recentErrors && diag.recentErrors.length > 0 ? `### Recent Runtime Errors (${diag.recentErrors.length})\n` + diag.recentErrors.map(e => `- \`${e.timestamp}\`: **[${e.name}]** ${e.message}${e.context ? ` (${e.context})` : ''}`).join('\n') + '\n\n' : ''}### Raw Diagnostic Payload (JSON)
\`\`\`json
${JSON.stringify(diag, null, 2)}
\`\`\`
`;
}

/**
 * Serializes the diagnostics object into a formatted JSON string.
 * @param {object} diag
 * @returns {string}
 */
export function formatDiagnosticsJson(diag) {
  return JSON.stringify(diag, null, 2);
}
