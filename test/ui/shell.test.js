import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hydratePlaybackState, togglePlaybackSource, savePlaybackState } from '../../src/main.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const INDEX_PATH = path.join(ROOT_DIR, 'index.html');

test('Shell Architecture - index.html has minimal containers and no legacy shell chrome', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  // Must contain minimal 4 container roots
  assert.ok(html.includes('id="stage-root"'), 'Must contain stage-root container');
  assert.ok(html.includes('id="layer-root"'), 'Must contain layer-root container');
  assert.ok(html.includes('id="toast-root"'), 'Must contain toast-root container');
  assert.ok(html.includes('id="aria-live-region"'), 'Must contain aria-live-region container');

  // Must NOT contain legacy multi-view shell elements
  assert.ok(!html.includes('app-sidebar'), 'Must not contain legacy app-sidebar');
  assert.ok(!html.includes('mobile-nav'), 'Must not contain legacy mobile-nav');
  assert.ok(!html.includes('top-bar'), 'Must not contain legacy top-bar');
  assert.ok(!html.includes('player-bar-container'), 'Must not contain legacy player-bar-container');
  assert.ok(!html.includes('global-search-input'), 'Must not contain legacy global-search-input');

  // Preserves verbatim PWA and Security assets
  assert.ok(html.includes('<link rel="manifest" href="./manifest.webmanifest" />'), 'Preserves relative manifest link');
  assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="./favicon.svg" />'), 'Preserves relative favicon link');
  assert.ok(html.includes('<meta name="theme-color" content="#0b0f17" />'), 'Preserves theme-color meta');
  assert.ok(html.includes('<script type="module" src="./src/main.js"></script>'), 'Preserves relative main.js script');
  assert.ok(html.includes('Content-Security-Policy'), 'Preserves CSP meta tag');
});

test('Shell Hydration - hydratePlaybackState restores radio state on cold start', async () => {
  const mockDb = {
    async getPlaybackState() {
      return {
        isRadio: true,
        stationId: 'station-ambient',
        volume: 0.65,
        muted: false
      };
    },
    async getAllTracks() {
      return [];
    }
  };

  const mockAudioEngine = {
    isRadio: false,
    isPlaying: true, // should be forced to false
    volume: 1.0,
    muted: false,
    currentStation: null,
    currentTrack: null,
    streamState: 'playing',
    notified: false,
    setVolume(v) {
      this.volume = v;
    },
    notifyState() {
      this.notified = true;
    }
  };

  const mockQueueManager = {
    shuffle: false,
    repeat: 'off',
    setQueue() {}
  };

  const mockStations = [
    { id: 'station-ambient', name: 'Ambient Space', genre: 'Ambient' }
  ];

  const result = await hydratePlaybackState({
    db: mockDb,
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager,
    stations: mockStations
  });

  assert.equal(result.type, 'radio');
  assert.equal(mockAudioEngine.isRadio, true, 'AudioEngine isRadio must be true');
  assert.equal(mockAudioEngine.currentStation?.id, 'station-ambient', 'Station must be restored');
  assert.equal(mockAudioEngine.volume, 0.65, 'Volume must be restored to 0.65');
  assert.equal(mockAudioEngine.isPlaying, false, 'AudioEngine must NOT auto-play on cold start');
  assert.equal(mockAudioEngine.streamState, 'idle', 'Stream state must be idle');
  assert.equal(mockAudioEngine.notified, true, 'State listeners must be notified');
});

test('Shell Hydration - hydratePlaybackState restores local track state on cold start', async () => {
  const mockTrack = {
    id: 'trk-1',
    title: 'Solar Flare',
    artist: 'Astral',
    duration: 240
  };

  const mockDb = {
    async getPlaybackState() {
      return {
        isRadio: false,
        trackId: 'trk-1',
        currentTime: 75.5,
        duration: 240,
        volume: 0.8,
        muted: true,
        shuffle: true,
        repeat: 'all'
      };
    },
    async getAllTracks() {
      return [mockTrack];
    }
  };

  let queuedTracks = null;
  let queuedIndex = -1;

  const mockQueueManager = {
    shuffle: false,
    repeat: 'off',
    setQueue(tracks, idx) {
      queuedTracks = tracks;
      queuedIndex = idx;
    }
  };

  const mockAudioEngine = {
    isRadio: true,
    isPlaying: true,
    volume: 1.0,
    muted: false,
    currentTime: 0,
    duration: 0,
    currentTrack: null,
    currentStation: { id: 'old-st' },
    notified: false,
    setVolume(v) {
      this.volume = v;
    },
    notifyState() {
      this.notified = true;
    }
  };

  const result = await hydratePlaybackState({
    db: mockDb,
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager
  });

  assert.equal(result.type, 'track');
  assert.equal(mockAudioEngine.isRadio, false, 'AudioEngine isRadio must be false');
  assert.equal(mockAudioEngine.currentTrack?.id, 'trk-1', 'Track must be hydrated');
  assert.equal(mockAudioEngine.currentStation, null, 'CurrentStation must be null');
  assert.equal(mockAudioEngine.currentTime, 75.5, 'Current time must be restored');
  assert.equal(mockAudioEngine.duration, 240, 'Duration must be restored');
  assert.equal(mockAudioEngine.volume, 0.8, 'Volume must be 0.8');
  assert.equal(mockAudioEngine.muted, true, 'Muted state must be restored');
  assert.equal(mockAudioEngine.isPlaying, false, 'AudioEngine must NOT auto-play');
  assert.equal(mockQueueManager.shuffle, true, 'Queue shuffle must be restored');
  assert.equal(mockQueueManager.repeat, 'all', 'Queue repeat must be restored');
  assert.equal(queuedIndex, 0, 'Queue index must be set');
  assert.equal(queuedTracks?.length, 1, 'Queue tracks must be populated');
  assert.equal(mockAudioEngine.notified, true, 'Listeners must be notified');
});

