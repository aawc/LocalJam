/**
 * LocalJam - OGG Audio Metadata Parser
 * Zero-dependency pure JavaScript binary parser for Ogg Vorbis and Ogg Opus metadata.
 */

import { parseVorbisComment } from './flac.js';

/**
 * Parse OGG metadata from an ArrayBuffer or Uint8Array
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {object|null}
 */
export function parseOgg(buffer) {
  if (!buffer) return null;
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 27) return null;

  // Validate OggS magic (0x4F, 0x67, 0x67, 0x53)
  if (bytes[0] !== 0x4F || bytes[1] !== 0x67 || bytes[2] !== 0x67 || bytes[3] !== 0x53) {
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
    sampleRate: 0,
    channels: 0,
    format: 'OGG'
  };

  try {
    let offset = 0;
    let packetChunks = [];

    function processPacket(pktBytes) {
      if (!pktBytes || pktBytes.length === 0) return;
      const pktView = new DataView(pktBytes.buffer, pktBytes.byteOffset, pktBytes.byteLength);

      // Check for OpusHead packet: 'OpusHead' (8 bytes: 0x4F 0x70 0x75 0x73 0x48 0x65 0x61 0x64)
      if (
        pktBytes.length >= 19 &&
        pktBytes[0] === 0x4F && pktBytes[1] === 0x70 && pktBytes[2] === 0x75 && pktBytes[3] === 0x73 &&
        pktBytes[4] === 0x48 && pktBytes[5] === 0x65 && pktBytes[6] === 0x61 && pktBytes[7] === 0x64
      ) {
        result.format = 'Opus';
        result.channels = pktBytes[9];
        const inputSampleRate = pktView.getUint32(12, true);
        result.sampleRate = inputSampleRate > 0 ? inputSampleRate : 48000;
        return;
      }

      // Check for OpusTags packet: 'OpusTags' (8 bytes: 0x4F 0x70 0x75 0x73 0x54 0x61 0x67 0x73)
      if (
        pktBytes.length >= 8 &&
        pktBytes[0] === 0x4F && pktBytes[1] === 0x70 && pktBytes[2] === 0x75 && pktBytes[3] === 0x73 &&
        pktBytes[4] === 0x54 && pktBytes[5] === 0x61 && pktBytes[6] === 0x67 && pktBytes[7] === 0x73
      ) {
        parseVorbisComment(pktBytes.subarray(8), result);
        return;
      }

      // Check for Vorbis identification header: \x01vorbis (7 bytes)
      if (
        pktBytes.length >= 16 &&
        pktBytes[0] === 0x01 &&
        pktBytes[1] === 0x76 && pktBytes[2] === 0x6F && pktBytes[3] === 0x72 &&
        pktBytes[4] === 0x62 && pktBytes[5] === 0x69 && pktBytes[6] === 0x73
      ) {
        result.format = 'OGG';
        result.channels = pktBytes[11];
        result.sampleRate = pktView.getUint32(12, true);
        return;
      }

      // Check for Vorbis comment header: \x03vorbis (7 bytes)
      if (
        pktBytes.length >= 7 &&
        pktBytes[0] === 0x03 &&
        pktBytes[1] === 0x76 && pktBytes[2] === 0x6F && pktBytes[3] === 0x72 &&
        pktBytes[4] === 0x62 && pktBytes[5] === 0x69 && pktBytes[6] === 0x73
      ) {
        parseVorbisComment(pktBytes.subarray(7), result);
        return;
      }
    }

    while (offset + 27 <= bytes.length) {
      // Validate OggS magic
      if (
        bytes[offset] !== 0x4F ||
        bytes[offset + 1] !== 0x67 ||
        bytes[offset + 2] !== 0x67 ||
        bytes[offset + 3] !== 0x53
      ) {
        break;
      }

      const numSegments = bytes[offset + 26];
      if (offset + 27 + numSegments > bytes.length) {
        break;
      }

      const segTableOffset = offset + 27;
      let bodyOffset = segTableOffset + numSegments;

      for (let i = 0; i < numSegments; i++) {
        const segLen = bytes[segTableOffset + i];
        const segEnd = Math.min(bytes.length, bodyOffset + segLen);
        if (bodyOffset < bytes.length) {
          packetChunks.push(bytes.subarray(bodyOffset, segEnd));
        }
        bodyOffset += segLen;

        if (segLen < 255) {
          let packet;
          if (packetChunks.length === 1) {
            packet = packetChunks[0];
          } else {
            const totalLen = packetChunks.reduce((acc, c) => acc + c.length, 0);
            packet = new Uint8Array(totalLen);
            let p = 0;
            for (const chunk of packetChunks) {
              packet.set(chunk, p);
              p += chunk.length;
            }
          }
          packetChunks = [];
          processPacket(packet);
        }
      }

      offset = bodyOffset;
    }

    // Flush any pending incomplete packet on truncated slice
    if (packetChunks.length > 0) {
      const totalLen = packetChunks.reduce((acc, c) => acc + c.length, 0);
      const packet = new Uint8Array(totalLen);
      let p = 0;
      for (const chunk of packetChunks) {
        packet.set(chunk, p);
        p += chunk.length;
      }
      processPacket(packet);
    }

    if (!result.albumArtist && result.artist) {
      result.albumArtist = result.artist;
    }
  } catch (err) {
    console.warn(`[OGG Parser] Error parsing Ogg container (${err?.name}): ${err?.message}`);
  }

  return result;
}
