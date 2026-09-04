import test from 'node:test';
import assert from 'node:assert/strict';
import { parseID3v2, parseID3v1, decodeSynchsafeInt, decodeText } from '../../src/metadata/id3v2.js';

// Helper to construct a synthetic ID3v2.3 buffer
function buildSyntheticID3v23(frames = []) {
  const frameBuffers = [];
  let totalFramesSize = 0;

  for (const { id, text, encoding = 3, rawBytes = null } of frames) {
    const idBytes = Buffer.from(id, 'ascii');
    let payload;
    if (rawBytes) {
      payload = rawBytes;
    } else {
      const textBytes = Buffer.from(text, encoding === 3 ? 'utf8' : 'latin1');
      payload = Buffer.concat([Buffer.from([encoding]), textBytes]);
    }

    const frameHeader = Buffer.alloc(10);
    idBytes.copy(frameHeader, 0, 0, 4);
    frameHeader.writeUInt32BE(payload.length, 4);
    frameHeader.writeUInt16BE(0, 8); // flags

    frameBuffers.push(frameHeader, payload);
    totalFramesSize += 10 + payload.length;
  }

  const allFrames = Buffer.concat(frameBuffers);
  const tagHeader = Buffer.alloc(10);
  tagHeader.write('ID3', 0, 3, 'ascii');
  tagHeader[3] = 3; // ID3v2.3
  tagHeader[4] = 0; // revision
  tagHeader[5] = 0; // flags

  // Write synchsafe integer size
  const size = allFrames.length;
  tagHeader[6] = (size >> 21) & 0x7f;
  tagHeader[7] = (size >> 14) & 0x7f;
  tagHeader[8] = (size >> 7) & 0x7f;
  tagHeader[9] = size & 0x7f;

  return Buffer.concat([tagHeader, allFrames]);
}

// Helper to construct synthetic ID3v2.2 buffer
function buildSyntheticID3v22(frames = []) {
  const frameBuffers = [];
  for (const { id, text, encoding = 0, rawBytes = null } of frames) {
    const idBytes = Buffer.from(id, 'ascii');
    let payload;
    if (rawBytes) {
      payload = rawBytes;
    } else {
      const textBytes = Buffer.from(text, 'latin1');
      payload = Buffer.concat([Buffer.from([encoding]), textBytes]);
    }

    const frameHeader = Buffer.alloc(6);
    idBytes.copy(frameHeader, 0, 0, 3);
    frameHeader[3] = (payload.length >> 16) & 0xff;
    frameHeader[4] = (payload.length >> 8) & 0xff;
    frameHeader[5] = payload.length & 0xff;

    frameBuffers.push(frameHeader, payload);
  }

  const allFrames = Buffer.concat(frameBuffers);
  const tagHeader = Buffer.alloc(10);
  tagHeader.write('ID3', 0, 3, 'ascii');
  tagHeader[3] = 2; // ID3v2.2
  tagHeader[4] = 0;
  tagHeader[5] = 0;

  const size = allFrames.length;
  tagHeader[6] = (size >> 21) & 0x7f;
  tagHeader[7] = (size >> 14) & 0x7f;
  tagHeader[8] = (size >> 7) & 0x7f;
  tagHeader[9] = size & 0x7f;

  return Buffer.concat([tagHeader, allFrames]);
}

