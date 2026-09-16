import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  filterTracks,
  buildLibraryRows,
  filterStations,
  buildStationRows
} from '../../src/ui/browse-model.js';

const FIXTURE_TRACKS = [
  { id: 't1', title: 'Midnight City', artist: 'M83', album: 'Hurry Up', duration: 243, isMissing: 0 },
  { id: 't2', title: 'Wait', artist: 'M83', album: 'Hurry Up', duration: 264, isMissing: 0 },
  { id: 't3', title: 'Starry Night', artist: 'Cosmic Band', album: 'Cosmos', duration: 180, isMissing: 0 },
  { id: 't4', title: 'Supernova', artist: 'Cosmic Band', album: 'Cosmos', duration: 210, isMissing: 0 }
];

const FIXTURE_STATIONS = [
  { id: 's1', name: 'Groove Salad', genre: 'Ambient', description: 'Chillout ambient', country: 'US', bitrate: '128 kbps', isFavorite: true },
  { id: 's2', name: 'Drone Zone', genre: 'Ambient', description: 'Atmospheric space music', country: 'US', bitrate: '64 kbps', isFavorite: false },
  { id: 's3', name: 'Radio Paradise', genre: 'Eclectic Rock', description: 'Listener-supported radio', country: 'US', bitrate: '320 kbps', isFavorite: true },
  { id: 's4', name: 'FIP Radio', genre: 'Jazz', description: 'French eclectic jazz', country: 'FR', bitrate: '192 kbps', isFavorite: false }
];

