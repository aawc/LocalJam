import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalJamDatabase, DB_NAME, DB_VERSION, db as singletonDb } from '../../src/storage/db.js';

// Minimal in-memory mock IndexedDB factory
function createMockIDBFactory() {
  const storesData = new Map();

  return {
    open(name, version) {
      const request = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
      };

      const mockDb = {
        objectStoreNames: {
          names: new Set(),
          contains(s) { return this.names.has(s); }
        },
        createObjectStore(storeName, options = {}) {
          this.objectStoreNames.names.add(storeName);
          if (!storesData.has(storeName)) {
            storesData.set(storeName, new Map());
          }
          return {
            createIndex() {}
          };
        },
        transaction(storeName, mode) {
          if (!storesData.has(storeName)) {
            storesData.set(storeName, new Map());
          }
          const map = storesData.get(storeName);

          const tx = {
            oncomplete: null,
            onerror: null,
            objectStore(name) {
              return {
                indexNames: { contains: () => false },
                put(record) {
                  const key = record.id || record.artworkId || record.trackId || record.key || record.rootId || String(map.size + 1);
                  map.set(key, JSON.parse(JSON.stringify(record)));
                  const req = { onsuccess: null, onerror: null, result: key };
                  queueMicrotask(() => {
                    if (req.onsuccess) req.onsuccess({ target: req });
                    if (tx.oncomplete) tx.oncomplete();
                  });
                  return req;
                },
                add(record) {
                  const id = map.size + 1;
                  const item = { id, ...JSON.parse(JSON.stringify(record)) };
                  map.set(id, item);
                  const req = { onsuccess: null, onerror: null, result: id };
                  queueMicrotask(() => {
                    if (req.onsuccess) req.onsuccess({ target: req });
                    if (tx.oncomplete) tx.oncomplete();
                  });
                  return req;
                },
                get(key) {
                  const item = map.get(key) ? JSON.parse(JSON.stringify(map.get(key))) : undefined;
                  const req = { onsuccess: null, onerror: null, result: item };
                  queueMicrotask(() => {
                    if (req.onsuccess) req.onsuccess({ target: req });
                  });
                  return req;
                },
                getAll() {
                  const items = Array.from(map.values()).map((v) => JSON.parse(JSON.stringify(v)));
                  const req = { onsuccess: null, onerror: null, result: items };
                  queueMicrotask(() => {
                    if (req.onsuccess) req.onsuccess({ target: req });
                  });
                  return req;
                },
                delete(key) {
                  map.delete(key);
                  const req = { onsuccess: null, onerror: null };
                  queueMicrotask(() => {
                    if (req.onsuccess) req.onsuccess({ target: req });
                  });
                  return req;
                },
                clear() {
                  map.clear();
                  const req = { onsuccess: null, onerror: null };
                  queueMicrotask(() => {
                    if (req.onsuccess) req.onsuccess({ target: req });
                  });
                  return req;
                }
              };
            }
          };
          return tx;
        }
      };

      queueMicrotask(() => {
        request.result = mockDb;
        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: request });
        }
        if (request.onsuccess) {
          request.onsuccess({ target: request });
        }
      });

      return request;
    }
  };
}

test('LocalJamDatabase - Initialization and Configuration', async (t) => {
  await t.test('Initializes with default database name and version', () => {
    const db = new LocalJamDatabase();
    assert.equal(db.dbName, DB_NAME);
    assert.equal(db.version, DB_VERSION);
  });

  await t.test('db.init() aliases to db.open()', async () => {
    const mockIdb = createMockIDBFactory();
    const db = new LocalJamDatabase('TestDB', 1, mockIdb);
    assert.equal(typeof db.init, 'function');
    const opened = await db.init();
    assert.ok(opened);
    assert.equal(db.db, opened);
  });

  await t.test('Singleton db instance exports init and open methods', () => {
    assert.equal(typeof singletonDb.init, 'function');
    assert.equal(typeof singletonDb.open, 'function');
  });

  await t.test('Throws error if indexedDB is unsupported', async () => {
    const db = new LocalJamDatabase('TestDB', 1, null);
    await assert.rejects(async () => {
      await db.open();
    }, /IndexedDB is not supported/);
  });
});

