/**
 * LocalJam - Dedicated Now Playing / Player View
 * Full-screen detailed player screen with embedded real-time visualizer,
 * large artwork, rich metadata, timeline scrubber, and comprehensive controls.
 */

import { audioEngine } from "../../player/audio-engine.js";
import { queueManager } from "../../player/queue.js";
import { AudioVisualizer, VISUALIZER_MODES } from "../../visualizer/visualizer.js";
import { db } from "../../storage/db.js";
import { toggleFavoriteStation, getStationFallbackArtwork } from "../../radio/stations.js";
import { escapeHtml } from "../../utils/sanitize.js";

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export async function renderPlayerView(params) {
  const container = document.createElement("div");
  container.className = "page-container player-view-page";

  let isVisualizerEnabled = false; // Off by default as requested
  let currentVisualizerMode = "bars";
  let visualizer = null;
  let isSeeking = false;

  function getMediaInfo() {
    if (audioEngine.isRadio && audioEngine.currentStation) {
      const s = audioEngine.currentStation;
      const fallback = getStationFallbackArtwork(s);
      return {
        isRadio: true,
        title: s.name || "Live Radio",
        artist: s.genre || "Internet Radio",
        album: s.country ? `${s.country} • Live Stream` : "Live Stream",
        description: s.description || "",
        bitrate: s.bitrate || "128 kbps",
        codec: s.streamUrl && s.streamUrl.includes("aac") ? "AAC" : "MP3",
        artSrc: s.favicon || fallback,
        fallbackArt: fallback,
        isFavorite: Boolean(s.isFavorite),
        streamStatus: audioEngine.streamStatus || (audioEngine.isPlaying ? "playing" : "ready")
      };
    }

    if (audioEngine.currentTrack) {
      const t = audioEngine.currentTrack;
      const formatFromExt = (t.path || "").split(".").pop()?.toUpperCase() || "AUDIO";
      return {
        isRadio: false,
        title: t.title || "Unknown Title",
        artist: t.artist || "Unknown Artist",
        album: t.album || "Unknown Album",
        year: t.year || "",
        bitrate: t.bitrate ? `${t.bitrate} kbps` : "",
        codec: formatFromExt,
        artSrc: t.artworkUrl || t.picture || "public/icons/icon-192.svg",
        fallbackArt: "public/icons/icon-192.svg",
        isFavorite: Boolean(t.isFavorite),
        duration: t.duration || audioEngine.duration || 0
      };
    }

    return {
      isRadio: false,
      isEmpty: true,
      title: "Not Playing",
      artist: "No media selected",
      album: "Select a song from your library or a station from Internet Radio",
      bitrate: "",
      codec: "",
      artSrc: "public/icons/icon-192.svg",
      fallbackArt: "public/icons/icon-192.svg",
      isFavorite: false,
      duration: 0
    };
  }

  function renderMarkup() {
    const info = getMediaInfo();

    const statusBadgeHtml = info.isRadio
      ? (info.streamStatus === "buffering"
          ? "<span class=\"status-badge badge-warning\" id=\"player-view-status-badge\"><span class=\"buffering-icon\">⏳</span> [BUFFERING]</span>"
          : info.streamStatus === "connecting"
          ? "<span class=\"status-badge badge-warning\" id=\"player-view-status-badge\"><span class=\"connecting-icon\">▲</span> [CONNECTING]</span>"
          : info.streamStatus === "error"
          ? "<span class=\"status-badge badge-danger\" id=\"player-view-status-badge\"><span class=\"offline-icon\">✖</span> [OFFLINE]</span>"
          : audioEngine.isPlaying
          ? "<span class=\"status-badge badge-active\" id=\"player-view-status-badge\"><span class=\"live-icon\">●</span> [LIVE]</span>"
          : "<span class=\"status-badge badge-neutral\" id=\"player-view-status-badge\"><span class=\"live-icon\">●</span> [READY]</span>")
      : (audioEngine.isPlaying
          ? "<span class=\"status-badge badge-active\" id=\"player-view-status-badge\"><span class=\"live-icon\">●</span> [PLAYING]</span>"
          : "<span class=\"status-badge badge-neutral\" id=\"player-view-status-badge\"><span>■</span> [PAUSED]</span>");

    return `
      <div class="player-view-container">
        <!-- Top Navigation / Actions Bar -->
        <header class="player-view-header">
          <button id="btn-player-back" class="btn btn-secondary btn-sm" aria-label="Go Back" title="Go Back (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>Back</span>
          </button>

          <div class="player-view-header-title">Now Playing</div>

          <div class="player-view-header-actions">
            <button id="btn-player-fav" class="btn btn-secondary btn-sm btn-icon" aria-label="Toggle Favorite" title="Star / Favorite">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${info.isFavorite ? "#fbbf24" : "none"}" stroke="${info.isFavorite ? "#fbbf24" : "currentColor"}" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>
            <button id="btn-player-eq" class="btn btn-secondary btn-sm btn-icon" aria-label="Toggle Equalizer" title="Equalizer (E)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="4" y1="21" x2="4" y2="14"></line>
                <line x1="4" y1="10" x2="4" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="3"></line>
                <line x1="20" y1="21" x2="20" y2="16"></line>
                <line x1="20" y1="12" x2="20" y2="3"></line>
              </svg>
            </button>
            <button id="btn-player-queue" class="btn btn-secondary btn-sm btn-icon" aria-label="Toggle Queue" title="Queue (Q)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </button>
          </div>
        </header>

        <!-- Center Stage: Artwork / Visualizer -->
        <div class="player-view-stage">
          <div class="player-view-art-wrapper" id="player-art-wrapper" style="${isVisualizerEnabled ? "display: none;" : "display: flex;"}">
            <img
              id="player-view-art-img"
              class="player-view-art ${audioEngine.isPlaying ? "art-playing" : ""}"
              src="${escapeHtml(info.artSrc)}"
              alt="${escapeHtml(info.title)}"
              data-fallback="${escapeHtml(info.fallbackArt)}"
            />
          </div>

          <div class="player-view-viz-wrapper" id="player-viz-wrapper" style="${isVisualizerEnabled ? "display: flex;" : "display: none;"}">
            <canvas id="player-view-visualizer-canvas" class="player-view-visualizer-canvas"></canvas>
            <div class="player-view-viz-mode-bar">
              ${VISUALIZER_MODES.map(
                (m) => `
                <button class="btn-mode-pill ${currentVisualizerMode === m.id ? "active" : ""}" data-mode="${m.id}" aria-label="Visualizer mode: ${m.name}">
                  ${m.name}
                </button>
              `
              ).join("")}
            </div>
          </div>

          <!-- Visualizer Toggle Pill / Switch (Off by default) -->
          <div class="player-view-viz-toggle-container">
            <button id="btn-player-toggle-viz" class="btn-viz-toggle ${isVisualizerEnabled ? "active" : ""}" aria-label="Toggle Audio Visualizer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
              <span>[VISUALIZER: ${isVisualizerEnabled ? "ON" : "OFF"}]</span>
            </button>
          </div>
        </div>

        <!-- Metadata & Telemetry Section -->
        <div class="player-view-meta">
          <div class="player-view-title-row">
            <h2 id="player-view-title" class="player-view-title">${escapeHtml(info.title)}</h2>
          </div>
          <div id="player-view-artist" class="player-view-artist">${escapeHtml(info.artist)}</div>
          <div id="player-view-album" class="player-view-album">${escapeHtml(info.album)}</div>

          <div class="player-view-badges">
            ${statusBadgeHtml}
            ${info.bitrate ? `<span class="player-tech-badge">${escapeHtml(info.bitrate)}</span>` : ""}
            ${info.codec ? `<span class="player-tech-badge">${escapeHtml(info.codec)}</span>` : ""}
            ${info.isRadio ? "<span class=\"player-tech-badge\">Live Stream</span>" : "<span class=\"player-tech-badge\">Local Audio</span>"}
          </div>
        </div>

        <!-- Timeline / Progress Controls -->
        <div class="player-view-timeline">
          <div id="player-view-progress-bar" class="player-view-progress-bar" style="${info.isRadio ? "display: none;" : "display: flex;"}">
            <span id="player-view-current-time" class="time-label current">${formatTime(audioEngine.currentTime)}</span>
            <input
              id="player-view-seek"
              type="range"
              class="seek-slider"
              min="0"
              max="${info.duration || 100}"
              value="${audioEngine.currentTime || 0}"
              aria-label="Seek track position"
            />
            <span id="player-view-duration" class="time-label">${formatTime(info.duration || audioEngine.duration)}</span>
          </div>

          <div id="player-view-live-bar" class="player-view-live-bar" style="${info.isRadio ? "display: flex;" : "display: none;"}">
            <span class="player-live-indicator">
              <span class="live-icon" style="font-size: 10px; margin-right: 4px;">●</span>
              <span class="live-text">[LIVE STREAM]</span>
            </span>
            <span id="player-view-live-meta" class="player-live-meta">${escapeHtml(info.bitrate || "128 kbps")} • Continuous broadcast</span>
          </div>
        </div>

        <!-- Primary Transport Controls -->
        <div class="player-view-transport">
          <button id="btn-player-shuffle" class="btn-control ${queueManager.shuffle ? "active" : ""}" aria-label="Toggle Shuffle" title="Shuffle (S)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 3 21 3 21 8"></polyline>
              <line x1="4" y1="20" x2="21" y2="3"></line>
              <polyline points="21 16 21 21 16 21"></polyline>
              <line x1="15" y1="15" x2="21" y2="21"></line>
              <line x1="4" y1="4" x2="9" y2="9"></line>
            </svg>
          </button>

          <button id="btn-player-prev" class="btn-control" aria-label="Previous Track" title="Previous (Shift+Left)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="19 20 9 12 19 4 19 20"></polygon>
              <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"></line>
            </svg>
          </button>

          <button id="btn-player-play-pause" class="btn-control btn-play-pause btn-play-pause-lg" aria-label="${audioEngine.isPlaying ? "Pause" : "Play"}" title="Play/Pause (Space)">
            <svg id="icon-player-play" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style="${audioEngine.isPlaying ? "display: none;" : "display: block;"}">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <svg id="icon-player-pause" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style="${audioEngine.isPlaying ? "display: block;" : "display: none;"}">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          </button>

          <button id="btn-player-next" class="btn-control" aria-label="Next Track" title="Next (Shift+Right)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 4 15 12 5 20 5 4"></polygon>
              <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"></line>
            </svg>
          </button>

          <button id="btn-player-repeat" class="btn-control ${queueManager.repeatMode !== "off" ? "active" : ""}" aria-label="Cycle Repeat" title="Repeat: ${queueManager.repeatMode} (R)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="17 1 21 5 17 9"></polyline>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
              <polyline points="7 23 3 19 7 15"></polyline>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
            ${queueManager.repeatMode === "one" ? "<span class=\"repeat-one-badge\">1</span>" : ""}
          </button>
        </div>

        <!-- Volume & Auxiliary Controls -->
        <div class="player-view-secondary">
          <div class="player-view-volume-box">
            <button id="btn-player-mute" class="btn-control" aria-label="Toggle Mute" title="Mute (M)">
              <svg id="icon-player-volume" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </button>
            <input
              id="player-view-volume"
              type="range"
              class="volume-slider player-view-volume-slider"
              min="0"
              max="100"
              value="${Math.round(audioEngine.volume * 100)}"
              aria-label="Volume level"
            />
          </div>
        </div>
      </div>
    `;
  }

  function setupVisualizerInstance() {
    const canvas = container.querySelector("#player-view-visualizer-canvas");
    if (!canvas) return;

    if (!visualizer) {
      visualizer = new AudioVisualizer(canvas);
      visualizer.setMode(currentVisualizerMode);
    } else {
      visualizer.init(canvas);
      visualizer.setMode(currentVisualizerMode);
    }

    if (isVisualizerEnabled) {
      visualizer.resize();
      if (audioEngine.isPlaying) {
        visualizer.start();
      }
    }
  }

  function updateVisualizerState() {
    const artWrapper = container.querySelector("#player-art-wrapper");
    const vizWrapper = container.querySelector("#player-viz-wrapper");
    const toggleBtn = container.querySelector("#btn-player-toggle-viz");

    if (artWrapper) artWrapper.style.display = isVisualizerEnabled ? "none" : "flex";
    if (vizWrapper) vizWrapper.style.display = isVisualizerEnabled ? "flex" : "none";

    if (toggleBtn) {
      toggleBtn.classList.toggle("active", isVisualizerEnabled);
      const span = toggleBtn.querySelector("span");
      if (span) span.textContent = `[VISUALIZER: ${isVisualizerEnabled ? "ON" : "OFF"}]`;
    }

    if (isVisualizerEnabled) {
      setupVisualizerInstance();
    } else if (visualizer) {
      visualizer.pause();
    }
  }

  function updateState() {
    const info = getMediaInfo();

    const titleEl = container.querySelector("#player-view-title");
    const artistEl = container.querySelector("#player-view-artist");
    const albumEl = container.querySelector("#player-view-album");
    const artImg = container.querySelector("#player-view-art-img");
    const progressBar = container.querySelector("#player-view-progress-bar");
    const liveBar = container.querySelector("#player-view-live-bar");
    const currentTimeEl = container.querySelector("#player-view-current-time");
    const durationEl = container.querySelector("#player-view-duration");
    const seekSlider = container.querySelector("#player-view-seek");
    const iconPlay = container.querySelector("#icon-player-play");
    const iconPause = container.querySelector("#icon-player-pause");
    const btnPlayPause = container.querySelector("#btn-player-play-pause");
    const favBtnSvg = container.querySelector("#btn-player-fav svg");
    const shuffleBtn = container.querySelector("#btn-player-shuffle");
    const repeatBtn = container.querySelector("#btn-player-repeat");
    const statusBadge = container.querySelector("#player-view-status-badge");

    if (titleEl) titleEl.textContent = info.title;
    if (artistEl) artistEl.textContent = info.artist;
    if (albumEl) albumEl.textContent = info.album;

    if (artImg) {
      artImg.src = info.artSrc;
      artImg.alt = info.title;
      artImg.dataset.fallback = info.fallbackArt;
      artImg.classList.toggle("art-playing", audioEngine.isPlaying);

      if (!info.isRadio && audioEngine.currentTrack?.artworkId && (!info.artSrc || info.artSrc === "public/icons/icon-192.svg")) {
        db.getArtwork(audioEngine.currentTrack.artworkId).then((art) => {
          if (art && art.thumbnailDataUrl) {
            artImg.src = art.thumbnailDataUrl;
          }
        }).catch(() => {});
      }
    }

    if (favBtnSvg) {
      favBtnSvg.setAttribute("fill", info.isFavorite ? "#fbbf24" : "none");
      favBtnSvg.setAttribute("stroke", info.isFavorite ? "#fbbf24" : "currentColor");
    }

    if (progressBar) progressBar.style.display = info.isRadio ? "none" : "flex";
    if (liveBar) liveBar.style.display = info.isRadio ? "flex" : "none";

    if (!info.isRadio && !isSeeking) {
      if (currentTimeEl) currentTimeEl.textContent = formatTime(audioEngine.currentTime);
      if (durationEl) durationEl.textContent = formatTime(info.duration || audioEngine.duration);
      if (seekSlider) {
        seekSlider.max = info.duration || audioEngine.duration || 100;
        seekSlider.value = audioEngine.currentTime || 0;
      }
    }

    if (iconPlay) iconPlay.style.display = audioEngine.isPlaying ? "none" : "block";
    if (iconPause) iconPause.style.display = audioEngine.isPlaying ? "block" : "none";
    if (btnPlayPause) {
      btnPlayPause.setAttribute("aria-label", audioEngine.isPlaying ? "Pause" : "Play");
    }

    if (shuffleBtn) shuffleBtn.classList.toggle("active", queueManager.shuffle);
    if (repeatBtn) {
      repeatBtn.classList.toggle("active", queueManager.repeatMode !== "off");
      repeatBtn.title = `Repeat: ${queueManager.repeatMode} (R)`;
    }

    if (statusBadge) {
      if (info.isRadio) {
        if (info.streamStatus === "buffering") {
          statusBadge.className = "status-badge badge-warning";
          statusBadge.innerHTML = "<span class=\"buffering-icon\">⏳</span> [BUFFERING]";
        } else if (info.streamStatus === "connecting") {
          statusBadge.className = "status-badge badge-warning";
          statusBadge.innerHTML = "<span class=\"connecting-icon\">▲</span> [CONNECTING]";
        } else if (info.streamStatus === "error") {
          statusBadge.className = "status-badge badge-danger";
          statusBadge.innerHTML = "<span class=\"offline-icon\">✖</span> [OFFLINE]";
        } else if (audioEngine.isPlaying) {
          statusBadge.className = "status-badge badge-active";
          statusBadge.innerHTML = "<span class=\"live-icon\">●</span> [LIVE]";
        } else {
          statusBadge.className = "status-badge badge-neutral";
          statusBadge.innerHTML = "<span class=\"live-icon\">●</span> [READY]";
        }
      } else {
        if (audioEngine.isPlaying) {
          statusBadge.className = "status-badge badge-active";
          statusBadge.innerHTML = "<span class=\"live-icon\">●</span> [PLAYING]";
        } else {
          statusBadge.className = "status-badge badge-neutral";
          statusBadge.innerHTML = "<span>■</span> [PAUSED]";
        }
      }
    }

    if (visualizer && isVisualizerEnabled) {
      if (audioEngine.isPlaying) {
        visualizer.start();
      } else {
        visualizer.pause();
      }
    }
  }

  function attachEvents() {
    // Back navigation
    const backBtn = container.querySelector("#btn-player-back");
    if (backBtn) {
      backBtn.onclick = () => {
        if (typeof window !== "undefined" && window.history.length > 1 && typeof document !== "undefined" && document.referrer && document.referrer.includes(window.location.host)) {
          window.history.back();
        } else if (typeof window !== "undefined") {
          window.location.hash = "#/home";
        }
      };
    }

    // Visualizer on/off toggle switch
    const toggleVizBtn = container.querySelector("#btn-player-toggle-viz");
    if (toggleVizBtn) {
      toggleVizBtn.onclick = () => {
        isVisualizerEnabled = !isVisualizerEnabled;
        updateVisualizerState();
      };
    }

    // Visualizer mode pills
    container.querySelectorAll(".btn-mode-pill").forEach((btn) => {
      btn.onclick = () => {
        const mode = btn.dataset.mode;
        if (mode) {
          currentVisualizerMode = mode;
          container.querySelectorAll(".btn-mode-pill").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
          if (visualizer) visualizer.setMode(mode);
        }
      };
    });

    // Transport buttons
    const btnPlayPause = container.querySelector("#btn-player-play-pause");
    const btnPrev = container.querySelector("#btn-player-prev");
    const btnNext = container.querySelector("#btn-player-next");
    const btnShuffle = container.querySelector("#btn-player-shuffle");
    const btnRepeat = container.querySelector("#btn-player-repeat");
    const btnMute = container.querySelector("#btn-player-mute");
    const seekSlider = container.querySelector("#player-view-seek");
    const volumeSlider = container.querySelector("#player-view-volume");
    const favBtn = container.querySelector("#btn-player-fav");
    const eqBtn = container.querySelector("#btn-player-eq");
    const queueBtn = container.querySelector("#btn-player-queue");

    if (btnPlayPause) btnPlayPause.onclick = () => audioEngine.togglePlay();
    if (btnPrev) btnPrev.onclick = () => audioEngine.previous();
    if (btnNext) btnNext.onclick = () => audioEngine.next();
    if (btnShuffle) btnShuffle.onclick = () => queueManager.toggleShuffle();
    if (btnRepeat) btnRepeat.onclick = () => queueManager.cycleRepeat();
    if (btnMute) btnMute.onclick = () => audioEngine.toggleMute();

    if (seekSlider) {
      seekSlider.oninput = () => {
        isSeeking = true;
        const currentTimeEl = container.querySelector("#player-view-current-time");
        if (currentTimeEl) currentTimeEl.textContent = formatTime(seekSlider.value);
      };
      seekSlider.onchange = () => {
        audioEngine.seek(parseFloat(seekSlider.value));
        isSeeking = false;
      };
    }

    if (volumeSlider) {
      volumeSlider.oninput = () => {
        audioEngine.setVolume(parseFloat(volumeSlider.value) / 100);
      };
    }

    if (favBtn) {
      favBtn.onclick = async () => {
        if (audioEngine.isRadio && audioEngine.currentStation) {
          const isFav = await toggleFavoriteStation(audioEngine.currentStation.id, db);
          audioEngine.currentStation.isFavorite = isFav;
          updateState();
        } else if (audioEngine.currentTrack) {
          const isFav = await db.toggleFavorite(audioEngine.currentTrack.id);
          audioEngine.currentTrack.isFavorite = isFav;
          updateState();
        }
      };
    }

    // Launch Equalizer Modal
    if (eqBtn) {
      eqBtn.onclick = () => {
        const globalEqBtn = document.getElementById("btn-toggle-eq");
        if (globalEqBtn) globalEqBtn.click();
      };
    }

    // Launch Queue Drawer
    if (queueBtn) {
      queueBtn.onclick = () => {
        const globalQueueBtn = document.getElementById("btn-toggle-queue");
        if (globalQueueBtn) globalQueueBtn.click();
      };
    }

    // Image fallback error listener
    const artImg = container.querySelector("#player-view-art-img");
    if (artImg) {
      artImg.onerror = () => {
        const fallback = artImg.dataset.fallback;
        if (fallback && artImg.src !== fallback) {
          artImg.src = fallback;
        }
      };
    }
  }

  container.innerHTML = renderMarkup();
  attachEvents();

  const unsubscribe = audioEngine.subscribe(() => {
    if (typeof container.isConnected === "boolean" && !container.isConnected) {
      if (visualizer) visualizer.destroy();
      unsubscribe();
      return;
    }
    updateState();
  });

  return container;
}
