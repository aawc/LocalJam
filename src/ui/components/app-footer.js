/**
 * LocalJam - Persistent Application Release Footer & Release Notes Modal Component
 */

import { CURRENT_RELEASE } from "../../version.js";
import { escapeHtml } from "../../utils/sanitize.js";

export function createAppFooter() {
  const container = document.createElement("div");
  container.id = "release-notes-dialog-wrapper";

  container.innerHTML = `
    <!-- Release Notes Modal Dialog -->
    <div id="release-notes-modal" class="modal-overlay" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="release-notes-title">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <h2 id="release-notes-title" class="modal-title">Release Notes</h2>
            <div class="modal-subtitle">LocalJam Version ${CURRENT_RELEASE.version} • ${CURRENT_RELEASE.releaseDate}</div>
          </div>
          <button id="btn-close-release-notes" class="btn-close" aria-label="Close Release Notes">&times;</button>
        </div>

        <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
          <div class="release-section">
            <h3 class="release-section-title">Highlights & Updates</h3>
            <ul class="release-highlights-list">
              ${CURRENT_RELEASE.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
            </ul>
          </div>

          <div class="release-section" style="margin-top: 20px;">
            <h3 class="release-section-title">Included Commits</h3>
            <div class="release-commits-list">
              ${CURRENT_RELEASE.commits
                .map(
                  (c) => `
                <div class="commit-item">
                  <code class="commit-hash">[${c.hash}]</code>
                  <span class="commit-msg">${escapeHtml(c.message)}</span>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button id="btn-done-release-notes" class="btn btn-primary">Close</button>
        </div>
      </div>
    </div>
  `;

  const modal = container.querySelector("#release-notes-modal");
  const closeBtn = container.querySelector("#btn-close-release-notes");
  const doneBtn = container.querySelector("#btn-done-release-notes");

  function openModal() {
    if (modal) {
      modal.style.display = "flex";
      if (doneBtn) doneBtn.focus();
    }
  }

  function closeModal() {
    if (modal) {
      modal.style.display = "none";
    }
  }

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (doneBtn) doneBtn.addEventListener("click", closeModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  function updateVersion(versionData) {
    if (!versionData || typeof versionData !== "object") return;
    const version = versionData.version || CURRENT_RELEASE.version;
    const releaseDate = versionData.releaseDate || CURRENT_RELEASE.releaseDate;

    const modalSubtitle = container.querySelector(".modal-subtitle");
    if (modalSubtitle) {
      modalSubtitle.textContent = `LocalJam Version ${version} • ${releaseDate}`;
    }

    if (Array.isArray(versionData.commits) && versionData.commits.length > 0) {
      const commitsList = container.querySelector(".release-commits-list");
      if (commitsList) {
        commitsList.innerHTML = versionData.commits
          .map((c) => {
            const hash = typeof c === "string" ? c : c.hash;
            const msg = typeof c === "string" ? "" : c.message;
            return `
              <div class="commit-item">
                <code class="commit-hash">[${escapeHtml(hash)}]</code>
                ${msg ? `<span class="commit-msg">${escapeHtml(msg)}</span>` : ""}
              </div>
            `;
          })
          .join("");
      }
    }
  }

  return {
    element: container,
    open: openModal,
    close: closeModal,
    updateVersion
  };
}
