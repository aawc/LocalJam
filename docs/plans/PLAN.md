# Subagent-Driven Development Plan: Browser Console Errors & Deprecation Fixes

**Repository:** `aawc/LocalJam`  
**Date:** 2026-09-19  
**Branch:** `main`

---

## Tasks Checklist

- [x] **Task 1: Fix Critical ReferenceError on App Initialization (`equalizer is not defined`)** `[DONE]`
  - *Context:* `main.js:394` passes `equalizer` to `createFeedbackModal`, but `equalizer` is never imported in `src/main.js`. Calling `initApp()` in the browser crashes with `ReferenceError: equalizer is not defined` and halts application mounting.
  - *File to edit:* `src/main.js` (import `{ equalizer } from './player/equalizer.js'`).
  - *Test to add/verify:* `test/ui/shell.test.js` (assert that `initApp` dependencies or `equalizer` import exist and resolve without ReferenceError).

- [x] **Task 2: Eliminate Non-Standard `slider-vertical` Appearance Deprecation Warning** `[DONE]`
  - *Context:* Chromium logs `[Deprecation] The keyword 'slider-vertical' specified to an 'appearance' property is not standardized. It will be removed in the future. Use <input type=range style="writing-mode: vertical-lr; direction: rtl"> instead.` caused by `-webkit-appearance: slider-vertical;` on `.eq-slider`.
  - *File to edit:* `src/ui/app.css` (remove `-webkit-appearance: slider-vertical;` while retaining standard `writing-mode: vertical-lr; direction: rtl;`).
  - *Test to add/verify:* `test/ui/theme.test.js` (assert `.eq-slider` CSS does not contain non-standard `slider-vertical`).

- [x] **Task 3: Sanitize Permissions-Policy Header in Service Worker for Navigation Responses** `[DONE]`
  - *Context:* GitHub Pages serves an edge-injected `Permissions-Policy` header containing unrecognized/deprecated Privacy Sandbox features (`browsing-topics`, `run-ad-auction`, `join-ad-interest-group`, `private-state-token-redemption`, `private-state-token-issuance`, `private-aggregation`, `attribution-reporting`), causing 7 console errors on document navigation.
  - *File to edit:* `sw.js` (sanitize response headers for navigation/document requests to deliver standard permissions policy: `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()`, and bump cache to `localjam-v2026.09.049`).
  - *Test to add/verify:* `test/pwa/pwa-assets.test.js` (assert cache version is bumped and header sanitization behaves cleanly).

- [x] **Task 4: Update Documentation and Checklists** `[DONE]`
  - *Context:* Synchronize `CHECKLIST.md` with Feature Request 31.
  - *File to edit:* `CHECKLIST.md`.
