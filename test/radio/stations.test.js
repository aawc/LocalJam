import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_STATIONS,
  loadStations,
  addCustomStation,
  toggleFavoriteStation,
  recordStationPlay,
  HIGH_LEVEL_GENRES,
  RADIO_GENRES,
  getStationCategory,
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

  await t.test('High-level genre taxonomy and getStationCategory classification', () => {
    assert.deepEqual(RADIO_GENRES, HIGH_LEVEL_GENRES);
    assert.ok(HIGH_LEVEL_GENRES.includes('Ambient'));
    assert.ok(HIGH_LEVEL_GENRES.includes('Rock'));
    assert.ok(HIGH_LEVEL_GENRES.includes('Classical'));
    assert.ok(HIGH_LEVEL_GENRES.includes('Jazz'));
    assert.ok(HIGH_LEVEL_GENRES.includes('Kids & Family'));
    assert.ok(HIGH_LEVEL_GENRES.includes('Electronic'));
    assert.ok(HIGH_LEVEL_GENRES.includes('Folk & Roots'));
    assert.ok(HIGH_LEVEL_GENRES.includes('News & Talk'));

    for (const station of CURATED_STATIONS) {
      const cat = getStationCategory(station);
      assert.ok(
        HIGH_LEVEL_GENRES.includes(cat),
        `Station ${station.name} (${station.genre}) mapped to invalid category: ${cat}`
      );
    }

    // Specific category assertions
    assert.equal(getStationCategory({ genre: 'Ambient / Drone' }), 'Ambient');
    assert.equal(getStationCategory({ genre: 'Rock / Alternative' }), 'Rock');
    assert.equal(getStationCategory({ genre: 'Classical / Instrumental' }), 'Classical');
    assert.equal(getStationCategory({ genre: 'Jazz / Blues' }), 'Jazz');
    assert.equal(getStationCategory({ genre: 'Kids & Family / Pop & Learning' }), 'Kids & Family');
    assert.equal(getStationCategory({ genre: 'Kids & Family / Sleep & Bedtime' }), 'Kids & Family');
    assert.equal(getStationCategory({ genre: 'Electronic / Industrial' }), 'Electronic');
    assert.equal(getStationCategory({ genre: 'Folk / Americana' }), 'Folk & Roots');
    assert.equal(getStationCategory({ genre: 'Spy / Lounge / Trip-Hop' }), 'Lounge');
    assert.equal(getStationCategory({ genre: 'News / English Talk' }), 'News & Talk');
    assert.equal(getStationCategory({ genre: 'News / Public Radio' }), 'News & Talk');
    assert.equal(getStationCategory({ genre: 'Soul / Funk' }), 'Soul & Funk');
    assert.equal(getStationCategory({ genre: 'World Fusion' }), 'World');
    assert.equal(getStationCategory({ genre: 'World Fusion / Asian Chill' }), 'World');
    assert.equal(getStationCategory({ genre: 'Future Lounge / Chill' }), 'Lounge');
    assert.equal(getStationCategory({ genre: 'Synthwave / Instrumental' }), 'Electronic');
  });

  await t.test('Includes Radio Paradise, SomaFM, Classical, Jazz, News, and Kids stations with verified URLs', () => {
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
    assert.ok(ids.includes('wnyc_fm'));
    assert.ok(ids.includes('bbc_world_service'));
    assert.ok(ids.includes('npr_news'));
    assert.ok(ids.includes('kqed_fm'));
    assert.ok(ids.includes('wbez_chicago'));
    assert.ok(ids.includes('rfi_english'));
    assert.ok(ids.includes('wgbh_boston'));
    assert.ok(ids.includes('fun_kids_uk'));
    assert.ok(ids.includes('fun_kids_junior'));
    assert.ok(ids.includes('radio_art_lullaby'));
    assert.ok(ids.includes('radio_art_solo_piano'));
    assert.ok(ids.includes('radio_art_mozart'));
    assert.ok(ids.includes('soma_covers'));

    // Verify critical station stream endpoints
    const kusc = CURATED_STATIONS.find((s) => s.id === 'kusc_classical');
    assert.ok(kusc.streamUrl.includes('streamtheworld.com'));

    const king = CURATED_STATIONS.find((s) => s.id === 'king_classical');
    assert.ok(king.streamUrl.includes('classicalking.streamguys1.com'));

    const jazz24 = CURATED_STATIONS.find((s) => s.id === 'jazz24');
    assert.ok(jazz24.streamUrl.includes('audiocdn.com'));

    const secretAgent = CURATED_STATIONS.find((s) => s.id === 'soma_secret_agent');
    assert.equal(secretAgent.streamUrl, 'https://ice1.somafm.com/secretagent-128-mp3');

    const illinoisStreet = CURATED_STATIONS.find((s) => s.id === 'soma_illinois_street');
    assert.equal(illinoisStreet.streamUrl, 'https://ice1.somafm.com/illstreet-128-mp3');

    const lush = CURATED_STATIONS.find((s) => s.id === 'soma_lush');
    assert.equal(lush.streamUrl, 'https://ice1.somafm.com/lush-128-mp3');

    const spaceStation = CURATED_STATIONS.find((s) => s.id === 'soma_spacestation');
    assert.equal(spaceStation.streamUrl, 'https://ice1.somafm.com/spacestation-128-mp3');

    const deepSpace = CURATED_STATIONS.find((s) => s.id === 'soma_deepspaceone');
    assert.equal(deepSpace.streamUrl, 'https://ice1.somafm.com/deepspaceone-128-mp3');

    const suburbs = CURATED_STATIONS.find((s) => s.id === 'soma_suburbs');
    assert.equal(suburbs.streamUrl, 'https://ice1.somafm.com/suburbsofgoa-128-mp3');

    const bbc6 = CURATED_STATIONS.find((s) => s.id === 'bbc_radio_6');
    assert.equal(bbc6.streamUrl, 'https://stream.live.vc.bbcmedia.co.uk/bbc_6music');
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

  await t.test('recordStationPlay updates lastPlayedAt timestamp on station', async () => {
    const db = new MockRadioDB();
    await loadStations(db);

    const updated = await recordStationPlay('rp_main', db);
    assert.ok(updated);
    assert.equal(updated.id, 'rp_main');
    assert.ok(typeof updated.lastPlayedAt === 'number' && updated.lastPlayedAt > 0);

    const reloaded = await loadStations(db);
    const rp = reloaded.find((s) => s.id === 'rp_main');
    assert.equal(rp.lastPlayedAt, updated.lastPlayedAt);
  });

  await t.test('Seamlessly upgrades legacy 23-station DB to 34 stations, adding Kids and News streams while preserving custom stations', async () => {
    const db = new MockRadioDB();
    // Simulate legacy DB with 23 old stations + 1 user custom station
    const legacyStations = CURATED_STATIONS.slice(0, 23).map((s) => ({
      ...s,
      description: 'Old legacy description'
    }));

    const customUserStation = {
      id: 'custom_user_stream_1',
      name: 'My Personal Radio',
      streamUrl: 'https://stream.myradio.org/live',
      genre: 'Custom Ambient',
      isCustom: true,
      isFavorite: true,
      lastPlayedAt: 1700000000000
    };
    legacyStations.push(customUserStation);

    await db.saveStations(legacyStations);
    assert.equal(db.stations.length, 24);

    // Run loadStations (simulating app boot on new version)
    const loaded = await loadStations(db);

    // Total should now be 34 curated stations + 1 custom station = 35 stations
    assert.equal(loaded.length, CURATED_STATIONS.length + 1);

    // Verify Kids & Family stations are present
    const kidsStations = loaded.filter((s) => getStationCategory(s) === 'Kids & Family');
    assert.equal(kidsStations.length, 6);
    assert.ok(kidsStations.some((s) => s.id === 'fun_kids_uk'));
    assert.ok(kidsStations.some((s) => s.id === 'fun_kids_junior'));
    assert.ok(kidsStations.some((s) => s.id === 'radio_art_lullaby'));
    assert.ok(kidsStations.some((s) => s.id === 'radio_art_solo_piano'));
    assert.ok(kidsStations.some((s) => s.id === 'radio_art_mozart'));
    assert.ok(kidsStations.some((s) => s.id === 'soma_covers'));

    // Verify News & Talk stations are present
    const newsStations = loaded.filter((s) => getStationCategory(s) === 'News & Talk');
    assert.equal(newsStations.length, 7); // wnyc_fm, bbc_world_service + npr_news, kqed_fm, wbez_chicago, rfi_english, wgbh_boston
    assert.ok(newsStations.some((s) => s.id === 'npr_news'));
    assert.ok(newsStations.some((s) => s.id === 'kqed_fm'));
    assert.ok(newsStations.some((s) => s.id === 'wbez_chicago'));
    assert.ok(newsStations.some((s) => s.id === 'rfi_english'));
    assert.ok(newsStations.some((s) => s.id === 'wgbh_boston'));

    // Verify custom user station is preserved intact
    const customInLoaded = loaded.find((s) => s.id === 'custom_user_stream_1');
    assert.ok(customInLoaded);
    assert.equal(customInLoaded.name, 'My Personal Radio');
    assert.equal(customInLoaded.isFavorite, true);
    assert.equal(customInLoaded.lastPlayedAt, 1700000000000);

    // Verify legacy station metadata was refreshed to new curated description
    const rpMain = loaded.find((s) => s.id === 'rp_main');
    assert.notEqual(rpMain.description, 'Old legacy description');
    assert.equal(rpMain.description, CURATED_STATIONS.find((s) => s.id === 'rp_main').description);
  });
});

