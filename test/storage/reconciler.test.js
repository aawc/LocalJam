import test from 'node:test';
import assert from 'node:assert/strict';
import { FilesystemReconciler, reconciler } from '../../src/storage/reconciler.js';
import { db } from '../../src/storage/db.js';

// In-Memory Mock Database for applyDiff tests
class MockDatabase {
  constructor() {
    this.tracks = new Map();
    this.artwork = new Map();
    this.favorites = new Set();
  }

  async removeFavorite(id) {
    this.favorites.delete(id);
  }

  async putTrack(track) {
    this.tracks.set(track.id, track);
  }

  async putTracksBatch(tracks) {
    for (const t of tracks) {
      this.tracks.set(t.id, t);
    }
  }

  async deleteTracksBatch(ids) {
    for (const id of ids) {
      this.tracks.delete(id);
    }
    return ids.length;
  }

  async saveArtwork(artworkId, mimeType, dataUrl) {
    this.artwork.set(artworkId, { artworkId, mimeType, dataUrl });
  }
}

test('Filesystem 3-Way Reconciler Suite', async (t) => {
  const rootId = 'root_test_1';

  await t.test('Identifies new track additions', () => {
    const existingTracks = [];
    const scannedItems = [
      { relativePath: 'Pink Floyd/01 - Speak to Me.mp3', filename: '01 - Speak to Me.mp3', size: 1024000, mtime: 1600000000000 },
      { relativePath: 'Pink Floyd/02 - Breathe.mp3', filename: '02 - Breathe.mp3', size: 2048000, mtime: 1600000000000 }
    ];

    const diff = FilesystemReconciler.computeDiff(scannedItems, existingTracks, rootId);
    assert.equal(diff.toAdd.length, 2);
    assert.equal(diff.toUpdate.length, 0);
    assert.equal(diff.toRename.length, 0);
    assert.equal(diff.toMarkMissing.length, 0);
    assert.equal(diff.unmodified.length, 0);
  });

  await t.test('Identifies unmodified tracks and modified tracks (mtime/size changed)', () => {
    const existingTracks = [
      { id: 'trk_1', relativePath: 'Radiohead/01 - Airbag.mp3', filename: '01 - Airbag.mp3', size: 5000000, mtime: 1600000000000, isMissing: 0 },
      { id: 'trk_2', relativePath: 'Radiohead/02 - Paranoid Android.mp3', filename: '02 - Paranoid Android.mp3', size: 8000000, mtime: 1600000000000, isMissing: 0 }
    ];

    const scannedItems = [
      // Unmodified
      { relativePath: 'Radiohead/01 - Airbag.mp3', filename: '01 - Airbag.mp3', size: 5000000, mtime: 1600000000000 },
      // Modified (size changed from 8000000 to 8000500)
      { relativePath: 'Radiohead/02 - Paranoid Android.mp3', filename: '02 - Paranoid Android.mp3', size: 8000500, mtime: 1600000500000 }
    ];

    const diff = FilesystemReconciler.computeDiff(scannedItems, existingTracks, rootId);
    assert.equal(diff.unmodified.length, 1);
    assert.equal(diff.toUpdate.length, 1);
    assert.equal(diff.toUpdate[0].existing.id, 'trk_2');
    assert.equal(diff.toAdd.length, 0);
  });

  await t.test('Identifies heuristic renames/moves (filename + size match)', () => {
    const existingTracks = [
      { id: 'trk_pink_floyd', relativePath: 'OldFolder/Time.mp3', filename: 'Time.mp3', size: 6543210, mtime: 1600000000000, title: 'Time', isMissing: 0 }
    ];

    const scannedItems = [
      // Moved to NewFolder/Time.mp3 with identical filename and size
      { relativePath: 'NewFolder/Time.mp3', filename: 'Time.mp3', size: 6543210, mtime: 1600000000000 }
    ];

    const diff = FilesystemReconciler.computeDiff(scannedItems, existingTracks, rootId);
    assert.equal(diff.toRename.length, 1);
    assert.equal(diff.toRename[0].existing.id, 'trk_pink_floyd');
    assert.equal(diff.toRename[0].newRelativePath, 'NewFolder/Time.mp3');
    assert.equal(diff.toAdd.length, 0);
    assert.equal(diff.toMarkMissing.length, 0);
  });

  await t.test('Marks missing files when deleted from filesystem', () => {
    const existingTracks = [
      { id: 'trk_stay', relativePath: 'Album/Track1.mp3', filename: 'Track1.mp3', size: 1000, mtime: 1000, isMissing: 0 },
      { id: 'trk_gone', relativePath: 'Album/Track2.mp3', filename: 'Track2.mp3', size: 2000, mtime: 1000, isMissing: 0 }
    ];

    const scannedItems = [
      { relativePath: 'Album/Track1.mp3', filename: 'Track1.mp3', size: 1000, mtime: 1000 }
    ];

    const diff = FilesystemReconciler.computeDiff(scannedItems, existingTracks, rootId);
    assert.equal(diff.unmodified.length, 1);
    assert.equal(diff.toMarkMissing.length, 1);
    assert.equal(diff.toMarkMissing[0].id, 'trk_gone');
  });

  await t.test('applyDiff executes batched updates and updates missing flags and renames in DB', async () => {
    const mockDb = new MockDatabase();
    const existingTracks = [
      { id: 'trk_moved', rootId, relativePath: 'Old/Song.mp3', filename: 'Song.mp3', size: 5000, mtime: 1000, title: 'Song', isMissing: 0 },
      { id: 'trk_deleted', rootId, relativePath: 'Album/Del.mp3', filename: 'Del.mp3', size: 3000, mtime: 1000, title: 'Del', isMissing: 0 }
    ];
    for (const t of existingTracks) mockDb.tracks.set(t.id, t);

    const scannedItems = [
      // Renamed / moved
      { relativePath: 'New/Song.mp3', filename: 'Song.mp3', size: 5000, mtime: 1000 },
      // Added
      { relativePath: 'Album/BrandNew.mp3', filename: 'BrandNew.mp3', size: 4000, mtime: 2000 }
    ];

    const diff = FilesystemReconciler.computeDiff(scannedItems, existingTracks, rootId);
    const progressReports = [];
    await FilesystemReconciler.applyDiff(mockDb, rootId, diff, (p, t, s) => progressReports.push(s));

    assert.ok(progressReports.length > 0);
    // trk_moved should have new path and isMissing: 0
    const moved = mockDb.tracks.get('trk_moved');
    assert.equal(moved.relativePath, 'New/Song.mp3');
    assert.equal(moved.isMissing, 0);

    // trk_deleted should be marked isMissing: 1
    const del = mockDb.tracks.get('trk_deleted');
    assert.equal(del.isMissing, 1);

    // BrandNew should have been added
    assert.equal(mockDb.tracks.size, 3);
  });

  await t.test('applyDiff with { purgeMissing: true } deletes missing tracks rather than marking isMissing: 1', async () => {
    const mockDb = new MockDatabase();
    const existingTracks = [
      { id: 'trk_kept', rootId, relativePath: 'Kept.mp3', filename: 'Kept.mp3', size: 5000, mtime: 1000, title: 'Kept', isMissing: 0 },
      { id: 'trk_missing', rootId, relativePath: 'Missing.mp3', filename: 'Missing.mp3', size: 3000, mtime: 1000, title: 'Missing', isMissing: 0 }
    ];
    for (const t of existingTracks) mockDb.tracks.set(t.id, t);

    const scannedItems = [
      { relativePath: 'Kept.mp3', filename: 'Kept.mp3', size: 5000, mtime: 1000 }
    ];

    const diff = FilesystemReconciler.computeDiff(scannedItems, existingTracks, rootId);
    assert.equal(diff.toMarkMissing.length, 1);
    assert.equal(diff.toMarkMissing[0].id, 'trk_missing');

    mockDb.favorites.add('trk_missing');
    mockDb.favorites.add('trk_kept');

    const progressReports = [];
    await FilesystemReconciler.applyDiff(
      mockDb,
      rootId,
      diff,
      (p, t, s) => progressReports.push(s),
      { purgeMissing: true }
    );

    assert.ok(progressReports.some((msg) => msg.includes('Purged missing track')));
    assert.ok(mockDb.tracks.has('trk_kept'));
    assert.equal(mockDb.tracks.has('trk_missing'), false, 'Missing track should be deleted from DB');
    assert.equal(mockDb.favorites.has('trk_missing'), false, 'Missing track should be removed from favorites');
    assert.equal(mockDb.favorites.has('trk_kept'), true, 'Kept track should remain in favorites');
    assert.equal(mockDb.tracks.size, 1);
  });

  await t.test('applyDiff with { purgeMissing: true } falls back to db.deleteTrack if deleteTracksBatch is undefined', async () => {
    const mockDb = new MockDatabase();
    mockDb.deleteTracksBatch = undefined;
    const deletedSingle = [];
    mockDb.deleteTrack = async (id) => {
      deletedSingle.push(id);
      mockDb.tracks.delete(id);
    };

    const existingTracks = [
      { id: 'trk_kept', rootId, relativePath: 'Kept.mp3', filename: 'Kept.mp3', size: 5000, mtime: 1000, title: 'Kept', isMissing: 0 },
      { id: 'trk_missing', rootId, relativePath: 'Missing.mp3', filename: 'Missing.mp3', size: 3000, mtime: 1000, title: 'Missing', isMissing: 0 }
    ];
    for (const t of existingTracks) mockDb.tracks.set(t.id, t);

    const scannedItems = [
      { relativePath: 'Kept.mp3', filename: 'Kept.mp3', size: 5000, mtime: 1000 }
    ];

    const diff = FilesystemReconciler.computeDiff(scannedItems, existingTracks, rootId);
    await FilesystemReconciler.applyDiff(
      mockDb,
      rootId,
      diff,
      null,
      { purgeMissing: true }
    );

    assert.deepEqual(deletedSingle, ['trk_missing']);
    assert.equal(mockDb.tracks.has('trk_missing'), false);
    assert.equal(mockDb.tracks.has('trk_kept'), true);
  });

  await t.test('reconciler.purgeMissingTracks delegates to db.purgeMissingTracks', async () => {
    const originalPurge = db.purgeMissingTracks;
    try {
      let passedRootId = undefined;
      db.purgeMissingTracks = async (rootId) => {
        passedRootId = rootId;
        return 42;
      };

      const result = await reconciler.purgeMissingTracks('root_custom');
      assert.equal(result, 42);
      assert.equal(passedRootId, 'root_custom');

      const resultGlobal = await reconciler.purgeMissingTracks();
      assert.equal(resultGlobal, 42);
      assert.equal(passedRootId, null);
    } finally {
      db.purgeMissingTracks = originalPurge;
    }
  });

  await t.test('reconcileFileList matches and ingests .oga, .opus, .wav, .webm, and .aac extensions', async () => {
    const originalGetAll = db.getAllTracks;
    const originalPutBatch = db.putTracksBatch;
    try {
      const storedTracks = [];
      db.getAllTracks = async () => [];
      db.putTracksBatch = async (batch) => {
        storedTracks.push(...batch);
      };

      const mockFile = (name, size = 1000) => ({
        name,
        size,
        lastModified: 1000,
        slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) })
      });

      const files = [
        mockFile('track1.oga', 1000),
        mockFile('track2.opus', 2000),
        mockFile('track3.wav', 3000),
        mockFile('track4.webm', 4000),
        mockFile('track5.aac', 5000),
        mockFile('ignore.txt', 500),
        mockFile('cover.jpg', 12000)
      ];

      const result = await reconciler.reconcileFileList(files);
      assert.equal(result.scannedCount, 5);
      assert.equal(result.diff.toAdd.length, 5);
      const extensions = result.diff.toAdd.map((item) => item.filename.split('.').pop());
      assert.deepEqual(extensions.sort(), ['aac', 'oga', 'opus', 'wav', 'webm']);
      assert.equal(storedTracks.length, 5);
    } finally {
      db.getAllTracks = originalGetAll;
      db.putTracksBatch = originalPutBatch;
    }
  });

  await t.test('applyDiff re-extracts metadata and normalizes yt-dlp album during track rename/move', async () => {
    const mockDb = new MockDatabase();
    const existing = {
      id: 'trk_legacy',
      title: 'Old Title',
      artist: 'yt-dlp',
      album: 'yt-dlp',
      relativePath: 'yt-dlp/01 - Pink Floyd - Speak to Me.mp3',
      filename: '01 - Pink Floyd - Speak to Me.mp3',
      size: 5000,
      mtime: 1000,
      isMissing: 0
    };
    mockDb.tracks.set(existing.id, existing);

    const diff = {
      toAdd: [],
      toUpdate: [],
      toRename: [{
        item: {
          filename: '01 - Pink Floyd - Speak to Me.mp3',
          size: 5000,
          mtime: 1000
        },
        existing,
        newRelativePath: 'Songs/yt-dlp/01 - Pink Floyd - Speak to Me.mp3'
      }],
      toMarkMissing: [],
      unmodified: []
    };

    await FilesystemReconciler.applyDiff(mockDb, 'root_songs', diff);

    const updated = mockDb.tracks.get('trk_legacy');
    assert.ok(updated);
    assert.equal(updated.relativePath, 'Songs/yt-dlp/01 - Pink Floyd - Speak to Me.mp3');
    assert.equal(updated.title, 'Speak to Me');
    assert.equal(updated.artist, 'Pink Floyd');
    assert.equal(updated.album, 'Songs', 'Album should be normalized from Songs directory hierarchy');
    assert.equal(updated.rootId, 'root_songs');
  });

  await t.test('reconcileFileList defaults purgeMissing to true and purges deleted tracks', async () => {
    const originalGetAll = db.getAllTracks;
    const originalPutBatch = db.putTracksBatch;
    const originalDeleteBatch = db.deleteTracksBatch;
    try {
      const deletedIds = [];
      db.getAllTracks = async () => [
        { id: 'trk_to_delete', relativePath: 'Missing.mp3', filename: 'Missing.mp3', size: 9999, rootId: 'root_session_files', isMissing: 0 }
      ];
      db.putTracksBatch = async () => {};
      db.deleteTracksBatch = async (ids) => {
        deletedIds.push(...ids);
        return ids.length;
      };

      const mockFile = (name, size = 1000) => ({
        name,
        size,
        lastModified: 1000,
        webkitRelativePath: `Songs/${name}`,
        slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) })
      });

      const files = [mockFile('Present.mp3', 2000)];
      await reconciler.reconcileFileList(files);

      assert.deepEqual(deletedIds, ['trk_to_delete'], 'Must purge missing tracks by default');
    } finally {
      db.getAllTracks = originalGetAll;
      db.putTracksBatch = originalPutBatch;
      db.deleteTracksBatch = originalDeleteBatch;
    }
  });

  await t.test('computeDiff and applyDiff preserve tracks from other roots during multi-root reconciliation', async () => {
    const existing = [
      { id: 'trk_root_a', filename: 'songA.mp3', size: 1000, mtime: 1000, relativePath: 'songA.mp3', rootId: 'root_A', isMissing: 0 },
      { id: 'trk_root_b', filename: 'songB.mp3', size: 2000, mtime: 2000, relativePath: 'songB.mp3', rootId: 'root_B', isMissing: 0 }
    ];
    const scannedInB = [
      // Only songB is present in root_B
      { filename: 'songB.mp3', size: 2000, mtime: 2000, relativePath: 'songB.mp3' }
    ];

    const diff = FilesystemReconciler.computeDiff(scannedInB, existing, 'root_B');
    assert.equal(diff.toMarkMissing.length, 0, 'Tracks from root_A must NOT be marked missing when reconciling root_B');
    assert.equal(diff.unmodified.length, 1);
    assert.equal(diff.unmodified[0].existing.id, 'trk_root_b');

    const mockDb = new MockDatabase();
    mockDb.tracks.set('trk_root_a', existing[0]);
    mockDb.tracks.set('trk_root_b', existing[1]);

    await FilesystemReconciler.applyDiff(mockDb, 'root_B', diff, null, { purgeMissing: true });
    assert.equal(mockDb.tracks.has('trk_root_a'), true, 'trk_root_a must be preserved in database');
    assert.equal(mockDb.tracks.has('trk_root_b'), true, 'trk_root_b must be preserved in database');
  });
});
