/**
 * LocalJam - Favorites View
 */

import { db } from '../../storage/db.js';
import { audioEngine } from '../../player/audio-engine.js';
import { queueManager } from '../../player/queue.js';

export async function renderFavoritesView() {
  const container = document.createElement('div');
  container.className = 'page-container';

  async function loadFavorites() {
    const favRecords = await db.getAllFavorites();
    const tracks = [];
    for (const fav of favRecords) {
      const t = await db.getTrack(fav.trackId);
      if (t) tracks.push(t);
    }
    return tracks;
  }

  async function render() {
    const tracks = await loadFavorites();
    const totalDuration = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Favorites</h1>
          <div class="view-subtitle">${tracks.length} favorite tracks • ${formatTotalDuration(totalDuration)}</div>
        </div>

        <div class="view-actions">
          <button id="fav-play-all-btn" class="btn btn-primary" ${tracks.length === 0 ? 'disabled' : ''}>
            Play All
          </button>
          <button id="fav-shuffle-btn" class="btn btn-secondary" ${tracks.length === 0 ? 'disabled' : ''}>
            Shuffle
          </button>
        </div>
      </div>

      ${
        tracks.length === 0
          ? `
        <div class="empty-state-card">
          <p>No favorite tracks starred yet. Click the star icon on any song to add it here.</p>
        </div>
      `
          : `
        <div class="track-table-container">
          <table class="track-table">
            <thead>
              <tr>
                <th style="width: 44px;">#</th>
                <th>Title</th>
                <th>Artist</th>
                <th>Album</th>
                <th style="width: 80px; text-align: right;">Duration</th>
                <th style="width: 50px; text-align: center;">Fav</th>
              </tr>
            </thead>
            <tbody>
              ${tracks
                .map((track, idx) => {
                  const isMissing = track.isMissing === 1;
                  return `
                  <tr class="track-row" data-track-id="${track.id}" data-index="${idx}">
                    <td>${idx + 1}</td>
                    <td>
                      <div class="track-title-cell">
                        <span class="track-name">${escapeHtml(track.title || track.filename)}</span>
                        ${isMissing ? '<span class="status-badge badge-missing">[MISSING]</span>' : ''}
                      </div>
                    </td>
                    <td>${escapeHtml(track.artist || 'Unknown Artist')}</td>
                    <td>${escapeHtml(track.album || 'Unknown Album')}</td>
                    <td style="text-align: right;">${formatDuration(track.duration)}</td>
                    <td style="text-align: center;">
                      <button class="btn-fav-toggle active" data-track-id="${track.id}" aria-label="Remove from Favorites" style="color: #fbbf24;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                      </button>
                    </td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `
      }
    `;

    const playAllBtn = container.querySelector('#fav-play-all-btn');
    const shuffleBtn = container.querySelector('#fav-shuffle-btn');

    if (playAllBtn) {
      playAllBtn.addEventListener('click', () => {
        if (tracks.length > 0) {
          queueManager.setQueue(tracks, 0);
          audioEngine.playTrack(tracks[0]);
        }
      });
    }

    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => {
        if (tracks.length > 0) {
          queueManager.setQueue(tracks, 0);
          queueManager.toggleShuffle();
          audioEngine.playTrack(queueManager.getCurrentTrack());
        }
      });
    }

    // Row clicks
    container.querySelectorAll('.track-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-fav-toggle')) return;
        const index = parseInt(row.dataset.index, 10);
        if (tracks[index]) {
          queueManager.setQueue(tracks, index);
          audioEngine.playTrack(tracks[index]);
        }
      });
    });

    // Un-favorite clicks
    container.querySelectorAll('.btn-fav-toggle').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const trackId = btn.dataset.trackId;
        await db.toggleFavorite(trackId);
        await render();
      });
    });
  }

  await render();
  return container;
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatTotalDuration(seconds) {
  if (!seconds) return '0 min';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs} hr ${mins} min`;
  return `${mins} min`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
