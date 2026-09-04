import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../src/storage/db.js';

import { renderHomeView } from '../../src/ui/views/home-view.js';
import { renderSongsView } from '../../src/ui/views/songs-view.js';
import { renderAlbumsView } from '../../src/ui/views/albums-view.js';
import { renderArtistsView } from '../../src/ui/views/artists-view.js';
import { renderPlaylistsView } from '../../src/ui/views/playlists-view.js';
import { renderFavoritesView } from '../../src/ui/views/favorites-view.js';
import { renderHistoryView } from '../../src/ui/views/history-view.js';
import { renderRadioView } from '../../src/ui/views/radio-view.js';
import { renderSettingsView } from '../../src/ui/views/settings-view.js';

// Setup minimal mock DOM
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        id: '',
        style: {},
        attributes: {},
        innerHTML: '',
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
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k]; },
        removeAttribute(k) { delete this.attributes[k]; },
        querySelector(selector) { return createMockElement(selector); },
        querySelectorAll(selector) { return [createMockElement(selector)]; },
        addEventListener() {}
      };
      return el;
    }
  };
}

function createMockElement(selector) {
  return {
    className: '',
    id: selector.replace(/^[#.\[\]=]/g, ''),
    style: {},
    dataset: { trackId: 'trk_1', albumName: 'Synth Album', artistName: 'Synth Artist', genre: 'Lo-Fi', playlistId: 'pl_1' },
    attributes: {},
    value: '0',
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener() {},
    querySelector() { return createMockElement(''); },
    querySelectorAll() { return []; }
  };
}

// Global DB mocks for views
db.isFavorite = async () => false;
db.toggleFavorite = async () => true;

test('UI Views - renderHomeView generates dashboard container', async () => {
  // Mock DB calls
  db.getAllTracks = async () => [
    { id: 'trk_1', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: 180, isMissing: 0 }
  ];
  db.getAllAlbums = async () => [{ name: 'Album 1', artist: 'Artist 1' }];
  db.getAllArtists = async () => [{ name: 'Artist 1' }];
  db.getAllPlaylists = async () => [{ id: 'pl_1', name: 'Chill', trackIds: ['trk_1'] }];
  db.getRecentHistory = async () => [{ trackId: 'trk_1', timestamp: Date.now(), track: { title: 'Song 1' } }];

  const view = await renderHomeView();
  assert.equal(view.className, 'page-container');
  assert.ok(view.innerHTML.includes('Your Music, Pure & Local'));
  assert.ok(view.innerHTML.includes('Shuffle Library (1)'));
});

test('UI Views - renderSongsView supports query filtering', async () => {
  db.getAllTracks = async () => [
    { id: 'trk_1', title: 'Solar Flare', artist: 'Nova', album: 'Cosmos', duration: 240, isMissing: 0 },
    { id: 'trk_2', title: 'Deep Ocean', artist: 'Aqua', album: 'Depths', duration: 190, isMissing: 0 }
  ];

  const params = new URLSearchParams('q=Solar');
  const view = await renderSongsView(params);
  assert.ok(view.innerHTML.includes('Solar Flare'));
  assert.ok(!view.innerHTML.includes('Deep Ocean'));
});

test('UI Views - renderAlbumsView generates album cards', async () => {
  db.getAllAlbums = async () => [{ name: 'Cosmos', artist: 'Nova' }];
  db.getAllTracks = async () => [{ id: 'trk_1', album: 'Cosmos', artist: 'Nova', isMissing: 0 }];

  const view = await renderAlbumsView();
  assert.ok(view.innerHTML.includes('Cosmos'));
  assert.ok(view.innerHTML.includes('Nova'));
});

test('UI Views - renderArtistsView generates artist cards', async () => {
  db.getAllArtists = async () => [{ name: 'Nova' }];
  db.getAllTracks = async () => [{ id: 'trk_1', album: 'Cosmos', artist: 'Nova', isMissing: 0 }];

  const view = await renderArtistsView();
  assert.ok(view.innerHTML.includes('Nova'));
});

test('UI Views - renderPlaylistsView generates playlist listing', async () => {
  db.getAllPlaylists = async () => [{ id: 'pl_1', name: 'Synthwave Hits', trackIds: ['trk_1'] }];

  const view = await renderPlaylistsView();
  assert.ok(view.innerHTML.includes('Synthwave Hits'));
});

test('UI Views - renderFavoritesView generates starred track list', async () => {
  db.getAllFavorites = async () => [{ trackId: 'trk_1' }];
  db.getTrack = async (id) => ({ id, title: 'Starred Track', artist: 'Artist', duration: 150 });

  const view = await renderFavoritesView();
  assert.ok(view.innerHTML.includes('Starred Track'));
});

test('UI Views - renderHistoryView displays listening history', async () => {
  db.getRecentHistory = async () => [
    { trackId: 'trk_1', timestamp: Date.now() - 5000, track: { title: 'Played Recently', duration: 200 } }
  ];

  const view = await renderHistoryView();
  assert.ok(view.innerHTML.includes('Played Recently'));
});

test('UI Views - renderRadioView displays curated streams and star action controls', async () => {
  db.getSetting = async () => [];

  const view = await renderRadioView();
  assert.ok(view.innerHTML.includes('Internet Radio'));
  assert.ok(view.innerHTML.includes('Radio Paradise'));
  assert.ok(view.innerHTML.includes('btn-star-station'));
  assert.ok(view.innerHTML.includes('Starred Streams'));
});

test('UI Views - renderSettingsView displays diagnostics and storage tier', async () => {
  db.getAllTracks = async () => [];
  db.getAllDirectoryHandles = async () => [];

  const view = await renderSettingsView();
  assert.ok(view.innerHTML.includes('Settings & Diagnostics'));
  assert.ok(view.innerHTML.includes('Storage Engine Status'));
  assert.ok(view.innerHTML.includes('Crossfade Duration'));
});
