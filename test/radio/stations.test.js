import test from 'node:test';
import assert from 'node:assert/strict';
import { CURATED_STATIONS, loadStations, addCustomStation, toggleFavoriteStation } from '../../src/radio/stations.js';

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
    assert.ok(CURATED_STATIONS.length >= 8);

    for (const station of CURATED_STATIONS) {
      assert.ok(station.id, 'Station must have an ID');
      assert.ok(station.name, 'Station must have a name');
      assert.ok(station.streamUrl, 'Station must have a streamUrl');
      assert.ok(station.streamUrl.startsWith('https://'), `Stream URL must use HTTPS: ${station.streamUrl}`);
      assert.ok(station.genre, 'Station must have a genre');
    }
  });

  await t.test('Includes Radio Paradise, SomaFM, Classical, Jazz, and News stations', () => {
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
    assert.ok(ids.includes('jazz24'));
    assert.ok(ids.includes('wnyc_fm'));
    assert.ok(ids.includes('bbc_world_service'));
  });

  await t.test('Loads stations and initializes mock database with curated list', async () => {
    const db = new MockRadioDB();
    const stations = await loadStations(db);
    assert.equal(stations.length, CURATED_STATIONS.length);
    assert.equal(db.stations.length, CURATED_STATIONS.length);
  });

  await t.test('Automatically merges newly added curated stations into existing DB records', async () => {
    const db = new MockRadioDB();
    // Simulate DB that only has 1 station saved
    await db.saveStations([{ id: 'rp_main', name: 'Radio Paradise', streamUrl: 'https://stream.radioparadise.com/mp3-320', isFavorite: true }]);
    
    const loaded = await loadStations(db);
    assert.equal(loaded.length, CURATED_STATIONS.length);
    // User's customized / favorite state should be preserved
    const rp = loaded.find((s) => s.id === 'rp_main');
    assert.equal(rp.isFavorite, true);
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
