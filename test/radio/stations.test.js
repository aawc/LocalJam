import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_STATIONS,
  loadStations,
  addCustomStation,
  toggleFavoriteStation,
  getStationFallbackArtwork
} from '../../src/radio/stations.js';

class MockRadioDB {
  constructor() {
    this.stations = [];
  }
  async getStations() {
    return [...this.stations];
  }
  async saveStations(list) {
    this.stations = [...list];
  }
}

test('Internet Radio Stations Suite', async (t) => {
  await t.test('Curated stations contain valid names, genres, and HTTPS stream URLs', () => {
    assert.ok(CURATED_STATIONS.length >= 20, `Expected at least 20 curated stations, got ${CURATED_STATIONS.length}`);

    for (const station of CURATED_STATIONS) {
      assert.ok(station.id, 'Station must have an ID');
      assert.ok(station.name, 'Station must have a name');
      assert.ok(station.streamUrl, 'Station must have a streamUrl');
      assert.ok(station.streamUrl.startsWith('https://'), `Stream URL must use HTTPS: ${station.streamUrl}`);
      assert.ok(station.genre, 'Station must have a genre');
    }
  });

  await t.test('Includes Radio Paradise, SomaFM, Classical, Jazz, and News stations with verified URLs', () => {
    const ids = CURATED_STATIONS.map((s) => s.id);
    assert.ok(ids.includes('rp_main'));
    assert.ok(ids.includes('rp_mellow'));
    assert.ok(ids.includes('soma_groove_salad'));
    assert.ok(ids.includes('soma_defcon'));
    assert.ok(ids.includes('soma_lush'));
    assert.ok(ids.includes('soma_deepspaceone'));
    assert.ok(ids.includes('soma_synphaera'));
    assert.ok(ids.includes('kusc_classical'));
    assert.ok(ids.includes('king_classical'));
    assert.ok(ids.includes('wqxr_classical'));
    assert.ok(ids.includes('jazz24'));
    assert.ok(ids.includes('knkx_jazz_npr'));
    assert.ok(ids.includes('soma_poptron'));
    assert.ok(ids.includes('soma_indiepop'));
    assert.ok(ids.includes('soma_beatblender'));
    assert.ok(ids.includes('soma_7soul'));
    assert.ok(ids.includes('soma_seventies'));
    assert.ok(ids.includes('soma_folkfwd'));
    assert.ok(ids.includes('soma_bootliquor'));
    assert.ok(ids.includes('soma_thistle'));
    assert.ok(ids.includes('soma_fluid'));
    assert.ok(ids.includes('soma_sf1033'));
    assert.ok(ids.includes('wnyc_fm'));
    assert.ok(ids.includes('bbc_world_service'));

    // Verify critical station stream endpoints
    const kusc = CURATED_STATIONS.find((s) => s.id === 'kusc_classical');
    assert.ok(kusc.streamUrl.includes('streamtheworld.com'));

    const king = CURATED_STATIONS.find((s) => s.id === 'king_classical');
    assert.ok(king.streamUrl.includes('classicalking.streamguys1.com'));

    const jazz24 = CURATED_STATIONS.find((s) => s.id === 'jazz24');
    assert.ok(jazz24.streamUrl.includes('audiocdn.com'));
  });

  await t.test('getStationFallbackArtwork produces valid, accessible SVG data URIs for each genre', () => {
    const genres = [
      'Classical / Instrumental',
      'Jazz / Blues',
      'Ambient / Drone',
      'Rock / Alternative',
      'Electropop / Indie Dance',
      'News / Public Radio',
      'Soul / Funk',
      'Unknown Genre'
    ];

    for (const g of genres) {
      const uri = getStationFallbackArtwork({ genre: g, name: `Test ${g}` });
      assert.ok(uri.startsWith('data:image/svg+xml;utf8,'), `Expected SVG data URI for ${g}`);
      assert.ok(uri.includes('%3Csvg') || uri.includes('<svg'), `Must contain valid SVG for ${g}`);
    }
  });

  await t.test('Loads stations and initializes mock database with curated list', async () => {
    const db = new MockRadioDB();
    const stations = await loadStations(db);
    assert.equal(stations.length, CURATED_STATIONS.length);
    assert.equal(db.stations.length, CURATED_STATIONS.length);
  });

  await t.test('Automatically merges newly added curated stations into existing DB records and updates outdated URLs', async () => {
    const db = new MockRadioDB();
    // Simulate DB that has 1 station saved with an obsolete stream URL and isFavorite=true
    await db.saveStations([
      {
        id: 'king_classical',
        name: 'Classical KING FM (Seattle)',
        streamUrl: 'https://king.streamguys1.com/king-aac-128',
        isFavorite: true
      }
    ]);

    const loaded = await loadStations(db);
    assert.equal(loaded.length, CURATED_STATIONS.length);

    // User's favorite state must be preserved
    const king = loaded.find((s) => s.id === 'king_classical');
    assert.equal(king.isFavorite, true);
    // Outdated URL must be updated to the new working URL
    assert.equal(king.streamUrl, 'https://classicalking.streamguys1.com/king-fm-aac');
  });

  await t.test('Adds custom radio stations and toggles favorites', async () => {
    const db = new MockRadioDB();
    await loadStations(db);

    const custom = await addCustomStation(
      {
        name: 'My Ambient Station',
        streamUrl: 'https://stream.example.com/live',
        genre: 'Ambient'
      },
      db
    );

    assert.ok(custom.id.startsWith('custom_'));
    assert.equal(custom.name, 'My Ambient Station');
    assert.equal(custom.isCustom, true);

    const isFav = await toggleFavoriteStation(custom.id, db);
    assert.equal(isFav, true);

    const unFav = await toggleFavoriteStation(custom.id, db);
    assert.equal(unFav, false);
  });
});

