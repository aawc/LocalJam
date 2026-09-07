import test from "node:test";
import assert from "node:assert/strict";
import {
  createUpdateBanner,
  checkRemoteVersion,
  initUpdateChecker
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
});

