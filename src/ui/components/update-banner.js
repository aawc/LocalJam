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
  let currentBannerVersion = null;
  let isApplying = false;

  function setWorker(worker) {
    if (worker) {
      waitingWorker = worker;
    }
  }

  function show(newVersion, worker = null) {
    if (worker) waitingWorker = worker;
    currentBannerVersion = newVersion;

    if (typeof sessionStorage !== "undefined") {
      const dismissed = sessionStorage.getItem("localjam_dismissed_version");
      if (dismissed === newVersion) {
        return;
      }
    }

    if (msgEl) {
      msgEl.textContent = `A new version of LocalJam (${newVersion}) is ready.`;
    }
    container.style.display = "block";
  }

  function hide() {
    container.style.display = "none";
  }

  async function applyUpdate() {
    if (isApplying) return;
    isApplying = true;

    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.textContent = "Updating...";
    }

    const doReload = () => {
      if (typeof window !== "undefined" && window.location) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("_t", Date.now().toString());
          window.location.replace(url.toString());
        } catch {
          window.location.reload();
        }
      }
    };

    // 1. Invalidate stale caches if available to prevent stale app-shell reload
    if (typeof caches !== "undefined" && typeof caches.keys === "function") {
      try {
        const isSemantic =
          currentBannerVersion &&
          (isValidSemanticTag(currentBannerVersion) || isValidReleaseName(currentBannerVersion));
        const targetCache = isSemantic ? `localjam-${currentBannerVersion}` : null;
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => (targetCache ? k !== targetCache : true))
            .map((k) => caches.delete(k))
        );
      } catch (err) {
        console.warn("[UpdateBanner] Cache cleanup notice:", err?.message || err);
      }
    }

    // 2. Dynamically resolve waiting or installing worker if not set
    let targetWorker = waitingWorker;

    if (!targetWorker && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          if (reg.waiting) {
            targetWorker = reg.waiting;
          } else if (reg.installing) {
            targetWorker = reg.installing;
          } else if (typeof reg.update === "function") {
            reg.update().catch(() => {});
          }
        }
      } catch (err) {
        console.warn("[UpdateBanner] Registration query notice:", err?.message || err);
      }
    }

    // 3. Post SKIP_WAITING to target worker
    if (targetWorker) {
      if (targetWorker.state === "installed" || targetWorker.state === "activated" || !targetWorker.state) {
        try {
          targetWorker.postMessage({ type: "SKIP_WAITING" });
        } catch {}
      } else if (targetWorker.state === "installing") {
        targetWorker.addEventListener("statechange", () => {
          if (targetWorker.state === "installed") {
            try {
              targetWorker.postMessage({ type: "SKIP_WAITING" });
            } catch {}
          }
        });
      }
    }

    // 4. Reload once controller changes or after safety fallback timeout
    let reloaded = false;
    const triggerReloadOnce = () => {
      if (reloaded) return;
      reloaded = true;
      hide();
      doReload();
    };

    if (
      typeof navigator !== "undefined" &&
      navigator.serviceWorker &&
      typeof navigator.serviceWorker.addEventListener === "function"
    ) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        triggerReloadOnce();
      }, { once: true });
    }

    // Fallback safety timeout if controllerchange does not fire
    setTimeout(() => {
      triggerReloadOnce();
    }, 800);
  }

  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      applyUpdate();
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      hide();
      if (typeof sessionStorage !== "undefined" && currentBannerVersion) {
        sessionStorage.setItem("localjam_dismissed_version", currentBannerVersion);
      }
    });
  }

  return {
    element: container,
    show,
    hide,
    setWorker,
    apply: applyUpdate
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
  let notifiedVersion = null;
  let notifiedWorker = null;
  let activeVersion = currentVersion;
  let intervalId = null;
  let initialTimeoutId = null;

  const notifyUpdate = (newVersion, worker = null) => {
    if (notifiedVersion && notifiedVersion === newVersion && notifiedWorker && !worker) {
      return;
    }
    if (notifiedVersion && notifiedVersion === newVersion && notifiedWorker === worker) {
      return;
    }
    notifiedVersion = newVersion;
    if (worker) {
      notifiedWorker = worker;
    }
    if (typeof onUpdateReady === "function") {
      onUpdateReady(newVersion, notifiedWorker || worker);
    }
  };

  // 1. Service Worker updatefound and waiting listener
  if (registration) {
    if (registration.waiting) {
      notifyUpdate("New Release", registration.waiting);
    }
    if (registration.installing) {
      const currentInstalling = registration.installing;
      currentInstalling.addEventListener("statechange", () => {
        const hasController = typeof navigator !== "undefined" && navigator.serviceWorker ? navigator.serviceWorker.controller : true;
        if (currentInstalling.state === "installed" && hasController) {
          notifyUpdate("New Release", currentInstalling);
        }
      });
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

  // 2. Periodic, window focus, and visibility change remote version check
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
      const worker = registration ? (registration.waiting || registration.installing) : null;
      notifyUpdate(newVersion, worker);
    }
  };

  const onFocus = () => {
    poll();
  };

  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      poll();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("focus", onFocus);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

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
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };

  return { poll, setActiveVersion, destroy };
}