test('Shell Hydration - fallback to first track if no saved state exists', async () => {
  const mockTrack = { id: 'trk-default', title: 'Default Song', duration: 180 };

  const mockDb = {
    async getPlaybackState() {
      return null;
    },
    async getAllTracks() {
      return [mockTrack];
    }
  };

  const mockQueueManager = {
    shuffle: false,
    repeat: 'off',
    setQueue() {}
  };

  const mockAudioEngine = {
    isRadio: false,
    isPlaying: false,
    volume: 1.0,
    muted: false,
    currentTrack: null,
    currentStation: null,
    notifyState() {}
  };

  const result = await hydratePlaybackState({
    db: mockDb,
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager
  });

  assert.equal(result.type, 'track');
  assert.equal(mockAudioEngine.currentTrack?.id, 'trk-default');
  assert.equal(mockAudioEngine.isPlaying, false);
});

test('Shell Hydration - fallback to first curated station if no saved state and no tracks', async () => {
  const mockDb = {
    async getPlaybackState() {
      return null;
    },
    async getAllTracks() {
      return [];
    }
  };

  const mockQueueManager = {
    shuffle: false,
    repeat: 'off',
    setQueue() {}
  };

  const mockAudioEngine = {
    isRadio: false,
    isPlaying: false,
    volume: 1.0,
    muted: false,
    currentTrack: null,
    currentStation: null,
    notifyState() {}
  };

  const mockStations = [
    { id: 'fallback-radio', name: 'Fallback Radio' }
  ];

  const result = await hydratePlaybackState({
    db: mockDb,
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager,
    stations: mockStations
  });

  assert.equal(result.type, 'radio');
  assert.equal(mockAudioEngine.currentStation?.id, 'fallback-radio');
  assert.equal(mockAudioEngine.isRadio, true);
  assert.equal(mockAudioEngine.isPlaying, false);
});

test('Shell Source Switching - togglePlaybackSource switches radio to local track', async () => {
  const mockTrack = { id: 'trk-fav', title: 'Favorite Track' };
  let playedTrack = null;
  const toasts = [];

  const mockAudioEngine = {
    isRadio: true,
    currentTrack: mockTrack,
    currentStation: { id: 'st-1', name: 'Radio One' },
    async playTrack(t) {
      playedTrack = t;
      this.isRadio = false;
    }
  };

  const mockQueueManager = {
    getCurrent() {
      return { track: mockTrack };
    }
  };

  await togglePlaybackSource({
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager,
    onToast: (msg) => toasts.push(msg)
  });

  assert.equal(playedTrack?.id, 'trk-fav', 'Should have called playTrack on local track');
  assert.equal(mockAudioEngine.isRadio, false, 'Audio engine isRadio must be false');
  assert.ok(toasts.includes('[SOURCE: LOCAL]'), 'Toast announcing [SOURCE: LOCAL] must be shown');
});

