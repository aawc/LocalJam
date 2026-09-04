/**
 * LocalJam - Persistent Audio Player Bar Component
 */

import { audioEngine } from '../../player/audio-engine.js';
import { queueManager } from '../../player/queue.js';
import { db } from '../../storage/db.js';
import { toggleFavoriteStation } from '../../radio/stations.js';

export function createPlayerBar() {
  const bar = document.createElement('div');
  bar.className = 'player-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Audio Player Controls');

  bar.innerHTML = `
    <!-- Left: Track info & artwork -->
    <div class="player-left">
      <img id="player-art-img" class="player-art" src="public/icons/icon-192.svg" alt="Album Artwork" />
      <div class="player-track-info">
        <div id="player-track-title" class="player-title">Not Playing</div>
        <div id="player-track-artist" class="player-artist">Select a song or radio station</div>
      </div>
      <button id="player-fav-btn" class="btn-control" aria-label="Toggle Favorite" style="margin-left: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </button>
    </div>

    <!-- Center: Playback controls and progress -->
    <div class="player-center">
      <div class="player-controls">
        <button id="btn-shuffle" class="btn-control" aria-label="Toggle Shuffle" title="Shuffle (S)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 3 21 3 21 8"></polyline>
            <line x1="4" y1="20" x2="21" y2="3"></line>
            <polyline points="21 16 21 21 16 21"></polyline>
            <line x1="15" y1="15" x2="21" y2="21"></line>
            <line x1="4" y1="4" x2="9" y2="9"></line>
          </svg>
        </button>

        <button id="btn-prev" class="btn-control" aria-label="Previous Track" title="Previous (Shift+Left)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19 20 9 12 19 4 19 20"></polygon>
            <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"></line>
          </svg>
        </button>

        <button id="btn-play-pause" class="btn-control btn-play-pause" aria-label="Play" title="Play/Pause (Space)">
          <svg id="icon-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <svg id="icon-pause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
        </button>

        <button id="btn-next" class="btn-control" aria-label="Next Track" title="Next (Shift+Right)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 4 15 12 5 20 5 4"></polygon>
            <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"></line>
          </svg>
        </button>

        <button id="btn-repeat" class="btn-control" aria-label="Cycle Repeat" title="Repeat (R)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="17 1 21 5 17 9"></polyline>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
            <polyline points="7 23 3 19 7 15"></polyline>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
          </svg>
        </button>
      </div>

      <div class="player-progress-bar">
        <span id="label-current-time" class="time-label current">0:00</span>
        <input id="player-seek" type="range" class="seek-slider" min="0" max="100" value="0" aria-label="Seek track position" />
        <span id="label-duration" class="time-label">0:00</span>
      </div>
    </div>

    <!-- Right: Volume, EQ, Visualizer, Queue -->
    <div class="player-right">
      <button id="btn-toggle-viz" class="btn-control" aria-label="Toggle Visualizer" title="Visualizer (V)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
      </button>

      <button id="btn-toggle-eq" class="btn-control" aria-label="Toggle Equalizer" title="Equalizer (E)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="21" x2="4" y2="14"></line>
          <line x1="4" y1="10" x2="4" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12" y2="3"></line>
          <line x1="20" y1="21" x2="20" y2="16"></line>
          <line x1="20" y1="12" x2="20" y2="3"></line>
          <line x1="1" y1="14" x2="7" y2="14"></line>
          <line x1="9" y1="8" x2="15" y2="8"></line>
          <line x1="17" y1="16" x2="23" y2="16"></line>
        </svg>
      </button>

      <button id="btn-toggle-queue" class="btn-control" aria-label="Toggle Queue Drawer" title="Queue (Q)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
      </button>

      <button id="btn-mute" class="btn-control" aria-label="Toggle Mute" title="Mute (M)">
        <svg id="icon-volume" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      </button>

      <input id="player-volume" type="range" class="volume-slider" min="0" max="100" value="80" aria-label="Volume level" />
    </div>
  `;

  // Attach interactive events
  const btnPlayPause = bar.querySelector('#btn-play-pause');
  const iconPlay = bar.querySelector('#icon-play');
  const iconPause = bar.querySelector('#icon-pause');
  const btnPrev = bar.querySelector('#btn-prev');
  const btnNext = bar.querySelector('#btn-next');
  const btnShuffle = bar.querySelector('#btn-shuffle');
  const btnRepeat = bar.querySelector('#btn-repeat');
  const btnMute = bar.querySelector('#btn-mute');
  const seekSlider = bar.querySelector('#player-seek');
  const volumeSlider = bar.querySelector('#player-volume');
  const currentTimeLabel = bar.querySelector('#label-current-time');
  const durationLabel = bar.querySelector('#label-duration');
  const titleEl = bar.querySelector('#player-track-title');
  const artistEl = bar.querySelector('#player-track-artist');
  const artImg = bar.querySelector('#player-art-img');
  const favBtn = bar.querySelector('#player-fav-btn');

  btnPlayPause.onclick = () => audioEngine.togglePlay();
  btnPrev.onclick = () => audioEngine.previous();
  btnNext.onclick = () => audioEngine.next();
  btnShuffle.onclick = () => queueManager.toggleShuffle();
  btnRepeat.onclick = () => queueManager.cycleRepeat();
  btnMute.onclick = () => audioEngine.toggleMute();

  let isSeeking = false;
  seekSlider.oninput = () => {
    isSeeking = true;
    currentTimeLabel.textContent = formatTime(seekSlider.value);
  };
  seekSlider.onchange = () => {
    audioEngine.seek(parseFloat(seekSlider.value));
    isSeeking = false;
  };

  volumeSlider.oninput = () => {
    audioEngine.setVolume(parseFloat(volumeSlider.value) / 100);
  };

  favBtn.onclick = async () => {
    if (audioEngine.isRadio && audioEngine.currentStation) {
      const isFav = await toggleFavoriteStation(audioEngine.currentStation.id, db);
      audioEngine.currentStation.isFavorite = isFav;
      favBtn.style.color = isFav ? '#fbbf24' : 'var(--text-secondary)';
      const svg = favBtn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isFav ? 'currentColor' : 'none');
    } else if (audioEngine.currentTrack) {
      const isFav = await db.toggleFavorite(audioEngine.currentTrack.id);
      favBtn.style.color = isFav ? '#fbbf24' : 'var(--text-secondary)';
      const svg = favBtn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isFav ? 'currentColor' : 'none');
    }
  };

  // Subscribe to Audio Engine state
  audioEngine.subscribe((state) => {
    iconPlay.style.display = state.isPlaying ? 'none' : 'block';
    iconPause.style.display = state.isPlaying ? 'block' : 'none';
    btnPlayPause.setAttribute('aria-label', state.isPlaying ? 'Pause' : 'Play');

    if (state.isRadio && state.currentStation) {
      titleEl.textContent = state.currentStation.name;
      artistEl.textContent = state.currentStation.genre + ' • Live Radio';
      artImg.src = state.currentStation.favicon || 'public/icons/icon-192.svg';
      durationLabel.textContent = 'LIVE';
      seekSlider.disabled = true;
      const isFav = Boolean(state.currentStation.isFavorite);
      favBtn.style.color = isFav ? '#fbbf24' : 'var(--text-secondary)';
      const svg = favBtn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isFav ? 'currentColor' : 'none');
    } else if (state.currentTrack) {
      titleEl.textContent = state.currentTrack.title || state.currentTrack.filename;
      artistEl.textContent = state.currentTrack.artist || 'Unknown Artist';
      seekSlider.disabled = false;

      // Update artwork
      if (state.currentTrack.artwork && state.currentTrack.artwork.dataUrl) {
        artImg.src = state.currentTrack.artwork.dataUrl;
      } else if (state.currentTrack.artworkId) {
        db.getArtwork(state.currentTrack.artworkId).then((art) => {
          if (art && art.thumbnailDataUrl) artImg.src = art.thumbnailDataUrl;
        });
      } else {
        artImg.src = 'public/icons/icon-192.svg';
      }

      // Check favorite status
      db.isFavorite(state.currentTrack.id).then((isFav) => {
        favBtn.style.color = isFav ? '#fbbf24' : 'var(--text-secondary)';
        const svg = favBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', isFav ? 'currentColor' : 'none');
      });
    } else {
      titleEl.textContent = 'Not Playing';
      artistEl.textContent = 'Select a song or radio station';
      artImg.src = 'public/icons/icon-192.svg';
      durationLabel.textContent = '0:00';
    }

    if (!isSeeking && !state.isRadio) {
      seekSlider.value = state.currentTime;
      seekSlider.max = state.duration || 100;
      currentTimeLabel.textContent = formatTime(state.currentTime);
      durationLabel.textContent = formatTime(state.duration);
    }

    btnShuffle.classList.toggle('active', state.shuffle);
    btnRepeat.classList.toggle('active', state.repeat !== 'off');
    volumeSlider.value = state.muted ? 0 : Math.round(state.volume * 100);
  });

  return bar;
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
