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

  await t.test('Includes Radio Paradise and SomaFM stations', () => {
    const ids = CURATED_STATIONS.map((s) => s.id);
    assert.ok(ids.includes('rp_main'));
    assert.ok(ids.includes('rp_mellow'));
    assert.ok(ids.includes('soma_groove_salad'));
    assert.ok(ids.includes('soma_defcon'));
  });

  await t.test('Loads stations and initializes mock database with curated list', async () => {
    const db = new MockRadioDB();
    const stations = await loadStations(db);
    assert.equal(stations.length, CURATED_STATIONS.length);
    assert.equal(db.stations.length, CURATED_STATIONS.length);
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
