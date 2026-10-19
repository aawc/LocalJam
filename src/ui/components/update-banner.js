/**
 * LocalJam - Automatic Release Update Detection & Refresh Banner Component
 */

import { APP_VERSION, isValidReleaseName, isValidSemanticTag } from "../../version.js";

/**
 * Requests native notification permission if supported and currently default.
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
 */
export async function requestNotificationPermission() {
  if (typeof Notification === "undefined" || typeof Notification.requestPermission !== "function") {
    return "unsupported";
  }
  if (Notification.permission !== "default") {
    return Notification.permission;
  }
  try {
    const permission = await Notification.requestPermission();
    return permission || Notification.permission || "default";
  } catch (err) {
    console.warn("[UpdateBanner] Notification permission request error:", err?.message || err);
    return Notification.permission || "default";
  }
}

/**
 * Dispatches a native browser/platform notification if permission is granted.
 * @param {string} version
 * @param {object} [options]
 * @param {ServiceWorkerRegistration} [options.registration]
 * @param {Function} [options.onApply]
 * @returns {Promise<boolean>} True if notification was dispatched
 */
export async function dispatchNativeUpdateNotification(version, options = {}) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return false;
  }

  // Prevent spamming repeat native notifications for the same version in this session
  if (typeof sessionStorage !== "undefined") {
    const lastNotifiedTs = Number(sessionStorage.getItem("localjam_native_notified_ts") || 0);
    if (Date.now() - lastNotifiedTs < 5000) {
      return false;
    }
    const sessionKey = `localjam_native_notified_${version || "latest"}`;
    if (sessionStorage.getItem(sessionKey)) {
      return false;
    }
    try {
      sessionStorage.setItem(sessionKey, "1");
      sessionStorage.setItem("localjam_native_notified_ts", Date.now().toString());
    } catch (_) {}
  }

  const isNamed = version && version !== "New Release";
  const title = "LocalJam Update Ready";
  const body = isNamed
    ? `A new version of LocalJam (${version}) is ready. Tap to refresh and apply.`
    : "A new version of LocalJam is ready. Tap to refresh and apply.";
  const icon = "./public/icons/icon-192.svg";
  const badge = "./favicon.svg";

  // 1. Prefer ServiceWorkerRegistration.showNotification if available
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      let reg = options.registration || null;
      if (!reg && typeof navigator.serviceWorker.getRegistration === "function") {
        reg = await navigator.serviceWorker.getRegistration();
      }
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, {
          body,
          icon,
          badge,
          tag: "localjam-update",
          renotify: true,
          data: { action: "apply-update", version: isNamed ? version : null }
        });
        return true;
      }
    }
  } catch (err) {
    console.warn("[UpdateBanner] SW showNotification fallback:", err?.message || err);
  }

  // 2. Fallback to Window Notification API
  try {
    const notif = new Notification(title, {
      body,
      icon,
      badge,
      tag: "localjam-update",
      renotify: true
    });
    notif.onclick = () => {
      if (typeof window !== "undefined" && typeof window.focus === "function") {
        window.focus();
      }
      if (typeof options.onApply === "function") {
        options.onApply();
      }
      if (typeof notif.close === "function") {
        notif.close();
      }
    };
    return true;
  } catch (err) {
    console.warn("[UpdateBanner] Window Notification fallback error:", err?.message || err);
    return false;
  }
}

