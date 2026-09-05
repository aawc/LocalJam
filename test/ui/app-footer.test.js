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

    footerComponent.open();
    assert.equal(modalMock.style.display, "flex");

    footerComponent.close();
    assert.equal(modalMock.style.display, "none");
  } finally {
    globalThis.document = prevDoc;
  }
});
