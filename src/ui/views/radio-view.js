/**
 * LocalJam - Internet Radio View
 */

import { loadStations, addCustomStation, toggleFavoriteStation, RADIO_GENRES } from '../../radio/stations.js';
import { audioEngine } from '../../player/audio-engine.js';
import { db } from '../../storage/db.js';

export async function renderRadioView() {
  const container = document.createElement('div');
  container.className = 'page-container';

  let selectedGenre = 'All';
  let allStations = await loadStations(db);

  function getFilteredStations() {
    if (selectedGenre === 'Favorites') {
      return allStations.filter((s) => Boolean(s.isFavorite));
    }
    if (selectedGenre === 'All') return allStations;
    return allStations.filter((s) => s.genre && s.genre.toLowerCase().includes(selectedGenre.toLowerCase()));
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

      <!-- Genre & Favorite Filter Pills -->
      <div class="filter-pills-bar" style="display: flex; gap: 8px; margin-bottom: 24px; overflow-x: auto; padding-bottom: 4px;">
        <button class="btn-filter-pill ${selectedGenre === 'All' ? 'active' : ''}" data-genre="All">All Streams</button>
        <button class="btn-filter-pill ${selectedGenre === 'Favorites' ? 'active' : ''}" data-genre="Favorites">★ Starred Streams</button>
        ${RADIO_GENRES.filter((g) => g !== 'All').map(
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
            <input type="text" id="custom-name-input" class="form-input" placeholder="My Ambient Stream" />
          </div>
          <div>
            <label class="form-label">HTTPS Stream URL</label>
            <input type="url" id="custom-url-input" class="form-input" placeholder="https://stream.example.org/live" />
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
      ${
        stations.length === 0
          ? `
        <div class="empty-state-card">
          <p>${selectedGenre === 'Favorites' ? 'No starred radio streams yet. Click the star icon on any station to save it here.' : 'No stations found in this category.'}</p>
        </div>
      `
          : `
        <div class="card-grid">
          ${stations
            .map((station) => {
              const stationUrl = station.streamUrl || station.url;
              const currentUrl = currentRadio ? (currentRadio.streamUrl || currentRadio.url) : null;
              const isPlayingThis = currentUrl === stationUrl && audioEngine.isPlaying;
              const isFav = Boolean(station.isFavorite);
              return `
              <div class="media-card radio-card ${isPlayingThis ? 'playing' : ''}" data-station-id="${station.id}" data-station-url="${escapeHtml(stationUrl)}" data-station-name="${escapeHtml(station.name)}">
                <div class="media-card-art-wrapper">
                  <img src="${station.favicon || 'public/icons/icon-192.svg'}" alt="${escapeHtml(station.name)}" class="media-card-art" />
                  <button class="btn-play-card" data-station-id="${station.id}" data-station-url="${escapeHtml(stationUrl)}" aria-label="${isPlayingThis ? 'Pause' : 'Play'} ${escapeHtml(station.name)}">
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
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px;">${escapeHtml(station.name)}</span>
                    <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                      ${isPlayingThis ? '<span class="status-badge badge-active" style="font-size: 10px;">[LIVE]</span>' : ''}
                      <button class="btn-star-station" data-station-id="${station.id}" aria-label="${isFav ? 'Unstar' : 'Star'} ${escapeHtml(station.name)}" style="background: none; border: none; cursor: pointer; color: ${isFav ? '#fbbf24' : 'var(--text-secondary)'}; padding: 2px; display: inline-flex; align-items: center;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div class="media-card-sub">${escapeHtml(station.genre)} • ${escapeHtml(station.country || 'Global')}</div>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      `
      }
    `;

    attachEvents();
  }

  function updatePlayingState() {
    const currentRadio = audioEngine.isRadio ? audioEngine.currentStation : null;
    const currentUrl = currentRadio ? (currentRadio.streamUrl || currentRadio.url) : null;

    container.querySelectorAll('.radio-card').forEach((card) => {
      const stationUrl = card.dataset.stationUrl;
      const isPlayingThis = Boolean(currentUrl && stationUrl === currentUrl && audioEngine.isPlaying);
      card.classList.toggle('playing', isPlayingThis);

      const playBtn = card.querySelector('.btn-play-card');
      if (playBtn) {
        playBtn.setAttribute('aria-label', `${isPlayingThis ? 'Pause' : 'Play'} ${card.dataset.stationName || 'Station'}`);
        playBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            ${
              isPlayingThis
                ? '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>'
                : '<polygon points="5 3 19 12 5 21 5 3"></polygon>'
            }
          </svg>
        `;
      }

      const liveBadge = card.querySelector('.badge-active');
      const titleWrapper = card.querySelector('.media-card-title > div');
      const titleSpan = card.querySelector('.media-card-title span');
      if (isPlayingThis) {
        if (titleSpan) titleSpan.setAttribute('title', 'Click for station details');
        if (!liveBadge && titleWrapper) {
          const badge = document.createElement('span');
          badge.className = 'status-badge badge-active';
          badge.style.fontSize = '10px';
          badge.textContent = '[LIVE]';
          titleWrapper.insertBefore(badge, titleWrapper.firstChild);
        }
      } else {
        if (titleSpan) titleSpan.removeAttribute('title');
        if (liveBadge) liveBadge.remove();
      }
    });
  }

  function attachEvents() {
    // Genre & Favorite filter pills
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

        if (!url.startsWith('https://')) {
          alert('Stream URL must start with https://');
          return;
        }

        const newStation = {
          id: 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          name,
          streamUrl: url,
          genre,
          country: 'Custom',
          favicon: 'public/icons/icon-192.svg',
          isCustom: true,
          isFavorite: false
        };

        // Initiate audio playback immediately within the user click gesture
        audioEngine.playRadio(newStation);
        formCard.style.display = 'none';

        try {
          const savedStation = await addCustomStation(newStation, db);
          if (audioEngine.isRadio && audioEngine.currentStation && audioEngine.currentStation.streamUrl === url) {
            audioEngine.currentStation = savedStation;
          }
          allStations = await loadStations(db);
          render();
        } catch (err) {
          console.error('[RadioView] Failed to save custom station:', err);
        }
      });
    }

    // Star / Favorite clicks
    container.querySelectorAll('.btn-star-station').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stationId = btn.dataset.stationId;
        await toggleFavoriteStation(stationId, db);
        allStations = await loadStations(db);
        if (audioEngine.isRadio && audioEngine.currentStation && audioEngine.currentStation.id === stationId) {
          const updated = allStations.find((s) => s.id === stationId);
          if (updated) audioEngine.currentStation.isFavorite = updated.isFavorite;
          audioEngine.notifyState();
        }
        render();
      });
    });

    // Play station clicks
    container.querySelectorAll('.radio-card').forEach((card) => {
      const stationId = card.dataset.stationId;
      const station = allStations.find((s) => s.id === stationId);

      // Clicking station title while playing opens station details modal
      const titleSpan = card.querySelector('.media-card-title span');
      if (titleSpan) {
        titleSpan.addEventListener('click', (e) => {
          const currentUrl = audioEngine.isRadio && audioEngine.currentStation ? (audioEngine.currentStation.streamUrl || audioEngine.currentStation.url) : null;
          const targetUrl = station ? (station.streamUrl || station.url) : null;
          if (currentUrl && targetUrl && currentUrl === targetUrl && audioEngine.isPlaying) {
            e.stopPropagation();
            if (typeof window !== 'undefined' && window.localjamStationModal) {
              window.localjamStationModal.open(station);
            }
          }
        });
      }

      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-star-station')) return;
        if (station) {
          const currentUrl = audioEngine.isRadio && audioEngine.currentStation ? (audioEngine.currentStation.streamUrl || audioEngine.currentStation.url) : null;
          const targetUrl = station.streamUrl || station.url;
          if (currentUrl === targetUrl && audioEngine.isPlaying) {
            audioEngine.pause();
          } else {
            audioEngine.playRadio(station);
          }
        }
      });
    });
  }

  const unsubscribe = audioEngine.subscribe(() => {
    if (typeof container.isConnected === 'boolean' && !container.isConnected) {
      unsubscribe();
      return;
    }
    updatePlayingState();
  });

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
