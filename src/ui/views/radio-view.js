/**
 * LocalJam - Internet Radio View
 */

import { CURATED_STATIONS, RADIO_GENRES } from '../../radio/stations.js';
import { audioEngine } from '../../player/audio-engine.js';
import { db } from '../../storage/db.js';

export async function renderRadioView() {
  const container = document.createElement('div');
  container.className = 'page-container';

  let selectedGenre = 'All';
  let customStations = (await db.getSetting('custom_radio_stations')) || [];

  function getAllStations() {
    return [...CURATED_STATIONS, ...customStations];
  }

  function getFilteredStations() {
    const all = getAllStations();
    if (selectedGenre === 'All') return all;
    return all.filter((s) => s.genre.toLowerCase().includes(selectedGenre.toLowerCase()));
  }

  function render() {
    const stations = getFilteredStations();
    const currentRadio = audioEngine.isRadio ? audioEngine.currentStation : null;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Internet Radio</h1>
          <div class="view-subtitle">Curated live audio streams with zero tracking</div>
        </div>

        <div class="view-actions">
          <button id="btn-add-custom-station" class="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Custom Stream
          </button>
        </div>
      </div>

      <!-- Genre Pills -->
      <div class="filter-pills-bar" style="display: flex; gap: 8px; margin-bottom: 24px; overflow-x: auto; padding-bottom: 4px;">
        <button class="btn-filter-pill ${selectedGenre === 'All' ? 'active' : ''}" data-genre="All">All Streams</button>
        ${RADIO_GENRES.map(
          (g) => `
          <button class="btn-filter-pill ${selectedGenre === g ? 'active' : ''}" data-genre="${g}">${g}</button>
        `
        ).join('')}
      </div>

      <!-- Custom Station Form (Hidden by default) -->
      <div id="custom-station-form-card" class="hero-card" style="display: none; margin-bottom: 24px; padding: 20px;">
        <h3 style="margin-bottom: 12px; font-size: 16px;">Add Custom Radio Stream</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr 120px auto; gap: 12px; align-items: end;">
          <div>
            <label class="form-label">Station Name</label>
            <input type="text" id="custom-name-input" class="form-input" placeholder="e.g., My Ambient Stream" />
          </div>
          <div>
            <label class="form-label">HTTPS Stream URL</label>
            <input type="url" id="custom-url-input" class="form-input" placeholder="https://..." />
          </div>
          <div>
            <label class="form-label">Genre</label>
            <input type="text" id="custom-genre-input" class="form-input" placeholder="Ambient" />
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-save-custom-stream" class="btn btn-primary">Save & Play</button>
            <button id="btn-cancel-custom-stream" class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Stations Grid -->
      <div class="card-grid">
        ${stations
          .map((station) => {
            const stationUrl = station.streamUrl || station.url;
            const currentUrl = currentRadio ? (currentRadio.streamUrl || currentRadio.url) : null;
            const isPlayingThis = currentUrl === stationUrl && audioEngine.isPlaying;
            return `
            <div class="media-card radio-card ${isPlayingThis ? 'playing' : ''}" data-station-url="${escapeHtml(stationUrl)}">
              <div class="media-card-art-wrapper">
                <img src="${station.favicon || 'public/icons/icon-192.svg'}" alt="${escapeHtml(station.name)}" class="media-card-art" />
                <button class="btn-play-card" data-station-url="${escapeHtml(stationUrl)}" aria-label="Play ${escapeHtml(station.name)}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    ${
                      isPlayingThis
                        ? '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>'
                        : '<polygon points="5 3 19 12 5 21 5 3"></polygon>'
                    }
                  </svg>
                </button>
              </div>
              <div class="media-card-info">
                <div class="media-card-title" style="display: flex; align-items: center; justify-content: space-between;">
                  <span>${escapeHtml(station.name)}</span>
                  ${isPlayingThis ? '<span class="status-badge badge-active" style="font-size: 10px;">[LIVE]</span>' : ''}
                </div>
                <div class="media-card-sub">${escapeHtml(station.genre)} • ${escapeHtml(station.country || 'Global')}</div>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    `;

    attachEvents();
  }

  function attachEvents() {
    // Genre pills
    container.querySelectorAll('.btn-filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        selectedGenre = pill.dataset.genre;
        render();
      });
    });

    // Custom station toggle & form
    const toggleFormBtn = container.querySelector('#btn-add-custom-station');
    const formCard = container.querySelector('#custom-station-form-card');
    const cancelFormBtn = container.querySelector('#btn-cancel-custom-stream');
    const saveFormBtn = container.querySelector('#btn-save-custom-stream');

    if (toggleFormBtn) {
      toggleFormBtn.addEventListener('click', () => {
        formCard.style.display = formCard.style.display === 'none' ? 'block' : 'none';
      });
    }

    if (cancelFormBtn) {
      cancelFormBtn.addEventListener('click', () => {
        formCard.style.display = 'none';
      });
    }

    if (saveFormBtn) {
      saveFormBtn.addEventListener('click', async () => {
        const nameInput = container.querySelector('#custom-name-input');
        const urlInput = container.querySelector('#custom-url-input');
        const genreInput = container.querySelector('#custom-genre-input');

        const name = nameInput.value.trim();
        const url = urlInput.value.trim();
        const genre = genreInput.value.trim() || 'Custom';

        if (!name || !url) {
          alert('Please provide both station name and HTTPS stream URL.');
          return;
        }

        const newStation = {
          name,
          url,
          genre,
          country: 'Custom',
          favicon: 'public/icons/icon-192.svg'
        };

        customStations.push(newStation);
        await db.setSetting('custom_radio_stations', customStations);
        formCard.style.display = 'none';
        audioEngine.playRadio(newStation);
        render();
      });
    }

    // Play station clicks
    container.querySelectorAll('.radio-card').forEach((card) => {
      const stationUrl = card.dataset.stationUrl;
      const all = getAllStations();
      const station = all.find((s) => (s.streamUrl || s.url) === stationUrl);

      card.addEventListener('click', () => {
        if (station) {
          audioEngine.playRadio(station);
          render();
        }
      });
    });
  }

  render();
  return container;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