test('Shell Source Switching - togglePlaybackSource opens browse sheet and prompts user to choose when no prior track was selected', async () => {
  let openedTab = null;
  let playedTrack = null;
  let paused = false;
  const toasts = [];

  const mockAudioEngine = {
    isRadio: true,
    currentTrack: null,
    currentStation: { id: 'st-ambient', name: 'Ambient Radio' },
    pause() {
      paused = true;
    },
    async playTrack(t) {
      playedTrack = t;
      this.isRadio = false;
    }
  };

  const mockDb = {
    async getAllTracks() {
      return [
        { id: 'trk-1', title: 'First Song', isMissing: false },
        { id: 'trk-2', title: 'Second Song', isMissing: false }
      ];
    }
  };

  const mockQueueManager = {
    getCurrent() { return null; },
    setQueue() {}
  };

  await togglePlaybackSource({
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager,
    db: mockDb,
    lastTrack: null,
    onOpenBrowse: (tab) => {
      openedTab = tab;
    },
    onToast: (msg) => toasts.push(msg)
  });

  assert.equal(playedTrack, null, 'Must NOT auto-play unchosen track');
  assert.equal(paused, true, 'Radio must be paused');
  assert.equal(mockAudioEngine.isRadio, false, 'Source must switch to local');
  assert.equal(openedTab, 'library', 'Must open library browse sheet');
  assert.ok(toasts.includes('[CHOOSE A TRACK]'), 'Must toast [CHOOSE A TRACK]');
});

test('Shell Source Switching - togglePlaybackSource prompts pickFolder when switching from radio with no local tracks', async () => {
  let pickFolderCalled = false;
  let playedTrack = null;
  const toasts = [];

  const mockAudioEngine = {
    isRadio: true,
    currentTrack: null,
    currentStation: { id: 'st-1', name: 'Radio One' },
    async playTrack(t) {
      playedTrack = t;
      this.isRadio = false;
    }
  };

  let tracksInDb = [];
  const mockDb = {
    async getAllTracks() {
      return tracksInDb;
    }
  };

  const mockQueueManager = {
    getCurrent() { return null; },
    setQueue() {}
  };

  await togglePlaybackSource({
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager,
    db: mockDb,
    onPickFolder: async () => {
      pickFolderCalled = true;
      tracksInDb = [{ id: 'new-trk', title: 'New Local Song' }];
      return true;
    },
    onToast: (msg) => toasts.push(msg)
  });

  assert.equal(pickFolderCalled, true, 'pickFolder must be invoked when switching to local without tracks');
  assert.equal(playedTrack?.id, 'new-trk', 'Should play newly indexed track after folder selection');
  assert.equal(mockAudioEngine.isRadio, false, 'Audio engine isRadio must be false');
  assert.ok(toasts.includes('[SOURCE: LOCAL]'), 'Toast announcing [SOURCE: LOCAL] must be shown');
});

test('Shell Source Switching - togglePlaybackSource retains radio when folder picker is canceled', async () => {
  let playedTrack = null;
  const toasts = [];

  const mockAudioEngine = {
    isRadio: true,
    currentTrack: null,
    currentStation: { id: 'st-1', name: 'Radio One' },
    async playTrack(t) {
      playedTrack = t;
      this.isRadio = false;
    }
  };

  const mockDb = {
    async getAllTracks() {
      return [];
    }
  };

  const mockQueueManager = {
    getCurrent() { return null; },
    setQueue() {}
  };

  await togglePlaybackSource({
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager,
    db: mockDb,
    onPickFolder: async () => false,
    onToast: (msg) => toasts.push(msg)
  });

  assert.equal(playedTrack, null, 'No track should be played when picker is canceled');
  assert.equal(mockAudioEngine.isRadio, true, 'Audio engine must remain on radio');
  assert.ok(toasts.includes('[NO LOCAL TRACKS]'), 'Toast announcing [NO LOCAL TRACKS] must be shown');
});

test('Shell Source Switching - togglePlaybackSource switches local track to radio station', async () => {
  const mockStation = { id: 'st-fav', name: 'Favorite Radio' };
  let playedStation = null;
  const toasts = [];

  const mockAudioEngine = {
    isRadio: false,
    currentTrack: { id: 'trk-1' },
    currentStation: mockStation,
    async playRadio(s) {
      playedStation = s;
      this.isRadio = true;
    }
  };

  const mockQueueManager = {
    getCurrent() {
      return { track: { id: 'trk-1' } };
    }
  };

  await togglePlaybackSource({
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager,
    onToast: (msg) => toasts.push(msg)
  });

  assert.equal(playedStation?.id, 'st-fav', 'Should have called playRadio on station');
  assert.equal(mockAudioEngine.isRadio, true, 'Audio engine isRadio must be true');
  assert.ok(toasts.includes('[SOURCE: RADIO]'), 'Toast announcing [SOURCE: RADIO] must be shown');
});

