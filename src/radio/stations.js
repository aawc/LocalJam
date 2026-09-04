/**
 * LocalJam - Curated Internet Radio Stations & Station Manager
 * High-quality, reliable HTTPS audio streams.
 */

export const CURATED_STATIONS = [
  {
    id: 'rp_main',
    name: 'Radio Paradise (Main Mix)',
    description: 'Eclectic mix of modern & classic rock, world, electronica, and indie.',
    streamUrl: 'https://stream.radioparadise.com/mp3-320',
    homepageUrl: 'https://radioparadise.com',
    genre: 'Eclectic / Rock',
    country: 'USA',
    bitrate: '320 kbps',
    favicon: 'https://radioparadise.com/favicon.ico',
    isCustom: false,
    isFavorite: false
  },
  {
    id: 'rp_mellow',
    name: 'Radio Paradise (Mellow Mix)',
    description: 'A relaxed, warm, and chilled acoustic/ambient stream.',
    streamUrl: 'https://stream.radioparadise.com/mellow-320',
    homepageUrl: 'https://radioparadise.com',
    genre: 'Acoustic / Ambient',
    country: 'USA',
    bitrate: '320 kbps',
    favicon: 'https://radioparadise.com/favicon.ico',
    isCustom: false,
    isFavorite: false
  },
  {
    id: 'rp_rock',
    name: 'Radio Paradise (Rock Mix)',
    description: 'High energy modern, alternative, and classic guitar rock.',
    streamUrl: 'https://stream.radioparadise.com/rock-320',
    homepageUrl: 'https://radioparadise.com',
    genre: 'Rock / Alternative',
    country: 'USA',
    bitrate: '320 kbps',
    favicon: 'https://radioparadise.com/favicon.ico',
    isCustom: false,
    isFavorite: false
  },
  {
    id: 'rp_world',
    name: 'Radio Paradise (World / Etc)',
    description: 'Global sounds, world fusion, and eclectic rhythms.',
    streamUrl: 'https://stream.radioparadise.com/world-etc-320',
    homepageUrl: 'https://radioparadise.com',
    genre: 'World Fusion',
    country: 'USA',
    bitrate: '320 kbps',
    favicon: 'https://radioparadise.com/favicon.ico',
    isCustom: false,
    isFavorite: false
  },
  {
    id: 'soma_groove_salad',
    name: 'SomaFM: Groove Salad',
    description: 'A nicely chilled plate of ambient / downtempo beats and grooves.',
    streamUrl: 'https://ice1.somafm.com/groovesalad-256-mp3',
    homepageUrl: 'https://somafm.com/groovesalad/',
    genre: 'Downtempo / Chillout',
    country: 'USA',
    bitrate: '256 kbps',
    favicon: 'https://somafm.com/favicon.ico',
    isCustom: false,
    isFavorite: false
  },
  {
    id: 'soma_defcon',
    name: 'SomaFM: DEF CON Radio',
    description: 'Music for hacking, coding, cyber-culture, and late-night focus.',
    streamUrl: 'https://ice1.somafm.com/defcon-256-mp3',
    homepageUrl: 'https://somafm.com/defcon/',
    genre: 'Electronic / Industrial',
    country: 'USA',
    bitrate: '256 kbps',
    favicon: 'https://somafm.com/favicon.ico',
    isCustom: false,
    isFavorite: false
  },
  {
    id: 'soma_secret_agent',
    name: 'SomaFM: Secret Agent',
    description: 'The soundtrack for your stylish, mysterious 007 lifestyle.',
    streamUrl: 'https://ice1.somafm.com/secretagent-256-mp3',
    homepageUrl: 'https://somafm.com/secretagent/',
    genre: 'Spy / Lounge / Trip-Hop',
    country: 'USA',
    bitrate: '256 kbps',
    favicon: 'https://somafm.com/favicon.ico',
    isCustom: false,
    isFavorite: false
  },
  {
    id: 'soma_drone_zone',
    name: 'SomaFM: Drone Zone',
    description: 'Served best chilled, safe with most medications. Atmospheric ambient.',
    streamUrl: 'https://ice1.somafm.com/dronezone-256-mp3',
    homepageUrl: 'https://somafm.com/dronezone/',
    genre: 'Ambient / Drone',
    country: 'USA',
    bitrate: '256 kbps',
    favicon: 'https://somafm.com/favicon.ico',
    isCustom: false,
    isFavorite: false
  },
  {
    id: 'kexp_seattle',
    name: 'KEXP 90.3 FM (Seattle)',
    description: 'Where the music matters. Independent listener-powered radio.',
    streamUrl: 'https://kexp.streamguys1.com/kexp160.aac',
    homepageUrl: 'https://kexp.org',
    genre: 'Indie / Alternative',
    country: 'USA',
    bitrate: '160 kbps AAC',
    favicon: 'https://kexp.org/favicon.ico',
    isCustom: false,
    isFavorite: false
  },
  {
    id: 'bbc_radio_6',
    name: 'BBC Radio 6 Music',
    description: 'Alternative music, indie rock, electronic, and rare grooves.',
    streamUrl: 'https://a.files.bbci.co.uk/media/live/manifesto/audio/simulcast/hls/nonuk/sbr_low/ak/bbc_6music.m3u8',
    homepageUrl: 'https://www.bbc.co.uk/6music',
    genre: 'Alternative / Indie',
    country: 'UK',
    bitrate: '128 kbps',
    favicon: 'https://www.bbc.co.uk/favicon.ico',
    isCustom: false,
    isFavorite: false
  }
];

export const RADIO_GENRES = [
  'All',
  'Eclectic / Rock',
  'Acoustic / Ambient',
  'Rock / Alternative',
  'World Fusion',
  'Downtempo / Chillout',
  'Electronic / Industrial',
  'Spy / Lounge / Trip-Hop',
  'Ambient / Drone',
  'Indie / Alternative'
];

export async function loadStations(db) {
  if (!db) return CURATED_STATIONS.map((s) => ({ ...s }));
  try {
    const saved = await db.getStations();
    if (!saved || saved.length === 0) {
      await db.saveStations(CURATED_STATIONS.map((s) => ({ ...s })));
      return CURATED_STATIONS.map((s) => ({ ...s }));
    }
    return saved.map((s) => ({ ...s }));
  } catch (err) {
    console.error(`[Stations] Failed to load stations from DB: ${err?.message}`);
    return CURATED_STATIONS.map((s) => ({ ...s }));
  }
}

export async function addCustomStation(station, db) {
  if (!station || typeof station !== 'object') {
    throw new Error('[Stations] Invalid station payload: object expected');
  }
  if (!station.streamUrl || typeof station.streamUrl !== 'string' || !station.streamUrl.startsWith('https://')) {
    throw new Error('[Stations] Valid HTTPS stream URL is required');
  }

  const newStation = {
    id: 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    name: station.name || 'Custom Station',
    description: station.description || 'User added stream',
    streamUrl: station.streamUrl,
    homepageUrl: station.homepageUrl || '',
    genre: station.genre || 'Custom',
    country: station.country || 'User',
    bitrate: station.bitrate || 'Unknown',
    favicon: station.favicon || '',
    isCustom: true,
    isFavorite: false
  };

  if (db) {
    const all = await loadStations(db);
    all.push(newStation);
    await db.saveStations(all);
  }
  return newStation;
}

export async function toggleFavoriteStation(stationId, db) {
  if (!db) return false;
  const stations = await loadStations(db);
  const target = stations.find((s) => s.id === stationId);
  if (!target) return false;

  target.isFavorite = !target.isFavorite;
  await db.saveStations(stations);
  return target.isFavorite;
}
