import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  filterTracks,
  buildLibraryRows,
  filterStations,
  buildStationRows,
  getStationProvider
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

  it('filterStations query matches provider names case-insensitively (F6)', () => {
    const providerFixtures = [
      { id: 's1', name: 'Secret Agent', genre: 'Spy', description: 'Spy music', country: 'US', provider: 'SomaFM' },
      { id: 's2', name: 'Lush', genre: 'Downtempo', description: 'Sensuous beats', country: 'US', provider: 'SomaFM' },
      { id: 's3', name: 'BBC World Service', genre: 'News & Talk', description: 'Global news', country: 'GB', provider: 'BBC' },
      { id: 's4', name: 'WAMU 88.5 FM', genre: 'Public Radio', description: 'NPR member station', country: 'US', provider: 'American University / WAMU' },
      { id: 's5', name: 'FIP Paris', genre: 'Eclectic', description: 'Radio France music', country: 'FR', provider: 'Radio France' },
      { id: 's6', name: 'Independent Beats', genre: 'Electronic', description: 'Community stream', country: 'DE', provider: '' }
    ];

    // Search 'somafm'
    const somafmMatches = filterStations(providerFixtures, { query: 'somafm' });
    assert.deepEqual(somafmMatches.map((s) => s.id), ['s1', 's2']);

    // Search 'soma' case-insensitively
    const somaMatches = filterStations(providerFixtures, { query: 'SOMA' });
    assert.deepEqual(somaMatches.map((s) => s.id), ['s1', 's2']);

    // Search 'bbc'
    const bbcMatches = filterStations(providerFixtures, { query: 'bbc' });
    assert.deepEqual(bbcMatches.map((s) => s.id), ['s3']);

    // Search 'wamu'
    const wamuMatches = filterStations(providerFixtures, { query: 'WAMU' });
    assert.deepEqual(wamuMatches.map((s) => s.id), ['s4']);

    // Search 'American University'
    const auMatches = filterStations(providerFixtures, { query: 'american university' });
    assert.deepEqual(auMatches.map((s) => s.id), ['s4']);

    // Search 'radio france'
    const rfMatches = filterStations(providerFixtures, { query: 'Radio France' });
    assert.deepEqual(rfMatches.map((s) => s.id), ['s5']);

    // Search with no matching provider, name, genre, description, country
    const noneMatches = filterStations(providerFixtures, { query: 'NonExistentProvider' });
    assert.deepEqual(noneMatches, []);
  });

  it('filterStations sorts by provider A-Z with contiguous grouping and name A-Z tie-break (F7)', () => {
    const stations = [
      { id: 's1', name: 'Underground 80s', provider: 'SomaFM' },
      { id: 's2', name: 'Groove Salad', provider: 'SomaFM' },
      { id: 's3', name: 'BBC World Service', provider: 'BBC' },
      { id: 's4', name: 'BBC Radio 1', provider: 'BBC' },
      { id: 's5', name: 'FIP', provider: 'Radio France' },
      { id: 's6', name: 'France Inter', provider: 'Radio France' },
      { id: 's7', name: 'Custom Stream Beta', isCustom: true, provider: '' },
      { id: 's8', name: 'Custom Stream Alpha', isCustom: true },
      { id: 's9', name: 'Indie Station 2', isCustom: false },
      { id: 's10', name: 'Indie Station 1', isCustom: false, provider: '' }
    ];

    const sorted = filterStations(stations, { sort: 'provider' });

    // Expected provider order (A-Z):
    // 1. BBC ('BBC Radio 1', 'BBC World Service')
    // 2. Custom ('Custom Stream Alpha', 'Custom Stream Beta') -> fallback for isCustom
    // 3. Independent ('Indie Station 1', 'Indie Station 2') -> fallback for non-custom
    // 4. Radio France ('FIP', 'France Inter')
    // 5. SomaFM ('Groove Salad', 'Underground 80s')
    assert.deepEqual(
      sorted.map((s) => `${s.provider || (s.isCustom ? 'Custom' : 'Independent')}:${s.name}`),
      [
        'BBC:BBC Radio 1',
        'BBC:BBC World Service',
        'Custom:Custom Stream Alpha',
        'Custom:Custom Stream Beta',
        'Independent:Indie Station 1',
        'Independent:Indie Station 2',
        'Radio France:FIP',
        'Radio France:France Inter',
        'SomaFM:Groove Salad',
        'SomaFM:Underground 80s'
      ]
    );

    // Verify all stations for each provider cluster contiguously
    const seenProviders = [];
    let currentProvider = null;
    for (const s of sorted) {
      const p = s.provider || (s.isCustom ? 'Custom' : 'Independent');
      if (p !== currentProvider) {
        assert.equal(
          seenProviders.includes(p),
          false,
          `Provider "${p}" should cluster contiguously and not reappear`
        );
        seenProviders.push(p);
        currentProvider = p;
      }
    }
  });

  it('filterStations sorts by popularity descending with deterministic name A-Z tie-break (F8)', () => {
    const stations = [
      { id: 's1', name: 'Medium Popularity B', popularity: 75 },
      { id: 's2', name: 'Highest Popularity', popularity: 95 },
      { id: 's3', name: 'Medium Popularity A', popularity: 75 },
      { id: 's4', name: 'Low Popularity', popularity: 30 },
      { id: 's5', name: 'Zero Popularity B', popularity: 0 },
      { id: 's6', name: 'Zero Popularity A', popularity: 0 },
      { id: 's7', name: 'Missing Popularity B' }, // defaults to 0
      { id: 's8', name: 'Missing Popularity A', popularity: undefined } // defaults to 0
    ];

    // Test 'popularity-desc'
    const sortedDesc = filterStations(stations, { sort: 'popularity-desc' });
    assert.deepEqual(
      sortedDesc.map((s) => `${s.name} (${s.popularity ?? 0})`),
      [
        'Highest Popularity (95)',
        'Medium Popularity A (75)',
        'Medium Popularity B (75)',
        'Low Popularity (30)',
        'Missing Popularity A (0)',
        'Missing Popularity B (0)',
        'Zero Popularity A (0)',
        'Zero Popularity B (0)'
      ]
    );

    // Test 'popularity' alias produces identical order
    const sortedAlias = filterStations(stations, { sort: 'popularity' });
    assert.deepEqual(
      sortedAlias.map((s) => s.id),
      sortedDesc.map((s) => s.id)
    );
  });

  it('buildStationRows enriches rows with provider, popularity, and formatted secondary (F9)', () => {
    const enrichedStations = [
      {
        id: 's_full',
        name: 'Groove Salad',
        genre: 'Ambient',
        country: 'US',
        bitrate: '128 kbps',
        provider: 'SomaFM',
        popularity: 92
      },
      {
        id: 's_no_provider',
        name: 'Eclectic Radio',
        genre: 'Eclectic',
        country: 'FR',
        bitrate: '192 kbps',
        provider: '',
        popularity: 50
      },
      {
        id: 's_no_country',
        name: 'BBC News Stream',
        genre: 'News',
        country: '',
        bitrate: '96 kbps',
        provider: 'BBC',
        popularity: 96
      },
      {
        id: 's_minimal',
        name: 'Minimal Stream',
        genre: '',
        country: '',
        bitrate: ''
      }
    ];

    const rows = buildStationRows(enrichedStations);
    assert.equal(rows.length, 4);

    // Full metadata: provider, genre, country
    assert.equal(rows[0].id, 's_full');
    assert.equal(rows[0].kind, 'station');
    assert.equal(rows[0].primary, 'Groove Salad');
    assert.equal(rows[0].secondary, 'SomaFM · Ambient · US');
    assert.equal(rows[0].provider, 'SomaFM');
    assert.equal(rows[0].popularity, 92);
    assert.equal(rows[0].trailing, '128 kbps');

    // No provider: secondary is genre · country, provider falls back to 'Independent', popularity is 50
    assert.equal(rows[1].secondary, 'Eclectic · FR');
    assert.equal(rows[1].provider, 'Independent');
    assert.equal(rows[1].popularity, 50);

    // No country: secondary is provider · genre, provider is 'BBC', popularity is 96
    assert.equal(rows[2].secondary, 'BBC · News');
    assert.equal(rows[2].provider, 'BBC');
    assert.equal(rows[2].popularity, 96);

    // Minimal station: provider falls back to 'Independent', popularity default 0
    assert.equal(rows[3].provider, 'Independent');
    assert.equal(rows[3].popularity, 0);
  });

  it('getStationProvider returns explicit provider or falls back based on isCustom flag', () => {
    // Explicit provider takes precedence
    assert.equal(getStationProvider({ provider: 'SomaFM' }), 'SomaFM');
    assert.equal(getStationProvider({ provider: 'BBC', isCustom: true }), 'BBC');

    // Missing/falsy provider falls back to 'Custom' when isCustom is true
    assert.equal(getStationProvider({ isCustom: true }), 'Custom');
    assert.equal(getStationProvider({ provider: '', isCustom: true }), 'Custom');
    assert.equal(getStationProvider({ provider: null, isCustom: true }), 'Custom');
    assert.equal(getStationProvider({ provider: undefined, isCustom: true }), 'Custom');

    // Missing/falsy provider falls back to 'Independent' for non-custom / unbranded stations
    assert.equal(getStationProvider({ isCustom: false }), 'Independent');
    assert.equal(getStationProvider({ provider: '', isCustom: false }), 'Independent');
    assert.equal(getStationProvider({}), 'Independent');
    assert.equal(getStationProvider(null), 'Independent');
    assert.equal(getStationProvider(undefined), 'Independent');
  });

  it('filterStations query matching finds custom stations lacking provider when searching "custom"', () => {
    const stations = [
      { id: 'c1', name: 'Ambient Stream', isCustom: true, genre: 'Ambient' },
      { id: 'c2', name: 'Synthesizer Lab', isCustom: true, provider: '' },
      { id: 'i1', name: 'Community Radio', isCustom: false, genre: 'Eclectic' },
      { id: 's1', name: 'Groove Salad', provider: 'SomaFM', isCustom: false }
    ];

    // Searching 'custom' finds custom stations c1 and c2 via fallback provider
    const customMatches = filterStations(stations, { query: 'custom' });
    assert.deepEqual(customMatches.map((s) => s.id), ['c1', 'c2']);

    // Searching 'independent' finds unbranded station i1 via fallback provider
    const indieMatches = filterStations(stations, { query: 'independent' });
    assert.deepEqual(indieMatches.map((s) => s.id), ['i1']);
  });

  it('buildStationRows assigns provider: "Custom" to custom stations lacking provider', () => {
    const customStations = [
      { id: 'cust1', name: 'User Custom One', isCustom: true },
      { id: 'cust2', name: 'User Custom Two', isCustom: true, provider: '' }
    ];

    const rows = buildStationRows(customStations);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].provider, 'Custom');
    assert.equal(rows[1].provider, 'Custom');
    assert.equal(rows[0].primary, 'User Custom One');
    assert.equal(rows[1].primary, 'User Custom Two');
  });

  it('buildStationRows formats secondary cleanly without dangling trailing delimiters', () => {
    const stations = [
      { id: 'x1', name: 'BBC Only Provider', provider: 'BBC', genre: '', country: '' },
      { id: 'x2', name: 'BBC Provider and Genre', provider: 'BBC', genre: 'News', country: '' },
      { id: 'x3', name: 'BBC Provider and Country', provider: 'BBC', genre: '', country: 'UK' },
      { id: 'x4', name: 'Genre Only', provider: '', genre: 'Classical', country: '' },
      { id: 'x5', name: 'Country Only', provider: '', genre: '', country: 'France' },
      { id: 'x6', name: 'All Empty', provider: '', genre: '', country: '' }
    ];

    const rows = buildStationRows(stations);
    assert.equal(rows[0].secondary, 'BBC');
    assert.equal(rows[1].secondary, 'BBC · News');
    assert.equal(rows[2].secondary, 'BBC · UK');
    assert.equal(rows[3].secondary, 'Classical');
    assert.equal(rows[4].secondary, 'France');
    assert.equal(rows[5].secondary, '');

    // Explicitly verify no trailing ' · ' exists in any rendered secondary string
    for (const row of rows) {
      assert.equal(row.secondary.endsWith(' · '), false, `Should not end with " · ": ${row.secondary}`);
      assert.equal(row.secondary.endsWith(' ·'), false, `Should not end with " ·": ${row.secondary}`);
      assert.equal(row.secondary.startsWith(' · '), false, `Should not start with " · ": ${row.secondary}`);
    }
  });

  it('buildStationRows normalizes popularity values safely', () => {
    const stations = [
      { id: 'p1', name: 'String Pop', popularity: '85' },
      { id: 'p2', name: 'NaN Pop', popularity: NaN },
      { id: 'p3', name: 'Null Pop', popularity: null },
      { id: 'p4', name: 'Numeric Pop', popularity: 77 }
    ];

    const rows = buildStationRows(stations);
    assert.equal(rows[0].popularity, 85);
    assert.equal(rows[1].popularity, 0);
    assert.equal(rows[2].popularity, 0);
    assert.equal(rows[3].popularity, 77);
  });
});
