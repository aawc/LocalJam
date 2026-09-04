/**
 * LocalJam - Master Metadata Engine
 * Orchestrates chunk-based binary metadata extraction across MP3, FLAC, M4A/AAC, WAV, and OGG formats.
 */

import { parseID3v2, parseID3v1 } from './id3v2.js';
import { parseFLAC } from './flac.js';
import { parseM4A } from './m4a.js';
import { parseFilenameMetadata } from './filename-parser.js';

export const CHUNK_SIZE = 128 * 1024; // 128 KB chunk for safe memory consumption

/**
 * Extract metadata from an ArrayBuffer/Uint8Array slice or File object
 * @param {ArrayBuffer|Uint8Array} headerBuffer - Initial 128KB slice of file
 * @param {string} filename - Base filename
 * @param {string} relativePath - Relative path in directory
 * @param {number} fileSize - Total file size in bytes
 * @param {Uint8Array} [tailBuffer] - Optional trailing 128 bytes for ID3v1
 */
export function extractMetadataFromChunk(headerBuffer, filename, relativePath = '', fileSize = 0, tailBuffer = null) {
  const bytes = headerBuffer instanceof Uint8Array ? headerBuffer : new Uint8Array(headerBuffer);
  let meta = null;

  try {
    if (bytes.length >= 4) {
      // 1. Check ID3v2 header (0x49 0x44 0x33 -> "ID3")
      if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
        meta = parseID3v2(bytes);
      }
      // 2. Check FLAC header (0x66 0x4C 0x61 0x43 -> "fLaC")
      else if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
        meta = parseFLAC(bytes);
      }
      // 3. Check MP4/M4A/AAC container (ftyp atom or moov atom at offset 4)
      else if (
        (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) || // 'ftyp'
        (bytes[4] === 0x6d && bytes[5] === 0x6f && bytes[6] === 0x6f && bytes[7] === 0x76)    // 'moov'
      ) {
        meta = parseM4A(bytes);
      }
      // 4. Check Ogg container ('OggS' -> 0x4F 0x67 0x67 0x53)
      else if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
        // Basic Ogg stream detection
        meta = { format: 'OGG', title: null, artist: null, album: null };
      }
      // 5. Check WAV container ('RIFF'....'WAVE')
      else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
        meta = { format: 'WAV', title: null, artist: null, album: null };
      }
    }

    // Check trailing ID3v1 if ID3v2 yielded no title
    if ((!meta || !meta.title) && tailBuffer && tailBuffer.length >= 128) {
      const v1 = parseID3v1(tailBuffer);
      if (v1) {
        meta = Object.assign(meta || {}, v1);
      }
    }
  } catch (err) {
    console.error(`[Metadata Engine] Error parsing binary chunk for ${filename}: ${err.message}`);
  }

  // Fallback to smart filename heuristics if metadata tags are absent or missing title/artist
  const fallback = parseFilenameMetadata(filename, relativePath);

  return {
    title: (meta && meta.title) || fallback.title,
    artist: (meta && meta.artist) || fallback.artist,
    albumArtist: (meta && meta.albumArtist) || (meta && meta.artist) || fallback.albumArtist,
    album: (meta && meta.album) || fallback.album,
    genre: (meta && meta.genre) || fallback.genre,
    year: (meta && meta.year) || fallback.year,
    trackNumber: (meta && meta.trackNumber) || fallback.trackNumber,
    trackTotal: (meta && meta.trackTotal) || fallback.trackTotal,
    discNumber: (meta && meta.discNumber) || fallback.discNumber,
    discTotal: (meta && meta.discTotal) || fallback.discTotal,
    duration: (meta && meta.duration) || 0,
    sampleRate: (meta && meta.sampleRate) || 0,
    channels: (meta && meta.channels) || 0,
    artwork: (meta && meta.artwork) || null,
    format: (meta && meta.format) || fallback.format,
    fileSize,
    filename,
    relativePath
  };
}

/**
 * High-level helper to extract metadata from a standard browser File object using chunked slicing
 * @param {File} file
 * @param {string} [relativePath]
 */
export async function parseFileMetadata(file, relativePath = '') {
  if (!file) throw new Error('File parameter is required');

  // Read first 128 KB slice
  const headerSlice = file.slice(0, CHUNK_SIZE);
  const headerBuffer = await headerSlice.arrayBuffer();

  let tailBuffer = null;
  if (file.size > 128) {
    const tailSlice = file.slice(-128);
    tailBuffer = new Uint8Array(await tailSlice.arrayBuffer());
  }

  return extractMetadataFromChunk(
    new Uint8Array(headerBuffer),
    file.name,
    relativePath || file.webkitRelativePath || file.name,
    file.size,
    tailBuffer
  );
}
