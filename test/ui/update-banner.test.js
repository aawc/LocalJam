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

    initUpdateChecker({
      registration: mockRegistration,
      onUpdateReady: (ver) => {
        updateFoundCalled = true;
        receivedVersion = ver;
      },
      pollIntervalMs: 0
    });

    assert.equal(updateFoundCalled, true);
    assert.equal(receivedVersion, "New Release");
  });
});
