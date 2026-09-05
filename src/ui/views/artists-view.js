/**
 * LocalJam - Artists View
 */

import { db } from '../../storage/db.js';
import { audioEngine } from '../../player/audio-engine.js';
import { queueManager } from '../../player/queue.js';
import { router } from '../router.js';
import { escapeHtml } from '../../utils/sanitize.js';

export async function renderArtistsView() {
  const container = document.createElement('div');
  container.className = 'page-container';

  const artists = await db.getAllArtists();
  const allTracks = await db.getAllTracks();

  // Map tracks to artists
  const artistTracksMap = new Map();
  for (const track of allTracks) {
    if (track.isMissing) continue;
    const key = track.artist || 'Unknown Artist';
    if (!artistTracksMap.has(key)) {
      artistTracksMap.set(key, []);
    }
    artistTracksMap.get(key).push(track);
  }

  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Artists</h1>
        <div class="view-subtitle">${artists.length} artists in your library</div>
      </div>
    </div>

    ${
      artists.length === 0
        ? `
      <div class="empty-state-card">
        <p>No artists found in your library. Open a music folder to get started.</p>
      </div>
    `
        : `
      <div class="card-grid">
        ${artists
          .map((artist) => {
            const tracks = artistTracksMap.get(artist.name) || [];
            const trackCount = tracks.length;
            const uniqueAlbums = new Set(tracks.map((t) => t.album || 'Unknown Album')).size;

            return `
            <div class="media-card artist-card" data-artist-name="${escapeHtml(artist.name)}">
              <div class="media-card-art-wrapper" style="border-radius: 50%; aspect-ratio: 1/1;">
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--surface-bg);">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="1.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
                <button class="btn-play-card" data-artist-name="${escapeHtml(artist.name)}" aria-label="Play artist ${escapeHtml(artist.name)}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </button>
              </div>
              <div class="media-card-info" style="text-align: center;">
                <div class="media-card-title">${escapeHtml(artist.name)}</div>
                <div class="media-card-sub">${uniqueAlbums} albums • ${trackCount} tracks</div>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    `
    }
  `;

  // Attach card interactions
  container.querySelectorAll('.artist-card').forEach((card) => {
    const artistName = card.dataset.artistName;
    const playBtn = card.querySelector('.btn-play-card');

    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tracks = artistTracksMap.get(artistName) || [];
      if (tracks.length > 0) {
        queueManager.setQueue(tracks, 0);
        audioEngine.playTrack(tracks[0]);
      }
    });

    card.addEventListener('click', () => {
      router.navigate(`songs?q=${encodeURIComponent(artistName)}`);
    });
  });

  return container;
}
