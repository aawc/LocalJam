/**
 * LocalJam - Albums Grid View
 */

import { db } from '../../storage/db.js';
import { audioEngine } from '../../player/audio-engine.js';
import { queueManager } from '../../player/queue.js';
import { router } from '../router.js';
import { escapeHtml } from '../../utils/sanitize.js';

export async function renderAlbumsView() {
  const container = document.createElement('div');
  container.className = 'page-container';

  const albums = await db.getAllAlbums();
  const allTracks = await db.getAllTracks();

  // Map tracks to albums
  const albumTracksMap = new Map();
  for (const track of allTracks) {
    if (track.isMissing) continue;
    const key = track.album || 'Unknown Album';
    if (!albumTracksMap.has(key)) {
      albumTracksMap.set(key, []);
    }
    albumTracksMap.get(key).push(track);
  }

  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Albums</h1>
        <div class="view-subtitle">${albums.length} albums in your collection</div>
      </div>
    </div>

    ${
      albums.length === 0
        ? `
      <div class="empty-state-card">
        <p>No albums found in your library. Open a music folder to get started.</p>
      </div>
    `
        : `
      <div class="card-grid">
        ${albums
          .map((album) => {
            const tracks = albumTracksMap.get(album.name) || [];
            const trackCount = tracks.length;
            const firstTrackWithArt = tracks.find((t) => t.artwork && t.artwork.dataUrl);
            const artSrc = firstTrackWithArt ? firstTrackWithArt.artwork.dataUrl : 'public/icons/icon-192.svg';

            return `
            <div class="media-card album-card" data-album-name="${escapeHtml(album.name)}">
              <div class="media-card-art-wrapper">
                <img src="${escapeHtml(artSrc)}" alt="${escapeHtml(album.name)}" class="media-card-art" />
                <button class="btn-play-card" data-album-name="${escapeHtml(album.name)}" aria-label="Play album ${escapeHtml(album.name)}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </button>
              </div>
              <div class="media-card-info">
                <div class="media-card-title">${escapeHtml(album.name)}</div>
                <div class="media-card-sub">${escapeHtml(album.artist || 'Various Artists')} • ${trackCount} tracks</div>
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
  container.querySelectorAll('.album-card').forEach((card) => {
    const albumName = card.dataset.albumName;
    const playBtn = card.querySelector('.btn-play-card');

    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tracks = albumTracksMap.get(albumName) || [];
      if (tracks.length > 0) {
        // Sort tracks by track number if available
        tracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
        queueManager.setQueue(tracks, 0);
        audioEngine.playTrack(tracks[0]);
      }
    });

    card.addEventListener('click', () => {
      router.navigate(`songs?q=${encodeURIComponent(albumName)}`);
    });
  });

  return container;
}
