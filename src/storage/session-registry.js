/**
 * LocalJam - Session File Registry (Tier 2 Fallback)
 * Maintains in-memory File references for non-FSAA browsers (Firefox, Safari, Mobile)
 * and generates deterministic track IDs.
 */

// Simple deterministic string hash for ID generation
export function generateDeterministicTrackId(relativePath, size, mtime) {
  const input = `${relativePath}:${size}:${Math.floor(mtime / 1000)}`;
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return 'trk_' + hash.toString(36);
}

class SessionFileRegistry {
  constructor() {
    /** @type {Map<string, File>} */
    this.files = new Map();
    /** @type {Map<string, string>} */
    this.pathToId = new Map();
  }

  registerFile(file, relativePath = '') {
    const path = relativePath || file.webkitRelativePath || file.name;
    const id = generateDeterministicTrackId(path, file.size, file.lastModified);
    this.files.set(id, file);
    this.pathToId.set(path, id);
    return id;
  }

  getFile(trackId) {
    return this.files.get(trackId) || null;
  }

  hasFile(trackId) {
    return this.files.has(trackId);
  }

  getIdByPath(path) {
    return this.pathToId.get(path) || null;
  }

  clear() {
    this.files.clear();
    this.pathToId.clear();
  }

  getAllTrackIds() {
    return Array.from(this.files.keys());
  }

  size() {
    return this.files.size;
  }
}

export const sessionRegistry = new SessionFileRegistry();
