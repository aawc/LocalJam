import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOgg } from '../../src/metadata/ogg.js';
import { extractMetadataFromChunk } from '../../src/metadata/index.js';

/**
 * Helper to construct an Ogg Page containing one or more packets.
 */
function makeOggPage(packets, options = {}) {
  const {
    headerType = 0,
    serialNumber = 1234,
    sequenceNumber = 0,
    granulePosition = 0
  } = options;

  const lacingValues = [];
  for (const pkt of packets) {
    let remaining = pkt.length;
    while (remaining >= 255) {
      lacingValues.push(255);
      remaining -= 255;
    }
    lacingValues.push(remaining);
  }

  const numSegments = lacingValues.length;
  const header = Buffer.alloc(27 + numSegments);
  header.write('OggS', 0, 4, 'ascii');
  header[4] = 0; // version
  header[5] = headerType;
  header.writeBigInt64LE(BigInt(granulePosition), 6);
  header.writeUInt32LE(serialNumber, 14);
  header.writeUInt32LE(sequenceNumber, 18);
  header.writeUInt32LE(0, 22); // CRC
  header[26] = numSegments;

  for (let i = 0; i < numSegments; i++) {
    header[27 + i] = lacingValues[i];
  }

  return Buffer.concat([header, ...packets]);
}

function makeVorbisIdHeader(channels = 2, sampleRate = 44100) {
  const buf = Buffer.alloc(30);
  buf[0] = 0x01;
  buf.write('vorbis', 1, 6, 'ascii');
  buf.writeUInt32LE(0, 7); // vorbis_version
  buf[11] = channels;
  buf.writeUInt32LE(sampleRate, 12);
  buf.writeInt32LE(192000, 16);
  buf.writeInt32LE(128000, 20);
  buf.writeInt32LE(64000, 24);
  buf[28] = 0xb8;
  buf[29] = 0x01; // framing
  return buf;
}

function makeVorbisCommentPacket(vendor, comments) {
  const prefix = Buffer.alloc(7);
  prefix[0] = 0x03;
  prefix.write('vorbis', 1, 6, 'ascii');

  const vendorBuf = Buffer.from(vendor, 'utf8');
  const vendorLen = Buffer.alloc(4);
  vendorLen.writeUInt32LE(vendorBuf.length, 0);

  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32LE(comments.length, 0);

  const commentBufs = [];
  for (const c of comments) {
    const cBuf = Buffer.from(c, 'utf8');
    const cLen = Buffer.alloc(4);
    cLen.writeUInt32LE(cBuf.length, 0);
    commentBufs.push(cLen, cBuf);
  }

  const framing = Buffer.from([0x01]);
  return Buffer.concat([prefix, vendorLen, vendorBuf, countBuf, ...commentBufs, framing]);
}

function makeOpusHead(channels = 2, sampleRate = 48000) {
  const buf = Buffer.alloc(19);
  buf.write('OpusHead', 0, 8, 'ascii');
  buf[8] = 1; // version
  buf[9] = channels;
  buf.writeUInt16LE(312, 10); // preSkip
  buf.writeUInt32LE(sampleRate, 12); // input sample rate
  buf.writeInt16LE(0, 16); // output gain
  buf[18] = 0; // mapping family
  return buf;
}

function makeOpusTags(vendor, comments) {
  const magic = Buffer.from('OpusTags', 'ascii');

  const vendorBuf = Buffer.from(vendor, 'utf8');
  const vendorLen = Buffer.alloc(4);
  vendorLen.writeUInt32LE(vendorBuf.length, 0);

  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32LE(comments.length, 0);

  const commentBufs = [];
  for (const c of comments) {
    const cBuf = Buffer.from(c, 'utf8');
    const cLen = Buffer.alloc(4);
    cLen.writeUInt32LE(cBuf.length, 0);
    commentBufs.push(cLen, cBuf);
  }

  return Buffer.concat([magic, vendorLen, vendorBuf, countBuf, ...commentBufs]);
}

