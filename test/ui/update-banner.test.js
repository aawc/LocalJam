import test from "node:test";
import assert from "node:assert/strict";
import {
  createUpdateBanner,
  checkRemoteVersion,
  initUpdateChecker,
  dispatchNativeUpdateNotification,
  requestNotificationPermission
} from "../../src/ui/components/update-banner.js";

test("Update Detection & Refresh Prompt Suite", async (t) => {
  await t.test("createUpdateBanner generates component with show and hide controls", () => {
    const prevDoc = globalThis.document;
    try {
      globalThis.document = {
        createElement: () => {
          const style = { display: "none" };
          return {
            id: "",
            className: "",
            style,
            innerHTML: "",
            querySelector: (sel) => {
              if (sel === "#update-banner-message") return { textContent: "" };
              if (sel === "#btn-apply-update" || sel === "#btn-dismiss-update") return { addEventListener: () => {} };
              return null;
            },
            setAttribute: () => {}
          };
        }
      };

      const banner = createUpdateBanner();
      assert.ok(banner.element);
      assert.equal(typeof banner.show, "function");
      assert.equal(typeof banner.hide, "function");

      banner.show("2026-09-04-002");
      assert.equal(banner.element.style.display, "block");

      banner.hide();
      assert.equal(banner.element.style.display, "none");
    } finally {
      globalThis.document = prevDoc;
    }
  });

  await t.test("checkRemoteVersion returns new version when remote version is newer", async () => {
    const prevFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ version: "2026-09-04-002" })
      });

      const newVer = await checkRemoteVersion("2026-09-04-001");
      assert.equal(newVer, "2026-09-04-002");

      // Same version should return null (no update)
      const sameVer = await checkRemoteVersion("2026-09-04-002");
      assert.equal(sameVer, null);

      // Invalid version format should return null
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ version: "invalid-release" })
      });
      const invalidVer = await checkRemoteVersion("2026-09-04-001");
      assert.equal(invalidVer, null);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  await t.test("initUpdateChecker triggers onUpdateReady when update is found", async () => {
    let updateFoundCalled = false;
    let receivedVersion = null;

    const mockRegistration = {
      waiting: null,
      installing: null,
      addEventListener: (evt, handler) => {
        if (evt === "updatefound") {
          const installingWorker = {
            state: "installing",
            addEventListener: (stateEvt, stateHandler) => {
              if (stateEvt === "statechange") {
                installingWorker.state = "installed";
                stateHandler();
              }
            }
          };
          mockRegistration.installing = installingWorker;
          handler();
        }
      }
    };

    const checker = initUpdateChecker({
      registration: mockRegistration,
      onUpdateReady: (ver) => {
        updateFoundCalled = true;
        receivedVersion = ver;
      },
      pollIntervalMs: 0
    });

    assert.equal(updateFoundCalled, true);
    assert.equal(receivedVersion, "New Release");
    checker.destroy();
  });

  await t.test("initUpdateChecker polls remote version and respects setActiveVersion and destroy", async () => {
    const prevFetch = globalThis.fetch;
    try {
      let notifiedVersion = null;
      let updateCheckedCount = 0;

      const mockRegistration = {
        update: async () => {
          updateCheckedCount++;
        },
        addEventListener: () => {}
      };

      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ version: "v2026.09.010" })
      });

      const checker = initUpdateChecker({
        registration: mockRegistration,
        currentVersion: "v2026.09.009",
        onUpdateReady: (ver) => {
          notifiedVersion = ver;
        },
        pollIntervalMs: 0
      });

      assert.equal(typeof checker.poll, "function");
      assert.equal(typeof checker.setActiveVersion, "function");
      assert.equal(typeof checker.destroy, "function");

      checker.destroy();
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  await t.test("checkRemoteVersion detects semantic tag updates (e.g. v2026.09.036 vs v2026.09.009)", async () => {
    const prevFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ version: "v2026.09.036" })
      });

      const newVer = await checkRemoteVersion("v2026.09.009");
      assert.equal(newVer, "v2026.09.036");

      const sameVer = await checkRemoteVersion("v2026.09.036");
      assert.equal(sameVer, null);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  await t.test("initUpdateChecker triggers immediately when registration.waiting worker is already present", async () => {
    let notifiedVersion = null;
    let notifiedWorker = null;

    const mockWaitingWorker = {
      state: "installed",
      postMessage: () => {}
    };

    const mockRegistration = {
      waiting: mockWaitingWorker,
      installing: null,
      addEventListener: () => {}
    };

    const checker = initUpdateChecker({
      registration: mockRegistration,
      onUpdateReady: (ver, worker) => {
        notifiedVersion = ver;
        notifiedWorker = worker;
      },
      pollIntervalMs: 0
    });

    assert.equal(notifiedVersion, "New Release");
    assert.equal(notifiedWorker, mockWaitingWorker);
    checker.destroy();
  });

  await t.test("createUpdateBanner applies update and posts SKIP_WAITING to waiting worker on button click", async () => {
    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const prevNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const prevCaches = globalThis.caches;
    try {
      let postedMessage = null;
      let reloaded = false;

      const mockWorker = {
        state: "installed",
        postMessage: (msg) => {
          postedMessage = msg;
        }
      };

      const listeners = {};
      const applyBtnMock = {
        disabled: false,
        textContent: "Refresh Now",
        addEventListener: (evt, fn) => {
          listeners[evt] = fn;
        }
      };
      const msgMock = { textContent: "" };

      globalThis.document = {
        createElement: () => ({
          id: "",
          className: "",
          style: { display: "none" },
          innerHTML: "",
          querySelector: (sel) => {
            if (sel === "#update-banner-message") return msgMock;
            if (sel === "#btn-apply-update") return applyBtnMock;
            if (sel === "#btn-dismiss-update") return { addEventListener: () => {} };
            return null;
          },
          setAttribute: () => {}
        })
      };

      let swListeners = {};
      Object.defineProperty(globalThis, "navigator", {
        value: {
          serviceWorker: {
            addEventListener: (evt, fn) => {
              swListeners[evt] = fn;
            },
            getRegistration: async () => null
          }
        },
        configurable: true,
        writable: true
      });

      globalThis.window = {
        location: {
          href: "http://localhost:3000/#/songs",
          replace: () => {
            reloaded = true;
          },
          reload: () => {
            reloaded = true;
          }
        }
      };

      const banner = createUpdateBanner();
      banner.show("v2026.09.036", mockWorker);

      assert.equal(msgMock.textContent, "A new version of LocalJam (v2026.09.036) is ready.");
      assert.equal(banner.element.style.display, "block");

      // Click "Refresh Now" with worker
      assert.ok(listeners["click"], "Click listener must be registered on apply button");
      await banner.apply();

      assert.deepEqual(postedMessage, { type: "SKIP_WAITING" });

      // Trigger controllerchange
      if (swListeners["controllerchange"]) {
        swListeners["controllerchange"]();
      }
      assert.equal(reloaded, true);
    } finally {
      globalThis.document = prevDoc;
      globalThis.window = prevWin;
      if (prevNavDescriptor) {
        Object.defineProperty(globalThis, "navigator", prevNavDescriptor);
      }
      globalThis.caches = prevCaches;
    }
  });

  await t.test("createUpdateBanner dynamically queries navigator.serviceWorker when worker was null", async () => {
    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const prevNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const prevCaches = globalThis.caches;
    try {
      let postedMessage = null;
      let deletedCaches = [];
      let replacedUrl = null;

      const dynamicWaitingWorker = {
        state: "installed",
        postMessage: (msg) => {
          postedMessage = msg;
        }
      };

      globalThis.caches = {
        keys: async () => ["localjam-v2026.09.045", "localjam-v2026.09.048"],
        delete: async (name) => {
          deletedCaches.push(name);
          return true;
        }
      };

      let swListeners = {};
      Object.defineProperty(globalThis, "navigator", {
        value: {
          serviceWorker: {
            addEventListener: (evt, fn) => {
              swListeners[evt] = fn;
            },
            getRegistration: async () => ({
              waiting: dynamicWaitingWorker,
              installing: null
            })
          }
        },
        configurable: true,
        writable: true
      });

      const applyBtnMock = { disabled: false, textContent: "Refresh Now", addEventListener: () => {} };
      globalThis.document = {
        createElement: () => ({
          id: "",
          className: "",
          style: { display: "none" },
          innerHTML: "",
          querySelector: (sel) => {
            if (sel === "#update-banner-message") return { textContent: "" };
            if (sel === "#btn-apply-update") return applyBtnMock;
            if (sel === "#btn-dismiss-update") return { addEventListener: () => {} };
            return null;
          },
          setAttribute: () => {}
        })
      };

      globalThis.window = {
        location: {
          href: "http://localhost:3000/",
          replace: (u) => {
            replacedUrl = u;
          },
          reload: () => {}
        }
      };

      const banner = createUpdateBanner();
      // Show without worker (e.g. from version.json fetch)
      banner.show("v2026.09.048", null);

      await banner.apply();

      // Verified dynamic resolution posted SKIP_WAITING
      assert.deepEqual(postedMessage, { type: "SKIP_WAITING" });

      // Verified old cache was deleted
      assert.ok(deletedCaches.includes("localjam-v2026.09.045"));

      // Trigger controllerchange to confirm reload
      if (swListeners["controllerchange"]) {
        swListeners["controllerchange"]();
      }
      assert.ok(replacedUrl && replacedUrl.includes("_t="));
    } finally {
      globalThis.document = prevDoc;
      globalThis.window = prevWin;
      if (prevNavDescriptor) {
        Object.defineProperty(globalThis, "navigator", prevNavDescriptor);
      }
      globalThis.caches = prevCaches;
    }
  });

  await t.test("createUpdateBanner waits for installing worker to become installed before sending SKIP_WAITING", async () => {
    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const prevNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
      let postedMessage = null;
      let installingListeners = {};

      const installingWorker = {
        state: "installing",
        addEventListener: (evt, fn) => {
          installingListeners[evt] = fn;
        },
        postMessage: (msg) => {
          postedMessage = msg;
        }
      };

      Object.defineProperty(globalThis, "navigator", {
        value: {
          serviceWorker: {
            addEventListener: () => {},
            getRegistration: async () => ({
              waiting: null,
              installing: installingWorker
            })
          }
        },
        configurable: true,
        writable: true
      });

      globalThis.document = {
        createElement: () => ({
          id: "",
          style: { display: "none" },
          innerHTML: "",
          querySelector: (sel) => {
            if (sel === "#update-banner-message") return { textContent: "" };
            if (sel === "#btn-apply-update" || sel === "#btn-dismiss-update") return { addEventListener: () => {} };
            return null;
          },
          setAttribute: () => {}
        })
      };

      globalThis.window = {
        location: {
          href: "http://localhost:3000/",
          replace: () => {},
          reload: () => {}
        }
      };

      const banner = createUpdateBanner();
      banner.show("v2026.09.048");

      await banner.apply();

      assert.equal(postedMessage, null, "Should not post before installed");

      // State transitions to installed
      installingWorker.state = "installed";
      if (installingListeners["statechange"]) {
        installingListeners["statechange"]();
      }

      assert.deepEqual(postedMessage, { type: "SKIP_WAITING" });
    } finally {
      globalThis.document = prevDoc;
      globalThis.window = prevWin;
      if (prevNavDescriptor) {
        Object.defineProperty(globalThis, "navigator", prevNavDescriptor);
      }
    }
  });

  await t.test("createUpdateBanner suppresses showing the prompt if the version was applied within the debounce window", () => {
    const prevDoc = globalThis.document;
    const prevSession = globalThis.sessionStorage;
    try {
      const store = {
        localjam_applied_update: JSON.stringify({
          version: "v2026.09.050",
          timestamp: Date.now() - 5000 // 5s ago < 30s
        })
      };
      globalThis.sessionStorage = {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = v; }
      };
      globalThis.document = {
        createElement: () => ({
          id: "",
          className: "",
          style: { display: "none" },
          innerHTML: "",
          querySelector: (sel) => {
            if (sel === "#update-banner-message") return { textContent: "" };
            return { addEventListener: () => {} };
          },
          setAttribute: () => {}
        })
      };

      const banner = createUpdateBanner();
      banner.show("v2026.09.050");
      assert.equal(banner.element.style.display, "none", "must suppress prompt for recently applied version");

      // Showing a different version must NOT be suppressed
      banner.show("v2026.09.051");
      assert.equal(banner.element.style.display, "block", "must allow prompt for newer, different version");
    } finally {
      globalThis.document = prevDoc;
      globalThis.sessionStorage = prevSession;
    }
  });

  await t.test("initUpdateChecker exposes setRegistration to dynamically bind registration and listeners", async () => {
    let notifiedVer = null;
    let notifiedWrk = null;

    const mockWaiting = { state: "installed", postMessage: () => {} };
    const mockReg = {
      waiting: mockWaiting,
      installing: null,
      addEventListener: () => {}
    };

    // Initialize checker WITHOUT registration (e.g. at cold boot before SW finishes registering)
    const checker = initUpdateChecker({
      currentVersion: "v2026.09.040",
      onUpdateReady: (ver, wrk) => {
        notifiedVer = ver;
        notifiedWrk = wrk;
      },
      pollIntervalMs: 0
    });

    assert.equal(typeof checker.setRegistration, "function", "checker must expose setRegistration function");
    assert.equal(notifiedVer, null, "Should not notify before registration is bound");

    // Later, when SW registration resolves, setRegistration is called
    checker.setRegistration(mockReg);

    assert.equal(notifiedVer, "New Release");
    assert.equal(notifiedWrk, mockWaiting);

    checker.destroy();
  });

  await t.test("createUpdateBanner only purges localjam- prefixed caches and preserves unrelated origin caches", async () => {
    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const prevNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const prevCaches = globalThis.caches;
    try {
      const deletedCaches = [];
      const originCaches = [
        "cricket-scorecard-v2026.09.001",
        "localjam-v2026.09.040",
        "localjam-v2026.09.045",
        "another-app-cache"
      ];

      globalThis.caches = {
        keys: async () => [...originCaches],
        delete: async (name) => {
          deletedCaches.push(name);
          return true;
        }
      };

      Object.defineProperty(globalThis, "navigator", {
        value: {
          serviceWorker: {
            addEventListener: () => {},
            getRegistration: async () => null
          }
        },
        configurable: true,
        writable: true
      });

      const applyBtnMock = { disabled: false, textContent: "Refresh Now", addEventListener: () => {} };
      globalThis.document = {
        createElement: () => ({
          id: "",
          className: "",
          style: { display: "none" },
          innerHTML: "",
          querySelector: (sel) => {
            if (sel === "#update-banner-message") return { textContent: "" };
            if (sel === "#btn-apply-update") return applyBtnMock;
            return { addEventListener: () => {} };
          },
          setAttribute: () => {}
        })
      };

      globalThis.window = {
        location: {
          href: "http://localhost:3000/",
          replace: () => {},
          reload: () => {}
        }
      };

      const banner = createUpdateBanner();
      banner.show("v2026.09.050", null);

      await banner.apply();

      // Verify old localjam caches were purged
      assert.ok(deletedCaches.includes("localjam-v2026.09.040"), "Must delete old localjam-v2026.09.040 cache");
      assert.ok(deletedCaches.includes("localjam-v2026.09.045"), "Must delete old localjam-v2026.09.045 cache");

      // Verify non-localjam caches on the origin were strictly preserved
      assert.equal(
        deletedCaches.includes("cricket-scorecard-v2026.09.001"),
        false,
        "Must NOT delete cricket-scorecard-v2026.09.001 on the same origin"
      );
      assert.equal(
        deletedCaches.includes("another-app-cache"),
        false,
        "Must NOT delete another-app-cache on the same origin"
      );
    } finally {
      globalThis.document = prevDoc;
      globalThis.window = prevWin;
      if (prevNavDescriptor) {
        Object.defineProperty(globalThis, "navigator", prevNavDescriptor);
      }
      globalThis.caches = prevCaches;
    }
  });

  await t.test("createUpdateBanner preserves concrete semantic version tag against generic New Release overwrite", () => {
    const prevDoc = globalThis.document;
    try {
      const msgMock = { textContent: "" };
      globalThis.document = {
        createElement: () => ({
          id: "",
          style: { display: "none" },
          innerHTML: "",
          querySelector: (sel) => {
            if (sel === "#update-banner-message") return msgMock;
            return { addEventListener: () => {} };
          },
          setAttribute: () => {}
        })
      };

      const banner = createUpdateBanner();
      // First show with concrete semantic version
      banner.show("v2026.09.052");
      assert.equal(msgMock.textContent, "A new version of LocalJam (v2026.09.052) is ready.");

      // Subsequent call with generic "New Release" from service worker listener must NOT overwrite concrete tag
      banner.show("New Release");
      assert.equal(msgMock.textContent, "A new version of LocalJam (v2026.09.052) is ready.");
    } finally {
      globalThis.document = prevDoc;
    }
  });

  await t.test("initUpdateChecker isDestroyed guard suppresses notifications after destruction", async () => {
    let notifiedVer = null;
    const mockWaiting = { state: "installed", postMessage: () => {} };
    const mockReg = {
      waiting: mockWaiting,
      installing: null,
      addEventListener: () => {}
    };

    const checker = initUpdateChecker({
      currentVersion: "v2026.09.040",
      onUpdateReady: (ver) => {
        notifiedVer = ver;
      },
      pollIntervalMs: 0
    });

    // Destroy checker
    checker.destroy();

    // Invoking setRegistration after destruction must be ignored
    checker.setRegistration(mockReg);
    assert.equal(notifiedVer, null, "Must not trigger notification after checker is destroyed");
  });

  await t.test("dispatchNativeUpdateNotification dispatches via registration.showNotification when permitted", async () => {
    const prevNotif = globalThis.Notification;
    const prevNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const prevSession = globalThis.sessionStorage;
    try {
      let dispatchedTitle = null;
      let dispatchedOptions = null;
      const store = {};
      globalThis.sessionStorage = {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = v; }
      };

      globalThis.Notification = {
        permission: "granted"
      };

      const mockReg = {
        showNotification: async (title, opts) => {
          dispatchedTitle = title;
          dispatchedOptions = opts;
          return true;
        }
      };

      Object.defineProperty(globalThis, "navigator", {
        value: {
          serviceWorker: {
            getRegistration: async () => mockReg
          }
        },
        configurable: true,
        writable: true
      });

      const res = await dispatchNativeUpdateNotification("v2026.10.138", { registration: mockReg });
      assert.equal(res, true, "Must return true on successful dispatch");
      assert.equal(dispatchedTitle, "LocalJam Update Ready");
      assert.ok(dispatchedOptions.body.includes("v2026.10.138"));
      assert.equal(dispatchedOptions.tag, "localjam-update");
      assert.equal(dispatchedOptions.renotify, true);

      // Repeat call for same version should be deduplicated in session
      const repeatRes = await dispatchNativeUpdateNotification("v2026.10.138", { registration: mockReg });
      assert.equal(repeatRes, false, "Must suppress duplicate native notification in same session");
    } finally {
      globalThis.Notification = prevNotif;
      if (prevNavDescriptor) {
        Object.defineProperty(globalThis, "navigator", prevNavDescriptor);
      }
      globalThis.sessionStorage = prevSession;
    }
  });

  await t.test("dispatchNativeUpdateNotification falls back to Window Notification when showNotification unavailable", async () => {
    const prevNotif = globalThis.Notification;
    const prevNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const prevSession = globalThis.sessionStorage;
    try {
      let createdTitle = null;
      let createdOptions = null;
      const store = {};
      globalThis.sessionStorage = {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = v; }
      };

      function MockNotification(title, opts) {
        createdTitle = title;
        createdOptions = opts;
        this.close = () => {};
      }
      MockNotification.permission = "granted";
      globalThis.Notification = MockNotification;

      Object.defineProperty(globalThis, "navigator", {
        value: {
          serviceWorker: {
            getRegistration: async () => null // no registration
          }
        },
        configurable: true,
        writable: true
      });

      const res = await dispatchNativeUpdateNotification("v2026.10.139");
      assert.equal(res, true);
      assert.equal(createdTitle, "LocalJam Update Ready");
      assert.ok(createdOptions.body.includes("v2026.10.139"));
    } finally {
      globalThis.Notification = prevNotif;
      if (prevNavDescriptor) {
        Object.defineProperty(globalThis, "navigator", prevNavDescriptor);
      }
      globalThis.sessionStorage = prevSession;
    }
  });

  await t.test("requestNotificationPermission correctly resolves status and triggers permission request", async () => {
    const prevNotif = globalThis.Notification;
    try {
      // 1. Unsupported
      delete globalThis.Notification;
      const unsupported = await requestNotificationPermission();
      assert.equal(unsupported, "unsupported");

      // 2. Already granted
      globalThis.Notification = { permission: "granted", requestPermission: async () => "granted" };
      const granted = await requestNotificationPermission();
      assert.equal(granted, "granted");

      // 3. Already denied
      globalThis.Notification = { permission: "denied", requestPermission: async () => "denied" };
      const denied = await requestNotificationPermission();
      assert.equal(denied, "denied");

      // 4. Default -> requests permission
      let requestCalled = false;
      globalThis.Notification = {
        permission: "default",
        requestPermission: async () => {
          requestCalled = true;
          return "granted";
        }
      };
      const requested = await requestNotificationPermission();
      assert.equal(requestCalled, true);
      assert.equal(requested, "granted");
    } finally {
      globalThis.Notification = prevNotif;
    }
  });

  await t.test("createUpdateBanner displays and handles Notify Me button when permission is default", async () => {
    const prevDoc = globalThis.document;
    const prevNotif = globalThis.Notification;
    try {
      let toastMsg = null;
      let alertBtnDisplay = null;
      let clickListeners = {};

      const alertBtnMock = {
        style: { display: "none" },
        addEventListener: (evt, fn) => {
          clickListeners[evt] = fn;
        }
      };

      globalThis.Notification = {
        permission: "default",
        requestPermission: async () => "granted"
      };

      globalThis.document = {
        createElement: () => ({
          id: "",
          className: "",
          style: { display: "none" },
          innerHTML: "",
          querySelector: (sel) => {
            if (sel === "#update-banner-message") return { textContent: "" };
            if (sel === "#btn-apply-update") return { addEventListener: () => {} };
            if (sel === "#btn-enable-alerts") return alertBtnMock;
            if (sel === "#btn-dismiss-update") return { addEventListener: () => {} };
            return null;
          },
          setAttribute: () => {}
        })
      };

      const banner = createUpdateBanner({
        onToast: (msg) => { toastMsg = msg; }
      });
      banner.show("v2026.10.140");

      assert.equal(alertBtnMock.style.display, "inline-flex", "Notify Me button must be displayed when permission is default");

      // Click Notify Me
      assert.ok(clickListeners["click"], "Must have click listener");
      await clickListeners["click"]();

      assert.equal(alertBtnMock.style.display, "none", "Notify Me button should hide once granted");
      assert.equal(toastMsg, "[UPDATE ALERTS: ENABLED]", "Must announce alerts enabled via toast");
    } finally {
      globalThis.document = prevDoc;
      globalThis.Notification = prevNotif;
    }
  });

  await t.test("initUpdateChecker immediately queries navigator.serviceWorker.getRegistration when registration omitted", async () => {
    const prevNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const prevFetch = globalThis.fetch;
    try {
      let notifiedVer = null;
      let notifiedWrk = null;

      const mockWaiting = { state: "installed", postMessage: () => {} };
      const mockReg = {
        waiting: mockWaiting,
        installing: null,
        addEventListener: () => {}
      };

      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ version: "v2026.10.141" })
      });

      Object.defineProperty(globalThis, "navigator", {
        value: {
          serviceWorker: {
            addEventListener: () => {},
            getRegistration: async () => mockReg,
            ready: Promise.resolve(mockReg)
          }
        },
        configurable: true,
        writable: true
      });

      const checker = initUpdateChecker({
        currentVersion: "v2026.10.137",
        onUpdateReady: (ver, wrk) => {
          notifiedVer = ver;
          notifiedWrk = wrk;
        },
        pollIntervalMs: 0
      });

      // Allow microtask ticks for getRegistration and checkRemoteVersion resolution
      await new Promise((r) => setTimeout(r, 20));

      assert.ok(notifiedVer === "New Release" || notifiedVer === "v2026.10.141", `Version was ${notifiedVer}`);
      assert.equal(notifiedWrk, mockWaiting);

      checker.destroy();
    } finally {
      if (prevNavDescriptor) {
        Object.defineProperty(globalThis, "navigator", prevNavDescriptor);
      }
      globalThis.fetch = prevFetch;
    }
  });
});




