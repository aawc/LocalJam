/**
 * LocalJam - Main Application Bootstrapper
 */

import { db } from './storage/db.js';
import { audioEngine } from './player/audio-engine.js';
import { equalizer } from './player/equalizer.js';
import { router } from './ui/router.js';
import { keyboardManager } from './ui/keyboard.js';
import { createPlayerBar } from './ui/components/player-bar.js';
import { createAppFooter } from './ui/components/app-footer.js';
import { createUpdateBanner, initUpdateChecker } from './ui/components/update-banner.js';
import { createEqModal } from './ui/components/eq-modal.js';
import { createVisualizerOverlay } from './ui/components/visualizer-overlay.js';
import { createQueueDrawer } from './ui/components/queue-drawer.js';
import { createStationModal } from './ui/components/station-modal.js';

import { renderHomeView } from './ui/views/home-view.js';
import { renderSongsView } from './ui/views/songs-view.js';
import { renderAlbumsView } from './ui/views/albums-view.js';
import { renderArtistsView } from './ui/views/artists-view.js';
import { renderPlaylistsView } from './ui/views/playlists-view.js';
import { renderFavoritesView } from './ui/views/favorites-view.js';
import { renderHistoryView } from './ui/views/history-view.js';
import { renderRadioView } from './ui/views/radio-view.js';
import { renderSettingsView } from './ui/views/settings-view.js';
import { APP_VERSION } from './version.js';

export async function initApp() {
  try {
    // 1. Initialize IndexedDB
    await db.init();

    // 2. Register Routes
    router.registerRoute('home', renderHomeView);
    router.registerRoute('songs', renderSongsView);
    router.registerRoute('albums', renderAlbumsView);
    router.registerRoute('artists', renderArtistsView);
    router.registerRoute('playlists', renderPlaylistsView);
    router.registerRoute('favorites', renderFavoritesView);
    router.registerRoute('history', renderHistoryView);
    router.registerRoute('radio', renderRadioView);
    router.registerRoute('settings', renderSettingsView);

    // 3. Mount UI Components
    const eqModal = createEqModal();
    document.body.appendChild(eqModal.element);

    const visualizerOverlay = createVisualizerOverlay();
    document.body.appendChild(visualizerOverlay.element);

    const stationModal = createStationModal({
      onToggleEq: () => eqModal.toggle(),
      onToggleViz: () => visualizerOverlay.toggle()
    });
    document.body.appendChild(stationModal.element);
    if (typeof window !== 'undefined') {
      window.localjamStationModal = stationModal;
    }

    const playerBarMount = document.getElementById('player-bar-container');
    if (playerBarMount) {
      playerBarMount.appendChild(
        createPlayerBar({
          onOpenStationDetails: (station) => stationModal.open(station)
        })
      );
    }

    const queueDrawer = createQueueDrawer();
    document.body.appendChild(queueDrawer.element);

    const appFooter = createAppFooter();
    const appMain = document.querySelector('.app-main');
    if (appMain) {
      appMain.appendChild(appFooter.element);
    } else {
      document.body.appendChild(appFooter.element);
    }

    let updateCheckerInstance = null;
    let activeDeployedVersion = APP_VERSION;

    // Dynamically fetch deployed version.json to synchronize runtime release display
    if (typeof fetch === 'function') {
      fetch(`./version.json?_t=${Date.now()}`, { cache: 'no-cache' })
        .then((res) => (res.ok ? res.json() : null))
        .then((verData) => {
          if (verData && verData.version) {
            activeDeployedVersion = verData.version;
            if (typeof appFooter.updateVersion === 'function') {
              appFooter.updateVersion(verData);
            }
            if (updateCheckerInstance && typeof updateCheckerInstance.setActiveVersion === 'function') {
              updateCheckerInstance.setActiveVersion(verData.version);
            }
          }
        })
        .catch((err) => {
          console.warn('[LocalJam] Could not fetch remote version.json:', err?.message || err);
        });
    }

    const updateBanner = createUpdateBanner();
    document.body.appendChild(updateBanner.element);

    // 4. Connect Toggle Triggers
    const btnToggleEq = document.getElementById('btn-toggle-eq');
    if (btnToggleEq) {
      btnToggleEq.addEventListener('click', () => eqModal.toggle());
    }

    const btnToggleViz = document.getElementById('btn-toggle-viz');
    if (btnToggleViz) {
      btnToggleViz.addEventListener('click', () => visualizerOverlay.toggle());
    }

    const btnToggleQueue = document.getElementById('btn-toggle-queue');
    if (btnToggleQueue) {
      btnToggleQueue.addEventListener('click', () => queueDrawer.toggle());
    }

    // 5. Global Search in Topbar
    const searchForm = document.getElementById('global-search-form');
    const searchInput = document.getElementById('global-search-input');
    if (searchForm && searchInput) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
          router.navigate(`songs?q=${encodeURIComponent(query)}`);
        }
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const query = searchInput.value.trim();
          if (query) {
            router.navigate(`songs?q=${encodeURIComponent(query)}`);
          }
        }
      });
    }

    // 6. Init Router with Main Content Area
    const mainContent = document.getElementById('main-content');
    router.init(mainContent);

    // 7. Initialize Global Keyboard Shortcuts
    keyboardManager.init();

    // 8. One-time Global User Interaction Audio Unlock
    const unlockWebAudio = () => {
      if (audioEngine && !audioEngine.webAudioInitialized) {
        audioEngine.initWebAudio().catch(() => {});
      } else if (audioEngine && audioEngine.audioCtx && audioEngine.audioCtx.state === 'suspended') {
        audioEngine.audioCtx.resume().catch(() => {});
      }
    };
    ['pointerdown', 'touchstart', 'keydown'].forEach((evt) => {
      document.addEventListener(evt, unlockWebAudio, { once: true, passive: true });
    });

    // 9. Initialize Update Checker & Register Service Worker for PWA
    const handleUpdateReady = (newVersion, worker) => {
      updateBanner.show(newVersion, worker);
    };

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('./sw.js')
          .then((reg) => {
            console.log('[SW] ServiceWorker registered with scope:', reg.scope);
            updateCheckerInstance = initUpdateChecker({
              registration: reg,
              currentVersion: activeDeployedVersion,
              onUpdateReady: handleUpdateReady
            });
          })
          .catch((err) => {
            console.warn('[SW] ServiceWorker registration failed:', err);
            updateCheckerInstance = initUpdateChecker({
              currentVersion: activeDeployedVersion,
              onUpdateReady: handleUpdateReady
            });
          });
      });
    } else {
      updateCheckerInstance = initUpdateChecker({
        currentVersion: activeDeployedVersion,
        onUpdateReady: handleUpdateReady
      });
    }
  } catch (err) {
    console.error('[LocalJam] Initialization failure:', err);
  }
}

// Auto-boot when loaded in browser
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