test('ID3v2 & ID3v1 Binary Parser Suite', async (t) => {
  await t.test('Decodes 28-bit synchsafe integers accurately', () => {
    assert.equal(decodeSynchsafeInt(0, 0, 1, 0), 128);
    assert.equal(decodeSynchsafeInt(0, 1, 0, 0), 16384);
    assert.equal(decodeSynchsafeInt(0x00, 0x00, 0x02, 0x01), 257);
  });

  await t.test('Decodes multi-encoding text (UTF-8, UTF-16, Latin-1)', () => {
    const utf8Bytes = Buffer.from('Echoes - Pink Floyd', 'utf8');
    assert.equal(decodeText(utf8Bytes, 3), 'Echoes - Pink Floyd');

    const latin1Bytes = Buffer.from('Café Del Mar', 'latin1');
    assert.equal(decodeText(latin1Bytes, 0), 'Café Del Mar');

    const utf16leWithBom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Lateralus', 'utf16le')]);
    assert.equal(decodeText(utf16leWithBom, 1), 'Lateralus');
  });

  await t.test('Parses complete synthetic ID3v2.3 tag with Title, Artist, Album, Track, Year, Genre', () => {
    const buffer = buildSyntheticID3v23([
      { id: 'TIT2', text: 'Stairway to Heaven', encoding: 3 },
      { id: 'TPE1', text: 'Led Zeppelin', encoding: 3 },
      { id: 'TALB', text: 'Led Zeppelin IV', encoding: 3 },
      { id: 'TRCK', text: '4/8', encoding: 3 },
      { id: 'TYER', text: '1971', encoding: 3 },
      { id: 'TCON', text: '(17)Hard Rock', encoding: 3 }
    ]);

    const result = parseID3v2(buffer);
    assert.ok(result);
    assert.equal(result.title, 'Stairway to Heaven');
    assert.equal(result.artist, 'Led Zeppelin');
    assert.equal(result.albumArtist, 'Led Zeppelin');
    assert.equal(result.album, 'Led Zeppelin IV');
    assert.equal(result.trackNumber, 4);
    assert.equal(result.trackTotal, 8);
    assert.equal(result.year, 1971);
    assert.equal(result.genre, 'Hard Rock');
    assert.equal(result.format, 'ID3v2.3.0');
  });

  await t.test('Parses legacy ID3v2.2 tag with 3-character frame IDs', () => {
    const buffer = buildSyntheticID3v22([
      { id: 'TT2', text: 'Money', encoding: 0 },
      { id: 'TP1', text: 'Pink Floyd', encoding: 0 },
      { id: 'TAL', text: 'The Dark Side of the Moon', encoding: 0 },
      { id: 'TRK', text: '6', encoding: 0 }
    ]);

    const result = parseID3v2(buffer);
    assert.ok(result);
    assert.equal(result.title, 'Money');
    assert.equal(result.artist, 'Pink Floyd');
    assert.equal(result.album, 'The Dark Side of the Moon');
    assert.equal(result.trackNumber, 6);
    assert.equal(result.format, 'ID3v2.2.0');
  });

  await t.test('Parses APIC attached picture cover art frame', () => {
    const fakeJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const mimeBytes = Buffer.from('image/jpeg\0', 'latin1');
    const apicPayload = Buffer.concat([
      Buffer.from([0x00]), // Latin1 encoding
      mimeBytes,
      Buffer.from([0x03]), // Cover Front
      Buffer.from('\0', 'latin1'), // Empty description
      fakeJpegBytes
    ]);

    const buffer = buildSyntheticID3v23([
      { id: 'TIT2', text: 'Cover Track', encoding: 3 },
      { id: 'APIC', rawBytes: apicPayload }
    ]);

    const result = parseID3v2(buffer);
    assert.ok(result);
    assert.equal(result.title, 'Cover Track');
    assert.ok(result.artwork);
    assert.equal(result.artwork.mimeType, 'image/jpeg');
    assert.equal(result.artwork.pictureType, 3);
    assert.ok(result.artwork.dataUrl.startsWith('data:image/jpeg;base64,'));
  });

  await t.test('Parses legacy ID3v1 fallback tag at tail of buffer', () => {
    const tailBuffer = Buffer.alloc(128);
    tailBuffer.write('TAG', 0, 3, 'ascii');
    tailBuffer.write('Comfortably Numb', 3, 30, 'latin1');
    tailBuffer.write('Pink Floyd', 33, 30, 'latin1');
    tailBuffer.write('The Wall', 63, 30, 'latin1');
    tailBuffer.write('1979', 93, 4, 'latin1');
    tailBuffer[125] = 0; // ID3v1.1 indicator
    tailBuffer[126] = 6; // Track 6

    const result = parseID3v1(tailBuffer);
    assert.ok(result);
    assert.equal(result.title, 'Comfortably Numb');
    assert.equal(result.artist, 'Pink Floyd');
    assert.equal(result.album, 'The Wall');
    assert.equal(result.year, 1979);
    assert.equal(result.trackNumber, 6);
    assert.equal(result.format, 'ID3v1.1');
  });

  await t.test('Handles corrupted or truncated ID3 headers gracefully', () => {
    const corruptBuffer = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x7f, 0x7f, 0x7f, 0x7f]);
    const result = parseID3v2(corruptBuffer);
    assert.ok(result !== undefined);
  });
});