export function createUpdateBanner(deps = {}) {
  const { onToast } = deps;
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
        <button id="btn-enable-alerts" class="btn btn-secondary btn-sm" style="display: none;" aria-label="Enable native update alerts">Notify Me</button>
        <button id="btn-dismiss-update" class="btn btn-secondary btn-sm" aria-label="Dismiss update notification">Later</button>
      </div>
    </div>
  `;

  const msgEl = container.querySelector("#update-banner-message");
  const applyBtn = container.querySelector("#btn-apply-update");
  const alertBtn = container.querySelector("#btn-enable-alerts");
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
    // Retain concrete semantic version if already known; do not overwrite with generic placeholder
    if (newVersion !== "New Release" || !currentBannerVersion) {
      currentBannerVersion = newVersion;
    }

    // If currentBannerVersion is generic "New Release", attempt to resolve concrete version in background
    if (currentBannerVersion === "New Release") {
      checkRemoteVersion().then((resolved) => {
        if (resolved && currentBannerVersion === "New Release") {
          currentBannerVersion = resolved;
          if (msgEl) {
            msgEl.textContent = `A new version of LocalJam (${resolved}) is ready.`;
          }
        }
      }).catch(() => {});
    }

    if (typeof sessionStorage !== "undefined") {
      const dismissed = sessionStorage.getItem("localjam_dismissed_version");
      if (dismissed && dismissed === currentBannerVersion && currentBannerVersion !== "New Release") {
        return;
      }
      const applied = sessionStorage.getItem("localjam_applied_update");
      if (applied) {
        try {
          const { version, timestamp } = JSON.parse(applied);
          // If this version was applied within the last 30 seconds, suppress re-prompting
          // to give the browser Service Worker and cache time to settle
          if (version === currentBannerVersion && Date.now() - timestamp < 30000) {
            return;
          }
        } catch (_) {}
      }
    }

    if (msgEl) {
      const isNamed = currentBannerVersion && currentBannerVersion !== "New Release";
      msgEl.textContent = isNamed
        ? `A new version of LocalJam (${currentBannerVersion}) is ready.`
        : `A new version of LocalJam is ready.`;
    }

    // Toggle "Notify Me" button visibility based on permission state
    if (alertBtn && alertBtn.style) {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        alertBtn.style.display = "inline-flex";
      } else {
        alertBtn.style.display = "none";
      }
    }

    container.style.display = "block";

    // Attempt native browser notification if permission is already granted
    dispatchNativeUpdateNotification(currentBannerVersion, {
      registration: null,
      onApply: applyUpdate
    }).catch(() => {});
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

    if (typeof sessionStorage !== "undefined" && currentBannerVersion) {
      try {
        sessionStorage.setItem("localjam_applied_update", JSON.stringify({
          version: currentBannerVersion,
          timestamp: Date.now()
        }));
      } catch (_) {}
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
            .filter((k) => k.startsWith("localjam-") && (targetCache ? k !== targetCache : true))
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
    }, 2500);
  }

  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      applyUpdate();
    });
  }

  if (alertBtn && typeof alertBtn.addEventListener === "function") {
    alertBtn.addEventListener("click", async () => {
      const perm = await requestNotificationPermission();
      if (perm === "granted") {
        if (alertBtn.style) alertBtn.style.display = "none";
        if (typeof onToast === "function") {
          onToast("[UPDATE ALERTS: ENABLED]");
        }
        dispatchNativeUpdateNotification(currentBannerVersion, {
          onApply: applyUpdate
        }).catch(() => {});
      } else if (perm === "denied") {
        if (alertBtn.style) alertBtn.style.display = "none";
        if (typeof onToast === "function") {
          onToast("[ALERTS: BLOCKED IN BROWSER]");
        }
      }
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
  let isDestroyed = false;
  let notifiedVersion = null;
  let notifiedWorker = null;
  let activeVersion = currentVersion;
  let intervalId = null;
  let initialTimeoutId = null;
  let activeRegistration = registration || null;

  const notifyUpdate = (newVersion, worker = null) => {
    if (isDestroyed) return;
    const effectiveVersion =
      newVersion === "New Release" && notifiedVersion && notifiedVersion !== "New Release"
        ? notifiedVersion
        : newVersion;

    if (notifiedVersion && notifiedVersion === effectiveVersion && notifiedWorker && !worker) {
      return;
    }
    if (notifiedVersion && notifiedVersion === effectiveVersion && notifiedWorker === worker) {
      return;
    }
    notifiedVersion = effectiveVersion;
    if (worker) {
      notifiedWorker = worker;
    }
    if (typeof onUpdateReady === "function") {
      onUpdateReady(effectiveVersion, notifiedWorker || worker);
    }
  };

  // 1. Service Worker updatefound, installing, and waiting listeners
  const bindRegistration = (reg) => {
    if (!reg || isDestroyed) return;
    activeRegistration = reg;

    if (reg.waiting) {
      notifyUpdate("New Release", reg.waiting);
      checkRemoteVersion(activeVersion).then((resolved) => {
        if (resolved && !isDestroyed) {
          notifyUpdate(resolved, reg.waiting);
        }
      }).catch(() => {});
    }
    if (reg.installing) {
      const currentInstalling = reg.installing;
      currentInstalling.addEventListener("statechange", () => {
        if (isDestroyed) return;
        const hasController = typeof navigator !== "undefined" && navigator.serviceWorker ? navigator.serviceWorker.controller : true;
        if (currentInstalling.state === "installed" && hasController) {
          notifyUpdate("New Release", currentInstalling);
          checkRemoteVersion(activeVersion).then((resolved) => {
            if (resolved && !isDestroyed) {
              notifyUpdate(resolved, currentInstalling);
            }
          }).catch(() => {});
        }
      });
    }

    if (typeof reg.addEventListener === "function") {
      reg.addEventListener("updatefound", () => {
        if (isDestroyed) return;
        const installing = reg.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (isDestroyed) return;
          const hasController = typeof navigator !== "undefined" && navigator.serviceWorker ? navigator.serviceWorker.controller : true;
          if (installing.state === "installed" && hasController) {
            notifyUpdate("New Release", installing);
            checkRemoteVersion(activeVersion).then((resolved) => {
              if (resolved && !isDestroyed) {
                notifyUpdate(resolved, installing);
              }
            }).catch(() => {});
          }
        });
      });
    }
  };

  if (registration) {
    bindRegistration(registration);
  } else if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    if (typeof navigator.serviceWorker.getRegistration === "function") {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && !activeRegistration && !isDestroyed) {
          bindRegistration(reg);
        }
      }).catch(() => {});
    }
    if (navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => {
        if (reg && !isDestroyed) {
          bindRegistration(reg);
        }
      }).catch(() => {});
    }
  }

  let swMessageListener = null;
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof navigator.serviceWorker.addEventListener === "function"
  ) {
    swMessageListener = (event) => {
      if (isDestroyed) return;
      if (event.data?.type === "VERSION" && event.data.version) {
        if (event.data.version !== activeVersion) {
          notifyUpdate(event.data.version, activeRegistration?.waiting || null);
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", swMessageListener);
  }

  // 2. Periodic, window focus, and visibility change remote version check
  const poll = async () => {
    if (isDestroyed) return;
    // Actively prompt browser Service Worker update check if registration is available
    const reg = activeRegistration || registration;
    if (reg && typeof reg.update === "function") {
      try {
        await reg.update();
      } catch {
        // Ignore network / update errors
      }
    }
    if (isDestroyed) return;

    const newVersion = await checkRemoteVersion(activeVersion);
    if (newVersion && !isDestroyed) {
      const worker = reg ? (reg.waiting || reg.installing) : null;
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
    isDestroyed = true;
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
    if (
      swMessageListener &&
      typeof navigator !== "undefined" &&
      navigator.serviceWorker &&
      typeof navigator.serviceWorker.removeEventListener === "function"
    ) {
      navigator.serviceWorker.removeEventListener("message", swMessageListener);
      swMessageListener = null;
    }
  };

  return { poll, setActiveVersion, setRegistration: bindRegistration, destroy };
}
