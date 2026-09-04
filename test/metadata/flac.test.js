import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFLAC } from '../../src/metadata/flac.js';

// Helper to build synthetic FLAC binary buffer
function buildSyntheticFLAC(options = {}) {
  const {
    sampleRate = 44100,
    channels = 2,
    bitsPerSample = 16,
    totalSamples = 44100 * 240, // 240 seconds (4 mins)
    comments = [],
    picture = null
  } = options;

  const magic = Buffer.from('fLaC', 'ascii');

  // Block 0: STREAMINFO (34 bytes)
  const streamInfo = Buffer.alloc(34);
  streamInfo.writeUInt16BE(4096, 0); // min block size
  streamInfo.writeUInt16BE(4096, 2); // max block size

  streamInfo[10] = (sampleRate >> 12) & 0xff;
  streamInfo[11] = (sampleRate >> 4) & 0xff;
  streamInfo[12] = ((sampleRate & 0x0f) << 4) | (((channels - 1) & 0x07) << 1) | (((bitsPerSample - 1) >> 4) & 0x01);
  const highSamples = Math.floor(totalSamples / 0x100000000) & 0x0f;
  streamInfo[13] = (((bitsPerSample - 1) & 0x0f) << 4) | highSamples;
  streamInfo.writeUInt32BE(totalSamples >>> 0, 14);

  const hasMore = comments.length > 0 || picture !== null;
  const streamInfoHeader = Buffer.alloc(4);
  streamInfoHeader[0] = hasMore ? 0x00 : 0x80; // block type 0
  streamInfoHeader.writeUIntBE(34, 1, 3);

  const blocks = [magic, streamInfoHeader, streamInfo];

  if (comments.length > 0) {
    // Block 4: VORBIS_COMMENT
    const vendor = Buffer.from('reference libFLAC 1.4.3', 'utf8');
    const vendorLenBuf = Buffer.alloc(4);
    vendorLenBuf.writeUInt32LE(vendor.length, 0);

    const commentBuffers = [];
    for (const c of comments) {
      const cBuf = Buffer.from(c, 'utf8');
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(cBuf.length, 0);
      commentBuffers.push(lenBuf, cBuf);
    }

    const countBuf = Buffer.alloc(4);
    countBuf.writeUInt32LE(comments.length, 0);

    const vorbisBody = Buffer.concat([vendorLenBuf, vendor, countBuf, ...commentBuffers]);
    const vorbisHeader = Buffer.alloc(4);
    vorbisHeader[0] = picture !== null ? 0x04 : 0x84; // 0x80 if last
    vorbisHeader.writeUIntBE(vorbisBody.length, 1, 3);

    blocks.push(vorbisHeader, vorbisBody);
  }

  if (picture) {
    // Block 6: PICTURE
    const mimeBuf = Buffer.from(picture.mimeType, 'ascii');
    const descBuf = Buffer.from(picture.description || '', 'utf8');
    const imgData = picture.bytes || Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    const picBody = Buffer.alloc(32 + mimeBuf.length + descBuf.length + imgData.length);
    let pos = 0;
    picBody.writeUInt32BE(picture.pictureType || 3, pos); pos += 4;
    picBody.writeUInt32BE(mimeBuf.length, pos); pos += 4;
    mimeBuf.copy(picBody, pos); pos += mimeBuf.length;
    picBody.writeUInt32BE(descBuf.length, pos); pos += 4;
    descBuf.copy(picBody, pos); pos += descBuf.length;
    picBody.writeUInt32BE(300, pos); pos += 4; // width
    picBody.writeUInt32BE(300, pos); pos += 4; // height
    picBody.writeUInt32BE(24, pos); pos += 4;  // depth
    picBody.writeUInt32BE(0, pos); pos += 4;   // colors
    picBody.writeUInt32BE(imgData.length, pos); pos += 4;
    imgData.copy(picBody, pos);

    const picHeader = Buffer.alloc(4);
    picHeader[0] = 0x86; // 0x80 (is_last) | 0x06 (PICTURE)
    picHeader.writeUIntBE(picBody.length, 1, 3);

    blocks.push(picHeader, picBody);
  }

  return Buffer.concat(blocks);
}

test('FLAC Metadata Parser Suite', async (t) => {
  await t.test('Calculates duration, sample rate, and channels from STREAMINFO', () => {
    const buffer = buildSyntheticFLAC({
      sampleRate: 48000,
      channels: 2,
      bitsPerSample: 24,
      totalSamples: 48000 * 180 // 180s (3m)
    });

    const result = parseFLAC(buffer);
    assert.ok(result);
    assert.equal(result.sampleRate, 48000);
    assert.equal(result.channels, 2);
    assert.equal(result.bitsPerSample, 24);
    assert.equal(result.duration, 180);
    assert.equal(result.format, 'FLAC');
  });

  await t.test('Parses VORBIS_COMMENT tags (TITLE, ARTIST, ALBUM, TRACKNUMBER, DATE, GENRE)', () => {
    const buffer = buildSyntheticFLAC({
      comments: [
        'TITLE=Time',
        'ARTIST=Pink Floyd',
        'ALBUM=The Dark Side of the Moon',
        'TRACKNUMBER=4/10',
        'DATE=1973',
        'GENRE=Progressive Rock'
      ]
    });

    const result = parseFLAC(buffer);
    assert.ok(result);
    assert.equal(result.title, 'Time');
    assert.equal(result.artist, 'Pink Floyd');
    assert.equal(result.album, 'The Dark Side of the Moon');
    assert.equal(result.trackNumber, 4);
    assert.equal(result.trackTotal, 10);
    assert.equal(result.year, 1973);
    assert.equal(result.genre, 'Progressive Rock');
  });

  await t.test('Parses PICTURE block for embedded cover artwork', () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const buffer = buildSyntheticFLAC({
      comments: ['TITLE=Cover Track'],
      picture: {
        mimeType: 'image/jpeg',
        pictureType: 3,
        bytes: fakeJpeg
      }
    });

    const result = parseFLAC(buffer);
    assert.ok(result);
    assert.ok(result.artwork);
    assert.equal(result.artwork.mimeType, 'image/jpeg');
    assert.equal(result.artwork.pictureType, 3);
    assert.ok(result.artwork.dataUrl.startsWith('data:image/jpeg;base64,'));
  });

  await t.test('Returns null for non-FLAC files', () => {
    const nonFlac = Buffer.from('NOT_A_FLAC_FILE_HEADER');
    assert.equal(parseFLAC(nonFlac), null);
  });
});