describe('Browse Model - Library & Radio Query Shaping', () => {
  it('formats track durations as M:SS with zero padding and handles falsy values', () => {
    const rows = buildLibraryRows({ mode: 'songs', tracks: FIXTURE_TRACKS });
    assert.deepEqual(rows.map((r) => r.trailing), ['4:03', '4:24', '3:00', '3:30']);
    assert.equal(formatDuration(9), '0:09');
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(undefined), '0:00');
    assert.equal(formatDuration(-5), '0:00');
  });

  it('filterTracks matches on title, artist, and album case-insensitively; empty query is identity', () => {
    assert.deepEqual(filterTracks(FIXTURE_TRACKS, ''), FIXTURE_TRACKS);
    assert.deepEqual(filterTracks(FIXTURE_TRACKS, '   '), FIXTURE_TRACKS);

    const byTitle = filterTracks(FIXTURE_TRACKS, 'midnight');
    assert.equal(byTitle.length, 1);
    assert.equal(byTitle[0].id, 't1');

    const byArtist = filterTracks(FIXTURE_TRACKS, 'm83');
    assert.equal(byArtist.length, 2);

    const byAlbum = filterTracks(FIXTURE_TRACKS, 'cosmos');
    assert.equal(byAlbum.length, 2);
  });

  it('filterTracks matches untagged tracks on filename', () => {
    const untagged = [{ id: 'f1', title: '', artist: '', album: '', filename: '03 - Hidden Gem.mp3' }];
    assert.equal(filterTracks(untagged, 'hidden').length, 1);
    assert.equal(filterTracks(untagged, 'HIDDEN').length, 1, 'case-insensitive');
  });

  it('buildLibraryRows with mode: albums collapses tracks across albums into summary rows', () => {
    const rows = buildLibraryRows({
      mode: 'albums',
      tracks: FIXTURE_TRACKS
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].kind, 'album');
    assert.equal(rows[0].trailing, '2 tracks');
    assert.equal(rows[1].kind, 'album');
    assert.equal(rows[1].trailing, '2 tracks');
  });

  it('buildLibraryRows with drill-in returns tracks for that specific album', () => {
    const rows = buildLibraryRows({
      mode: 'albums',
      tracks: FIXTURE_TRACKS,
      drill: { kind: 'album', name: 'Cosmos' }
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].kind, 'track');
    assert.equal(rows[0].primary, 'Starry Night');
    assert.equal(rows[1].kind, 'track');
    assert.equal(rows[1].primary, 'Supernova');
  });

  it('buildLibraryRows mode: artists groups tracks and pluralises the count', () => {
    const rows = buildLibraryRows({ mode: 'artists', tracks: FIXTURE_TRACKS });
    assert.deepEqual(rows.map((r) => r.primary), ['Cosmic Band', 'M83']);
    assert.equal(rows[0].kind, 'artist');
    assert.equal(rows[0].secondary, '2 tracks');
    assert.equal(
      buildLibraryRows({ mode: 'artists', tracks: [FIXTURE_TRACKS[0]] })[0].secondary,
      '1 track',
      'singular for a single track'
    );
  });

  it('buildLibraryRows drills into an artist', () => {
    const rows = buildLibraryRows({
      mode: 'artists',
      tracks: FIXTURE_TRACKS,
      drill: { kind: 'artist', name: 'M83' }
    });
    assert.deepEqual(rows.map((r) => r.primary), ['Midnight City', 'Wait']);
    assert.equal(rows[0].kind, 'track');
  });

  it('buildLibraryRows with mode: starred returns only favorite tracks', () => {
    const favorites = [{ trackId: 't1' }, { trackId: 't4' }];
    const rows = buildLibraryRows({
      mode: 'starred',
      tracks: FIXTURE_TRACKS,
      favorites
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].primary, 'Midnight City');
    assert.equal(rows[1].primary, 'Supernova');
  });

  it('buildLibraryRows with mode: recent preserves history order', () => {
    const history = [
      { trackId: 't3', timestamp: 100 },
      { trackId: 't1', timestamp: 90 },
      { trackId: 't4', timestamp: 80 }
    ];

    const rows = buildLibraryRows({
      mode: 'recent',
      tracks: FIXTURE_TRACKS,
      history
    });

    assert.equal(rows.length, 3);
    assert.equal(rows[0].id, 't3');
    assert.equal(rows[1].id, 't1');
    assert.equal(rows[2].id, 't4');
  });

  it('handles isMissing tracks: shown with [MISSING] label in songs mode, omitted from albums and artists', () => {
    const tracksWithMissing = [
      ...FIXTURE_TRACKS,
      { id: 't5', title: 'Ghost Song', artist: 'Phantoms', album: 'Afterlife', duration: 150, isMissing: 1 }
    ];

    const songRows = buildLibraryRows({
      mode: 'songs',
      tracks: tracksWithMissing
    });
    const missingRow = songRows.find((r) => r.id === 't5');
    assert.ok(missingRow);
    assert.equal(missingRow.trailing, '[MISSING]');

    const albumRows = buildLibraryRows({
      mode: 'albums',
      tracks: tracksWithMissing
    });
    assert.equal(albumRows.some((r) => r.primary === 'Afterlife'), false);

    const artistRows = buildLibraryRows({
      mode: 'artists',
      tracks: tracksWithMissing
    });
    assert.equal(artistRows.some((r) => r.primary === 'Phantoms'), false);
  });

  it('filterStations filters by genre and favorites chip', () => {
    const favs = filterStations(FIXTURE_STATIONS, { genre: 'Favorites' });
    assert.equal(favs.length, 2);
    assert.deepEqual(favs.map((s) => s.id), ['s1', 's3']);

    const ambient = filterStations(FIXTURE_STATIONS, { genre: 'Ambient' });
    assert.equal(ambient.length, 2);
    assert.deepEqual(ambient.map((s) => s.id), ['s1', 's2']);
  });

  it('filterStations matches the derived category even when genre does not contain it', () => {
    const derived = [{ id: 'k1', name: 'Fun Kids Radio', genre: 'Variety', country: 'GB' }];
    assert.deepEqual(filterStations(derived, { genre: 'Kids & Family' }).map((s) => s.id), ['k1']);
  });

  it('filterStations query matches name, genre, description, and country case-insensitively', () => {
    assert.deepEqual(filterStations(FIXTURE_STATIONS, { query: 'jazz' }).map((s) => s.id), ['s4']);
    assert.deepEqual(filterStations(FIXTURE_STATIONS, { query: 'fr' }).map((s) => s.id), ['s4']);
    assert.deepEqual(filterStations(FIXTURE_STATIONS, { query: 'space' }).map((s) => s.id), ['s2']);
    assert.deepEqual(filterStations(FIXTURE_STATIONS, { query: 'drone' }).map((s) => s.id), ['s2']);
    assert.deepEqual(filterStations(FIXTURE_STATIONS, { query: 'zzzz' }), []);
    assert.equal(filterStations(FIXTURE_STATIONS, { query: '  ' }).length, 4, 'blank query is identity');
  });

  it('filterStations sorts by name-asc, name-desc, genre-asc, and bitrate-desc', () => {
    const sortedByNameAsc = filterStations(FIXTURE_STATIONS, { sort: 'name-asc' });
    assert.deepEqual(sortedByNameAsc.map((s) => s.name), [
      'Drone Zone',
      'FIP Radio',
      'Groove Salad',
      'Radio Paradise'
    ]);

    const sortedByNameDesc = filterStations(FIXTURE_STATIONS, { sort: 'name-desc' });
    assert.deepEqual(sortedByNameDesc.map((s) => s.name), [
      'Radio Paradise',
      'Groove Salad',
      'FIP Radio',
      'Drone Zone'
    ]);

    const sortedByGenreAsc = filterStations(FIXTURE_STATIONS, { sort: 'genre-asc' });
    assert.deepEqual(sortedByGenreAsc.map((s) => s.id), [
      's2', // Ambient (Drone Zone)
      's1', // Ambient (Groove Salad)
      's3', // Eclectic Rock (Radio Paradise)
      's4'  // Jazz (FIP Radio)
    ]);

    const sortedByBitrate = filterStations(FIXTURE_STATIONS, { sort: 'bitrate-desc' });
    assert.deepEqual(sortedByBitrate.map((s) => s.id), [
      's3', // 320 kbps
      's4', // 192 kbps
      's1', // 128 kbps
      's2'  // 64 kbps
    ]);
  });

  it('filterStations sorting is stable for equal keys', () => {
    const tied = [
      { id: 'a', name: 'Same', genre: 'Rock', bitrate: '128 kbps' },
      { id: 'b', name: 'Same', genre: 'Rock', bitrate: '128 kbps' },
      { id: 'c', name: 'Same', genre: 'Rock', bitrate: '128 kbps' }
    ];
    assert.deepEqual(filterStations(tied, { sort: 'name-asc' }).map((s) => s.id), ['a', 'b', 'c']);
    assert.deepEqual(filterStations(tied, { sort: 'bitrate-desc' }).map((s) => s.id), ['a', 'b', 'c']);
  });

  it('buildStationRows produces uniform BrowseRow structures', () => {
    const rows = buildStationRows([FIXTURE_STATIONS[0]]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'station');
    assert.equal(rows[0].primary, 'Groove Salad');
    assert.equal(rows[0].secondary, 'Ambient · US');
    assert.equal(rows[0].trailing, '128 kbps');
    assert.equal(rows[0].payload.id, 's1');
  });
});
