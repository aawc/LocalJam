/**
 * LocalJam - Home Dashboard View
 */

import { db } from '../../storage/db.js';
import { reconciler } from '../../storage/reconciler.js';
import { audioEngine } from '../../player/audio-engine.js';
import { queueManager } from '../../player/queue.js';
import { router } from '../router.js';
import { escapeHtml } from '../../utils/sanitize.js';

export async function renderHomeView() {
  const container = document.createElement('div');
  container.className = 'page-container';

  const tracks = await db.getAllTracks();
  const activeTracks = tracks.filter((t) => !t.isMissing);
  const albums = await db.getAllAlbums();
  const artists = await db.getAllArtists();
  const playlists = await db.getAllPlaylists();
  const history = await db.getRecentHistory(5);

  container.innerHTML = `
    <div class="hero-card">
      <div class="hero-content">
        <h1 class="hero-title">Local Audio Player</h1>
        <p class="hero-subtitle">
          Audio playback directly from your local drive.
        </p>
        <div class="hero-actions">
          <button id="hero-scan-folder-btn" class="btn btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
            Open Music Folder
          </button>
          <input type="file" id="fallback-folder-input" webkitdirectory directory multiple style="display: none;" />
          
          <button id="hero-shuffle-all-btn" class="btn btn-secondary" ${activeTracks.length === 0 ? 'disabled' : ''}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
              <polyline points="16 3 21 3 21 8"></polyline>
              <line x1="4" y1="20" x2="21" y2="3"></line>
              <polyline points="21 16 21 21 16 21"></polyline>
              <line x1="15" y1="15" x2="21" y2="21"></line>
              <line x1="4" y1="4" x2="9" y2="9"></line>
            </svg>
            Shuffle Library (${activeTracks.length})
          </button>

          <button id="hero-radio-btn" class="btn btn-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
              <circle cx="12" cy="12" r="2"></circle>
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path>
            </svg>
            Internet Radio
          </button>
        </div>
      </div>
    </div>

    <!-- Stats Bar -->
    <div class="stats-grid">
      <a class="stat-card" href="#/songs" style="text-decoration: none; color: inherit;">
        <div class="stat-val">${activeTracks.length}</div>
        <div class="stat-label">Tracks</div>
      </a>
      <a class="stat-card" href="#/albums" style="text-decoration: none; color: inherit;">
        <div class="stat-val">${albums.length}</div>
        <div class="stat-label">Albums</div>
      </a>
      <a class="stat-card" href="#/artists" style="text-decoration: none; color: inherit;">
        <div class="stat-val">${artists.length}</div>
        <div class="stat-label">Artists</div>
      </a>
      <a class="stat-card" href="#/playlists" style="text-decoration: none; color: inherit;">
        <div class="stat-val">${playlists.length}</div>
        <div class="stat-label">Playlists</div>
      </a>
    </div>

    <!-- Recently Played Section -->
    <div class="section-header" style="margin-top: 32px;">
      <h2 class="section-title">Recently Played</h2>
      ${history.length > 0 ? `<button id="btn-view-all-history" class="btn btn-secondary" style="font-size: 13px; padding: 4px 12px;">View All</button>` : ''}
    </div>

    ${
      history.length === 0
        ? `
        <div class="empty-state-card">
          <p>No tracks played yet. Choose a song or station to start listening.</p>
        </div>
      `
        : `
        <div class="track-table-container">
          <table class="track-table">
            <thead>
              <tr>
                <th style="width: 48px;">#</th>
                <th>Title</th>
                <th>Artist</th>
                <th>Album</th>
                <th style="width: 80px; text-align: right;">Duration</th>
              </tr>
            </thead>
            <tbody>
              ${history
                .map((item, idx) => {
                  const track = item.track || {};
                  return `
                  <tr class="track-row" data-track-id="${item.trackId}">
                    <td>${idx + 1}</td>
                    <td style="font-weight: 500; color: var(--text-primary);">${escapeHtml(track.title || track.filename || 'Unknown')}</td>
                    <td>${escapeHtml(track.artist || 'Unknown Artist')}</td>
                    <td>${escapeHtml(track.album || 'Unknown Album')}</td>
                    <td style="text-align: right;">${formatDuration(track.duration)}</td>
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

  // Attach handlers
  const scanBtn = container.querySelector('#hero-scan-folder-btn');
  const fallbackInput = container.querySelector('#fallback-folder-input');
  const shuffleBtn = container.querySelector('#hero-shuffle-all-btn');
  const radioBtn = container.querySelector('#hero-radio-btn');
  const viewHistoryBtn = container.querySelector('#btn-view-all-history');

  scanBtn.addEventListener('click', async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        scanBtn.disabled = true;
        scanBtn.textContent = 'Scanning files...';

        await reconciler.reconcileDirectoryHandle(dirHandle, (progress) => {
          scanBtn.textContent = `Scanning: ${progress.parsedCount} tracks found`;
        });

        router.handleRouteChange();
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Directory picker error:', err);
        }
        scanBtn.disabled = false;
        scanBtn.textContent = 'Open Music Folder';
      }
    } else {
      fallbackInput.click();
    }
  });

  fallbackInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    scanBtn.disabled = true;
    scanBtn.textContent = 'Scanning files...';

    await reconciler.reconcileFileList(files, (progress) => {
      scanBtn.textContent = `Scanning: ${progress.parsedCount} tracks found`;
    });

    router.handleRouteChange();
  });

  shuffleBtn.addEventListener('click', () => {
    if (activeTracks.length > 0) {
      queueManager.setQueue(activeTracks, 0);
      queueManager.toggleShuffle();
      audioEngine.playTrack(queueManager.getCurrentTrack());
    }
  });

  radioBtn.addEventListener('click', () => {
    router.navigate('radio');
  });

  if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', () => {
      router.navigate('history');
    });
  }

  // Row clicks in recently played
  container.querySelectorAll('.track-row').forEach((row) => {
    row.addEventListener('click', async () => {
      const trackId = row.dataset.trackId;
      const track = await db.getTrack(trackId);
      if (track) {
        queueManager.setQueue(activeTracks, activeTracks.findIndex((t) => t.id === track.id) || 0);
        audioEngine.playTrack(track);
      }
    });
  });

  return container;
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
