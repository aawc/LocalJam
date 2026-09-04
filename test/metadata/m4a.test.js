import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM4A } from '../../src/metadata/m4a.js';

// Helper to construct MP4 atoms
function makeAtom(fourcc, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(fourcc, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function makeIlstDataAtom(dataType, valueBytes) {
  // data atom header: 4-byte size, 4-byte "data", 4-byte type, 4-byte locale
  const header = Buffer.alloc(16);
  header.writeUInt32BE(16 + valueBytes.length, 0);
  header.write('data', 4, 4, 'ascii');
  header.writeUInt32BE(dataType, 8); // 1 = UTF-8, 13 = JPEG, 14 = PNG, 0 = implicit
  header.writeUInt32BE(0, 12); // locale
  return Buffer.concat([header, valueBytes]);
}

function buildSyntheticM4A(options = {}) {
  const {
    title = 'Lateralus',
    artist = 'Tool',
    album = 'Lateralus',
    trackNumber = 9,
    year = '2001',
    timescale = 1000,
    durationUnits = 564000, // 564 seconds (9m24s)
    artworkBytes = null
  } = options;

  // 1. ftyp atom
  const ftypPayload = Buffer.from('M4A \0\0\0\0M4A mp42isom', 'ascii');
  const ftyp = makeAtom('ftyp', ftypPayload);

  // 2. mvhd atom (Movie Header Atom with duration)
  const mvhdPayload = Buffer.alloc(100);
  mvhdPayload[0] = 0; // version 0
  mvhdPayload.writeUInt32BE(timescale, 12);
  mvhdPayload.writeUInt32BE(durationUnits, 16);
  const mvhd = makeAtom('mvhd', mvhdPayload);

  // 3. ilst child atoms
  const ilstChildren = [];
  if (title) {
    const data = makeIlstDataAtom(1, Buffer.from(title, 'utf8'));
    ilstChildren.push(makeAtom('©nam', data));
  }
  if (artist) {
    const data = makeIlstDataAtom(1, Buffer.from(artist, 'utf8'));
    ilstChildren.push(makeAtom('©ART', data));
  }
  if (album) {
    const data = makeIlstDataAtom(1, Buffer.from(album, 'utf8'));
    ilstChildren.push(makeAtom('©alb', data));
  }
  if (year) {
    const data = makeIlstDataAtom(1, Buffer.from(year, 'utf8'));
    ilstChildren.push(makeAtom('©day', data));
  }
  if (trackNumber) {
    const trkPayload = Buffer.alloc(8);
    trkPayload.writeUInt16BE(trackNumber, 2);
    trkPayload.writeUInt16BE(13, 4); // total 13
    const data = makeIlstDataAtom(0, trkPayload);
    ilstChildren.push(makeAtom('trkn', data));
  }
  if (artworkBytes) {
    const data = makeIlstDataAtom(13, artworkBytes); // 13 = JPEG
    ilstChildren.push(makeAtom('covr', data));
  }

  const ilst = makeAtom('ilst', Buffer.concat(ilstChildren));

  // meta atom: 4 bytes version/flags (0x00 0x00 0x00 0x00) + ilst
  const metaPayload = Buffer.concat([Buffer.alloc(4), ilst]);
  const meta = makeAtom('meta', metaPayload);

  // udta atom -> wraps meta
  const udta = makeAtom('udta', meta);

  // moov atom -> wraps mvhd and udta
  const moov = makeAtom('moov', Buffer.concat([mvhd, udta]));

  return Buffer.concat([ftyp, moov]);
}

test('M4A / MP4 Metadata Parser Suite', async (t) => {
  await t.test('Parses title, artist, album, track, year, and duration from MP4 atom tree', () => {
    const buffer = buildSyntheticM4A({
      title: 'Schism',
      artist: 'Tool',
      album: 'Lateralus',
      trackNumber: 5,
      year: '2001',
      timescale: 44100,
      durationUnits: 44100 * 407 // 407 seconds (6m47s)
    });

    const result = parseM4A(buffer);
    assert.ok(result);
    assert.equal(result.title, 'Schism');
    assert.equal(result.artist, 'Tool');
    assert.equal(result.album, 'Lateralus');
    assert.equal(result.trackNumber, 5);
    assert.equal(result.trackTotal, 13);
    assert.equal(result.year, 2001);
    assert.equal(result.duration, 407);
    assert.equal(result.format, 'M4A/AAC');
  });

  await t.test('Parses covr artwork atom', () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const buffer = buildSyntheticM4A({
      title: 'Cover Track M4A',
      artworkBytes: fakeJpeg
    });

    const result = parseM4A(buffer);
    assert.ok(result);
    assert.ok(result.artwork);
    assert.equal(result.artwork.mimeType, 'image/jpeg');
    assert.equal(result.artwork.pictureType, 3);
    assert.ok(result.artwork.dataUrl.startsWith('data:image/jpeg;base64,'));
  });

  await t.test('Returns null for empty or non-MP4 buffer', () => {
    assert.equal(parseM4A(Buffer.alloc(4)), null);
  });
});
