/**
 * LocalJam - IndexedDB Storage Layer (LocalJamDB_v1)
 * Authoritative client-side database managing 9 object stores and compound indexes.
 */

export const DB_NAME = 'LocalJamDB_v1';
export const DB_VERSION = 1;

export class LocalJamDatabase {
  constructor(dbName = DB_NAME, version = DB_VERSION, idbFactory = typeof indexedDB !== 'undefined' ? indexedDB : null) {
    this.dbName = dbName;
    this.version = version;
    this.idb = idbFactory;
    /** @type {IDBDatabase|null} */
    this.db = null;
  }

  async init() {
    return this.open();
  }

  async open() {
    if (this.db) return this.db;
    if (!this.idb) throw new Error('IndexedDB is not supported in this environment');

    return new Promise((resolve, reject) => {
      const request = this.idb.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // 1. roots store
        if (!db.objectStoreNames.contains('roots')) {
          db.createObjectStore('roots', { keyPath: 'id' });
        }

        // 2. tracks store
        if (!db.objectStoreNames.contains('tracks')) {
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('by_root_path', ['rootId', 'relativePath'], { unique: true });
          trackStore.createIndex('by_root', 'rootId', { unique: false });
          trackStore.createIndex('by_artist', 'artist', { unique: false });
          trackStore.createIndex('by_album', ['albumArtist', 'album'], { unique: false });
          trackStore.createIndex('by_album_name', 'album', { unique: false });
          trackStore.createIndex('by_title', 'title', { unique: false });
          trackStore.createIndex('by_genre', 'genre', { unique: false });
          trackStore.createIndex('by_date_added', 'dateAdded', { unique: false });
          // Note: isMissing uses integer 0 (active/available) or 1 (missing) for valid IDB key indexing
          trackStore.createIndex('by_missing', 'isMissing', { unique: false });
        }

        // 3. artwork store (deduplicated thumbnail cache)
        if (!db.objectStoreNames.contains('artwork')) {
          db.createObjectStore('artwork', { keyPath: 'artworkId' });
        }

        // 4. playlists store
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }

        // 5. favorites store
        if (!db.objectStoreNames.contains('favorites')) {
          db.createObjectStore('favorites', { keyPath: 'trackId' });
        }

        // 6. playHistory store
        if (!db.objectStoreNames.contains('playHistory')) {
          const historyStore = db.createObjectStore('playHistory', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('by_played_at', 'playedAt', { unique: false });
        }

        // 7. stations store (internet radio)
        if (!db.objectStoreNames.contains('stations')) {
          db.createObjectStore('stations', { keyPath: 'id' });
        }

        // 8. playbackState store
        if (!db.objectStoreNames.contains('playbackState')) {
          db.createObjectStore('playbackState', { keyPath: 'key' });
        }

        // 9. settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error(`[LocalJamDB] Failed to open database: ${request.error?.message}`);
        reject(request.error);
      };
    });
  }

  async getStore(storeName, mode = 'readonly') {
    const db = await this.open();
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  async clearStore(storeName) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /* === Roots Store === */
  async saveRoot(root) {
    const store = await this.getStore('roots', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(root);
      req.onsuccess = () => resolve(root.id);
      req.onerror = () => {
        console.error(`[LocalJamDB] Error saving root (${req.error?.name}): ${req.error?.message}`);
        reject(req.error);
      };
    });
  }

  async getRoots() {
    const store = await this.getStore('roots', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => {
        console.error(`[LocalJamDB] Error fetching roots: ${req.error?.message}`);
        reject(req.error);
      };
    });
  }

  async saveDirectoryHandle(id, handle) {
    return this.saveRoot({ id, handle, name: handle?.name || id, dateAdded: Date.now() });
  }

  async getAllDirectoryHandles() {
    return this.getRoots();
  }

  /* === Tracks Store === */
  async putTrack(track) {
    // Ensure isMissing is integer flag (0 or 1)
    if (typeof track.isMissing === 'boolean') {
      track.isMissing = track.isMissing ? 1 : 0;
    }
    const store = await this.getStore('tracks', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(track);
      req.onsuccess = () => resolve(track.id);
      req.onerror = () => {
        console.error(`[LocalJamDB] Error saving track ${track.id}: ${req.error?.message}`);
        reject(req.error);
      };
    });
  }

  async putTracksBatch(tracks) {
    if (!tracks || tracks.length === 0) return;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      const store = tx.objectStore('tracks');
      for (const track of tracks) {
        if (typeof track.isMissing === 'boolean') {
          track.isMissing = track.isMissing ? 1 : 0;
        }
        store.put(track);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.error(`[LocalJamDB] Error batch saving tracks: ${tx.error?.message}`);
        reject(tx.error);
      };
    });
  }

  async getTrack(id) {
    const store = await this.getStore('tracks', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllTracks() {
    const store = await this.getStore('tracks', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getTracksByRoot(rootId) {
    const store = await this.getStore('tracks', 'readonly');
    return new Promise((resolve, reject) => {
      try {
        if (store.indexNames.contains('by_root')) {
          const index = store.index('by_root');
          const req = index.getAll(rootId);
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        } else {
          const req = store.getAll();
          req.onsuccess = () => resolve((req.result || []).filter((t) => t.rootId === rootId));
          req.onerror = () => reject(req.error);
        }
      } catch (err) {
        console.error(`[LocalJamDB] Error querying tracks by root: ${err?.message}`);
        reject(err);
      }
    });
  }

  async deleteTrack(id) {
    const store = await this.getStore('tracks', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getAllAlbums() {
    const tracks = await this.getAllTracks();
    const map = new Map();
    for (const t of tracks) {
      const albumName = t.album || 'Unknown Album';
      const artistName = t.albumArtist || t.artist || 'Unknown Artist';
      const key = `${albumName}:::${artistName}`;
      if (!map.has(key)) {
        map.set(key, {
          name: albumName,
          artist: artistName,
          year: t.year || null,
          artworkId: t.artworkId || null,
          trackCount: 0,
          tracks: []
        });
      }
      const entry = map.get(key);
      entry.trackCount += 1;
      if (!entry.artworkId && t.artworkId) entry.artworkId = t.artworkId;
      if (!entry.year && t.year) entry.year = t.year;
      entry.tracks.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAllArtists() {
    const tracks = await this.getAllTracks();
    const map = new Map();
    for (const t of tracks) {
      const artistName = t.artist || 'Unknown Artist';
      if (!map.has(artistName)) {
        map.set(artistName, {
          name: artistName,
          trackCount: 0,
          albums: new Set(),
          artworkId: t.artworkId || null
        });
      }
      const entry = map.get(artistName);
      entry.trackCount += 1;
      if (t.album) entry.albums.add(t.album);
      if (!entry.artworkId && t.artworkId) entry.artworkId = t.artworkId;
    }
    return Array.from(map.values())
      .map((a) => ({
        name: a.name,
        trackCount: a.trackCount,
        albumCount: a.albums.size,
        artworkId: a.artworkId
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /* === Artwork Store === */
  async saveArtwork(artworkId, mimeType, thumbnailDataUrl) {
    const store = await this.getStore('artwork', 'readwrite');
    const record = { artworkId, mimeType, thumbnailDataUrl, updatedAt: Date.now() };
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve(artworkId);
      req.onerror = () => {
        console.error(`[LocalJamDB] Error saving artwork ${artworkId}: ${req.error?.message}`);
        reject(req.error);
      };
    });
  }

  async getArtwork(artworkId) {
    if (!artworkId) return null;
    const store = await this.getStore('artwork', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(artworkId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /* === Playlists Store === */
  async createPlaylist(name, description = '', trackIds = []) {
    const id = 'pl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const playlist = {
      id,
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      trackIds,
      coverArtworkId: null
    };
    const store = await this.getStore('playlists', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(playlist);
      req.onsuccess = () => resolve(playlist);
      req.onerror = () => reject(req.error);
    });
  }

  async savePlaylist(playlist) {
    playlist.updatedAt = Date.now();
    const store = await this.getStore('playlists', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(playlist);
      req.onsuccess = () => resolve(playlist);
      req.onerror = () => reject(req.error);
    });
  }

  async putPlaylist(playlist) {
    return this.savePlaylist(playlist);
  }

  async getPlaylists() {
    const store = await this.getStore('playlists', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllPlaylists() {
    return this.getPlaylists();
  }

  async getPlaylist(id) {
    const store = await this.getStore('playlists', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async deletePlaylist(id) {
    const store = await this.getStore('playlists', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /* === Favorites Store === */
  async toggleFavorite(trackId) {
    const isFav = await this.isFavorite(trackId);
    const store = await this.getStore('favorites', 'readwrite');
    return new Promise((resolve, reject) => {
      if (isFav) {
        const req = store.delete(trackId);
        req.onsuccess = () => resolve(false);
        req.onerror = () => {
          console.error(`[LocalJamDB] Failed to remove favorite ${trackId}: ${req.error?.message}`);
          reject(req.error);
        };
      } else {
        const req = store.put({ trackId, favoritedAt: Date.now() });
        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          console.error(`[LocalJamDB] Failed to add favorite ${trackId}: ${req.error?.message}`);
          reject(req.error);
        };
      }
    });
  }

  async isFavorite(trackId) {
    const store = await this.getStore('favorites', 'readonly');
    return new Promise((resolve) => {
      const req = store.get(trackId);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  }

  async getFavorites() {
    const store = await this.getStore('favorites', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllFavorites() {
    return this.getFavorites();
  }

  /* === Play History Store === */
  async addPlayHistory(trackId, playbackDuration = 0, completed = false) {
    const store = await this.getStore('playHistory', 'readwrite');
    const entry = { trackId, playedAt: Date.now(), playbackDuration, completed };
    return new Promise((resolve, reject) => {
      const req = store.add(entry);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getPlayHistory(limit = 100) {
    const store = await this.getStore('playHistory', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => (b.playedAt - a.playedAt) || ((b.id || 0) - (a.id || 0))).slice(0, limit);
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getRecentHistory(limit = 100) {
    const history = await this.getPlayHistory(limit);
    const enriched = [];
    for (const item of history) {
      const track = await this.getTrack(item.trackId);
      enriched.push({
        ...item,
        track: track || { title: 'Unknown Track', artist: 'Unknown Artist', duration: 0 }
      });
    }
    return enriched;
  }

  async clearHistory() {
    return this.clearStore('playHistory');
  }

  /* === Playback State Store === */
  async savePlaybackState(state) {
    const store = await this.getStore('playbackState', 'readwrite');
    const record = Object.assign({ key: 'singleton' }, state);
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getPlaybackState() {
    const store = await this.getStore('playbackState', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get('singleton');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /* === Settings Store === */
  async saveSettings(settings) {
    const store = await this.getStore('settings', 'readwrite');
    const record = Object.assign({ key: 'singleton' }, settings);
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getSettings() {
    const store = await this.getStore('settings', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get('singleton');
      req.onsuccess = () =>
        resolve(
          req.result || {
            key: 'singleton',
            theme: 'dark',
            crossfadeSeconds: 0,
            visualizerEnabled: true,
            colorblindMode: 'standard'
          }
        );
      req.onerror = () => reject(req.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    const settings = await this.getSettings();
    return settings && key in settings ? settings[key] : defaultValue;
  }

  async setSetting(key, value) {
    const settings = await this.getSettings();
    settings[key] = value;
    return this.saveSettings(settings);
  }

  /* === Stations Store === */
  async saveStations(stations) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('stations', 'readwrite');
      const store = tx.objectStore('stations');
      for (const st of stations) {
        store.put(st);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getStations() {
    const store = await this.getStore('stations', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
}

export const db = new LocalJamDatabase();
