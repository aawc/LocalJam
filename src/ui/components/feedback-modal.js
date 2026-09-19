/**
 * LocalJam - Diagnostics & Feedback Modal Component
 * Captures PWA state, storage quota, audio engine telemetry, and provides
 * one-click report copying, JSON export, and GitHub issue generation.
 */

import {
  captureDiagnostics,
  formatDiagnosticsMarkdown,
  formatDiagnosticsJson
} from '../../utils/diagnostics.js';

export function createFeedbackModal(deps = {}) {
  const {
    onToast,
    onClose: onParentClose,
    db,
    audioEngine,
    queueManager,
    equalizer,
    visualizer
  } = deps;

  let openerEl = null;
  let cachedDiagnostics = null;

  const modal = document.createElement('div');
  modal.id = 'feedback-modal';
  modal.className = 'modal-overlay feedback-modal-overlay';
  modal.style.display = 'none';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Diagnostics & Feedback');

  modal.innerHTML = `
    <div class="modal-card feedback-modal-card">
      <div class="modal-header">
        <div>
          <h2 id="feedback-modal-title" class="modal-title">Diagnostics & Feedback</h2>
          <div class="modal-subtitle">Capture PWA local state for troubleshooting</div>
        </div>
        <button type="button" class="btn-close" id="btn-close-feedback" aria-label="Close Diagnostics">&times;</button>
      </div>

      <div class="modal-body feedback-modal-body">
        <div class="feedback-summary-grid" id="feedback-metrics-grid">
          <div class="feedback-metric-card">
            <span class="feedback-metric-label">App Version</span>
            <span class="feedback-metric-val" id="metric-version">...</span>
          </div>
          <div class="feedback-metric-card">
            <span class="feedback-metric-label">Display Mode</span>
            <span class="feedback-metric-val" id="metric-display">...</span>
          </div>
          <div class="feedback-metric-card">
            <span class="feedback-metric-label">Storage Tier</span>
            <span class="feedback-metric-val" id="metric-storage-tier">...</span>
          </div>
          <div class="feedback-metric-card">
            <span class="feedback-metric-label">Local Tracks</span>
            <span class="feedback-metric-val" id="metric-tracks">...</span>
          </div>
          <div class="feedback-metric-card">
            <span class="feedback-metric-label">Service Worker</span>
            <span class="feedback-metric-val" id="metric-sw">...</span>
          </div>
          <div class="feedback-metric-card">
            <span class="feedback-metric-label">Audio Engine</span>
            <span class="feedback-metric-val" id="metric-audio">...</span>
          </div>
        </div>

        <div class="feedback-notes-section">
          <label for="feedback-user-notes" class="feedback-label">Feedback Notes (Optional)</label>
          <textarea id="feedback-user-notes" class="feedback-textarea" rows="3" placeholder="Describe any issues, unexpected behavior, or steps to reproduce..."></textarea>
        </div>
      </div>

      <div class="modal-footer feedback-modal-footer">
        <button type="button" id="btn-copy-diagnostics" class="btn btn-primary">
          Copy Report
        </button>
        <button type="button" id="btn-export-json" class="btn btn-secondary">
          Export JSON
        </button>
        <a id="btn-github-issue" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">
          GitHub Issue &nearr;
        </a>
        <button type="button" id="btn-done-feedback" class="btn btn-secondary">
          Close
        </button>
      </div>
    </div>
  `;

  const closeBtn = modal.querySelector('#btn-close-feedback');
  const doneBtn = modal.querySelector('#btn-done-feedback');
  const copyBtn = modal.querySelector('#btn-copy-diagnostics');
  const exportBtn = modal.querySelector('#btn-export-json');
  const githubLink = modal.querySelector('#btn-github-issue');
  const notesTextarea = modal.querySelector('#feedback-user-notes');

  const metricVersion = modal.querySelector('#metric-version');
  const metricDisplay = modal.querySelector('#metric-display');
  const metricTier = modal.querySelector('#metric-storage-tier');
  const metricTracks = modal.querySelector('#metric-tracks');
  const metricSw = modal.querySelector('#metric-sw');
  const metricAudio = modal.querySelector('#metric-audio');

  async function refreshMetrics() {
    try {
      cachedDiagnostics = await captureDiagnostics({
        db,
        audioEngine,
        queueManager,
        equalizer,
        visualizer
      });

      if (metricVersion) {
        metricVersion.textContent = cachedDiagnostics.app.version;
      }
      if (metricDisplay) {
        metricDisplay.textContent = cachedDiagnostics.app.isPwa ? 'PWA Standalone' : 'Browser';
      }
      if (metricTier) {
        metricTier.textContent = cachedDiagnostics.storage.tier.includes('Tier 1') ? 'Tier 1 (Filesystem)' : 'Tier 2 (Session)';
      }
      if (metricTracks) {
        const trkCount = cachedDiagnostics.storage.storeCounts.tracks;
        const missing = cachedDiagnostics.storage.storeCounts.missingTracks;
        metricTracks.textContent = missing > 0 ? `${trkCount} (${missing} missing)` : `${trkCount} tracks`;
      }
      if (metricSw) {
        metricSw.textContent = cachedDiagnostics.serviceWorker.controllerPresent ? 'Active' : 'Inactive';
      }
      if (metricAudio) {
        metricAudio.textContent = `${cachedDiagnostics.audio.source} • ${cachedDiagnostics.audio.playbackState}`;
      }

      updateGithubLink();
    } catch (err) {
      console.warn('[FeedbackModal] Failed refreshing diagnostics:', err?.message || err);
    }
  }

  function updateGithubLink() {
    if (!githubLink) return;
    const userNotes = notesTextarea?.value || '';
    const fullMd = formatDiagnosticsMarkdown(cachedDiagnostics, userNotes);
    // Exclude raw JSON payload from URL query parameters to avoid exceeding URI length limits
    const summaryMd = fullMd.split('### Raw Diagnostic Payload')[0].trim();
    const issueTitle = encodeURIComponent(`[Bug / Feedback]: LocalJam ${cachedDiagnostics?.app?.version || ''}`);
    const issueBody = encodeURIComponent(summaryMd);
    githubLink.href = `https://github.com/aawc/LocalJam/issues/new?title=${issueTitle}&body=${issueBody}`;
  }

  async function handleCopy() {
    try {
      if (!cachedDiagnostics) {
        cachedDiagnostics = await captureDiagnostics({
          db,
          audioEngine,
          queueManager,
          equalizer,
          visualizer
        });
      }
      const userNotes = notesTextarea?.value || '';
      const markdown = formatDiagnosticsMarkdown(cachedDiagnostics, userNotes);

      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(markdown);
      } else {
        // Fallback using textarea execCommand
        const tempArea = document.createElement('textarea');
        tempArea.value = markdown;
        tempArea.style.position = 'fixed';
        tempArea.style.opacity = '0';
        document.body.appendChild(tempArea);
        tempArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempArea);
      }

      if (copyBtn) {
        const prevText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = prevText;
        }, 1500);
      }

      if (typeof onToast === 'function') {
        onToast('[DIAGNOSTICS COPIED]');
      }
    } catch (err) {
      console.error('[FeedbackModal] Copy failed:', err);
      if (typeof onToast === 'function') {
        onToast('[ERROR] Failed to copy diagnostics');
      }
    }
  }

  function handleExportJson() {
    try {
      const userNotes = notesTextarea?.value || '';
      const payload = {
        ...cachedDiagnostics,
        userNotes: userNotes.trim() || null
      };
      const jsonStr = formatDiagnosticsJson(payload);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `localjam-diagnostics-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (typeof onToast === 'function') {
        onToast('[JSON EXPORTED]');
      }
    } catch (err) {
      console.error('[FeedbackModal] Export JSON failed:', err);
      if (typeof onToast === 'function') {
        onToast('[ERROR] Could not export JSON');
      }
    }
  }

  function closeModal() {
    modal.style.display = 'none';
    if (openerEl && typeof openerEl.focus === 'function') {
      try {
        openerEl.focus();
      } catch (_) {}
    }
    if (typeof onParentClose === 'function') {
      onParentClose();
    }
    modal.dispatchEvent(new CustomEvent('layer-close', { bubbles: true }));
  }

  function openModal(props = {}) {
    openerEl = props.openerEl || (typeof document !== 'undefined' ? document.activeElement : null);
    modal.style.display = 'flex';
    refreshMetrics();
    focusFirst();
  }

  function focusFirst() {
    if (copyBtn && typeof copyBtn.focus === 'function') {
      copyBtn.focus();
    } else if (notesTextarea && typeof notesTextarea.focus === 'function') {
      notesTextarea.focus();
    }
  }

  closeBtn?.addEventListener('click', closeModal);
  doneBtn?.addEventListener('click', closeModal);
  copyBtn?.addEventListener('click', handleCopy);
  exportBtn?.addEventListener('click', handleExportJson);
  notesTextarea?.addEventListener('input', updateGithubLink);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Keyboard navigation & focus trap
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeModal();
      return;
    }

    if (e.key === 'Tab') {
      const focusables = Array.from(
        modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')
      ).filter((el) => !el.disabled && el.style.display !== 'none' && !el.hidden);

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  return {
    element: modal,
    open: openModal,
    close: closeModal,
    toggle: () => {
      if (modal.style.display === 'none') openModal();
      else closeModal();
    },
    focusFirst,
    refreshMetrics
  };
}
