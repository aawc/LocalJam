/**
 * LocalJam - 3-Way Filesystem Reconciler
 * Reconciles scanned filesystem entries against existing IndexedDB records:
 * - Discovers new additions
 * - Detects modified files (mtime/size)
 * - Identifies renames/moves heuristically (matching filename + size + duration)
 * - Marks deleted/unreachable files as missing without corrupting playlists
 */

import { generateDeterministicTrackId, sessionRegistry } from './session-registry.js';
import { extractMetadataFromChunk } from '../metadata/index.js';
import { db } from './db.js';

export class FilesystemReconciler {
  /**
   * Compute the diff between scanned items and existing DB tracks
   * @param {Array<{ relativePath: string, filename: string, size: number, mtime: number, handle?: any, file?: File }>} scannedItems
   * @param {Array<any>} existingTracks - Existing DB tracks for this root
   * @param {string} rootId - Library root ID
   */
  static computeDiff(scannedItems, existingTracks, rootId) {
    const dbByPath = new Map();
    const dbById = new Map();
    for (const track of existingTracks) {
      dbByPath.set(track.relativePath, track);
      dbById.set(track.id, track);
    }

    const scannedByPath = new Map();
    for (const item of scannedItems) {
      scannedByPath.set(item.relativePath, item);
    }

    const unmodified = [];
    const toUpdate = [];
    const toAdd = [];
    const matchedDbIds = new Set();
    const unmatchedScanned = [];

    // 1. Check scanned items against DB by path
    for (const item of scannedItems) {
      const existing = dbByPath.get(item.relativePath);
      if (existing) {
        matchedDbIds.add(existing.id);
        const sizeMatches = existing.size === item.size;
        const mtimeMatches = Math.abs((existing.mtime || 0) - item.mtime) < 1000;

        if (sizeMatches && mtimeMatches && (existing.isMissing === 0 || existing.isMissing === false)) {
          unmodified.push({ item, existing });
        } else {
          toUpdate.push({ item, existing });
        }
      } else {
        unmatchedScanned.push(item);
      }
    }

    // 2. Identify missing DB records
    const missingDbTracks = [];
    for (const track of existingTracks) {
      if (!matchedDbIds.has(track.id)) {
        missingDbTracks.push(track);
      }
    }

    // 3. Heuristic Rename / Move Matching
    // Match missing DB tracks against new scanned items by filename + size
    const toRename = [];
    const remainingToAdd = [];

    const missingBySignature = new Map();
    for (const missing of missingDbTracks) {
      const sig = `${missing.filename}:${missing.size}`;
      missingBySignature.set(sig, missing);
    }

    for (const newItem of unmatchedScanned) {
      const sig = `${newItem.filename}:${newItem.size}`;
      const matchedMissing = missingBySignature.get(sig);

      if (matchedMissing && !matchedDbIds.has(matchedMissing.id)) {
        matchedDbIds.add(matchedMissing.id);
        missingBySignature.delete(sig);
        toRename.push({
          item: newItem,
          existing: matchedMissing,
          newRelativePath: newItem.relativePath
        });
      } else {
        remainingToAdd.push(newItem);
      }
    }

    // DB tracks still unmatched are marked as missing (scoped to this root or legacy unassigned/scraper tracks)
    const toMarkMissing = missingDbTracks.filter((t) => (!t.rootId || t.rootId === rootId || /^(root_default|root_yt-dlp|root_session_files)$/i.test(t.rootId)) && !matchedDbIds.has(t.id));

    return {
      unmodified,
      toUpdate,
      toRename,
      toAdd: remainingToAdd,
      toMarkMissing
    };
  }

