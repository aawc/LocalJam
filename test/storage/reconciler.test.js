import test from 'node:test';
import assert from 'node:assert/strict';
import { FilesystemReconciler } from '../../src/storage/reconciler.js';

// In-Memory Mock Database for applyDiff tests
class MockDatabase {
  constructor() {
    this.tracks = new Map();
    this.artwork = new Map();
  }

  async putTrack(track) {
    this.tracks.set(track.id, track);
  }

  async putTracksBatch(tracks) {
    for (const t of tracks) {
      this.tracks.set(t.id, t);
    }
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
});
