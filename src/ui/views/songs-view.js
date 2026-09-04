/**
 * LocalJam - All Songs View
 */

import { db } from '../../storage/db.js';
import { audioEngine } from '../../player/audio-engine.js';
import { queueManager } from '../../player/queue.js';

export async function renderSongsView(params) {
  const container = document.createElement('div');
  container.className = 'page-container';

  let tracks = await db.getAllTracks();
  let sortField = 'title';
  let sortAsc = true;
  let query = params?.get('q') || '';

  // Initial filter if search query in URL
  function getFilteredAndSorted() {
    let list = [...tracks];
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.artist && t.artist.toLowerCase().includes(q)) ||
          (t.album && t.album.toLowerCase().includes(q)) ||
          (t.filename && t.filename.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }

  function renderTable() {
    const list = getFilteredAndSorted();
    const totalDurationSecs = list.reduce((acc, t) => acc + (t.duration || 0), 0);

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">All Songs</h1>
          <div class="view-subtitle">${list.length} tracks • ${formatTotalDuration(totalDurationSecs)}</div>
        </div>

        <div class="view-actions">
          <input
            type="search"
            id="songs-search-input"
            class="form-input"
            placeholder="Filter songs... (/)"
            value="${escapeHtml(query)}"
            style="width: 240px;"
          />
          <button id="songs-play-all-btn" class="btn btn-primary" ${list.length === 0 ? 'disabled' : ''}>
            Play All
          </button>
        </div>
      </div>

      ${
        list.length === 0
          ? `
        <div class="empty-state-card">
          <p>No songs found. Scan a music folder or clear search filters.</p>
        </div>
      `
          : `
        <div class="track-table-container">
          <table class="track-table">
            <thead>
              <tr>
                <th style="width: 44px;">#</th>
                <th class="sortable-th" data-field="title">Title ${sortField === 'title' ? (sortAsc ? '▲' : '▼') : ''}</th>
                <th class="sortable-th" data-field="artist">Artist ${sortField === 'artist' ? (sortAsc ? '▲' : '▼') : ''}</th>
                <th class="sortable-th" data-field="album">Album ${sortField === 'album' ? (sortAsc ? '▲' : '▼') : ''}</th>
                <th class="sortable-th" data-field="duration" style="width: 80px; text-align: right;">Time ${sortField === 'duration' ? (sortAsc ? '▲' : '▼') : ''}</th>
                <th style="width: 50px; text-align: center;">Fav</th>
              </tr>
            </thead>
            <tbody id="songs-tbody">
              ${list
                .map((track, idx) => {
                  const isCurrent = audioEngine.currentTrack?.id === track.id;
                  const isMissing = track.isMissing === 1;
                  return `
                  <tr class="track-row ${isCurrent ? 'active' : ''} ${isMissing ? 'missing' : ''}" data-track-id="${track.id}" data-index="${idx}">
                    <td class="track-num-cell">${idx + 1}</td>
                    <td>
                      <div class="track-title-cell">
                        <span class="track-name">${escapeHtml(track.title || track.filename)}</span>
                        ${isMissing ? '<span class="status-badge badge-missing" title="File not found at original path">[MISSING]</span>' : ''}
                      </div>
                    </td>
                    <td>${escapeHtml(track.artist || 'Unknown Artist')}</td>
                    <td>${escapeHtml(track.album || 'Unknown Album')}</td>
                    <td style="text-align: right;">${formatDuration(track.duration)}</td>
                    <td style="text-align: center;">
                      <button class="btn-fav-toggle" data-track-id="${track.id}" aria-label="Toggle Favorite">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

    attachEvents(list);
  }

  function attachEvents(list) {
    const searchInput = container.querySelector('#songs-search-input');
    const playAllBtn = container.querySelector('#songs-play-all-btn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        query = e.target.value;
        renderTable();
        // Restore focus to search input
        const updatedInput = container.querySelector('#songs-search-input');
        if (updatedInput) {
          updatedInput.focus();
          updatedInput.setSelectionRange(query.length, query.length);
        }
      });
    }

    if (playAllBtn) {
      playAllBtn.addEventListener('click', () => {
        if (list.length > 0) {
          queueManager.setQueue(list, 0);
          audioEngine.playTrack(list[0]);
        }
      });
    }

    // Sort column headers
    container.querySelectorAll('.sortable-th').forEach((th) => {
      th.addEventListener('click', () => {
        const field = th.dataset.field;
        if (sortField === field) {
          sortAsc = !sortAsc;
        } else {
          sortField = field;
          sortAsc = true;
        }
        renderTable();
      });
    });

    // Row clicks
    container.querySelectorAll('.track-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-fav-toggle')) return;
        const index = parseInt(row.dataset.index, 10);
        if (list[index]) {
          queueManager.setQueue(list, index);
          audioEngine.playTrack(list[index]);
        }
      });
    });

    // Favorite buttons
    container.querySelectorAll('.btn-fav-toggle').forEach(async (btn) => {
      const trackId = btn.dataset.trackId;
      const isFav = await db.isFavorite(trackId);
      if (isFav) {
        btn.style.color = '#fbbf24';
      }
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newState = await db.toggleFavorite(trackId);
        btn.style.color = newState ? '#fbbf24' : 'var(--text-secondary)';
      });
    });
  }

  renderTable();
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