  /**
   * Apply reconciliation diff to IndexedDB with batched transactions and Tier 1 handle resolution
   * @param {LocalJamDatabase} db
   * @param {string} rootId
   * @param {object} diff - Result of computeDiff
   * @param {Function} [progressCallback] - (processed, total, status) => void
   * @param {object} [options] - Reconciliation options, e.g. { purgeMissing: boolean }
   */
  static async applyDiff(db, rootId, diff, progressCallback = null, options = {}) {
    let cb = progressCallback;
    let opts = options;
    if (typeof cb === 'object' && cb !== null && (!opts || Object.keys(opts).length === 0)) {
      opts = cb;
      cb = null;
    }

    const totalOperations = diff.toAdd.length + diff.toUpdate.length + diff.toRename.length + diff.toMarkMissing.length;
    let processed = 0;

    const report = (status) => {
      processed++;
      if (cb) {
        cb(processed, totalOperations, status);
      }
    };

    const SCRAPER_REGEX = /^(yt-dlp|youtube-dl|ytdl|tmp|temp|\.cache|\.tmp)$/i;
    let rootName = 'Songs';
    if (rootId && !/^(root_default|root_session_files|root_yt-dlp)$/i.test(rootId)) {
      const parsed = rootId.replace(/^root_/, '');
      if (!SCRAPER_REGEX.test(parsed)) {
        rootName = parsed;
      }
    }

    const tracksToPut = [];

    // 1. Process renames
    for (const { item, existing, newRelativePath } of diff.toRename) {
      let meta = null;
      try {
        const file = item.file || (item.handle && typeof item.handle.getFile === 'function' ? await item.handle.getFile() : null);
        if (file) {
          const headerSlice = await file.slice(0, 131072).arrayBuffer();
          meta = extractMetadataFromChunk(headerSlice, item.filename, newRelativePath, item.size, null, rootName);
        }
      } catch (err) {
        console.warn(`[Reconciler] Error re-extracting metadata for renamed track ${item.filename}: ${err?.message}`);
      }
      if (!meta) {
        meta = extractMetadataFromChunk(new Uint8Array(0), item.filename, newRelativePath, item.size, null, rootName);
      }

      let renamedAlbum = (meta && meta.album && meta.album !== 'Unknown Album' && !SCRAPER_REGEX.test(meta.album.trim()))
        ? meta.album
        : existing.album;
      if (!renamedAlbum || renamedAlbum === 'Unknown Album' || SCRAPER_REGEX.test(renamedAlbum.trim())) {
        renamedAlbum = rootName;
      }

      const updated = Object.assign({}, existing, {
        relativePath: newRelativePath,
        filename: item.filename,
        mtime: item.mtime,
        size: item.size,
        rootId: rootId,
        title: (meta && meta.title && meta.title !== 'Unknown Track') ? meta.title : existing.title,
        artist: (meta && meta.artist && meta.artist !== 'Unknown Artist' && !SCRAPER_REGEX.test(meta.artist.trim())) ? meta.artist : existing.artist,
        albumArtist: (meta && meta.albumArtist && !SCRAPER_REGEX.test(meta.albumArtist.trim())) ? meta.albumArtist : (existing.albumArtist || meta?.artist || existing.artist),
        album: renamedAlbum,
        isMissing: 0,
        handle: item.handle || existing.handle || null
      });
      tracksToPut.push(updated);
      report(`Renamed track: ${existing.title}`);
    }

    // 2. Process missing tracks
    if (opts && opts.purgeMissing === true) {
      const missingIds = diff.toMarkMissing.map((t) => t.id);
      if (missingIds.length > 0) {
        if (typeof db.deleteTracksBatch === 'function') {
          await db.deleteTracksBatch(missingIds);
        } else if (typeof db.deleteTrack === 'function') {
          await Promise.all(missingIds.map((id) => db.deleteTrack(id).catch(() => {})));
        }
        if (typeof db.removeFavorite === 'function') {
          await Promise.all(missingIds.map((id) => db.removeFavorite(id).catch(() => {})));
        }
        for (const missing of diff.toMarkMissing) {
          report(`Purged missing track: ${missing.title}`);
        }
      }
    } else {
      for (const missing of diff.toMarkMissing) {
        if (missing.isMissing !== 1) {
          const updated = Object.assign({}, missing, { isMissing: 1 });
          tracksToPut.push(updated);
        }
        report(`Marked missing: ${missing.title}`);
      }
    }

    // 3. Process updates (modified files)
    for (const { item, existing } of diff.toUpdate) {
      let meta = null;
      try {
        const file = item.file || (item.handle && typeof item.handle.getFile === 'function' ? await item.handle.getFile() : null);
        if (file) {
          const headerSlice = await file.slice(0, 131072).arrayBuffer();
          meta = extractMetadataFromChunk(headerSlice, item.filename, item.relativePath, item.size, null, rootName);
        }
      } catch (err) {
        console.error(`[Reconciler] Error reading file for modified track ${item.relativePath}: ${err?.message}`);
      }

      if (!meta) {
        meta = extractMetadataFromChunk(new Uint8Array(0), item.filename, item.relativePath, item.size, null, rootName);
      }

      let updatedAlbum = (meta && meta.album && meta.album !== 'Unknown Album' && !SCRAPER_REGEX.test(meta.album.trim()))
        ? meta.album
        : existing.album;
      if (!updatedAlbum || updatedAlbum === 'Unknown Album' || SCRAPER_REGEX.test(updatedAlbum.trim())) {
        updatedAlbum = rootName;
      }

      const updated = Object.assign({}, existing, {
        title: (meta && meta.title) || existing.title,
        artist: (meta && meta.artist && !SCRAPER_REGEX.test(meta.artist.trim())) ? meta.artist : existing.artist,
        albumArtist: (meta && (meta.albumArtist || meta.artist) && !SCRAPER_REGEX.test((meta.albumArtist || meta.artist).trim())) ? (meta.albumArtist || meta.artist) : (existing.albumArtist || existing.artist),
        album: updatedAlbum,
        genre: (meta && meta.genre) !== undefined && meta.genre !== null ? meta.genre : existing.genre,
        year: (meta && meta.year) !== undefined && meta.year !== null ? meta.year : existing.year,
        trackNumber: (meta && meta.trackNumber) !== undefined && meta.trackNumber !== null ? meta.trackNumber : existing.trackNumber,
        trackTotal: (meta && meta.trackTotal) !== undefined && meta.trackTotal !== null ? meta.trackTotal : existing.trackTotal,
        discNumber: (meta && meta.discNumber) !== undefined && meta.discNumber !== null ? meta.discNumber : existing.discNumber,
        discTotal: (meta && meta.discTotal) !== undefined && meta.discTotal !== null ? meta.discTotal : existing.discTotal,
        duration: (meta && meta.duration) || existing.duration,
        sampleRate: (meta && meta.sampleRate) || existing.sampleRate,
        mtime: item.mtime,
        size: item.size,
        isMissing: 0,
        handle: item.handle || existing.handle || null
      });

      if (meta && meta.artwork && meta.artwork.dataUrl) {
        const artworkId = 'art_' + Math.abs(hashCode(updated.artist + ':' + updated.album));
        try {
          await db.saveArtwork(artworkId, meta.artwork.mimeType, meta.artwork.dataUrl);
          updated.artworkId = artworkId;
        } catch (artErr) {
          console.error(`[Reconciler] Failed saving artwork for ${updated.title}: ${artErr?.message}`);
        }
      }

      tracksToPut.push(updated);
      report(`Updated track: ${updated.title}`);
    }

    // 4. Process new additions
    for (const newItem of diff.toAdd) {
      let meta = null;
      try {
        const file = newItem.file || (newItem.handle && typeof newItem.handle.getFile === 'function' ? await newItem.handle.getFile() : null);
        if (file) {
          const headerSlice = await file.slice(0, 131072).arrayBuffer();
          meta = extractMetadataFromChunk(headerSlice, newItem.filename, newItem.relativePath, newItem.size, null, rootName);
        }
      } catch (err) {
        console.error(`[Reconciler] Error reading file for new track ${newItem.relativePath}: ${err?.message}`);
      }

      if (!meta) {
        meta = extractMetadataFromChunk(new Uint8Array(0), newItem.filename, newItem.relativePath, newItem.size, null, rootName);
      }

      let newAlbum = meta.album;
      if (!newAlbum || newAlbum === 'Unknown Album' || SCRAPER_REGEX.test(newAlbum.trim())) {
        newAlbum = rootName;
      }

      const trackId = generateDeterministicTrackId(newItem.relativePath, newItem.size, newItem.mtime);
      const newTrack = {
        id: trackId,
        rootId,
        relativePath: newItem.relativePath,
        filename: newItem.filename,
        size: newItem.size,
        mtime: newItem.mtime,
        title: meta.title,
        artist: meta.artist,
        albumArtist: meta.albumArtist || meta.artist,
        album: newAlbum,
        genre: meta.genre,
        year: meta.year,
        trackNumber: meta.trackNumber,
        trackTotal: meta.trackTotal,
        discNumber: meta.discNumber,
        discTotal: meta.discTotal,
        duration: meta.duration || 0,
        sampleRate: meta.sampleRate || 0,
        artworkId: null,
        isMissing: 0,
        dateAdded: Date.now(),
        handle: newItem.handle || null
      };

      if (meta && meta.artwork && meta.artwork.dataUrl) {
        const artworkId = 'art_' + Math.abs(hashCode(newTrack.artist + ':' + newTrack.album));
        try {
          await db.saveArtwork(artworkId, meta.artwork.mimeType, meta.artwork.dataUrl);
          newTrack.artworkId = artworkId;
        } catch (artErr) {
          console.error(`[Reconciler] Failed saving artwork for new track ${newTrack.title}: ${artErr?.message}`);
        }
      }

      tracksToPut.push(newTrack);
      report(`Added track: ${newTrack.title}`);
    }

    // Execute batched DB writes in chunks of 100 for high performance
    const BATCH_SIZE = 100;
    for (let i = 0; i < tracksToPut.length; i += BATCH_SIZE) {
      const batch = tracksToPut.slice(i, i + BATCH_SIZE);
      await db.putTracksBatch(batch);
    }
  }
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Recursively scan a FileSystemDirectoryHandle (Tier 1 Chromium FSAA)
 */
async function scanDirectoryHandle(dirHandle, path = '') {
  const items = [];
  for await (const [name, entry] of dirHandle.entries()) {
    const relativePath = path ? `${path}/${name}` : name;
    if (entry.kind === 'file') {
      try {
        const file = await entry.getFile();
        const ext = name.split('.').pop().toLowerCase();
        if (['mp3', 'flac', 'm4a', 'mp4', 'aac', 'ogg', 'oga', 'opus', 'wav', 'webm'].includes(ext)) {
          if (sessionRegistry && typeof sessionRegistry.registerFile === 'function') {
            sessionRegistry.registerFile(file, relativePath);
          }
          items.push({
            relativePath,
            filename: name,
            size: file.size,
            mtime: file.lastModified,
            handle: entry,
            file
          });
        }
      } catch (err) {
        console.warn(`[Reconciler] Could not read file ${name}:`, err);
      }
    } else if (entry.kind === 'directory') {
      const subItems = await scanDirectoryHandle(entry, relativePath);
      items.push(...subItems);
    }
  }
  return items;
}

export const reconciler = {
  async reconcileDirectoryHandle(dirHandle, progressCallback, options = {}) {
    let cb = progressCallback;
    let opts = options;
    if (typeof cb === 'object' && cb !== null && (!opts || Object.keys(opts).length === 0)) {
      opts = cb;
      cb = null;
    }
    let handleName = (dirHandle.name || 'Songs').trim();
    if (!handleName || /^(yt-dlp|youtube-dl|ytdl|tmp|temp|\.cache|\.tmp|default)$/i.test(handleName)) {
      handleName = 'Songs';
    }
    const rootId = 'root_' + handleName;
    await db.saveDirectoryHandle(rootId, dirHandle);
    const scannedItems = await scanDirectoryHandle(dirHandle);
    const activeHandles = (typeof db.getAllDirectoryHandles === 'function' ? await db.getAllDirectoryHandles().catch(() => []) : []) || [];
    const knownRootIds = new Set(activeHandles.map((h) => h.id).filter(Boolean));
    knownRootIds.add(rootId);

    const allTracks = (await db.getAllTracks()) || [];
    let existingTracks = allTracks.filter(
      (t) => !t.rootId || t.rootId === rootId || !knownRootIds.has(t.rootId) || t.rootId === 'root_default' || /^(root_yt-dlp|root_session_files)$/i.test(t.rootId)
    );
    const diff = FilesystemReconciler.computeDiff(scannedItems, existingTracks, rootId);
    const purgeMissing = opts ? opts.purgeMissing !== false : true;
    const finalOpts = Object.assign({}, opts, { purgeMissing });
    await FilesystemReconciler.applyDiff(db, rootId, diff, (processed, total, status) => {
      if (cb) {
        cb({ processed, total, status, parsedCount: scannedItems.length });
      }
    }, finalOpts);
    return { scannedCount: scannedItems.length, diff };
  },

  async reconcileFileList(fileList, progressCallback, options = {}) {
    let cb = progressCallback;
    let opts = options;
    if (typeof cb === 'object' && cb !== null && (!opts || Object.keys(opts).length === 0)) {
      opts = cb;
      cb = null;
    }
    const rootId = 'root_session_files';
    const scannedItems = [];
    for (const file of fileList) {
      const relativePath = file.webkitRelativePath || file.name;
      const ext = file.name.split('.').pop().toLowerCase();
      if (['mp3', 'flac', 'm4a', 'mp4', 'aac', 'ogg', 'oga', 'opus', 'wav', 'webm'].includes(ext)) {
        if (sessionRegistry && typeof sessionRegistry.registerFile === 'function') {
          sessionRegistry.registerFile(file, relativePath);
        }
        scannedItems.push({
          relativePath,
          filename: file.name,
          size: file.size,
          mtime: file.lastModified,
          file
        });
      }
    }
    let rootFolderName = (fileList[0]?.webkitRelativePath ? fileList[0].webkitRelativePath.split('/')[0] : 'Songs') || 'Songs';
    if (/^(yt-dlp|youtube-dl|ytdl|tmp|temp|\.cache|\.tmp)$/i.test(rootFolderName.trim())) {
      rootFolderName = 'Songs';
    }
    try {
      if (typeof db.saveRoot === 'function') {
        await db.saveRoot({ id: rootId, name: rootFolderName, dateAdded: Date.now() });
      }
    } catch (_) {}
    const activeHandles = (typeof db.getAllDirectoryHandles === 'function' ? await db.getAllDirectoryHandles().catch(() => []) : []) || [];
    const knownRootIds = new Set(activeHandles.map((h) => h.id).filter(Boolean));
    knownRootIds.add(rootId);

    const allTracks = (await db.getAllTracks()) || [];
    let existingTracks = allTracks.filter(
      (t) => !t.rootId || t.rootId === rootId || !knownRootIds.has(t.rootId) || t.rootId === 'root_default' || /^(root_yt-dlp)$/i.test(t.rootId)
    );
    const diff = FilesystemReconciler.computeDiff(scannedItems, existingTracks, rootId);
    const purgeMissing = opts ? opts.purgeMissing !== false : true;
    const finalOpts = Object.assign({}, opts, { purgeMissing });
    await FilesystemReconciler.applyDiff(db, rootId, diff, (processed, total, status) => {
      if (cb) {
        cb({ processed, total, status, parsedCount: scannedItems.length });
      }
    }, finalOpts);
    return { scannedCount: scannedItems.length, diff };
  },

  async purgeMissingTracks(rootId = null) {
    return db.purgeMissingTracks(rootId);
  }
};

