import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDeterministicTrackId, sessionRegistry } from '../../src/storage/session-registry.js';

test('Session File Registry & Deterministic ID Suite', async (t) => {
  await t.test('Generates stable deterministic IDs for identical inputs', () => {
    const id1 = generateDeterministicTrackId('Music/Rock/Song.mp3', 5242880, 1600000000000);
    const id2 = generateDeterministicTrackId('Music/Rock/Song.mp3', 5242880, 1600000000000);
    assert.equal(id1, id2);
    assert.ok(id1.startsWith('trk_'));
  });

  await t.test('Generates distinct IDs for different file paths or sizes', () => {
    const idA = generateDeterministicTrackId('Music/ArtistA/01.mp3', 5000, 1600000000000);
    const idB = generateDeterministicTrackId('Music/ArtistB/01.mp3', 5000, 1600000000000);
    const idC = generateDeterministicTrackId('Music/ArtistA/01.mp3', 6000, 1600000000000);
    assert.notEqual(idA, idB);
    assert.notEqual(idA, idC);
  });

  await t.test('Registers files and retrieves them by ID and path', () => {
    sessionRegistry.clear();
    const mockFile = {
      name: '01 - Test.mp3',
      size: 4096,
      lastModified: 1700000000000,
      webkitRelativePath: 'TestAlbum/01 - Test.mp3'
    };

    const trackId = sessionRegistry.registerFile(mockFile);
    assert.ok(trackId);
    assert.equal(sessionRegistry.hasFile(trackId), true);
    assert.equal(sessionRegistry.getFile(trackId), mockFile);
    assert.equal(sessionRegistry.getIdByPath('TestAlbum/01 - Test.mp3'), trackId);
    assert.equal(sessionRegistry.size(), 1);

    sessionRegistry.clear();
    assert.equal(sessionRegistry.size(), 0);
  });
});
