import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWAV } from '../../src/metadata/wav.js';
import { extractMetadataFromChunk } from '../../src/metadata/index.js';

function makeWavChunk(id, data) {
  const pad = data.length % 2 !== 0 ? 1 : 0;
  const chunk = Buffer.alloc(8 + data.length + pad);
  chunk.write(id.padEnd(4, ' ').slice(0, 4), 0, 4, 'ascii');
  chunk.writeUInt32LE(data.length, 4);
  data.copy(chunk, 8);
  if (pad) {
    chunk[8 + data.length] = 0;
  }
  return chunk;
}

function makeFmtChunk(options = {}) {
  const {
    channels = 2,
    sampleRate = 44100,
    bitsPerSample = 16,
    byteRate = sampleRate * channels * (bitsPerSample / 8)
  } = options;

  const buf = Buffer.alloc(16);
  buf.writeUInt16LE(1, 0); // PCM
  buf.writeUInt16LE(channels, 2);
  buf.writeUInt32LE(sampleRate, 4);
  buf.writeUInt32LE(byteRate, 8);
  buf.writeUInt16LE(channels * (bitsPerSample / 8), 12);
  buf.writeUInt16LE(bitsPerSample, 14);

  return makeWavChunk('fmt ', buf);
}

function makeDataChunk(dataSize) {
  const buf = Buffer.alloc(dataSize);
  return makeWavChunk('data', buf);
}

function makeListInfoChunk(tags = {}) {
  const subchunks = [];
  for (const [key, value] of Object.entries(tags)) {
    const valBuf = Buffer.from(value + '\0', 'utf8');
    subchunks.push(makeWavChunk(key, valBuf));
  }

  const listData = Buffer.concat([Buffer.from('INFO', 'ascii'), ...subchunks]);
  return makeWavChunk('LIST', listData);
}

function buildSyntheticID3v23(frames = []) {
  const frameBuffers = [];
  for (const { id, text } of frames) {
    const idBytes = Buffer.from(id, 'ascii');
    const textBytes = Buffer.from(text, 'utf8');
    const payload = Buffer.concat([Buffer.from([3]), textBytes]); // UTF-8 encoding (3)

    const frameHeader = Buffer.alloc(10);
    idBytes.copy(frameHeader, 0, 0, 4);
    frameHeader.writeUInt32BE(payload.length, 4);
    frameHeader.writeUInt16BE(0, 8);

    frameBuffers.push(frameHeader, payload);
  }

  const allFrames = Buffer.concat(frameBuffers);
  const tagHeader = Buffer.alloc(10);
  tagHeader.write('ID3', 0, 3, 'ascii');
  tagHeader[3] = 3; // ID3v2.3
  tagHeader[4] = 0;
  tagHeader[5] = 0;

  const size = allFrames.length;
  tagHeader[6] = (size >> 21) & 0x7f;
  tagHeader[7] = (size >> 14) & 0x7f;
  tagHeader[8] = (size >> 7) & 0x7f;
  tagHeader[9] = size & 0x7f;

  return Buffer.concat([tagHeader, allFrames]);
}

function assembleRIFF(chunks) {
  const payload = Buffer.concat(chunks);
  const riffHeader = Buffer.alloc(12);
  riffHeader.write('RIFF', 0, 4, 'ascii');
  riffHeader.writeUInt32LE(4 + payload.length, 4);
  riffHeader.write('WAVE', 8, 4, 'ascii');
  return Buffer.concat([riffHeader, payload]);
}

test('WAV/RIFF Metadata Parser Suite', async (t) => {
  await t.test('Calculates sample rate, channels, duration, and parses LIST INFO tags', () => {
    const sampleRate = 44100;
    const channels = 2;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8); // 176400 bytes/sec
    const durationSec = 120; // 2 minutes
    const dataSize = byteRate * durationSec;

    const fmtChunk = makeFmtChunk({ channels, sampleRate, bitsPerSample, byteRate });
    const dataChunk = makeDataChunk(dataSize);
    const listChunk = makeListInfoChunk({
      INAM: 'Echoes',
      IART: 'Pink Floyd',
      IPRD: 'Meddle',
      IGNR: 'Progressive Rock',
      ICRD: '1971',
      ITRK: '6'
    });

    const wavBuffer = assembleRIFF([fmtChunk, listChunk, dataChunk]);
    const result = parseWAV(wavBuffer);

    assert.ok(result);
    assert.equal(result.format, 'WAV');
    assert.equal(result.sampleRate, 44100);
    assert.equal(result.channels, 2);
    assert.equal(result.duration, 120);
    assert.equal(result.title, 'Echoes');
    assert.equal(result.artist, 'Pink Floyd');
    assert.equal(result.albumArtist, 'Pink Floyd');
    assert.equal(result.album, 'Meddle');
    assert.equal(result.genre, 'Progressive Rock');
    assert.equal(result.year, 1971);
    assert.equal(result.trackNumber, 6);
  });

  await t.test('Parses embedded id3 chunk in WAV', () => {
    const fmtChunk = makeFmtChunk({ channels: 1, sampleRate: 22050, bitsPerSample: 16 });
    const id3Data = buildSyntheticID3v23([
      { id: 'TIT2', text: 'Time' },
      { id: 'TPE1', text: 'Pink Floyd' },
      { id: 'TALB', text: 'Dark Side of the Moon' },
      { id: 'TYER', text: '1973' },
      { id: 'TRCK', text: '4/10' }
    ]);
    const id3Chunk = makeWavChunk('id3 ', id3Data);

    const wavBuffer = assembleRIFF([fmtChunk, id3Chunk]);
    const result = parseWAV(wavBuffer);

    assert.ok(result);
    assert.equal(result.format, 'WAV');
    assert.equal(result.sampleRate, 22050);
    assert.equal(result.channels, 1);
    assert.equal(result.title, 'Time');
    assert.equal(result.artist, 'Pink Floyd');
    assert.equal(result.album, 'Dark Side of the Moon');
    assert.equal(result.year, 1973);
    assert.equal(result.trackNumber, 4);
    assert.equal(result.trackTotal, 10);
  });

  await t.test('Handles truncated and corrupt buffers gracefully without crashing', () => {
    assert.equal(parseWAV(null), null);
    assert.equal(parseWAV(new Uint8Array(0)), null);
    assert.equal(parseWAV(new Uint8Array([1, 2, 3])), null);
    assert.equal(parseWAV(Buffer.from('fLaC000000000000')), null);

    // Corrupt / truncated RIFF
    const truncated = Buffer.from('RIFF\x10\x00\x00\x00WAVEfmt ');
    const result = parseWAV(truncated);
    assert.ok(result);
    assert.equal(result.format, 'WAV');
    assert.equal(result.title, null);
  });

  await t.test('Integration: extractMetadataFromChunk correctly delegates to parseWAV', () => {
    const fmtChunk = makeFmtChunk({ channels: 2, sampleRate: 48000 });
    const listChunk = makeListInfoChunk({
      INAM: 'Money',
      IART: 'Pink Floyd'
    });
    const wavBuffer = assembleRIFF([fmtChunk, listChunk]);

    const meta = extractMetadataFromChunk(wavBuffer, 'Money.wav', 'Money.wav', wavBuffer.length);
    assert.equal(meta.format, 'WAV');
    assert.equal(meta.title, 'Money');
    assert.equal(meta.artist, 'Pink Floyd');
    assert.equal(meta.sampleRate, 48000);
    assert.equal(meta.channels, 2);
  });
});
