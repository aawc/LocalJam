/**
 * LocalJam - Smart Filename & Path Heuristic Parser
 * Derives clean title, artist, album, and track number from filenames and folder structures when tags are missing.
 */

export function parseFilenameMetadata(filename, relativePath = '') {
  if (!filename) return { title: 'Unknown Track', artist: 'Unknown Artist', album: 'Unknown Album', trackNumber: null };

  // Strip extension
  const dotIndex = filename.lastIndexOf('.');
  let baseName = dotIndex !== -1 ? filename.slice(0, dotIndex) : filename;

  // Pre-normalize underscores and bracketed tags in baseName
  baseName = baseName.replace(/_+/g, ' ').trim();

  let trackNumber = null;
  let artist = null;
  let album = null;
  let title = null;

  // Infer Artist & Album from directory hierarchy if path is available
  // e.g. "Pink Floyd/The Dark Side of the Moon/01 - Speak to Me.mp3"
  if (relativePath) {
    const segments = relativePath.split(/[/\\]/).filter(Boolean);
    if (segments.length >= 3) {
      artist = cleanName(segments[segments.length - 3]);
      album = cleanName(segments[segments.length - 2]);
    } else if (segments.length === 2) {
      album = cleanName(segments[0]);
    }
  }

  // Pattern 1: "01 - Artist - Title" or "01. Artist - Title"
  let match = /^(\d{1,3})\s*[-._]\s*(.+?)\s*[-–—]\s*(.+)$/.exec(baseName);
  if (match) {
    trackNumber = parseInt(match[1], 10);
    if (!artist) artist = cleanName(match[2]);
    title = cleanName(match[3]);
  } else {
    // Pattern 2: "Artist - 01 - Title"
    match = /^(.+?)\s*[-–—]\s*(\d{1,3})\s*[-._]\s*(.+)$/.exec(baseName);
    if (match) {
      if (!artist) artist = cleanName(match[1]);
      trackNumber = parseInt(match[2], 10);
      title = cleanName(match[3]);
    } else {
      // Pattern 3: "01 - Title" or "01. Title" or "01 Title"
      match = /^(\d{1,3})\s*[-._\s]\s*(.+)$/.exec(baseName);
      if (match) {
        trackNumber = parseInt(match[1], 10);
        title = cleanName(match[2]);
      } else {
        // Pattern 4: "Artist - Title"
        match = /^(.+?)\s*[-–—]\s*(.+)$/.exec(baseName);
        if (match) {
          if (!artist) artist = cleanName(match[1]);
          title = cleanName(match[2]);
        } else {
          // Fallback: entire baseName as title
          title = cleanName(baseName);
        }
      }
    }
  }

  return {
    title: title || 'Unknown Track',
    artist: artist || 'Unknown Artist',
    albumArtist: artist || 'Unknown Artist',
    album: album || 'Unknown Album',
    trackNumber: trackNumber || null,
    trackTotal: null,
    discNumber: null,
    discTotal: null,
    genre: null,
    year: null,
    artwork: null,
    format: 'Filename-Inferred'
  };
}

function cleanName(str) {
  if (!str) return '';
  return str
    .replace(/^[-–—\s]+|[-–—\s]+$/g, '') // Strip leading/trailing dashes and whitespace
    .replace(/[_\.]+/g, ' ') // Replace underscores and dots with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/^\[.+?\]\s*/, '') // Remove bracketed tags like "[1080p]" or "[FLAC]"
    .replace(/\s*\[.+?\]$/, '') // Remove trailing bracketed tags like "[320kbps]"
    .replace(/\s*\(.+?\)$/, (match) => {
      // Keep things like "(Remastered)" or "(Live)", strip web junk
      if (/kbps|flac|mp3|320k|256k|official|video/i.test(match)) return '';
      return match;
    })
    .trim();
}