test('Shell Source Switching - togglePlaybackSource preserves lastStation across transitions', async () => {
  const stationAlpha = { id: 'st-alpha', name: 'Alpha Jazz' };
  const trackBeta = { id: 'trk-beta', title: 'Beta Beat' };
  let currentPlaying = null;

  const mockAudioEngine = {
    isRadio: true,
    currentStation: stationAlpha,
    currentTrack: trackBeta,
    async playTrack(t) {
      this.isRadio = false;
      this.currentTrack = t;
      this.currentStation = null; // simulate audio engine clearing station
      currentPlaying = t;
    },
    async playRadio(s) {
      this.isRadio = true;
      this.currentStation = s;
      currentPlaying = s;
    }
  };

  const mockQueueManager = {
    getCurrent() {
      return { track: trackBeta };
    }
  };

  // 1. Switch from radio stationAlpha to local trackBeta
  await togglePlaybackSource({
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager,
    onToast: () => {}
  });

  assert.equal(mockAudioEngine.isRadio, false);
  assert.equal(currentPlaying.id, 'trk-beta');
  assert.equal(mockAudioEngine.currentStation, null);

  // 2. Switch back to radio: must recover stationAlpha, NOT fallback to stations[0]
  const mockFallbackStations = [
    { id: 'st-fallback', name: 'Fallback Station' }
  ];

  await togglePlaybackSource({
    audioEngine: mockAudioEngine,
    queueManager: mockQueueManager,
    stations: mockFallbackStations,
    onToast: () => {}
  });

  assert.equal(mockAudioEngine.isRadio, true);
  assert.equal(mockAudioEngine.currentStation?.id, 'st-alpha', 'Must recover stationAlpha');
});

test('Shell Persistence - savePlaybackState serializes state cleanly with null safety', async () => {
  let savedRecord = null;
  const mockDb = {
    async savePlaybackState(rec) {
      savedRecord = rec;
      return rec;
    }
  };

  // 1. Null safety: should not throw
  await savePlaybackState(null, mockDb);
  assert.equal(savedRecord, null, 'Null state must no-op without saving');

  await savePlaybackState(undefined, mockDb);
  assert.equal(savedRecord, null, 'Undefined state must no-op without saving');

  // 2. Valid local track state serialization
  const localState = {
    isRadio: false,
    currentTrack: { id: 'trk-101', title: 'Cosmic Drift' },
    currentStation: null,
    currentTime: 124.5,
    duration: 300,
    volume: 0.75,
    muted: false,
    repeat: 'one',
    shuffle: true
  };

  await savePlaybackState(localState, mockDb);

  assert.ok(savedRecord, 'Record must be saved');
  assert.equal(savedRecord.isRadio, false);
  assert.equal(savedRecord.trackId, 'trk-101');
  assert.equal(savedRecord.currentStation, null);
  assert.equal(savedRecord.currentTime, 124.5);
  assert.equal(savedRecord.duration, 300);
  assert.equal(savedRecord.volume, 0.75);
  assert.equal(savedRecord.muted, false);
  assert.equal(savedRecord.repeat, 'one');
  assert.equal(savedRecord.shuffle, true);

  // 3. Valid radio state serialization with defaults
  const radioState = {
    isRadio: true,
    currentStation: { id: 'st-groove', name: 'Groove FM' }
  };

  await savePlaybackState(radioState, mockDb);

  assert.equal(savedRecord.isRadio, true);
  assert.equal(savedRecord.stationId, 'st-groove');
  assert.equal(savedRecord.currentTrack, null);
  assert.equal(savedRecord.volume, 1.0, 'Default volume 1.0');
  assert.equal(savedRecord.repeat, 'off', 'Default repeat off');
  assert.equal(savedRecord.shuffle, false, 'Default shuffle false');
});

test('Shell Hydration - automatically migrates saved bbc_radio_6 to nts_radio_1', async () => {
  let savedRecord = null;
  const mockDb = {
    async getPlaybackState() {
      return {
        isRadio: true,
        stationId: 'bbc_radio_6',
        currentStation: { id: 'bbc_radio_6', name: 'BBC Radio 6 Music', streamUrl: 'https://stream.live.vc.bbcmedia.co.uk/bbc_6music' },
        volume: 0.8
      };
    },
    async savePlaybackState(state) {
      savedRecord = state;
    },
    async getAllTracks() {
      return [];
    },
    async getStations() {
      return [];
    },
    async saveStations() {}
  };

  const mockAudioEngine = {
    isRadio: false,
    isPlaying: true,
    volume: 1.0,
    muted: false,
    currentStation: null,
    currentTrack: null,
    streamState: 'idle',
    notifyState() {}
  };

  const result = await hydratePlaybackState({
    db: mockDb,
    audioEngine: mockAudioEngine,
    queueManager: { clear() {}, setQueue() {} }
  });

  assert.equal(result.type, 'radio');
  assert.equal(result.station.id, 'nts_radio_1', 'Must migrate bbc_radio_6 to nts_radio_1');
  assert.equal(mockAudioEngine.currentStation.id, 'nts_radio_1');
  assert.equal(mockAudioEngine.isRadio, true);
  assert.equal(savedRecord?.stationId, 'nts_radio_1', 'Must persist migrated stationId to DB');
});
