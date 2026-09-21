/**
 * LocalJam - Pure Browse Model & Query Engine
 * Provides pure data selection, search filtering, grouping, and row formatting
 * for library tracks, albums, artists, favorites, history, and radio stations.
 */

import { getStationCategory } from '../radio/stations.js';

/**
 * @typedef {{
 *   id: string,
 *   kind: 'track' | 'album' | 'artist' | 'station',
 *   primary: string,
 *   secondary: string,
 *   trailing: string,
 *   provider?: string,
 *   popularity?: number,
 *   payload: object
 * }} BrowseRow
 */

/**
 * Formats a duration in seconds into M:SS format.
 * @param {number} [seconds=0]
 * @returns {string}
 */
export function formatDuration(seconds = 0) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Filters a track list case-insensitively by title, artist, album, or filename.
 * Empty query returns the original array.
 * @param {Array<object>} tracks
 * @param {string} query
 * @returns {Array<object>}
 */
export function filterTracks(tracks = [], query = '') {
  const q = (query || '').trim().toLowerCase();
  if (!q) return tracks;

  return tracks.filter((t) => {
    const title = (t.title || '').toLowerCase();
    const artist = (t.artist || '').toLowerCase();
    const album = (t.album || '').toLowerCase();
    const filename = (t.filename || '').toLowerCase();
    return title.includes(q) || artist.includes(q) || album.includes(q) || filename.includes(q);
  });
}

/**
 * Builds BrowseRow items for local music library based on active mode, query, and drill-in state.
 * @param {{
 *   mode?: 'songs' | 'albums' | 'artists' | 'starred' | 'recent',
 *   tracks?: Array<object>,
 *   albums?: Array<object>,
 *   artists?: Array<object>,
 *   favorites?: Array<object>,
 *   history?: Array<object>,
 *   query?: string,
 *   drill?: { kind: 'album' | 'artist', name: string } | null
 * }} options
 * @returns {BrowseRow[]}
 */
export function buildLibraryRows({
  mode = 'songs',
  tracks = [],
  albums = [],
  artists = [],
  favorites = [],
  history = [],
  query = '',
  drill = null
} = {}) {
  // 1. Handle drill-in state (e.g., viewing tracks for a specific album or artist)
  if (drill && drill.name) {
    const drillName = drill.name.toLowerCase();
    const availableTracks = tracks.filter((t) => !t.isMissing);
    const drilled = availableTracks.filter((t) => {
      if (drill.kind === 'album') {
        return (t.album || '').toLowerCase() === drillName;
      }
      return (t.artist || '').toLowerCase() === drillName;
    });

    const filtered = filterTracks(drilled, query);
    return filtered.map((t) => ({
      id: t.id,
      kind: 'track',
      primary: t.title || t.filename || 'Unknown Track',
      secondary: t.artist || 'Unknown Artist',
      trailing: formatDuration(t.duration),
      payload: t
    }));
  }

  // 2. Handle root modes
  if (mode === 'songs') {
    const filtered = filterTracks(tracks, query);
    return filtered.map((t) => ({
      id: t.id,
      kind: 'track',
      primary: t.title || t.filename || 'Unknown Track',
      secondary: t.artist || 'Unknown Artist',
      trailing: t.isMissing ? '[MISSING]' : formatDuration(t.duration),
      payload: t
    }));
  }

  if (mode === 'albums') {
    // Exclude missing tracks from album calculations
    const availableTracks = tracks.filter((t) => !t.isMissing);
    const albumMap = new Map();

    for (const t of availableTracks) {
      const albumName = t.album || 'Unknown Album';
      const artistName = t.albumArtist || t.artist || 'Unknown Artist';
      const key = `${albumName}:::${artistName}`;
      if (!albumMap.has(key)) {
        albumMap.set(key, {
          name: albumName,
          artist: artistName,
          year: t.year || null,
          tracks: []
        });
      }
      albumMap.get(key).tracks.push(t);
    }

    let albumList = Array.from(albumMap.values());
    const q = (query || '').trim().toLowerCase();
    if (q) {
      albumList = albumList.filter(
        (a) => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
      );
    }

    albumList.sort((a, b) => a.name.localeCompare(b.name));

    return albumList.map((a) => ({
      id: `album_${a.name}_${a.artist}`,
      kind: 'album',
      primary: a.name,
      secondary: a.artist,
      trailing: `${a.tracks.length} track${a.tracks.length === 1 ? '' : 's'}`,
      payload: a
    }));
  }

  if (mode === 'artists') {
    // Exclude missing tracks from artist calculations
    const availableTracks = tracks.filter((t) => !t.isMissing);
    const artistMap = new Map();

    for (const t of availableTracks) {
      const artistName = t.artist || 'Unknown Artist';
      if (!artistMap.has(artistName)) {
        artistMap.set(artistName, {
          name: artistName,
          tracks: []
        });
      }
      artistMap.get(artistName).tracks.push(t);
    }

    let artistList = Array.from(artistMap.values());
    const q = (query || '').trim().toLowerCase();
    if (q) {
      artistList = artistList.filter((a) => a.name.toLowerCase().includes(q));
    }

    artistList.sort((a, b) => a.name.localeCompare(b.name));

    return artistList.map((a) => ({
      id: `artist_${a.name}`,
      kind: 'artist',
      primary: a.name,
      secondary: `${a.tracks.length} track${a.tracks.length === 1 ? '' : 's'}`,
      trailing: '',
      payload: a
    }));
  }

  if (mode === 'starred') {
    const favSet = new Set(
      (favorites || []).map((f) => (typeof f === 'string' ? f : f.trackId || f.id))
    );
    const availableTracks = tracks.filter((t) => !t.isMissing && (favSet.has(t.id) || t.isFavorite));
    const filtered = filterTracks(availableTracks, query);

    return filtered.map((t) => ({
      id: t.id,
      kind: 'track',
      primary: t.title || t.filename || 'Unknown Track',
      secondary: t.artist || 'Unknown Artist',
      trailing: formatDuration(t.duration),
      payload: t
    }));
  }

  if (mode === 'recent') {
    const trackMap = new Map(tracks.filter((t) => !t.isMissing).map((t) => [t.id, t]));
    const recentTracks = [];
    const seenIds = new Set();

    for (const record of history || []) {
      const trackId = typeof record === 'string' ? record : record.trackId || record.id;
      if (trackId && trackMap.has(trackId) && !seenIds.has(trackId)) {
        seenIds.add(trackId);
        recentTracks.push(trackMap.get(trackId));
      }
    }

    const filtered = filterTracks(recentTracks, query);
    return filtered.map((t) => ({
      id: t.id,
      kind: 'track',
      primary: t.title || t.filename || 'Unknown Track',
      secondary: t.artist || 'Unknown Artist',
      trailing: formatDuration(t.duration),
      payload: t
    }));
  }

  return [];
}

