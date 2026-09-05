/**
 * LocalJam - ID3v2 & ID3v1 Audio Metadata Parser
 * Zero-dependency pure JavaScript binary parser for ID3v2.2, ID3v2.3, ID3v2.4, and ID3v1 tags.
 */

import { sanitizeMimeType } from '../utils/sanitize.js';

// Helper to decode synchsafe integer (28-bit)
export function decodeSynchsafeInt(b0, b1, b2, b3) {
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

// Helper to decode standard 32-bit big-endian integer
export function decodeInt32(view, offset) {
  return view.getUint32(offset, false);
}

// Decode text with specified encoding
export function decodeText(bytes, encodingByte) {
  if (!bytes || bytes.length === 0) return '';

  try {
    switch (encodingByte) {
      case 0x00: {
        // ISO-8859-1 (Latin-1)
        const decoder = new TextDecoder('iso-8859-1');
        return decoder.decode(bytes).replace(/\0+$/, '').trim();
      }
      case 0x01: {
        // UTF-16 with BOM
        const decoder = new TextDecoder('utf-16');
        return decoder.decode(bytes).replace(/\0+$/, '').trim();
      }
      case 0x02: {
        // UTF-16BE without BOM
        const decoder = new TextDecoder('utf-16be');
        return decoder.decode(bytes).replace(/\0+$/, '').trim();
      }
      case 0x03:
      default: {
        // UTF-8
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(bytes).replace(/\0+$/, '').trim();
      }
    }
  } catch (err) {
    console.error(`[ID3 Parser] Text decoding error (encoding ${encodingByte}): ${err.message}`);
    // Fallback simple ascii decoding
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] >= 32 && bytes[i] <= 126) str += String.fromCharCode(bytes[i]);
    }
    return str.trim();
  }
}

// Find null terminator for text encoding
function findNullTerminator(bytes, offset, encodingByte) {
  if (encodingByte === 0x01 || encodingByte === 0x02) {
    // 2-byte null terminator (0x00 0x00) on 2-byte alignment
    for (let i = offset; i < bytes.length - 1; i += 2) {
      if (bytes[i] === 0x00 && bytes[i + 1] === 0x00) return i;
    }
  } else {
    // 1-byte null terminator
    for (let i = offset; i < bytes.length; i++) {
      if (bytes[i] === 0x00) return i;
    }
  }
  return -1;
}

// Convert byte array to data URL efficiently
export function bytesToDataUrl(bytes, mimeType = 'image/jpeg') {
  if (!bytes || bytes.length === 0) return null;
  const safeMime = sanitizeMimeType(mimeType);
  let base64 = '';
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64');
  } else {
    const CHUNK_SIZE = 0x8000;
    const chunks = [];
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE)));
    }
    base64 = btoa(chunks.join(''));
  }
  return `data:${safeMime};base64,${base64}`;
}

/**
 * Parse ID3v2 metadata from an ArrayBuffer or Uint8Array
 */
