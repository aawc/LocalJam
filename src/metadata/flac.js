/**
 * LocalJam - FLAC Audio Metadata Parser
 * Zero-dependency pure JavaScript binary parser for FLAC metadata blocks (STREAMINFO, VORBIS_COMMENT, PICTURE).
 */

import { bytesToDataUrl } from './id3v2.js';

export function parseFLAC(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length < 42) return null;

  // Check FLAC magic bytes (0x66 0x4C 0x61 0x43 -> "fLaC")
  if (bytes[0] !== 0x66 || bytes[1] !== 0x4C || bytes[2] !== 0x61 || bytes[3] !== 0x43) {
    return null;
  }

  const result = {
    title: null,
    artist: null,
    albumArtist: null,
    album: null,
    genre: null,
    year: null,
    trackNumber: null,
    trackTotal: null,
    discNumber: null,
    discTotal: null,
    duration: 0,
    sampleRate: 0,
    channels: 0,
    bitsPerSample: 0,
    artwork: null,
    format: 'FLAC'
  };

  let offset = 4;
  let isLastBlock = false;

  while (offset + 4 <= bytes.length && !isLastBlock) {
    const headerByte = bytes[offset];
    isLastBlock = (headerByte & 0x80) !== 0;
    const blockType = headerByte & 0x7f;
    const blockLength = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 4;

    if (offset + blockLength > bytes.length) {
      // Truncated block slice (common with 128KB chunk inspection)
      // Parse whatever portion is available if it's STREAMINFO or VORBIS_COMMENT
    }

    const blockEnd = Math.min(bytes.length, offset + blockLength);
    const blockBytes = bytes.subarray(offset, blockEnd);

    try {
      if (blockType === 0) {
        // STREAMINFO Block (34 bytes minimum)
        if (blockBytes.length >= 34) {
          const sampleRate = (blockBytes[10] << 12) | (blockBytes[11] << 4) | (blockBytes[12] >> 4);
          const channels = ((blockBytes[12] >> 1) & 0x07) + 1;
          const bitsPerSample = (((blockBytes[12] & 0x01) << 4) | (blockBytes[13] >> 4)) + 1;
          
          // Total samples is 36 bits (last 4 bits of byte 13 + bytes 14..17)
          const totalSamplesHigh = blockBytes[13] & 0x0f;
          const totalSamplesLow = (blockBytes[14] << 24) | (blockBytes[15] << 16) | (blockBytes[16] << 8) | blockBytes[17];
          const totalSamples = (totalSamplesHigh * 0x100000000) + (totalSamplesLow >>> 0);

          result.sampleRate = sampleRate;
          result.channels = channels;
          result.bitsPerSample = bitsPerSample;
          if (sampleRate > 0 && totalSamples > 0) {
            result.duration = Math.round((totalSamples / sampleRate) * 100) / 100;
          }
        }
      } else if (blockType === 4) {
        // VORBIS_COMMENT Block
        parseVorbisComment(blockBytes, result);
      } else if (blockType === 6 && !result.artwork) {
        // PICTURE Block
        parseFlacPicture(blockBytes, result);
      }
    } catch (err) {
      console.error(`[FLAC Parser] Error parsing block type ${blockType}: ${err.message}`);
    }

    offset += blockLength;
  }

  // Fallback albumArtist to artist
  if (!result.albumArtist && result.artist) {
    result.albumArtist = result.artist;
  }

  return result;
}

export function parseVorbisComment(bytes, result) {
  if (bytes.length < 8) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const utf8Decoder = new TextDecoder('utf-8');

  let offset = 0;
  // 4-byte Little-Endian Vendor Length
  const vendorLen = view.getUint32(offset, true);
  offset += 4 + vendorLen;

  if (offset + 4 > bytes.length) return;

  // 4-byte Little-Endian Comment List Length
  const commentCount = view.getUint32(offset, true);
  offset += 4;

  for (let i = 0; i < commentCount && offset + 4 <= bytes.length; i++) {
    const commentLen = view.getUint32(offset, true);
    offset += 4;

    if (offset + commentLen > bytes.length) break;

    const commentBytes = bytes.subarray(offset, offset + commentLen);
    offset += commentLen;

    const commentStr = utf8Decoder.decode(commentBytes);
    const eqIdx = commentStr.indexOf('=');
    if (eqIdx === -1) continue;

    const key = commentStr.slice(0, eqIdx).toUpperCase().trim();
    const value = commentStr.slice(eqIdx + 1).trim();

    if (key === 'TITLE') {
      result.title = value;
    } else if (key === 'ARTIST') {
      result.artist = value;
    } else if (key === 'ALBUMARTIST' || key === 'ALBUM ARTIST') {
      result.albumArtist = value;
    } else if (key === 'ALBUM') {
      result.album = value;
    } else if (key === 'GENRE') {
      result.genre = value;
    } else if (key === 'DATE' || key === 'YEAR') {
      const match = /(\d{4})/.exec(value);
      if (match) result.year = parseInt(match[1], 10);
    } else if (key === 'TRACKNUMBER' || key === 'TRACK') {
      const parts = value.split('/');
      result.trackNumber = parseInt(parts[0], 10) || null;
      if (parts[1]) result.trackTotal = parseInt(parts[1], 10) || null;
    } else if (key === 'TRACKTOTAL' || key === 'TOTALTRACKS') {
      result.trackTotal = parseInt(value, 10) || null;
    } else if (key === 'DISCNUMBER' || key === 'DISC') {
      const parts = value.split('/');
      result.discNumber = parseInt(parts[0], 10) || null;
      if (parts[1]) result.discTotal = parseInt(parts[1], 10) || null;
    } else if (key === 'DISCTOTAL' || key === 'TOTALDISCS') {
      result.discTotal = parseInt(value, 10) || null;
    }
  }
}

function parseFlacPicture(bytes, result) {
  if (bytes.length < 32) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const asciiDecoder = new TextDecoder('iso-8859-1');

  let offset = 0;
  // 4-byte Picture Type (Big Endian)
  const pictureType = view.getUint32(offset, false);
  offset += 4;

  // 4-byte MIME length
  const mimeLen = view.getUint32(offset, false);
  offset += 4;

  if (offset + mimeLen > bytes.length) return;
  const mimeType = asciiDecoder.decode(bytes.subarray(offset, offset + mimeLen)).toLowerCase() || 'image/jpeg';
  offset += mimeLen;

  // 4-byte Description length
  if (offset + 4 > bytes.length) return;
  const descLen = view.getUint32(offset, false);
  offset += 4 + descLen;

  // Skip 4x4 bytes: width, height, depth, colors
  offset += 16;

  // 4-byte Data length
  if (offset + 4 > bytes.length) return;
  const dataLen = view.getUint32(offset, false);
  offset += 4;

  const dataEnd = Math.min(bytes.length, offset + dataLen);
  const rawImageBytes = bytes.subarray(offset, dataEnd);

  if (rawImageBytes.length > 0) {
    result.artwork = {
      mimeType,
      pictureType,
      bytes: rawImageBytes,
      dataUrl: bytesToDataUrl(rawImageBytes, mimeType)
    };
  }
}