/**
 * Resolves the effective provider for a station with fallback guarantees.
 * Custom stations default to 'Custom', unbranded curated stations default to 'Independent'.
 * @param {object} station
 * @returns {string}
 */
export function getStationProvider(station) {
  if (!station) return 'Independent';
  return station.provider || (station.isCustom ? 'Custom' : 'Independent');
}

/**
 * Filters and sorts radio stations based on genre, search query, and sort order.
 * Predicate matching radio station name, genre, category, description, country, and provider.
 * @param {Array<object>} stations
 * @param {{
 *   genre?: string,
 *   query?: string,
 *   sort?: 'default' | 'name-asc' | 'name-desc' | 'genre-asc' | 'bitrate-desc' | 'provider' | 'popularity' | 'popularity-desc'
 * }} options
 * @returns {Array<object>}
 */
export function filterStations(stations = [], { genre = 'All', query = '', sort = 'default' } = {}) {
  let list = [...(Array.isArray(stations) ? stations : [])];

  // 1. Genre filtering
  if (genre === 'Favorites') {
    list = list.filter((s) => Boolean(s.isFavorite));
  } else if (genre && genre !== 'All') {
    list = list.filter((s) => {
      const cat = getStationCategory(s);
      const g = (s.genre || '').toLowerCase();
      return cat === genre || g.includes(genre.toLowerCase());
    });
  }

  // 2. Search query filtering (name, genre, category, description, country, provider)
  const q = (query || '').trim().toLowerCase();
  if (q) {
    list = list.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const stationGenre = (s.genre || '').toLowerCase();
      const cat = (getStationCategory(s) || '').toLowerCase();
      const desc = (s.description || '').toLowerCase();
      const country = (s.country || '').toLowerCase();
      const provider = getStationProvider(s).toLowerCase();
      return (
        name.includes(q) ||
        stationGenre.includes(q) ||
        cat.includes(q) ||
        desc.includes(q) ||
        country.includes(q) ||
        provider.includes(q)
      );
    });
  }

  // 3. Sorting
  if (sort === 'name-asc') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (sort === 'name-desc') {
    list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
  } else if (sort === 'genre-asc') {
    list.sort(
      (a, b) =>
        (a.genre || '').localeCompare(b.genre || '') || (a.name || '').localeCompare(b.name || '')
    );
  } else if (sort === 'bitrate-desc') {
    const getNum = (str) => parseInt((str || '').match(/\d+/)?.[0] || '0', 10);
    list.sort((a, b) => getNum(b.bitrate) - getNum(a.bitrate) || (a.name || '').localeCompare(b.name || ''));
  } else if (sort === 'provider') {
    list.sort((a, b) => {
      const provA = getStationProvider(a);
      const provB = getStationProvider(b);
      const cmp = provA.localeCompare(provB);
      if (cmp !== 0) return cmp;
      return (a.name || '').localeCompare(b.name || '');
    });
  } else if (sort === 'popularity-desc' || sort === 'popularity') {
    list.sort((a, b) => {
      const popA = Number.isFinite(a.popularity) ? a.popularity : (parseInt(a.popularity, 10) || 0);
      const popB = Number.isFinite(b.popularity) ? b.popularity : (parseInt(b.popularity, 10) || 0);
      if (popB !== popA) return popB - popA;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  return list;
}

/**
 * Transforms filtered radio stations into uniform BrowseRow presentation items.
 * @param {Array<object>} stations
 * @returns {BrowseRow[]}
 */
export function buildStationRows(stations = []) {
  return stations.map((station) => {
    const s = station || {};
    const secondary = [s.provider, s.genre, s.country]
      .filter(Boolean)
      .join(' · ');
    const popularity = Number.isFinite(s.popularity)
      ? s.popularity
      : (parseInt(s.popularity, 10) || 0);

    return {
      id: s.id,
      kind: 'station',
      primary: s.name || 'Unknown Station',
      secondary,
      trailing: s.bitrate || '',
      provider: getStationProvider(s),
      popularity,
      payload: station
    };
  });
}
