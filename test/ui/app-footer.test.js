import test from "node:test";
import assert from "node:assert/strict";
import { createAppFooter } from "../../src/ui/components/app-footer.js";
import { CURRENT_RELEASE } from "../../src/version.js";

test("App Footer & Release Notes Modal Suite", async (t) => {
  // Setup minimal DOM mock if in Node
  const prevDoc = globalThis.document;
  try {
    const listeners = {};
    const modalMock = { id: "release-notes-modal", style: { display: "none" }, addEventListener: (evt, fn) => { listeners[evt] = fn; } };
    const openBtnMock = { id: "btn-open-release-notes", addEventListener: (evt, fn) => { listeners[evt] = fn; }, focus: () => {} };
    const closeBtnMock = { id: "btn-close-release-notes", addEventListener: (evt, fn) => { listeners[evt] = fn; } };
    const doneBtnMock = { id: "btn-done-release-notes", addEventListener: (evt, fn) => { listeners[evt] = fn; }, focus: () => {} };

    globalThis.document = {
      createElement: (tag) => {
        const children = [];
        const el = {
          tagName: tag.toUpperCase(),
          id: "",
          className: "",
          style: {},
          innerHTML: "",
          querySelector: (sel) => {
            if (sel === "#release-notes-modal") return modalMock;
            if (sel === "#btn-open-release-notes") return openBtnMock;
            if (sel === "#btn-close-release-notes") return closeBtnMock;
            if (sel === "#btn-done-release-notes") return doneBtnMock;
            return null;
          },
          querySelectorAll: () => [],
          appendChild: (c) => children.push(c),
          addEventListener: (evt, fn) => { listeners[evt] = fn; },
          setAttribute: () => {},
          getAttribute: () => null
        };
        return el;
      }
    };

    const footerComponent = createAppFooter();
    assert.ok(footerComponent.element);
    assert.equal(typeof footerComponent.open, "function");
    assert.equal(typeof footerComponent.close, "function");
    assert.equal(typeof footerComponent.updateVersion, "function");

    // Verify modal overlay presence
    assert.ok(footerComponent.element.innerHTML.includes("release-notes-modal"));
    assert.ok(!footerComponent.element.innerHTML.includes("[LOCAL-FIRST]"), "Modal wrapper must not contain [LOCAL-FIRST]");
    assert.ok(!footerComponent.element.innerHTML.includes("Zero tracking"), "Modal wrapper must not contain Zero tracking");

    footerComponent.open();
    assert.equal(modalMock.style.display, "flex");

    footerComponent.close();
    assert.equal(modalMock.style.display, "none");

    // Test updateVersion dynamic synchronization
    const modalSubtitleMock = { textContent: "" };
    const commitsListMock = { innerHTML: "" };

    footerComponent.element.querySelector = (sel) => {
      if (sel === ".modal-subtitle") return modalSubtitleMock;
      if (sel === ".release-commits-list") return commitsListMock;
      return null;
    };

    footerComponent.updateVersion({
      version: "v2026.09.008",
      releaseDate: "2026-09-04",
      commits: ["0fbf4ff", "7df8d9d"]
    });

    assert.equal(modalSubtitleMock.textContent, "LocalJam Version v2026.09.008 • 2026-09-04");
    assert.ok(commitsListMock.innerHTML.includes("0fbf4ff"));
    assert.ok(commitsListMock.innerHTML.includes("7df8d9d"));
  } finally {
    globalThis.document = prevDoc;
  }
});
