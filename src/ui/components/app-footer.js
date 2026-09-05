/**
 * LocalJam - Persistent Application Release Footer & Release Notes Modal Component
 */

import { CURRENT_RELEASE } from "../../version.js";

export function createAppFooter() {
  const footer = document.createElement("div");
  footer.id = "app-footer-wrapper";
  footer.className = "app-footer-wrapper";

  footer.innerHTML = `
    <footer class="app-footer" role="contentinfo" aria-label="Application Release Info">
      <div class="footer-left">
        <button id="btn-open-release-notes" class="footer-release-btn" aria-label="View release notes for ${CURRENT_RELEASE.version}">
          <span class="footer-release-tag">Release:</span>
          <span class="footer-release-version">${CURRENT_RELEASE.version}</span>
        </button>
        <span class="footer-badge">[LOCAL-FIRST]</span>
      </div>

      <div class="footer-right">
        <span class="footer-text">Zero tracking • Local storage authoritative</span>
        <a href="https://github.com/aawc/LocalJam" target="_blank" rel="noopener noreferrer" class="footer-link" aria-label="LocalJam GitHub Repository">
          GitHub
        </a>
      </div>
    </footer>

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

  const modal = footer.querySelector("#release-notes-modal");
  const openBtn = footer.querySelector("#btn-open-release-notes");
  const closeBtn = footer.querySelector("#btn-close-release-notes");
  const doneBtn = footer.querySelector("#btn-done-release-notes");

  function openModal() {
    if (modal) {
      modal.style.display = "flex";
      if (doneBtn) doneBtn.focus();
    }
  }

  function closeModal() {
    if (modal) {
      modal.style.display = "none";
      if (openBtn) openBtn.focus();
    }
  }

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (doneBtn) doneBtn.addEventListener("click", closeModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  return {
    element: footer,
    open: openModal,
    close: closeModal
  };
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
