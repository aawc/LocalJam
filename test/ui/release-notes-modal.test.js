import test from "node:test";
import assert from "node:assert/strict";
import { createReleaseNotesModal } from "../../src/ui/components/release-notes-modal.js";
import { CURRENT_RELEASE } from "../../src/version.js";

test("Release Notes Modal Suite", async (t) => {
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

    const notesComponent = createReleaseNotesModal();
    assert.ok(notesComponent.element);
    assert.equal(typeof notesComponent.open, "function");
    assert.equal(typeof notesComponent.close, "function");
    assert.equal(typeof notesComponent.updateVersion, "function");

    // Verify modal overlay presence
    assert.ok(notesComponent.element.innerHTML.includes("release-notes-modal"));
    assert.ok(!notesComponent.element.innerHTML.includes("[LOCAL-FIRST]"), "Modal wrapper must not contain [LOCAL-FIRST]");
    assert.ok(!notesComponent.element.innerHTML.includes("Zero tracking"), "Modal wrapper must not contain Zero tracking");

    notesComponent.open();
    assert.equal(modalMock.style.display, "flex");

    notesComponent.close();
    assert.equal(modalMock.style.display, "none");

    // Test updateVersion dynamic synchronization
    const modalSubtitleMock = { textContent: "" };
    const commitsListMock = { innerHTML: "" };

    notesComponent.element.querySelector = (sel) => {
      if (sel === ".modal-subtitle") return modalSubtitleMock;
      if (sel === ".release-commits-list") return commitsListMock;
      return null;
    };

    notesComponent.updateVersion({
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
