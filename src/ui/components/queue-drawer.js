/**
 * LocalJam - Playback Queue Drawer Component
 */

import { queueManager } from '../../player/queue.js';
import { audioEngine } from '../../player/audio-engine.js';

export function createQueueDrawer() {
  const drawer = document.createElement('div');
  drawer.id = 'queue-drawer';
  drawer.className = 'queue-drawer';
  drawer.setAttribute('role', 'region');
  drawer.setAttribute('aria-label', 'Play Queue');

  drawer.innerHTML = `
    <div class="queue-header">
      <div class="queue-title">Play Queue</div>
      <div class="queue-actions">
        <button id="queue-clear-btn" class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;">Clear</button>
        <button id="queue-close-btn" class="btn-close" aria-label="Close Queue">&times;</button>
      </div>
    </div>

    <div id="queue-items-list" class="queue-items">
      <!-- Dynamically populated -->
    </div>
  `;

  const itemsList = drawer.querySelector('#queue-items-list');
  const clearBtn = drawer.querySelector('#queue-clear-btn');
  const closeBtn = drawer.querySelector('#queue-close-btn');

  function renderQueue(state) {
    const queue = state.queue || [];
    const currentIndex = state.currentIndex;

    if (queue.length === 0) {
      itemsList.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--text-secondary); font-size: 14px;">
          Queue is empty.<br>Add songs to queue to keep playing.
        </div>
      `;
      return;
    }

    itemsList.innerHTML = queue
      .map((track, idx) => {
        const isCurrent = idx === currentIndex;
        const durationStr = formatDuration(track.duration);
        return `
          <div class="queue-item ${isCurrent ? 'active' : ''}" data-index="${idx}">
            <span class="queue-item-index">${idx + 1}</span>
            <div class="queue-item-info">
              <div class="queue-item-title">${escapeHtml(track.title || track.filename)}</div>
              <div class="queue-item-artist">${escapeHtml(track.artist || 'Unknown Artist')}</div>
            </div>
            <span class="queue-item-duration">${durationStr}</span>
            <button class="queue-item-remove" data-remove-index="${idx}" aria-label="Remove track ${idx + 1} from queue">&times;</button>
          </div>
        `;
      })
      .join('');

    // Attach click listeners to rows
    itemsList.querySelectorAll('.queue-item').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.queue-item-remove')) return;
        const index = parseInt(row.dataset.index, 10);
        const track = queueManager.jumpTo(index);
        if (track) {
          audioEngine.playTrack(track);
        }
      });
    });

    // Attach remove listeners
    itemsList.querySelectorAll('.queue-item-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const removeIdx = parseInt(btn.dataset.removeIndex, 10);
        queueManager.remove(removeIdx);
      });
    });
  }

  clearBtn.addEventListener('click', () => {
    queueManager.clear();
  });

  function close() {
    drawer.classList.remove('open');
  }

  function open() {
    drawer.classList.add('open');
    renderQueue(queueManager.getState());
  }

  closeBtn.addEventListener('click', close);

  // Subscribe to queue changes
  queueManager.subscribe((state) => {
    if (drawer.classList.contains('open')) {
      renderQueue(state);
    }
  });

  return {
    element: drawer,
    open,
    close,
    toggle: () => {
      if (drawer.classList.contains('open')) close();
      else open();
    }
  };
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