test('OGG Metadata Parser Suite', async (t) => {
  await t.test('Parses Ogg Vorbis identification header and Vorbis comments', () => {
    const idPacket = makeVorbisIdHeader(2, 44100);
    const commentPacket = makeVorbisCommentPacket('Xiph.Org libVorbis I 20200413', [
      'TITLE=Eclipse',
      'ARTIST=Pink Floyd',
      'ALBUM=The Dark Side of the Moon',
      'GENRE=Progressive Rock',
      'DATE=1973',
      'TRACKNUMBER=10/10'
    ]);

    const page0 = makeOggPage([idPacket], { headerType: 0x02, sequenceNumber: 0 });
    const page1 = makeOggPage([commentPacket], { headerType: 0x00, sequenceNumber: 1 });
    const oggBuffer = Buffer.concat([page0, page1]);

    const result = parseOgg(oggBuffer);
    assert.ok(result);
    assert.equal(result.format, 'OGG');
    assert.equal(result.title, 'Eclipse');
    assert.equal(result.artist, 'Pink Floyd');
    assert.equal(result.albumArtist, 'Pink Floyd');
    assert.equal(result.album, 'The Dark Side of the Moon');
    assert.equal(result.genre, 'Progressive Rock');
    assert.equal(result.year, 1973);
    assert.equal(result.trackNumber, 10);
    assert.equal(result.trackTotal, 10);
    assert.equal(result.channels, 2);
    assert.equal(result.sampleRate, 44100);
  });

  await t.test('Parses Ogg Opus OpusHead and OpusTags', () => {
    const headPacket = makeOpusHead(2, 48000);
    const tagsPacket = makeOpusTags('libopus 1.3.1', [
      'TITLE=Comfortably Numb',
      'ARTIST=Pink Floyd',
      'ALBUM=The Wall',
      'GENRE=Rock',
      'DATE=1979',
      'TRACKNUMBER=6'
    ]);

    const page0 = makeOggPage([headPacket], { headerType: 0x02, sequenceNumber: 0 });
    const page1 = makeOggPage([tagsPacket], { headerType: 0x00, sequenceNumber: 1 });
    const oggBuffer = Buffer.concat([page0, page1]);

    const result = parseOgg(oggBuffer);
    assert.ok(result);
    assert.equal(result.format, 'Opus');
    assert.equal(result.title, 'Comfortably Numb');
    assert.equal(result.artist, 'Pink Floyd');
    assert.equal(result.albumArtist, 'Pink Floyd');
    assert.equal(result.album, 'The Wall');
    assert.equal(result.genre, 'Rock');
    assert.equal(result.year, 1979);
    assert.equal(result.trackNumber, 6);
    assert.equal(result.channels, 2);
    assert.equal(result.sampleRate, 48000);
  });

  await t.test('Handles truncated and invalid buffers gracefully without crashing', () => {
    assert.equal(parseOgg(null), null);
    assert.equal(parseOgg(new Uint8Array(0)), null);
    assert.equal(parseOgg(new Uint8Array([1, 2, 3, 4])), null);
    assert.equal(parseOgg(Buffer.from('RIFF1234WAVE')), null);

    // Truncated OggS header
    const partialOgg = Buffer.from('OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01\x10');
    const result = parseOgg(partialOgg);
    assert.ok(result);
    assert.equal(result.format, 'OGG');
    assert.equal(result.title, null);
  });

  await t.test('Integration: extractMetadataFromChunk handles Ogg, WebM, and AAC', () => {
    // 1. Ogg via chunk extractor
    const idPacket = makeVorbisIdHeader(2, 44100);
    const commentPacket = makeVorbisCommentPacket('Xiph.Org', ['TITLE=Track 1', 'ARTIST=Artist 1']);
    const oggBuffer = Buffer.concat([
      makeOggPage([idPacket], { headerType: 0x02, sequenceNumber: 0 }),
      makeOggPage([commentPacket], { headerType: 0x00, sequenceNumber: 1 })
    ]);
    const oggMeta = extractMetadataFromChunk(oggBuffer, 'track.ogg', 'track.ogg', oggBuffer.length);
    assert.equal(oggMeta.format, 'OGG');
    assert.equal(oggMeta.title, 'Track 1');
    assert.equal(oggMeta.artist, 'Artist 1');

    // 2. WebM via EBML magic
    const webmHeader = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81]);
    const webmMeta = extractMetadataFromChunk(webmHeader, 'audio.webm', 'audio.webm', 1000);
    assert.equal(webmMeta.format, 'WebM');

    // 3. AAC via ADTS syncword (0xFF, 0xF1)
    const aacHeader = new Uint8Array([0xFF, 0xF1, 0x4C, 0x80, 0x01, 0x40, 0x20]);
    const aacMeta = extractMetadataFromChunk(aacHeader, 'stream.aac', 'stream.aac', 500);
    assert.equal(aacMeta.format, 'AAC');
  });
});
