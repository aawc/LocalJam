# Implementation Plan: Fix PWA Update Prompt Loop & Add Diagnostics Feedback Mechanism

**Date:** 2026-09-19  
**Specification:** Subagent-Driven Development Plan for PWA Update Loop and Feedback System  
**Tracking:** FR 28 & FR 29  

---

## 1. Overview & Context

This plan addresses two user requests in `aawc/LocalJam`:
1. **Repeated "Update Available" Prompt Loop:** After clicking "Refresh Now" / "Restart Now", the update banner repeatedly reappears on reload. Root cause: `src/version.js` was intercepted by `sw.js` with Cache-First strategy while `version.json` was Network-First, creating a persistent mismatch (`version.json !== APP_VERSION`). In addition, `update-banner.js` had an aggressive 800ms reload timeout that aborted before Service Worker activation completed, and lacked reload suppression debouncing.
2. **In-App PWA Diagnostics & Feedback Mechanism:** A dedicated feedback and diagnostic system in the UI that inspects local PWA state (storage quota, IndexedDB store counts, audio engine telemetry, Service Worker lifecycle, display mode, browser environment) and enables one-click copying, JSON export, and GitHub issue generation to streamline troubleshooting.

---

## 2. Task Breakdown & Execution Checklist

- [x] **Task 1: Fix Persistent PWA Update Prompt Loop & Service Worker Synchronization**
  - [x] Update [`sw.js`](./sw.js) to treat `version.js` with Network-First strategy (matching `version.json` and `sw.js`), ensuring `APP_VERSION` is never stale in cache.
  - [x] Update [`src/ui/components/update-banner.js`](./src/ui/components/update-banner.js):
    - Ensure `applyUpdate()` waits for active worker or installation without premature 800ms aborts (extend timeout to 2500ms).
    - Add `sessionStorage` debounce key (`localjam_applied_update`) to prevent immediate re-prompt loops across reloads.
    - Resolve waiting/installing workers robustly before posting `SKIP_WAITING`.
  - [x] Update [`test/ui/update-banner.test.js`](./test/ui/update-banner.test.js) with test coverage for reload debounce and Network-First version resolution.

- [x] **Task 2: Implement PWA Diagnostic State Collector Engine**
  - [x] Create [`src/utils/diagnostics.js`](./src/utils/diagnostics.js) to collect:
    - App & environment telemetry (APP_VERSION, remote version, user agent, display mode, online status).
    - Storage & database telemetry (IndexedDB availability, storage estimate quota/usage, record counts for tracks, roots, playlists, favorites, history, stations).
    - Audio engine & stream telemetry (source, playback state, AudioContext state, volume, equalizer gains, visualizer mode, current track/station metadata).
    - Service Worker registration & cache metadata (cache names, worker states).
  - [x] Provide formatters for structured JSON and clean Markdown summary.
  - [x] Create [`test/utils/diagnostics.test.js`](./test/utils/diagnostics.test.js) asserting metric accuracy, error resilience, and null safety.

- [x] **Task 3: Implement Diagnostics & Feedback UI Modal & Overflow Menu Trigger**
  - [x] Create [`src/ui/components/feedback-modal.js`](./src/ui/components/feedback-modal.js) modal component:
    - Diagnostic metrics cards with color-blind safe status badges.
    - User notes input field.
    - One-click "Copy Diagnostics" button (`navigator.clipboard.writeText`) with toast feedback.
    - "Export JSON" file download button.
    - "Report Issue on GitHub" action with pre-populated query parameters.
    - Keyboard trap, Escape key dismissal, and focus management.
  - [x] Register `feedback` layer in [`src/ui/layers.js`](./src/ui/layers.js) / [`src/main.js`](./src/main.js).
  - [x] Add "Diagnostics & Feedback" row to L2 Overflow Menu in [`src/ui/components/overflow-menu.js`](./src/ui/components/overflow-menu.js).
  - [x] Add glassmorphic styling in [`src/ui/app.css`](./src/ui/app.css).
  - [x] Create [`test/ui/feedback-modal.test.js`](./test/ui/feedback-modal.test.js) unit tests.

- [x] **Task 4: Integration Verification, Subagent Code Review, and Atomic Commits**
  - [x] Run full test suite (`node --test`).
  - [x] Bump Service Worker cache in `sw.js` to `localjam-v2026.09.047`.
  - [x] Run independent subagent code review.
  - [x] Request user approval and execute atomic commits.