export function parseID3v2(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length < 10) return null;

  // Check ID3 magic bytes (0x49 0x44 0x33 -> "ID3")
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return parseID3v1(bytes);
  }

  const majorVersion = bytes[3]; // 2 = ID3v2.2, 3 = ID3v2.3, 4 = ID3v2.4
  const revision = bytes[4];
  const flags = bytes[5];
  const hasUnsync = (flags & 0x80) !== 0;
  const hasExtendedHeader = (flags & 0x40) !== 0;
  const isFooterPresent = (flags & 0x10) !== 0;

  const tagSize = decodeSynchsafeInt(bytes[6], bytes[7], bytes[8], bytes[9]);
  const endOffset = Math.min(bytes.length, 10 + tagSize);

  let offset = 10;

  // Skip extended header if present
  if (hasExtendedHeader && offset < endOffset) {
    let extSize;
    if (majorVersion === 4) {
      extSize = decodeSynchsafeInt(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    } else {
      extSize = view.getUint32(offset, false);
    }
    offset += Math.max(4, extSize);
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
    artwork: null,
    format: `ID3v2.${majorVersion}.${revision}`
  };

  const isV22 = majorVersion === 2;
  const frameHeaderSize = isV22 ? 6 : 10;

  while (offset + frameHeaderSize <= endOffset) {
    // Check for padding (0x00 bytes)
    if (bytes[offset] === 0x00) break;

    let frameId;
    let frameSize;

    if (isV22) {
      // 3-char frame ID, 3-byte size
      frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
      frameSize = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
      offset += 6;
    } else {
      // 4-char frame ID, 4-byte size, 2-byte flags
      frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      if (majorVersion === 4) {
        frameSize = decodeSynchsafeInt(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      } else {
        frameSize = view.getUint32(offset + 4, false);
      }
      offset += 10;
    }

    if (frameSize <= 0 || offset + frameSize > endOffset) break;

    const frameBytes = bytes.subarray(offset, offset + frameSize);
    offset += frameSize;

    try {
      // Text frames: TIT2/TT2 (Title), TPE1/TP1 (Artist), TPE2/TP2 (Album Artist), TALB/TAL (Album),
      // TRCK/TRK (Track), TPOS/TPA (Disc), TCON/TCO (Genre), TYER/TYE/TDRC (Year)
      if (frameId === 'TIT2' || frameId === 'TT2') {
        result.title = decodeText(frameBytes.subarray(1), frameBytes[0]);
      } else if (frameId === 'TPE1' || frameId === 'TP1') {
        result.artist = decodeText(frameBytes.subarray(1), frameBytes[0]);
      } else if (frameId === 'TPE2' || frameId === 'TP2') {
        result.albumArtist = decodeText(frameBytes.subarray(1), frameBytes[0]);
      } else if (frameId === 'TALB' || frameId === 'TAL') {
        result.album = decodeText(frameBytes.subarray(1), frameBytes[0]);
      } else if (frameId === 'TCON' || frameId === 'TCO') {
        let genreStr = decodeText(frameBytes.subarray(1), frameBytes[0]);
        // Strip ID3v1 parenthesized numeric genres e.g. "(17)Rock" -> "Rock"
        genreStr = genreStr.replace(/^\(\d+\)\s*/, '');
        result.genre = genreStr || null;
      } else if (frameId === 'TYER' || frameId === 'TYE' || frameId === 'TDRC') {
        const yearStr = decodeText(frameBytes.subarray(1), frameBytes[0]);
        const match = /(\d{4})/.exec(yearStr);
        if (match) result.year = parseInt(match[1], 10);
      } else if (frameId === 'TRCK' || frameId === 'TRK') {
        const trkStr = decodeText(frameBytes.subarray(1), frameBytes[0]);
        const parts = trkStr.split('/');
        result.trackNumber = parseInt(parts[0], 10) || null;
        if (parts[1]) result.trackTotal = parseInt(parts[1], 10) || null;
      } else if (frameId === 'TPOS' || frameId === 'TPA') {
        const discStr = decodeText(frameBytes.subarray(1), frameBytes[0]);
        const parts = discStr.split('/');
        result.discNumber = parseInt(parts[0], 10) || null;
        if (parts[1]) result.discTotal = parseInt(parts[1], 10) || null;
      } else if ((frameId === 'APIC' || frameId === 'PIC') && !result.artwork) {
        // Attached Picture frame
        let picOffset = 0;
        const picEncoding = frameBytes[picOffset++];
        let mimeType = 'image/jpeg';

        if (isV22) {
          // 3-byte format format e.g. "JPG" or "PNG"
          const fmt = String.fromCharCode(frameBytes[picOffset], frameBytes[picOffset + 1], frameBytes[picOffset + 2]).toLowerCase();
          picOffset += 3;
          mimeType = fmt === 'png' ? 'image/png' : 'image/jpeg';
        } else {
          // Null-terminated MIME string
          let nullPos = -1;
          for (let i = picOffset; i < frameBytes.length; i++) {
            if (frameBytes[i] === 0x00) {
              nullPos = i;
              break;
            }
          }
          if (nullPos !== -1) {
            mimeType = new TextDecoder('iso-8859-1').decode(frameBytes.subarray(picOffset, nullPos)).toLowerCase() || 'image/jpeg';
            picOffset = nullPos + 1;
          }
        }

        const pictureType = frameBytes[picOffset++]; // 0x03 = Cover Front

        // Skip description string
        const descNullPos = findNullTerminator(frameBytes, picOffset, picEncoding);
        if (descNullPos !== -1) {
          picOffset = descNullPos + (picEncoding === 0x01 || picEncoding === 0x02 ? 2 : 1);
        }

        if (picOffset < frameBytes.length) {
          const rawImageBytes = frameBytes.subarray(picOffset);
          if (rawImageBytes.length > 0) {
            result.artwork = {
              mimeType: sanitizeMimeType(mimeType),
              pictureType,
              bytes: rawImageBytes,
              dataUrl: bytesToDataUrl(rawImageBytes, mimeType)
            };
          }
        }
      }
    } catch (frameErr) {
      console.error(`[ID3 Parser] Error parsing frame ${frameId}: ${frameErr.message}`);
    }
  }

  // Use artist as albumArtist if missing
  if (!result.albumArtist && result.artist) {
    result.albumArtist = result.artist;
  }

  return result;
}

/**
 * Fallback ID3v1 parser (last 128 bytes of file)
 */
export function parseID3v1(bytes) {
  if (bytes.length < 128) return null;
  const start = bytes.length - 128;

  // Check magic "TAG" (0x54 0x41 0x47)
  if (bytes[start] !== 0x54 || bytes[start + 1] !== 0x41 || bytes[start + 2] !== 0x47) {
    return null;
  }

  const decoder = new TextDecoder('iso-8859-1');
  const title = decoder.decode(bytes.subarray(start + 3, start + 33)).replace(/\0+$/, '').trim();
  const artist = decoder.decode(bytes.subarray(start + 33, start + 63)).replace(/\0+$/, '').trim();
  const album = decoder.decode(bytes.subarray(start + 63, start + 93)).replace(/\0+$/, '').trim();
  const yearStr = decoder.decode(bytes.subarray(start + 93, start + 97)).replace(/\0+$/, '').trim();
  const year = parseInt(yearStr, 10) || null;

  let trackNumber = null;
  // ID3v1.1: if byte 125 is 0, byte 126 is track number
  if (bytes[start + 125] === 0x00 && bytes[start + 126] !== 0x00) {
    trackNumber = bytes[start + 126];
  }

  return {
    title: title || null,
    artist: artist || null,
    albumArtist: artist || null,
    album: album || null,
    genre: null,
    year,
    trackNumber,
    trackTotal: null,
    discNumber: null,
    discTotal: null,
    artwork: null,
    format: trackNumber ? 'ID3v1.1' : 'ID3v1'
  };
}
