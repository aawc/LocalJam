/**
 * LocalJam - M4A / MP4 / AAC Metadata Parser
 * Zero-dependency pure JavaScript binary parser for ISO Base Media / QuickTime atoms (moov.udta.meta.ilst).
 */

import { bytesToDataUrl } from './id3v2.js';

export function parseM4A(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length < 8) return null;

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
    artwork: null,
    format: 'M4A/AAC'
  };

  try {
    findAndParseAtoms(bytes, view, 0, bytes.length, result);
  } catch (err) {
    console.error(`[M4A Parser] Error parsing atoms: ${err.message}`);
  }

  if (!result.albumArtist && result.artist) {
    result.albumArtist = result.artist;
  }

  return result;
}

function findAndParseAtoms(bytes, view, startOffset, endOffset, result) {
  let offset = startOffset;
  const utf8Decoder = new TextDecoder('utf-8');

  while (offset + 8 <= endOffset) {
    let atomSize = view.getUint32(offset, false);
    const atomType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    let headerSize = 8;
    if (atomSize === 1) {
      // 64-bit extended size
      if (offset + 16 > endOffset) break;
      // High 32 bits + low 32 bits
      const high = view.getUint32(offset + 8, false);
      const low = view.getUint32(offset + 12, false);
      atomSize = (high * 0x100000000) + (low >>> 0);
      headerSize = 16;
    } else if (atomSize === 0) {
      // Atom extends to end of file
      atomSize = endOffset - offset;
    }

    if (atomSize < headerSize) break;
    const atomEnd = Math.min(endOffset, offset + atomSize);
    const payloadStart = offset + headerSize;

    if (atomType === 'moov' || atomType === 'udta' || atomType === 'trak' || atomType === 'mdia') {
      // Container atoms - recurse
      findAndParseAtoms(bytes, view, payloadStart, atomEnd, result);
    } else if (atomType === 'meta') {
      // Meta atom has 4 bytes of version/flags before child atoms
      const metaPayloadStart = payloadStart + 4;
      if (metaPayloadStart < atomEnd) {
        findAndParseAtoms(bytes, view, metaPayloadStart, atomEnd, result);
      }
    } else if (atomType === 'ilst') {
      // ilst atom contains metadata key atoms
      parseIlst(bytes, view, payloadStart, atomEnd, result);
    } else if (atomType === 'mvhd' && result.duration === 0) {
      // Movie Header Atom: duration & timescale
      const version = bytes[payloadStart];
      if (version === 0 && payloadStart + 20 <= atomEnd) {
        const timescale = view.getUint32(payloadStart + 12, false);
        const durationUnits = view.getUint32(payloadStart + 16, false);
        if (timescale > 0 && durationUnits > 0) {
          result.duration = Math.round((durationUnits / timescale) * 100) / 100;
        }
      } else if (version === 1 && payloadStart + 32 <= atomEnd) {
        const timescale = view.getUint32(payloadStart + 20, false);
        const highDur = view.getUint32(payloadStart + 24, false);
        const lowDur = view.getUint32(payloadStart + 28, false);
        const durationUnits = (highDur * 0x100000000) + (lowDur >>> 0);
        if (timescale > 0 && durationUnits > 0) {
          result.duration = Math.round((durationUnits / timescale) * 100) / 100;
        }
      }
    }

    offset += atomSize;
  }
}

function parseIlst(bytes, view, startOffset, endOffset, result) {
  let offset = startOffset;
  const utf8Decoder = new TextDecoder('utf-8');

  while (offset + 8 <= endOffset) {
    const itemSize = view.getUint32(offset, false);
    if (itemSize < 8 || offset + itemSize > endOffset) break;

    const itemType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    const itemPayload = bytes.subarray(offset + 8, offset + itemSize);
    offset += itemSize;

    // Inside each ilst item, there is a 'data' atom: [4 bytes size, 4 bytes "data", 4 bytes type, 4 bytes locale, bytes...]
    if (itemPayload.length < 16) continue;
    const itemView = new DataView(itemPayload.buffer, itemPayload.byteOffset, itemPayload.byteLength);
    const dataSize = itemView.getUint32(0, false);
    const dataFourcc = String.fromCharCode(itemPayload[4], itemPayload[5], itemPayload[6], itemPayload[7]);

    if (dataFourcc !== 'data') continue;
    const dataType = itemView.getUint32(8, false);
    const valueBytes = itemPayload.subarray(16, dataSize);

    try {
      if (itemType === '©nam' || itemType === 'titl') {
        result.title = utf8Decoder.decode(valueBytes).trim();
      } else if (itemType === '©ART' || itemType === 'perf') {
        result.artist = utf8Decoder.decode(valueBytes).trim();
      } else if (itemType === 'aART') {
        result.albumArtist = utf8Decoder.decode(valueBytes).trim();
      } else if (itemType === '©alb') {
        result.album = utf8Decoder.decode(valueBytes).trim();
      } else if (itemType === '©gen' || itemType === 'gnre') {
        result.genre = utf8Decoder.decode(valueBytes).trim();
      } else if (itemType === '©day') {
        const yearStr = utf8Decoder.decode(valueBytes).trim();
        const match = /(\d{4})/.exec(yearStr);
        if (match) result.year = parseInt(match[1], 10);
      } else if (itemType === 'trkn' && valueBytes.length >= 6) {
        const valView = new DataView(valueBytes.buffer, valueBytes.byteOffset, valueBytes.byteLength);
        result.trackNumber = valView.getUint16(2, false) || null;
        result.trackTotal = valView.getUint16(4, false) || null;
      } else if (itemType === 'disk' && valueBytes.length >= 6) {
        const valView = new DataView(valueBytes.buffer, valueBytes.byteOffset, valueBytes.byteLength);
        result.discNumber = valView.getUint16(2, false) || null;
        result.discTotal = valView.getUint16(4, false) || null;
      } else if (itemType === 'covr' && !result.artwork) {
        // dataType 13 = JPEG, 14 = PNG
        const mimeType = dataType === 14 ? 'image/png' : 'image/jpeg';
        result.artwork = {
          mimeType,
          pictureType: 3,
          bytes: valueBytes,
          dataUrl: bytesToDataUrl(valueBytes, mimeType)
        };
      }
    } catch (err) {
      console.error(`[M4A Parser] Error parsing ilst item ${itemType}: ${err.message}`);
    }
  }
}
