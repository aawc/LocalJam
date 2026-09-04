import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilenameMetadata } from '../../src/metadata/filename-parser.js';
import { extractMetadataFromChunk } from '../../src/metadata/index.js';

test('Filename Heuristic Parser Suite', async (t) => {
  await t.test('Parses "01 - Artist - Title.mp3"', () => {
    const meta = parseFilenameMetadata('01 - Pink Floyd - Speak to Me.mp3');
    assert.equal(meta.trackNumber, 1);
    assert.equal(meta.artist, 'Pink Floyd');
    assert.equal(meta.title, 'Speak to Me');
  });

  await t.test('Parses "Artist - 02 - Title.flac"', () => {
    const meta = parseFilenameMetadata('Radiohead - 02 - Paranoid Android.flac');
    assert.equal(meta.trackNumber, 2);
    assert.equal(meta.artist, 'Radiohead');
    assert.equal(meta.title, 'Paranoid Android');
  });

  await t.test('Parses "03. Title.m4a"', () => {
    const meta = parseFilenameMetadata('03. Subterranean Homesick Alien.m4a');
    assert.equal(meta.trackNumber, 3);
    assert.equal(meta.title, 'Subterranean Homesick Alien');
  });

  await t.test('Extracts Artist and Album from folder path hierarchy', () => {
    const meta = parseFilenameMetadata('05 - Let Down.mp3', 'Radiohead/OK Computer/05 - Let Down.mp3');
    assert.equal(meta.artist, 'Radiohead');
    assert.equal(meta.album, 'OK Computer');
    assert.equal(meta.trackNumber, 5);
    assert.equal(meta.title, 'Let Down');
  });

  await t.test('Cleans web junk, underscores, and bitrates', () => {
    const meta = parseFilenameMetadata('01_-_Solar_Fields_-_Sol_[320kbps].mp3');
    assert.equal(meta.trackNumber, 1);
    assert.equal(meta.artist, 'Solar Fields');
    assert.equal(meta.title, 'Sol');
  });
});

test('Master Metadata Chunk Engine Suite', async (t) => {
  await t.test('Falls back gracefully to filename heuristics when headers contain no tags', () => {
    const emptyChunk = new Uint8Array(1024);
    const result = extractMetadataFromChunk(emptyChunk, '01 - Daft Punk - One More Time.mp3', 'Daft Punk/Discovery/01 - Daft Punk - One More Time.mp3', 5242880);
    assert.equal(result.title, 'One More Time');
    assert.equal(result.artist, 'Daft Punk');
    assert.equal(result.album, 'Discovery');
    assert.equal(result.trackNumber, 1);
    assert.equal(result.fileSize, 5242880);
  });
});