test('LocalJamDatabase - Full Store Operations and Aggregations', async (t) => {
  const mockIdb = createMockIDBFactory();
  const db = new LocalJamDatabase('TestDB_Full', 1, mockIdb);
  await db.init();

  await t.test('Roots and Directory Handles Store', async () => {
    const rootId = await db.saveRoot({ id: 'root_1', name: 'MusicFolder', dateAdded: 1000 });
    assert.equal(rootId, 'root_1');

    await db.saveDirectoryHandle('root_2', { name: 'LocalDrive' });
    const handles = await db.getAllDirectoryHandles();
    assert.equal(handles.length, 2);
    assert.equal(handles[0].name, 'MusicFolder');
    assert.equal(handles[1].name, 'LocalDrive');
  });

  await t.test('Tracks Store - CRUD, batch, and normalization', async () => {
    // Normalizes boolean isMissing
    await db.putTrack({
      id: 'trk_1',
      rootId: 'root_1',
      title: 'Echoes',
      artist: 'Pink Floyd',
      album: 'Meddle',
      year: 1971,
      duration: 1410,
      artworkId: 'art_1',
      isMissing: false
    });

    const trk1 = await db.getTrack('trk_1');
    assert.equal(trk1.title, 'Echoes');
    assert.equal(trk1.isMissing, 0); // Normalized to integer

    // Batch insertion
    await db.putTracksBatch([
      { id: 'trk_2', rootId: 'root_1', title: 'One of These Days', artist: 'Pink Floyd', album: 'Meddle', year: 1971, duration: 350, artworkId: 'art_1', isMissing: true },
      { id: 'trk_3', rootId: 'root_1', title: 'Time', artist: 'Pink Floyd', album: 'Dark Side of the Moon', year: 1973, duration: 425, artworkId: 'art_2', isMissing: 0 },
      { id: 'trk_4', rootId: 'root_1', title: 'Paranoid Android', artist: 'Radiohead', album: 'OK Computer', year: 1997, duration: 387, artworkId: 'art_3', isMissing: 0 }
    ]);

    const allTracks = await db.getAllTracks();
    assert.equal(allTracks.length, 4);

    const rootTracks = await db.getTracksByRoot('root_1');
    assert.equal(rootTracks.length, 4);

    await db.deleteTrack('trk_4');
    const remaining = await db.getAllTracks();
    assert.equal(remaining.length, 3);
  });

  await t.test('Album and Artist Dynamic Aggregations', async () => {
    const albums = await db.getAllAlbums();
    assert.equal(albums.length, 2);
    assert.equal(albums[0].name, 'Dark Side of the Moon');
    assert.equal(albums[0].artist, 'Pink Floyd');
    assert.equal(albums[0].trackCount, 1);
    assert.equal(albums[1].name, 'Meddle');
    assert.equal(albums[1].trackCount, 2);

    const artists = await db.getAllArtists();
    assert.equal(artists.length, 1);
    assert.equal(artists[0].name, 'Pink Floyd');
    assert.equal(artists[0].trackCount, 3);
    assert.equal(artists[0].albumCount, 2);
  });

  await t.test('Artwork Store - Save and Retrieve', async () => {
    await db.saveArtwork('art_1', 'image/jpeg', 'data:image/jpeg;base64,1234');
    const art = await db.getArtwork('art_1');
    assert.equal(art.artworkId, 'art_1');
    assert.equal(art.mimeType, 'image/jpeg');
    assert.equal(art.thumbnailDataUrl, 'data:image/jpeg;base64,1234');
  });

  await t.test('Playlists Store - CRUD and Aliases', async () => {
    const pl = await db.createPlaylist('Favorites Chill', 'Evening mix', ['trk_1']);
    assert.ok(pl.id.startsWith('pl_'));
    assert.equal(pl.name, 'Favorites Chill');

    pl.name = 'Ambient & Chill';
    await db.putPlaylist(pl);

    const fetched = await db.getPlaylist(pl.id);
    assert.equal(fetched.name, 'Ambient & Chill');

    const allPlaylists = await db.getAllPlaylists();
    assert.equal(allPlaylists.length, 1);

    await db.deletePlaylist(pl.id);
    const afterDelete = await db.getPlaylists();
    assert.equal(afterDelete.length, 0);
  });

  await t.test('Favorites Store - Toggle and Query', async () => {
    assert.equal(await db.isFavorite('trk_1'), false);

    const added = await db.toggleFavorite('trk_1');
    assert.equal(added, true);
    assert.equal(await db.isFavorite('trk_1'), true);

    const favs = await db.getAllFavorites();
    assert.equal(favs.length, 1);
    assert.equal(favs[0].trackId, 'trk_1');

    const removed = await db.toggleFavorite('trk_1');
    assert.equal(removed, false);
    assert.equal(await db.isFavorite('trk_1'), false);
  });

  await t.test('Play History Store - Add, Enriched Query, and Clear', async () => {
    await db.addPlayHistory('trk_1', 120, true);
    await db.addPlayHistory('trk_2', 300, false);

    const history = await db.getPlayHistory(10);
    assert.equal(history.length, 2);

    const enriched = await db.getRecentHistory(10);
    assert.equal(enriched.length, 2);
    assert.equal(enriched[0].track.title, 'One of These Days');
    assert.equal(enriched[1].track.title, 'Echoes');

    await db.clearHistory();
    const cleared = await db.getPlayHistory();
    assert.equal(cleared.length, 0);
  });

  await t.test('Playback State and Settings Store', async () => {
    await db.savePlaybackState({ currentTrackId: 'trk_1', currentTime: 42, isPlaying: false });
    const state = await db.getPlaybackState();
    assert.equal(state.currentTrackId, 'trk_1');
    assert.equal(state.currentTime, 42);

    // Settings defaults
    const defaultSettings = await db.getSettings();
    assert.equal(defaultSettings.theme, 'dark');

    // Key-value settings helpers
    await db.setSetting('crossfadeSeconds', 4);
    assert.equal(await db.getSetting('crossfadeSeconds'), 4);
    assert.equal(await db.getSetting('non_existent', 'default_val'), 'default_val');
  });

  await t.test('Stations Store and ClearStore', async () => {
    await db.saveStations([{ id: 'st_1', name: 'Ambient Sleep', url: 'https://stream.example/live' }]);
    const stations = await db.getStations();
    assert.equal(stations.length, 1);
    assert.equal(stations[0].name, 'Ambient Sleep');

    await db.clearStore('stations');
    const emptyStations = await db.getStations();
    assert.equal(emptyStations.length, 0);
  });
});
