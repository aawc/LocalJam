/**
 * LocalJam - WAV/RIFF Audio Metadata Parser
 * Zero-dependency pure JavaScript binary parser for RIFF WAVE headers, fmt, data, LIST INFO, and ID3 chunks.
 */

import { parseID3v2 } from './id3v2.js';

/**
 * Parse WAV metadata from an ArrayBuffer or Uint8Array
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {object|null}
 */
export function parseWAV(buffer) {
  if (!buffer) return null;
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 12) return null;

  // Validate RIFF header: bytes 0..3 === 'RIFF', bytes 8..11 === 'WAVE'
  if (
    bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 || bytes[9] !== 0x41 || bytes[10] !== 0x56 || bytes[11] !== 0x45
  ) {
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
    duration: 0,
    sampleRate: 0,
    channels: 0,
    format: 'WAV'
  };

  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const asciiDecoder = new TextDecoder('ascii');
    const utf8Decoder = new TextDecoder('utf-8');

    let offset = 12;
    let byteRate = 0;

    while (offset + 8 <= bytes.length) {
      const chunkId = asciiDecoder.decode(bytes.subarray(offset, offset + 4));
      const chunkSize = view.getUint32(offset + 4, true);
      const chunkDataOffset = offset + 8;

      if (chunkSize < 0) break;

      const chunkDataEnd = Math.min(bytes.length, chunkDataOffset + chunkSize);

      if (chunkId === 'fmt ' && chunkDataEnd >= chunkDataOffset + 16) {
        // audioFormat = view.getUint16(chunkDataOffset, true);
        result.channels = view.getUint16(chunkDataOffset + 2, true);
        result.sampleRate = view.getUint32(chunkDataOffset + 4, true);
        byteRate = view.getUint32(chunkDataOffset + 8, true);
        // bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
      } else if (chunkId === 'data') {
        const dataSize = chunkSize;
        if (byteRate > 0 && result.duration === 0) {
          result.duration = Math.round(dataSize / byteRate);
        }
      } else if (chunkId === 'LIST' && chunkDataEnd >= chunkDataOffset + 4) {
        const listType = asciiDecoder.decode(bytes.subarray(chunkDataOffset, chunkDataOffset + 4));
        if (listType === 'INFO') {
          let subOffset = chunkDataOffset + 4;
          while (subOffset + 8 <= chunkDataEnd) {
            const subId = asciiDecoder.decode(bytes.subarray(subOffset, subOffset + 4));
            const subSize = view.getUint32(subOffset + 4, true);
            const subDataOffset = subOffset + 8;
            if (subSize < 0) break;

            const subDataEnd = Math.min(chunkDataEnd, subDataOffset + subSize);
            if (subDataOffset <= chunkDataEnd) {
              const subBytes = bytes.subarray(subDataOffset, subDataEnd);
              const val = utf8Decoder.decode(subBytes).replace(/\0+$/, '').trim();

              if (subId === 'INAM') {
                result.title = val;
              } else if (subId === 'IART') {
                result.artist = val;
              } else if (subId === 'IPRD') {
                result.album = val;
              } else if (subId === 'IGNR') {
                result.genre = val;
              } else if (subId === 'ICRD' || subId === 'YEAR') {
                const match = /(\d{4})/.exec(val);
                if (match) result.year = parseInt(match[1], 10);
              } else if (subId === 'ITRK' || subId === 'IPRT') {
                result.trackNumber = parseInt(val, 10) || null;
              }
            }

            const subPaddedSize = subSize + (subSize % 2);
            subOffset += 8 + (subPaddedSize > 0 ? subPaddedSize : 0);
          }
        }
      } else if (chunkId === 'id3 ' || chunkId === 'ID3 ') {
        const id3Bytes = bytes.subarray(chunkDataOffset, chunkDataEnd);
        const id3Meta = parseID3v2(id3Bytes);
        if (id3Meta) {
          result.title = result.title || id3Meta.title;
          result.artist = result.artist || id3Meta.artist;
          result.album = result.album || id3Meta.album;
          result.albumArtist = result.albumArtist || id3Meta.albumArtist;
          result.genre = result.genre || id3Meta.genre;
          result.year = result.year || id3Meta.year;
          result.trackNumber = result.trackNumber || id3Meta.trackNumber;
          result.trackTotal = result.trackTotal || id3Meta.trackTotal;
          if (!result.artwork && id3Meta.artwork) {
            result.artwork = id3Meta.artwork;
          }
        }
      }

      // Word alignment: RIFF chunks must be padded to even byte boundary
      const paddedSize = chunkSize + (chunkSize % 2);
      offset += 8 + (paddedSize > 0 ? paddedSize : 0);
    }

    if (!result.albumArtist && result.artist) {
      result.albumArtist = result.artist;
    }
  } catch (err) {
    console.warn(`[WAV Parser] Error parsing WAV container (${err?.name}): ${err?.message}`);
  }

  return result;
}
