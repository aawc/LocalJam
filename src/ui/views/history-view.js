/**
 * LocalJam - Playback History View
 */

import { db } from '../../storage/db.js';
import { audioEngine } from '../../player/audio-engine.js';
import { queueManager } from '../../player/queue.js';
import { escapeHtml } from '../../utils/sanitize.js';

export async function renderHistoryView() {
  const container = document.createElement('div');
  container.className = 'page-container';

  async function render() {
    const history = await db.getRecentHistory(100);

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Listening History</h1>
          <div class="view-subtitle">${history.length} tracks played recently</div>
        </div>

        <div class="view-actions">
          <button id="btn-clear-history" class="btn btn-secondary" ${history.length === 0 ? 'disabled' : ''} style="color: var(--status-error); border-color: var(--status-error);">
            Clear History
          </button>
        </div>
      </div>

      ${
        history.length === 0
          ? `
        <div class="empty-state-card">
          <p>No listening history recorded yet. Play some music to see history here.</p>
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
                <th style="width: 140px;">Played At</th>
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
                    <td style="color: var(--text-secondary); font-size: 13px;">${formatTimestamp(item.playedAt || item.timestamp)}</td>
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

    const clearBtn = container.querySelector('#btn-clear-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear your entire listening history?')) {
          await db.clearHistory();
          await render();
        }
      });
    }

    container.querySelectorAll('.track-row').forEach((row) => {
      row.addEventListener('click', async () => {
        const trackId = row.dataset.trackId;
        const track = await db.getTrack(trackId);
        if (track && !track.isMissing) {
          queueManager.setQueue([track], 0);
          audioEngine.playTrack(track);
        }
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

function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const now = new Date();
  const diffSecs = Math.floor((now - date) / 1000);

  if (diffSecs < 60) return 'Just now';
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
