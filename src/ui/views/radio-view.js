/**
 * LocalJam - Internet Radio View
 */

import {
  loadStations,
  addCustomStation,
  toggleFavoriteStation,
  RADIO_GENRES,
  HIGH_LEVEL_GENRES,
  getStationCategory,
  getStationFallbackArtwork
} from '../../radio/stations.js';
import { audioEngine } from '../../player/audio-engine.js';
import { db } from '../../storage/db.js';

export async function renderRadioView() {
  const container = document.createElement('div');
  container.className = 'page-container';

  let selectedGenre = 'All';
  let searchQuery = '';
  let sortOrder = 'default';
  let allStations = await loadStations(db);

  function getFilteredAndSortedStations() {
    let list = [...allStations];

    // 1. Genre filtering
    if (selectedGenre === 'Favorites') {
      list = list.filter((s) => Boolean(s.isFavorite));
    } else if (selectedGenre !== 'All') {
      list = list.filter((s) => {
        const cat = getStationCategory(s);
        const g = (s.genre || '').toLowerCase();
        return cat === selectedGenre || g.includes(selectedGenre.toLowerCase());
      });
    }

    // 2. Search query filtering (name, genre, description, country)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        const name = (s.name || '').toLowerCase();
        const genre = (s.genre || '').toLowerCase();
        const cat = getStationCategory(s).toLowerCase();
        const desc = (s.description || '').toLowerCase();
        const country = (s.country || '').toLowerCase();
        return name.includes(q) || genre.includes(q) || cat.includes(q) || desc.includes(q) || country.includes(q);
      });
    }

    // 3. Sorting
    if (sortOrder === 'name-asc') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortOrder === 'name-desc') {
      list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (sortOrder === 'genre-asc') {
      list.sort((a, b) => (a.genre || '').localeCompare(b.genre || '') || (a.name || '').localeCompare(b.name || ''));
    } else if (sortOrder === 'bitrate-desc') {
      list.sort((a, b) => {
        const getNum = (str) => parseInt((str || '').match(/\d+/)?.[0] || '0', 10);
        return getNum(b.bitrate) - getNum(a.bitrate) || (a.name || '').localeCompare(b.name || '');
      });
    }

    return list;
  }

  function renderCard(station, currentRadio) {
    const stationUrl = station.streamUrl || station.url;
    const currentUrl = currentRadio ? (currentRadio.streamUrl || currentRadio.url) : null;
    const isPlayingThis = currentUrl === stationUrl && audioEngine.isPlaying;
    const isFav = Boolean(station.isFavorite);
    const fallbackArt = getStationFallbackArtwork(station);
    const artworkSrc = station.favicon || fallbackArt;

    return `
      <div class="media-card radio-card ${isPlayingThis ? 'playing' : ''}" data-station-id="${station.id}" data-station-url="${escapeHtml(stationUrl)}" data-station-name="${escapeHtml(station.name)}">
        <div class="media-card-art-wrapper">
          <img src="${artworkSrc}" alt="${escapeHtml(station.name)}" class="media-card-art" onerror="this.onerror=null; this.src='${fallbackArt}';" />
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
  }

  function renderSections(stations, currentRadio) {
    if (stations.length === 0) {
      return `
        <div class="empty-state-card">
          <p>${
            selectedGenre === 'Favorites'
              ? 'No starred radio streams yet. Click the star icon on any station to save it here.'
              : searchQuery
              ? `No stations match "${escapeHtml(searchQuery)}".`
              : 'No stations found in this category.'
          }</p>
        </div>
      `;
    }

    if (selectedGenre === 'Favorites') {
      return `
        <div class="radio-section-header">
          <h2 class="radio-section-title">
            <span>★ Starred Radio Stations</span>
          </h2>
          <span class="radio-section-count">${stations.length} stream${stations.length === 1 ? '' : 's'}</span>
        </div>
        <div class="card-grid">
          ${stations.map((s) => renderCard(s, currentRadio)).join('')}
        </div>
      `;
    }

    if (selectedGenre !== 'All') {
      return `
        <div class="radio-section-header">
          <h2 class="radio-section-title">
            <span>${escapeHtml(selectedGenre)} Streams</span>
          </h2>
          <span class="radio-section-count">${stations.length} stream${stations.length === 1 ? '' : 's'}</span>
        </div>
        <div class="card-grid">
          ${stations.map((s) => renderCard(s, currentRadio)).join('')}
        </div>
      `;
    }

    // When viewing 'All', separate starred stations first if present
    const starredStations = stations.filter((s) => Boolean(s.isFavorite));
    const nonStarredStations = stations.filter((s) => !s.isFavorite);

    let html = '';

    if (starredStations.length > 0) {
      html += `
        <div class="radio-section-header">
          <h2 class="radio-section-title">
            <span>★ Starred Radio Stations</span>
          </h2>
          <span class="radio-section-count">${starredStations.length} stream${starredStations.length === 1 ? '' : 's'}</span>
        </div>
        <div class="card-grid" style="margin-bottom: 32px;">
          ${starredStations.map((s) => renderCard(s, currentRadio)).join('')}
        </div>
      `;
    }

    if (sortOrder !== 'default') {
      // If a non-default sort is explicitly selected, display a flat sorted grid
      if (nonStarredStations.length > 0) {
        html += `
          <div class="radio-section-header">
            <h2 class="radio-section-title">
              <span>All Streams</span>
            </h2>
            <span class="radio-section-count">${nonStarredStations.length} stream${nonStarredStations.length === 1 ? '' : 's'}</span>
          </div>
          <div class="card-grid">
            ${nonStarredStations.map((s) => renderCard(s, currentRadio)).join('')}
          </div>
        `;
      }
      return html;
    }

    // In default sort order, group remaining stations into high-level genre sections
    const targetPool = nonStarredStations.length > 0 ? nonStarredStations : stations;
    const genres = HIGH_LEVEL_GENRES.filter((g) => g !== 'All');

    genres.forEach((genre) => {
      const genreItems = targetPool.filter((s) => getStationCategory(s) === genre);
      if (genreItems.length > 0) {
        html += `
          <div class="radio-section-header" style="margin-top: 16px;">
            <h2 class="radio-section-title">
              <span>${escapeHtml(genre)}</span>
            </h2>
            <span class="radio-section-count">${genreItems.length} stream${genreItems.length === 1 ? '' : 's'}</span>
          </div>
          <div class="card-grid" style="margin-bottom: 28px;">
            ${genreItems.map((s) => renderCard(s, currentRadio)).join('')}
          </div>
        `;
      }
    });

    const otherItems = targetPool.filter((s) => getStationCategory(s) === 'Other');
    if (otherItems.length > 0) {
      html += `
        <div class="radio-section-header" style="margin-top: 16px;">
          <h2 class="radio-section-title">
            <span>Other Streams</span>
          </h2>
          <span class="radio-section-count">${otherItems.length} stream${otherItems.length === 1 ? '' : 's'}</span>
        </div>
        <div class="card-grid" style="margin-bottom: 28px;">
          ${otherItems.map((s) => renderCard(s, currentRadio)).join('')}
        </div>
      `;
    }

    return html;
  }

  function render() {
    const stations = getFilteredAndSortedStations();
    const currentRadio = audioEngine.isRadio ? audioEngine.currentStation : null;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Internet Radio</h1>
          <div class="view-subtitle">Curated live internet radio streams</div>
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

      <!-- Search & Sort Controls Toolbar -->
      <div class="radio-toolbar">
        <div class="radio-search-wrapper">
          <svg class="radio-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="search"
            id="radio-search-input"
            class="radio-search-input"
            placeholder="Search stations by name, genre, or country..."
            value="${escapeHtml(searchQuery)}"
            aria-label="Search radio stations"
          />
        </div>

        <div class="radio-sort-wrapper">
          <label for="radio-sort-select" class="radio-sort-label">Sort by:</label>
          <select id="radio-sort-select" class="radio-sort-select" aria-label="Sort radio stations">
            <option value="default" ${sortOrder === 'default' ? 'selected' : ''}>Default Order</option>
            <option value="name-asc" ${sortOrder === 'name-asc' ? 'selected' : ''}>Name (A - Z)</option>
            <option value="name-desc" ${sortOrder === 'name-desc' ? 'selected' : ''}>Name (Z - A)</option>
            <option value="genre-asc" ${sortOrder === 'genre-asc' ? 'selected' : ''}>Genre (A - Z)</option>
            <option value="bitrate-desc" ${sortOrder === 'bitrate-desc' ? 'selected' : ''}>Bitrate (High - Low)</option>
          </select>
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
            <label class="form-label" for="custom-name-input">Station Name</label>
            <input type="text" id="custom-name-input" class="form-input" placeholder="My Ambient Stream" />
          </div>
          <div>
            <label class="form-label" for="custom-url-input">HTTPS Stream URL</label>
            <input type="url" id="custom-url-input" class="form-input" placeholder="https://stream.example.org/live" />
          </div>
          <div>
            <label class="form-label" for="custom-genre-input">Genre</label>
            <input type="text" id="custom-genre-input" class="form-input" placeholder="Ambient" />
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-save-custom-stream" class="btn btn-primary">Save & Play</button>
            <button id="btn-cancel-custom-stream" class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Grouped or Flat Stations Content -->
      ${renderSections(stations, currentRadio)}
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
    // Search input listener
    const searchInput = container.querySelector('#radio-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        const cursor = e.target.selectionStart;
        render();
        const updatedInput = container.querySelector('#radio-search-input');
        if (updatedInput) {
          updatedInput.focus();
          if (typeof cursor === 'number') {
            updatedInput.setSelectionRange(cursor, cursor);
          }
        }
      });
    }

    // Sort select listener
    const sortSelect = container.querySelector('#radio-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortOrder = e.target.value;
        render();
      });
    }

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
          favicon: '',
          isCustom: true,
          isFavorite: false
        };

        // Initiate audio playback immediately within user click gesture
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

