/**
 * LocalJam - Radio Station & Live Stream Details Modal Component
 */

import { toggleFavoriteStation } from '../../radio/stations.js';
import { db } from '../../storage/db.js';
import { audioEngine } from '../../player/audio-engine.js';

export function createStationModal({ onToggleEq, onToggleViz } = {}) {
  const overlay = document.createElement('div');
  overlay.id = 'station-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.display = 'none';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'station-modal-title');

  overlay.innerHTML = `
    <div class="modal-card station-modal-card">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <img id="station-modal-favicon" class="station-modal-art" src="public/icons/icon-192.svg" alt="Station Icon" />
          <div style="min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <h2 id="station-modal-title" class="modal-title" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Station Details</h2>
              <span id="station-modal-live-badge" class="status-badge badge-active">[LIVE]</span>
            </div>
            <div id="station-modal-subtitle" class="modal-subtitle">Live Internet Radio Stream</div>
          </div>
        </div>
        <button id="btn-close-station-modal" class="btn-close" aria-label="Close Station Details">&times;</button>
      </div>

      <div class="modal-body" style="max-height: 65vh; overflow-y: auto;">
        <!-- Description -->
        <div class="station-section">
          <p id="station-modal-description" class="station-description-text" style="color: var(--text-primary); line-height: 1.5; margin-bottom: 16px;">
            Station programming information.
          </p>
        </div>

        <!-- Metadata Grid -->
        <div class="station-details-grid">
          <div class="station-detail-item">
            <span class="station-detail-label">Genre / Format</span>
            <span id="station-modal-genre" class="station-detail-value">-</span>
          </div>
          <div class="station-detail-item">
            <span class="station-detail-label">Broadcast Location</span>
            <span id="station-modal-country" class="station-detail-value">-</span>
          </div>
          <div class="station-detail-item">
            <span class="station-detail-label">Audio Quality / Bitrate</span>
            <span id="station-modal-bitrate" class="station-detail-value">-</span>
          </div>
          <div class="station-detail-item">
            <span class="station-detail-label">Audio Pipeline</span>
            <span id="station-modal-pipeline" class="station-detail-value" style="color: var(--accent-cyan);">Web Audio (EQ & Analyser Active)</span>
          </div>
        </div>

        <!-- Stream URL & Copy -->
        <div class="station-section" style="margin-top: 16px;">
          <label class="form-label" for="station-modal-url-input">Direct Stream URL</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="station-modal-url-input" class="form-input" readonly aria-label="Stream URL" style="font-family: var(--font-mono); font-size: 11px;" />
            <button id="btn-copy-stream-url" class="btn btn-secondary" style="flex-shrink: 0;" aria-label="Copy Stream URL">
              Copy URL
            </button>
          </div>
          <div id="station-copy-feedback" class="copy-feedback" style="display: none; font-size: 11px; color: var(--accent-cyan); margin-top: 4px;">
            [COPIED!] Stream URL copied to clipboard
          </div>
        </div>
      </div>

      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <a id="station-modal-homepage-link" href="#" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 4px;">
            <span>Website</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
          <button id="btn-modal-star" class="btn btn-secondary btn-sm" aria-label="Star Station">
            ★ Favorite
          </button>
          <button id="btn-modal-eq" class="btn btn-secondary btn-sm" aria-label="Open Equalizer">
            Equalizer
          </button>
          <button id="btn-modal-viz" class="btn btn-secondary btn-sm" aria-label="Open Visualizer">
            Visualizer
          </button>
        </div>

        <button id="btn-done-station-modal" class="btn btn-primary btn-sm">Close</button>
      </div>
    </div>
  `;

  let activeStation = null;
  let previousFocusEl = null;

  const faviconImg = overlay.querySelector('#station-modal-favicon');
  const titleEl = overlay.querySelector('#station-modal-title');
  const subtitleEl = overlay.querySelector('#station-modal-subtitle');
  const descEl = overlay.querySelector('#station-modal-description');
  const genreEl = overlay.querySelector('#station-modal-genre');
  const countryEl = overlay.querySelector('#station-modal-country');
  const bitrateEl = overlay.querySelector('#station-modal-bitrate');
  const pipelineEl = overlay.querySelector('#station-modal-pipeline');
  const urlInput = overlay.querySelector('#station-modal-url-input');
  const copyBtn = overlay.querySelector('#btn-copy-stream-url');
  const copyFeedback = overlay.querySelector('#station-copy-feedback');
  const homepageLink = overlay.querySelector('#station-modal-homepage-link');
  const starBtn = overlay.querySelector('#btn-modal-star');
  const eqBtn = overlay.querySelector('#btn-modal-eq');
  const vizBtn = overlay.querySelector('#btn-modal-viz');
  const closeBtn = overlay.querySelector('#btn-close-station-modal');
  const doneBtn = overlay.querySelector('#btn-done-station-modal');

  function open(station) {
    if (!station && audioEngine.isRadio && audioEngine.currentStation) {
      station = audioEngine.currentStation;
    }
    if (!station) return;

    activeStation = station;
    previousFocusEl = document.activeElement;

    const streamUrl = station.streamUrl || station.url || '';
    const isPlaying = audioEngine.isRadio && audioEngine.isPlaying;

    if (faviconImg) faviconImg.src = station.favicon || 'public/icons/icon-192.svg';
    if (titleEl) titleEl.textContent = station.name || 'Internet Radio Station';
    if (subtitleEl) subtitleEl.textContent = `${station.genre || 'Radio'} • ${station.country || 'Global'}`;
    if (descEl) descEl.textContent = station.description || 'Live streaming radio station.';
    if (genreEl) genreEl.textContent = station.genre || 'Eclectic';
    if (countryEl) countryEl.textContent = station.country || 'Global';
    if (bitrateEl) bitrateEl.textContent = station.bitrate || 'Live Stream';
    if (urlInput) urlInput.value = streamUrl;

    if (pipelineEl) {
      pipelineEl.textContent = isPlaying ? 'Active (Web Audio Graph + 10-Band EQ + Analyser)' : 'Ready for playback';
    }

    if (homepageLink) {
      if (station.homepageUrl) {
        homepageLink.href = station.homepageUrl;
        homepageLink.style.display = 'inline-flex';
      } else {
        homepageLink.style.display = 'none';
      }
    }

    if (starBtn) {
      const isFav = Boolean(station.isFavorite);
      starBtn.textContent = isFav ? '★ Favorited' : '☆ Favorite';
      starBtn.style.color = isFav ? '#fbbf24' : 'var(--text-primary)';
    }

    if (copyFeedback) copyFeedback.style.display = 'none';

    overlay.style.display = 'flex';
    if (doneBtn) doneBtn.focus();
  }

  function close() {
    overlay.style.display = 'none';
    if (previousFocusEl && typeof previousFocusEl.focus === 'function') {
      previousFocusEl.focus();
    }
  }

  if (closeBtn) closeBtn.addEventListener('click', close);
  if (doneBtn) doneBtn.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      if (!urlInput || !urlInput.value) return;
      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(urlInput.value);
          copied = true;
        } else {
          throw new Error('Clipboard API unavailable');
        }
      } catch (err) {
        try {
          urlInput.select();
          copied = document.execCommand('copy');
        } catch (fallbackErr) {
          console.warn('[StationModal] Copy failed:', fallbackErr);
        }
      }

      if (copied && copyFeedback) {
        copyFeedback.style.display = 'block';
        setTimeout(() => {
          if (copyFeedback) copyFeedback.style.display = 'none';
        }, 3000);
      }
    });
  }

  if (starBtn) {
    starBtn.addEventListener('click', async () => {
      if (!activeStation) return;
      const isFav = await toggleFavoriteStation(activeStation.id, db);
      activeStation.isFavorite = isFav;
      starBtn.textContent = isFav ? '★ Favorited' : '☆ Favorite';
      starBtn.style.color = isFav ? '#fbbf24' : 'var(--text-primary)';
      if (audioEngine.isRadio && audioEngine.currentStation && audioEngine.currentStation.id === activeStation.id) {
        audioEngine.currentStation.isFavorite = isFav;
        audioEngine.notifyState();
      }
    });
  }

  if (eqBtn) {
    eqBtn.addEventListener('click', () => {
      close();
      if (typeof onToggleEq === 'function') onToggleEq();
    });
  }

  if (vizBtn) {
    vizBtn.addEventListener('click', () => {
      close();
      if (typeof onToggleViz === 'function') onToggleViz();
    });
  }

  return {
    element: overlay,
    open,
    close
  };
}
