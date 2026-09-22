/**
 * LocalJam - Diagnostics State Collector & Report Generator Test Suite
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureDiagnostics,
  formatDiagnosticsMarkdown,
  formatDiagnosticsJson,
  formatBytes,
  detectDisplayMode,
  recordDiagnosticError,
  getDiagnosticErrors,
  clearDiagnosticErrors
} from '../../src/utils/diagnostics.js';

describe('PWA Diagnostics & State Collector Suite', () => {
  beforeEach(() => {
    clearDiagnosticErrors();
  });

  it('formatBytes formats binary magnitudes accurately', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(-10), '0 B');
    assert.equal(formatBytes(500), '500 B');
    assert.equal(formatBytes(1024), '1.0 KB');
    assert.equal(formatBytes(1048576), '1.0 MB');
    assert.equal(formatBytes(1073741824), '1.0 GB');
    assert.equal(formatBytes(5368709120), '5.0 GB');
  });

  it('recordDiagnosticError stores errors in ring buffer up to max limit', () => {
    assert.equal(getDiagnosticErrors().length, 0);

    recordDiagnosticError(new Error('Sample error 1'), 'Unit test context');
    const errors = getDiagnosticErrors();
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'Sample error 1');
    assert.equal(errors[0].context, 'Unit test context');
    assert.ok(errors[0].timestamp);

    // Overflow ring buffer past 25 entries
    for (let i = 2; i <= 30; i++) {
      recordDiagnosticError(`Error ${i}`);
    }
    const overflowed = getDiagnosticErrors();
    assert.equal(overflowed.length, 25, 'ring buffer must cap at 25 entries');
    assert.equal(overflowed[overflowed.length - 1].message, 'Error 30');

    clearDiagnosticErrors();
    assert.equal(getDiagnosticErrors().length, 0);
  });

  it('detectDisplayMode defaults safely in headless environments', () => {
    const mode = detectDisplayMode();
    assert.ok(['standalone', 'browser', 'minimal-ui', 'fullscreen', 'unknown'].includes(mode));
  });

  it('captureDiagnostics captures structured metrics with mocked services', async () => {
    const mockDb = {
      getAllTracks: async () => [
        { id: 't1', isMissing: 0 },
        { id: 't2', isMissing: 1 },
        { id: 't3', isMissing: 0 }
      ],
      getDirectoryHandles: async () => [{ name: 'Music' }],
      getAllPlaylists: async () => [{ id: 'p1' }],
      getFavorites: async () => ['t1'],
      getRecentHistory: async () => [{ id: 't1' }],
      getStations: async () => [{ id: 's1' }]
    };

    const mockAudioEngine = {
      isRadio: false,
      isPlaying: true,
      isPaused: false,
      volume: 0.85,
      muted: false,
      audioCtx: { state: 'running', sampleRate: 44100 },
      currentTrack: {
        id: 'trk_42',
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        album: 'A Night at the Opera',
        duration: 354,
        format: 'audio/mp3'
      },
      currentStation: null
    };

    const mockQueueManager = {
      tracks: [{}, {}, {}],
      currentIndex: 1,
      shuffle: true,
      repeat: 'all'
    };

    const mockEqualizer = {
      currentPreset: 'Rock',
      gains: [3, 2, 0, -1, 0, 1, 2, 3, 2, 1]
    };

    const mockVisualizer = {
      isRunning: true,
      mode: 'nebula'
    };

    recordDiagnosticError(new Error('Test warning'), 'Playback test');

    const diag = await captureDiagnostics({
      db: mockDb,
      audioEngine: mockAudioEngine,
      queueManager: mockQueueManager,
      equalizer: mockEqualizer,
      visualizer: mockVisualizer
    });

    assert.ok(diag.timestamp);
    assert.ok(diag.app.version);
    assert.equal(diag.storage.storeCounts.tracks, 3);
    assert.equal(diag.storage.storeCounts.missingTracks, 1);
    assert.equal(diag.storage.storeCounts.roots, 1);
    assert.equal(diag.storage.storeCounts.playlists, 1);
    assert.equal(diag.storage.storeCounts.favorites, 1);

    assert.equal(diag.audio.source, 'Local');
    assert.equal(diag.audio.playbackState, 'Playing');
    assert.equal(diag.audio.volume, '85%');
    assert.equal(diag.audio.muted, false);
    assert.equal(diag.audio.currentTrack.title, 'Bohemian Rhapsody');
    assert.equal(diag.audio.currentTrack.artist, 'Queen');
    assert.equal(diag.audio.equalizer.preset, 'Rock');
    assert.equal(diag.audio.equalizer.isCustom, true);
    assert.equal(diag.audio.visualizer.running, true);
    assert.equal(diag.audio.visualizer.mode, 'nebula');

    assert.equal(diag.recentErrors.length, 1);
    assert.equal(diag.recentErrors[0].message, 'Test warning');
  });

  it('formatDiagnosticsMarkdown formats readable report with notes and summary table', async () => {
    const mockAudioEngine = {
      isRadio: true,
      isPlaying: true,
      volume: 1,
      muted: false,
      audioCtx: { state: 'running' },
      streamState: 'playing',
      currentStation: {
        id: 'kohl',
        name: 'KOHL 89.3 FM',
        genre: 'College / Pop',
        bitrate: '128 kbps',
        streamUrl: 'https://ice10.securenetsystems.net/KOHL'
      }
    };

    const diag = await captureDiagnostics({
      audioEngine: mockAudioEngine,
      db: null
    });

    const md = formatDiagnosticsMarkdown(diag, 'Streams pause unexpectedly on mobile');
    assert.ok(md.includes('LocalJam Diagnostic Report'));
    assert.ok(md.includes('User Feedback & Observations'));
    assert.ok(md.includes('Streams pause unexpectedly on mobile'));
    assert.ok(md.includes('Radio: KOHL 89.3 FM [playing]'));
    assert.ok(md.includes('Raw Diagnostic Payload (JSON)'));
    assert.ok(md.includes('```json'));
  });

  it('formatDiagnosticsJson produces valid parseable JSON', async () => {
    const diag = await captureDiagnostics({ db: null, audioEngine: null });
    const jsonStr = formatDiagnosticsJson(diag);
    assert.equal(typeof jsonStr, 'string');
    const parsed = JSON.parse(jsonStr);
    assert.ok(parsed.timestamp);
    assert.ok(parsed.app);
    assert.ok(parsed.storage);
    assert.ok(parsed.audio);
  });

  it('formatDiagnosticsMarkdown labels App Version as (Local Bundle) and Remote Version as (Deployed Origin)', async () => {
    const diag = await captureDiagnostics({ db: null, audioEngine: null });
    diag.app.version = 'v2026.09.111';
    diag.app.remoteVersion = 'v2026.09.115';

    const md = formatDiagnosticsMarkdown(diag);
    assert.ok(md.includes('App Version (Local Bundle)'), 'header or metrics must label App Version (Local Bundle)');
    assert.ok(md.includes('Remote Version (Deployed Origin)'), 'header or metrics must label Remote Version (Deployed Origin)');
    assert.ok(md.includes('v2026.09.111'));
    assert.ok(md.includes('v2026.09.115'));

    // Check with null remoteVersion / synced
    diag.app.remoteVersion = null;
    const mdSynced = formatDiagnosticsMarkdown(diag);
    assert.ok(mdSynced.includes('App Version (Local Bundle)'));
    assert.ok(mdSynced.includes('Remote Version (Deployed Origin)'));
    assert.ok(mdSynced.includes('synced'));
  });
});
