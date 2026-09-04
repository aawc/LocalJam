/**
 * LocalJam - Playlists View & Management
 */

import { db } from '../../storage/db.js';
import { audioEngine } from '../../player/audio-engine.js';
import { queueManager } from '../../player/queue.js';

export async function renderPlaylistsView(params) {
  const container = document.createElement('div');
  container.className = 'page-container';

  const selectedPlaylistId = params?.get('id');
  const playlists = await db.getAllPlaylists();

  if (selectedPlaylistId) {
    await renderPlaylistDetail(container, selectedPlaylistId);
  } else {
    await renderPlaylistList(container, playlists);
  }

  return container;
}

async function renderPlaylistList(container, playlists) {
  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Playlists</h1>
        <div class="view-subtitle">${playlists.length} playlists created</div>
      </div>

      <div class="view-actions">
        <button id="btn-create-playlist" class="btn btn-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Playlist
        </button>
      </div>
    </div>

    ${
      playlists.length === 0
        ? `
      <div class="empty-state-card">
        <p>No custom playlists yet. Create one to organize your music.</p>
      </div>
    `
        : `
      <div class="card-grid">
        ${playlists
          .map((pl) => {
            const trackCount = (pl.trackIds || []).length;
            return `
            <div class="media-card playlist-card" data-playlist-id="${pl.id}">
              <div class="media-card-art-wrapper">
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--surface-bg);">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="1.5">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                  </svg>
                </div>
                <button class="btn-play-card" data-playlist-id="${pl.id}" aria-label="Play playlist ${escapeHtml(pl.name)}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </button>
              </div>
              <div class="media-card-info">
                <div class="media-card-title">${escapeHtml(pl.name)}</div>
                <div class="media-card-sub">${trackCount} tracks</div>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    `
    }
  `;

  // Attach create button
  const createBtn = container.querySelector('#btn-create-playlist');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const name = prompt('Enter playlist name:');
      if (name && name.trim()) {
        const id = 'pl_' + Date.now();
        await db.putPlaylist({
          id,
          name: name.trim(),
          trackIds: [],
          created: Date.now(),
          updated: Date.now()
        });
        window.location.hash = `#/playlists?id=${id}`;
      }
    });
  }

  // Attach card clicks
  container.querySelectorAll('.playlist-card').forEach((card) => {
    const plId = card.dataset.playlistId;
    const playBtn = card.querySelector('.btn-play-card');

    playBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await playEntirePlaylist(plId);
    });

    card.addEventListener('click', () => {
      window.location.hash = `#/playlists?id=${plId}`;
    });
  });
}

async function renderPlaylistDetail(container, playlistId) {
  const playlist = await db.getPlaylist(playlistId);
  if (!playlist) {
    container.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Playlist Not Found</h1>
      </div>
      <button class="btn btn-secondary" onclick="window.location.hash='#/playlists'">Back to Playlists</button>
    `;
    return;
  }

  // Load track objects
  const tracks = [];
  for (const tid of playlist.trackIds || []) {
    const t = await db.getTrack(tid);
    if (t) tracks.push(t);
  }

  const totalDuration = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

  container.innerHTML = `
    <div class="view-header">
      <div>
        <button class="btn btn-secondary" id="btn-back-playlists" style="margin-bottom: 12px; font-size: 13px; padding: 4px 10px;">
          ← All Playlists
        </button>
        <h1 class="view-title">${escapeHtml(playlist.name)}</h1>
        <div class="view-subtitle">${tracks.length} tracks • ${formatTotalDuration(totalDuration)}</div>
      </div>

      <div class="view-actions">
        <button id="btn-play-playlist" class="btn btn-primary" ${tracks.length === 0 ? 'disabled' : ''}>
          Play
        </button>
        <button id="btn-delete-playlist" class="btn btn-secondary" style="color: var(--status-error); border-color: var(--status-error);">
          Delete Playlist
        </button>
      </div>
    </div>

    ${
      tracks.length === 0
        ? `
      <div class="empty-state-card">
        <p>This playlist is empty. Add songs from the Songs view.</p>
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
              <th style="width: 50px; text-align: center;">Action</th>
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
                    <button class="btn-remove-from-pl" data-track-id="${track.id}" title="Remove from playlist" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 16px;">
                      &times;
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

  // Attach back button
  container.querySelector('#btn-back-playlists').addEventListener('click', () => {
    window.location.hash = '#/playlists';
  });

  // Attach play button
  const playBtn = container.querySelector('#btn-play-playlist');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (tracks.length > 0) {
        queueManager.setQueue(tracks, 0);
        audioEngine.playTrack(tracks[0]);
      }
    });
  }

  // Attach delete button
  const delBtn = container.querySelector('#btn-delete-playlist');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (confirm(`Delete playlist "${playlist.name}"?`)) {
        await db.deletePlaylist(playlistId);
        window.location.hash = '#/playlists';
      }
    });
  }

  // Row clicks
  container.querySelectorAll('.track-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-remove-from-pl')) return;
      const index = parseInt(row.dataset.index, 10);
      if (tracks[index]) {
        queueManager.setQueue(tracks, index);
        audioEngine.playTrack(tracks[index]);
      }
    });
  });

  // Remove track from playlist buttons
  container.querySelectorAll('.btn-remove-from-pl').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const trackId = btn.dataset.trackId;
      playlist.trackIds = (playlist.trackIds || []).filter((id) => id !== trackId);
      playlist.updated = Date.now();
      await db.putPlaylist(playlist);
      await renderPlaylistDetail(container, playlistId);
    });
  });
}

async function playEntirePlaylist(playlistId) {
  const pl = await db.getPlaylist(playlistId);
  if (!pl || !pl.trackIds || pl.trackIds.length === 0) return;
  const tracks = [];
  for (const tid of pl.trackIds) {
    const t = await db.getTrack(tid);
    if (t && !t.isMissing) tracks.push(t);
  }
  if (tracks.length > 0) {
    queueManager.setQueue(tracks, 0);
    audioEngine.playTrack(tracks[0]);
  }
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
