/**
 * LocalJam - Automatic Release Update Detection & Refresh Banner Component
 */

import { APP_VERSION, isValidReleaseName, isValidSemanticTag } from "../../version.js";

export function createUpdateBanner() {
  const container = document.createElement("div");
  container.id = "update-banner-container";
  container.className = "update-banner-container";
  container.style.display = "none";
  container.setAttribute("role", "alert");
  container.setAttribute("aria-live", "polite");

  container.innerHTML = `
    <div class="update-banner">
      <div class="update-banner-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
      </div>
      <div class="update-banner-text">
        <span class="status-badge badge-warn">[UPDATE AVAILABLE]</span>
        <span id="update-banner-message">A new version of LocalJam is available.</span>
      </div>
      <div class="update-banner-actions">
        <button id="btn-apply-update" class="btn btn-primary btn-sm">Refresh Now</button>
        <button id="btn-dismiss-update" class="btn btn-secondary btn-sm" aria-label="Dismiss update notification">Later</button>
      </div>
    </div>
  `;

  const msgEl = container.querySelector("#update-banner-message");
  const applyBtn = container.querySelector("#btn-apply-update");
  const dismissBtn = container.querySelector("#btn-dismiss-update");

  let waitingWorker = null;

  function show(newVersion, worker = null) {
    if (worker) waitingWorker = worker;
    if (msgEl) {
      msgEl.textContent = `A new version of LocalJam (${newVersion}) is ready.`;
    }
    container.style.display = "block";
  }

  function hide() {
    container.style.display = "none";
  }

  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      if (waitingWorker) {
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
      }
      if (typeof window !== "undefined" && window.location) {
        window.location.reload();
      }
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      hide();
    });
  }

  return {
    element: container,
    show,
    hide
  };
}

/**
 * Checks if a newer version is available from remote version.json
 * @param {string} currentVersion
 * @param {string} versionEndpoint
 * @returns {Promise<string|null>} Returns new version string if newer, or null
 */
export async function checkRemoteVersion(currentVersion = APP_VERSION, versionEndpoint = "./version.json") {
  try {
    const url = `${versionEndpoint}?_t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    const data = await res.json();
    if (
      data &&
      data.version &&
      data.version !== currentVersion &&
      (isValidReleaseName(data.version) || isValidSemanticTag(data.version))
    ) {
      return data.version;
    }
    return null;
  } catch (err) {
    console.warn('[UpdateChecker] Remote version check error:', err?.message || err);
    return null;
  }
}

/**
 * Initializes automatic update detection using Service Worker lifecycle and periodic polling
 * @param {Object} options
 * @param {ServiceWorkerRegistration} [options.registration]
 * @param {Function} [options.onUpdateReady]
 * @param {number} [options.pollIntervalMs=30000] // 30 seconds default
 * @param {string} [options.currentVersion=APP_VERSION]
 */
export function initUpdateChecker({ registration, onUpdateReady, pollIntervalMs = 30000, currentVersion = APP_VERSION } = {}) {
  let hasNotified = false;
  let activeVersion = currentVersion;
  let intervalId = null;
  let initialTimeoutId = null;

  const notifyUpdate = (newVersion, worker = null) => {
    if (hasNotified) return;
    hasNotified = true;
    if (typeof onUpdateReady === "function") {
      onUpdateReady(newVersion, worker);
    }
  };

  // 1. Service Worker updatefound listener
  if (registration) {
    if (registration.waiting) {
      notifyUpdate("New Release", registration.waiting);
    }

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;

      installing.addEventListener("statechange", () => {
        const hasController = typeof navigator !== "undefined" && navigator.serviceWorker ? navigator.serviceWorker.controller : true;
        if (installing.state === "installed" && hasController) {
          notifyUpdate("New Release", installing);
        }
      });
    });
  }

  // 2. Periodic and window focus remote version check
  const poll = async () => {
    // Actively prompt browser Service Worker update check if registration is available
    if (registration && typeof registration.update === "function") {
      try {
        await registration.update();
      } catch {
        // Ignore network / update errors
      }
    }

    const newVersion = await checkRemoteVersion(activeVersion);
    if (newVersion) {
      notifyUpdate(newVersion);
    }
  };

  const onFocus = () => {
    poll();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("focus", onFocus);

    // Initial check after short boot settle delay (1500ms)
    initialTimeoutId = setTimeout(() => {
      poll();
    }, 1500);

    if (pollIntervalMs > 0) {
      intervalId = setInterval(poll, pollIntervalMs);
    }
  }

  const setActiveVersion = (ver) => {
    if (ver) {
      activeVersion = ver;
    }
  };

  const destroy = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (initialTimeoutId) {
      clearTimeout(initialTimeoutId);
      initialTimeoutId = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", onFocus);
    }
  };

  return { poll, setActiveVersion, destroy };
}
