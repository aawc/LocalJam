/**
 * LocalJam - Settings & Diagnostics View
 */

import { db } from '../../storage/db.js';
import { audioEngine } from '../../player/audio-engine.js';
import { reconciler } from '../../storage/reconciler.js';
import { CURRENT_RELEASE } from '../../version.js';

export async function renderSettingsView() {
  const container = document.createElement('div');
  container.className = 'page-container';

  const tracks = await db.getAllTracks();
  const activeCount = tracks.filter((t) => !t.isMissing).length;
  const missingCount = tracks.filter((t) => t.isMissing === 1).length;
  const handles = await db.getAllDirectoryHandles();
  const hasFSAA = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  const currentCrossfade = audioEngine.crossfadeDuration || 2;

  let activeVersion = CURRENT_RELEASE.version;
  let activeReleaseDate = CURRENT_RELEASE.releaseDate;
  if (typeof window !== 'undefined' && window.localjamActiveVersionData) {
    activeVersion = window.localjamActiveVersionData.version || activeVersion;
    activeReleaseDate = window.localjamActiveVersionData.releaseDate || activeReleaseDate;
  }

  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Settings & Diagnostics</h1>
        <div class="view-subtitle">Storage architecture, audio engine parameters, and library maintenance</div>
      </div>
    </div>

    <!-- About LocalJam -->
    <div class="settings-section hero-card" style="margin-bottom: 24px; padding: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
        <div>
          <h2 style="font-size: 18px; margin-bottom: 6px; color: var(--text-primary);">About LocalJam</h2>
          <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 12px;">
            Local-first audio player Progressive Web App
          </div>
          <div style="font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">
            <strong>Version:</strong> <span id="settings-app-version">${escapeHtml(activeVersion)}</span>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
            <strong>Released:</strong> <span id="settings-release-date">${escapeHtml(activeReleaseDate)}</span>
          </div>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button id="btn-open-release-notes" class="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Release Notes
          </button>
          <a href="https://github.com/aawc/LocalJam" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="display: inline-flex; align-items: center; text-decoration: none;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
            GitHub
          </a>
        </div>
      </div>
    </div>

    <!-- Storage Engine Diagnostics -->
    <div class="settings-section hero-card" style="margin-bottom: 24px; padding: 24px;">
      <h2 style="font-size: 18px; margin-bottom: 16px; color: var(--text-primary);">Storage Engine Status</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 16px;">
        <div class="stat-card" style="text-align: left; padding: 14px;">
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">ACTIVE STORAGE TIER</div>
          <div style="font-size: 15px; font-weight: 600; color: var(--primary-color);">
            ${hasFSAA ? 'Tier 1: File System Access API' : 'Tier 2: Session File Registry'}
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            ${hasFSAA ? 'Persistent directory handles' : 'Indexed metadata + session registry'}
          </div>
        </div>

        <div class="stat-card" style="text-align: left; padding: 14px;">
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">ACTIVE TRACKS</div>
          <div style="font-size: 15px; font-weight: 600; color: var(--status-success);">
            ${activeCount} Available <span class="status-badge badge-active" style="font-size: 10px;">[AVAILABLE]</span>
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            ${missingCount > 0 ? `${missingCount} Missing <span class="status-badge badge-missing" style="font-size: 10px;">[MISSING]</span>` : '0 Missing files'}
          </div>
        </div>

        <div class="stat-card" style="text-align: left; padding: 14px;">
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">DIRECTORY ROOTS</div>
          <div style="font-size: 15px; font-weight: 600; color: var(--text-primary);">
            ${handles.length} Root Directories
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            ${handles.map((h) => escapeHtml(h.name || h.id)).join(', ') || 'None saved'}
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 12px;">
        <button id="btn-rescan-library" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Re-scan Library
        </button>
        <input type="file" id="settings-folder-input" webkitdirectory directory multiple style="display: none;" />
      </div>
    </div>

    <!-- Audio Playback Settings -->
    <div class="settings-section hero-card" style="margin-bottom: 24px; padding: 24px;">
      <h2 style="font-size: 18px; margin-bottom: 16px; color: var(--text-primary);">Audio Engine & Playback</h2>
      
      <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label for="crossfade-slider" style="font-weight: 500;">Crossfade Duration:</label>
          <span id="crossfade-val-label" style="font-weight: 600; color: var(--primary-color);">${currentCrossfade} seconds</span>
        </div>
        <input
          type="range"
          id="crossfade-slider"
          class="seek-slider"
          min="0"
          max="10"
          step="0.5"
          value="${currentCrossfade}"
          style="width: 100%;"
        />
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
          <span>0s (Gapless / Instant)</span>
          <span>5s</span>
          <span>10s (Long Blend)</span>
        </div>
      </div>
    </div>

    <!-- Database Reset -->
    <div class="settings-section hero-card" style="padding: 24px; border-color: rgba(244, 63, 94, 0.3);">
      <h2 style="font-size: 18px; margin-bottom: 12px; color: var(--status-error);">Danger Zone</h2>
      <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
        Resetting the database clears indexed metadata, history, and playlists. Original audio files on your device are not modified or deleted.
      </p>
      <button id="btn-reset-db" class="btn btn-secondary" style="color: var(--status-error); border-color: var(--status-error);">
        Reset Library Database
      </button>
    </div>
  `;

  // Attach handlers
  const releaseNotesBtn = container.querySelector('#btn-open-release-notes');
  const crossfadeSlider = container.querySelector('#crossfade-slider');
  const crossfadeLabel = container.querySelector('#crossfade-val-label');
  const rescanBtn = container.querySelector('#btn-rescan-library');
  const folderInput = container.querySelector('#settings-folder-input');
  const resetDbBtn = container.querySelector('#btn-reset-db');

  if (releaseNotesBtn) {
    releaseNotesBtn.addEventListener('click', () => {
      if (typeof window !== 'undefined' && window.localjamReleaseNotesModal) {
        window.localjamReleaseNotesModal.open();
      }
    });
  }

  crossfadeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    audioEngine.setCrossfadeDuration(val);
    crossfadeLabel.textContent = `${val} seconds`;
  });

  rescanBtn.addEventListener('click', async () => {
    if (hasFSAA) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        rescanBtn.disabled = true;
        rescanBtn.textContent = 'Scanning...';
        await reconciler.reconcileDirectoryHandle(dirHandle);
        alert('Library re-scan complete.');
        window.location.reload();
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
        rescanBtn.disabled = false;
        rescanBtn.textContent = 'Re-scan Library';
      }
    } else {
      folderInput.click();
    }
  });

  folderInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    rescanBtn.disabled = true;
    rescanBtn.textContent = 'Scanning...';
    await reconciler.reconcileFileList(files);
    alert('Library re-scan complete.');
    window.location.reload();
  });

  resetDbBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset all library data? This action cannot be undone.')) {
      const stores = ['tracks', 'albums', 'artists', 'playlists', 'favorites', 'history', 'artwork', 'directoryHandles', 'settings'];
      for (const s of stores) {
        await db.clearStore(s);
      }
      alert('Database cleared successfully.');
      window.location.hash = '#/home';
      window.location.reload();
    }
  });

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
