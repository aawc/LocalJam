# LocalJam - Task Execution Checklist

This checklist tracks resolution of reported issues and feature requests. Each completed item records its associated atomic commit hashes upon completion.

---

## Issue Resolution

- [x] **Issue 1: Radio stream playback user gesture failure** `[DONE]`
  - *Description:* Resolves `"play() can only be initiated by a user gesture"` when first clicking a radio station card and requiring a second click to start playing.
  - *Associated Commits:* `a30d644`, `0f064f7`

- [x] **Issue 2: Visualizer is completely static (non-functional)** `[DONE]`
  - *Description:* Ensure the visualizer renders active real-time Web Audio frequency and time-domain animations during playback and handles canvas resizing, audio routing, and audio context connections properly.
  - *Associated Commits:* `651972a`, `0f064f7`

- [x] **Issue 3: Dynamic Semantic Release Tagging (`v$yyyy.$mm.$nnn`) & Tag Push** `[DONE]`
  - *Description:* Replace commit message / SHA256 release naming in `.github/workflows/release.yml`. Dynamically generate timestamped semantic tag `v$yyyy.$mm.$nnn` using bash date commands and zero-padded GitHub run number (`$(printf "%03d" ${{ github.run_number }})`), push the tag back to the repository, and bundle release assets named with the tag.
  - *Associated Commits:* `0fbf4ff`

- [x] **Issue 4: Release Workflow YAML Parsing Failure (Indentation Fix)** `[DONE]`
  - *Description:* Resolve GitHub Actions check suite parsing failure in `.github/workflows/release.yml` caused by unindented heredoc lines breaking out of the `run: |` block scalar. Format release notes generation with indented `{ echo ... } > release_notes.md` command grouping.
  - *Associated Commits:* `7df8d9d`

- [x] **Issue 5: Version Number on Page Showing Older Release** `[DONE]`
  - *Description:* Ensure the version number displayed on the page and in the release notes dialog dynamically synchronizes with deployed release metadata (`version.json`) rather than relying exclusively on static imports. Generate dynamic version metadata during GitHub Pages deployment.
  - *Associated Commits:* `a145b10`

- [x] **Issue 6: Classical KUSC, KING FM, and Jazz24 Stream Endpoints & Thumbnail Fallback Rendering** `[DONE]`
  - *Description:* Resolve audio playback failures for Classical KUSC, Classical KING FM, and Jazz24 by migrating to verified HTTPS endpoints. Add genre-specific SVG fallback artwork and `onerror` image recovery so station cards never show broken thumbnails.
  - *Associated Commits:* `e09a85b`

- [x] **Issue 7: Application Footer Cleanup (Remove [LOCAL-FIRST], Subtitle, and GitHub Link)** `[DONE]`
  - *Description:* Streamline application footer by removing `[LOCAL-FIRST]` badge, `"Zero tracking • Local storage authoritative"` label, and `"GitHub"` external repository link, leaving a clean, minimal release version button that opens the release notes dialog.
  - *Associated Commits:* `5beae4c`

- [x] **Issue 8: Radio Station High-Level Genre Sections & Navigation** `[DONE]`
  - *Description:* Reorganize radio stations into clean, high-level genre categories (Ambient, Rock, Classical, Jazz, Electronic, Folk & Roots, Lounge, News & Talk, Soul & Funk, World) instead of compound subgenres (e.g., "Ambient / Electronics"), with organized section headings and responsive genre filter pills.
  - *Associated Commits:* `2731460`

- [x] **Issue 9: Fullscreen Audio Visualizer Mode** `[DONE]`
  - *Description:* Enable true fullscreen display for the audio visualizer overlay using the Fullscreen API, with a dedicated fullscreen toggle button, keyboard shortcut (`F`), canvas double-click trigger, and clean exit lifecycle.
  - *Associated Commits:* `f2d3b90`

- [x] **Issue 10: Professional Copy Refinement (Remove Promotional Hyperbole)** `[DONE]`
  - *Description:* Refine user-facing copy across Home view, Radio view, Settings view, and app headers to use clear, elegant, and professional language without hyperbole.
  - *Associated Commits:* `5beae4c`, `2731460`, `f2d3b90`, `6c6aec9`

- [x] **Issue 11: Fix Broken SomaFM & BBC Radio 6 Stream Endpoints** `[DONE]`
  - *Description:* Resolve 404 and 410 playback errors for SomaFM stations (Illinois Street Lounge, Secret Agent, Lush, Space Station Soma, Deep Space One, Suburbs of Goa) by updating to verified 128 kbps HTTPS MP3 endpoints, and update BBC Radio 6 Music to its active HTTPS live stream.
  - *Associated Commits:* `6215421`

- [x] **Issue 12: Comprehensive Release Commits & Highlights Metadata Generation** `[DONE]`
  - *Description:* Ensure `version.json` and `.github/workflows/deploy.yml` dynamically extract the full list of recent git commits (hashes and commit messages) and release highlights rather than overwriting with only a single commit hash.
  - *Associated Commits:* `380a1e6`

- [x] **Issue 13: Instant & Continuous Release Update Detection & Refresh Prompt** `[DONE]`
  - *Description:* Optimize update checker in `update-banner.js` and `main.js` to perform initial check on boot, poll every 30 seconds, trigger `registration.update()` on focus, and reactively prompt the user with a high-contrast toast banner whenever a new version is published.
  - *Associated Commits:* `fe21f9f`

- [x] **Issue 14: Mobile Playback Failure on Android Chrome and Brave** `[DONE]`
  - *Description:* Resolve local track and internet radio stream playback failures on Android (Chrome and Brave, including normal and Incognito windows). Add `playsInline` attributes across media elements, establish global touch/pointer unlock handlers to awaken `AudioContext`, decouple radio streams from Web Audio graph to prevent CORS muting, and trigger `.play()` synchronously in user gesture dispatch chains.
  - *Associated Commits:* `6baed6b`

- [x] **Issue 15: Strict Security Review & Vulnerability Remediation** `[DONE]`
  - *Description:* Perform a comprehensive security audit of repository, server (`server.js`), static hosting on GitHub Pages, and client-side web application. Document all 11 vulnerability findings in `SECURITY_REPORT.md` across 4 severity tiers (Critical path traversal, High CSP/DOM XSS, Medium HTML escaping/MIME validation/inline handlers, Low/Info security headers and error masking), commit report, and implement complete remediations with automated test verification.
  - *Associated Commits:* `51360b0`, `721bc8f`

- [x] **Issue 16: Minimalist UX Design Review & UI Enhancements** `[DONE]`
  - *Description:* Conduct end-to-end UX audit from a minimalist product designer perspective. Document 10 findings in `UX_REVIEW_REPORT.md` (live stream progress bar vs track timeline, fluid search header, single-row horizontal genre pills scroll, hero button hierarchy, card hover elevations, table padding, glassmorphic overlays, and warm empty states), commit report, and implement all UI improvements across views.
  - *Associated Commits:* `dba488a`
- [x] **Issue 17: PWA Update Notification Failure & Radio Station Catalog Sync** `[DONE]`
  - *Description:* Resolve failure of PWA update notifications on Chrome Canary (Android) and desktop browsers caused by premature remote version mutation overwriting baseline `APP_VERSION`, missing Service Worker precaching of `sanitize.js`, unconditional `self.skipWaiting()` on install, and deceptive version display in Settings. Fix station catalog synchronization to seamlessly merge all 34 curated streams (including 6 Kids & Family and 5 News & Talk streams) into pre-existing IndexedDB stores while preserving user favorites and custom streams.
  - *Associated Commits:* `6c810c4`, `3b259d6`, `6bd4abd`

- [x] **Issue 18: Persistent Update Popup on Refresh (Version Disconnect in CI & Synchronous Reload)** `[DONE]`
  - *Description:* Resolve recurring update popup appearing on every page refresh caused by GitHub Pages deployment workflow (`deploy.yml`) only generating `version.json` while leaving `src/version.js` (`APP_VERSION`) and `sw.js` (`CACHE_NAME`) un-synchronized with the deployed release tag. Update `deploy.yml` to automatically patch `src/version.js` and `sw.js` with `TAG_NAME` prior to uploading GitHub Pages artifacts. Update `createUpdateBanner` to smoothly post `SKIP_WAITING` to waiting worker without premature synchronous reload, and add session-level version dismissal.
  - *Associated Commits:* `d47f726`

- [x] **Issue 19: GitHub Pages Deployment Syntax Error & Dedicated Synchronizer Script** `[DONE]`
  - *Description:* Resolve GitHub Actions deployment workflow syntax error caused by unescaped bash double-quotes in multiline inline `node -e` script. Extract deployment metadata generation and asset synchronization into modular `scripts/generate-version.js` with comprehensive unit and integration tests.
  - *Associated Commits:* `ea9bd9a`

- [x] **Issue 20: PWA Usability Enhancements: Minimalist Player Details Bar, Bottom Navigation Scroll Clearance, and Local Audio Playback Pipeline Fixes** `[DONE]`
  - *Description:* Resolve 3 critical PWA usability defects: (1) Streamline player details bar with context-adaptive controls hiding irrelevant shuffle/repeat during live radio and replacing bulky multiline badges with a minimalist tactile LIVE capsule, (2) Fix station list and view scroll clipping by providing full bottom scroll clearance above the floating player and mobile navigation bars, and (3) Overhaul the local audio playback pipeline by registering scanned files in sessionRegistry, adding QueueManager.getCurrentTrack(), adding robust FSAA permission handling and root directory handle fallback traversal in audioEngine.playTrack(), and auto-populating library queue on initial play. Document comprehensive UX design specifications and skeuomorphic/minimalist critique in `UX_CRITIQUE_REPORT.md`.
  - *Associated Commits:* `4d6d525`, `1a8ad3d`, `0c64306`

- [x] **Issue 21: Persistent Update Dialog Loop on Chrome Canary (Android PWA)** `[DONE]`
  - *Description:* Resolve recurring update popup loop on Chrome Canary (Android) and desktop PWAs where clicking "Refresh Now" or restarting the PWA reloads into the old version. Fix by dynamically resolving the active ServiceWorkerRegistration and waiting/installing workers when waitingWorker was null on boot, awaiting installing worker completion, dispatching SKIP_WAITING before reload, invalidating outdated app shell caches via caches.delete, listening for controllerchange to trigger safe reload, and passing discovered workers in main.js and update-banner.js.
  - *Associated Commits:* `df72572`

- [x] **Issue 22: Extreme Minimalist UX Design Overhaul** `[DONE]`
  - *Description:* Overhaul the entire user interface and design system under extreme minimalist principles ("Less, but better"): deep matte slate surfaces (`#0a0e17`, `#111827`, `#1a2333`), Swiss typography with tabular monospace numbers for time/frequency/bitrate metrics, high-contrast double-coded colorblind-safe accents (Cobalt `#0072B2`, Sky Blue `#38bdf8`, Amber `#fbbf24`, Rose `#f43f5e`, Purple `#a855f7`), tactile 3-column audio player bar with dynamic volume iconography and live broadcast capsule, refined card elevations, streamlined sortable track tables, and glassmorphic modal overlays.
  - *Associated Commits:* `f43ca0d`

- [x] **Issue 23: Audio Visualizer Inactivity on Chrome on macOS and Android (v2026.09.051)** `[DONE]`
  - *Description:* Resolve audio visualizer inactivity, fixed artificial oscillations, and rendering failures on Chrome on macOS and Android caused by: (1) Unresumed suspended `AudioContext` lifecycle during overlay opening and background visibility return, (2) Elimination of visualizer button on mobile viewports (< 768px), (3) Horizontal header overflow pushing close and fullscreen buttons off-screen on mobile, (4) Zero-dimension canvas reflow `IndexSizeError` in `createRadialGradient` and `roundRect` radius clamping, and (5) Fixed mechanical sine patterns by routing radio streams through the Web Audio pipeline (`nextAudio` with `crossOrigin = 'anonymous'`) and querying authentic `AnalyserNode` FFT frequencies with calm baseline idle states. Document comprehensive findings in `VISUALIZER_INVESTIGATION_REPORT.md` and add unit and integration test coverage.
  - *Associated Commits:* `eee72da`, `d016df6`

- [x] **Issue 24: Radio & Mobile UX Simplification & Responsive Overhaul** `[DONE]`
  - *Description:* Conduct static analysis and UX evaluation across radio streaming and mobile platforms. Document 10 distinct UX and architectural findings in `RADIO_MOBILE_UX_REPORT.md` (radio station circular cycling, dynamic stream state machine telemetry `connecting`/`buffering`/`playing`/`error`, Now Playing radio hero banner with quick transport and station details access, search clear button trigger, compact 60px mobile mini-player bar, bottom navigation vertical clearance saving 40px, slide-up mobile station details bottom sheet with drag handle, responsive hiding of table columns `.col-num` and `.col-album` on small screens <=640px, and `setCrossfadeDuration` method consistency). Implement complete fixes across player engine, CSS layout, and UI views with comprehensive unit and integration test coverage.
  - *Associated Commits:* `f52bd39`

- [x] **Issue 25: Dedicated Player Screen (`#/player`), Radio Hero Banner Removal, and Curated Station Expansion (University, Rock, Pop, Lo-Fi)** `[DONE]`
  - *Description:* (1) Remove duplicative Now Playing hero banner from `radio-view.js` to streamline the radio view and eliminate redundancy with the bottom player controls. (2) Build dedicated full "Player" screen (`src/ui/views/player-view.js`) registered at `#/player`, accessible by clicking on the mini player artwork or stream/track info. When active, automatically hide the bottom mini-player (`body.viewing-player`). Embed real-time audio visualizer with on/off toggle switch (off by default) and live mode chips. (3) Expand curated HTTPS radio catalog with premier University radio stations (Stanford KZSU 90.1 FM, Ohlone College KOHL 89.3 FM, UC Berkeley KALX 90.7 FM, Santa Clara University KSCU 103.3 FM, Princeton University WPRB 103.3 FM, MIT WMBR 88.1 FM), Rock (The Current 89.3 FM MPR, SomaFM Left Coast 70s), Pop (Dance Wave!), and Lo-Fi (Chillsky Lo-Fi & Beats, Lofi Radio), with full high-level genre taxonomy and colorblind-safe SVG fallback artwork.
  - *Associated Commits:* Pending commit


---

## Feature Requests

- [x] **FR 1: Release Naming Convention (`YYYY-MM-DD-NNN`)** `[DONE]`
  - *Description:* Standardize release naming to `YYYY-MM-DD-NNN` where `YYYY-MM-DD` is today's date and `NNN` is an increasing sequence number for that day.
  - *Associated Commits:* `4535f30`

- [x] **FR 2: Application Footer with Current Release & Release Notes** `[DONE]`
  - *Description:* Add a persistent footer displaying the currently running release, with release notes detailing the commits included in the release.
  - *Associated Commits:* `f8bd490`

- [x] **FR 3: Automatic New Release Detection & Refresh Prompt (Web & PWA)** `[DONE]`
  - *Description:* Automatically detect when a new release/version is published and prompt the user to refresh the page/PWA.
  - *Associated Commits:* `47d22ee`

- [x] **FR 4: Markdown Documentation Synchronization** `[DONE]`
  - *Description:* Ensure `CHECKLIST.md`, `README.md`, `PROMPT.md`, and `GEMINI.md` are consistently updated and synchronized before each commit.
  - *Associated Commits:* `0e42f2e`, `dda7bd2`

- [x] **FR 5: Popular Radio Stations Expansion (English / Instrumental / Lo-Fi / Jazz / Ambient)** `[DONE]`
  - *Description:* Identify and integrate high-quality, stable HTTPS radio stations focusing on English and instrumental programming (e.g., Chillhop, SomaFM Drone Zone, SomaFM DEF CON, Classical KUSC, Jazz24, BBC World Service, WNYC/NPR, Lofi Girl stream).
  - *Associated Commits:* `dda7bd2`

- [x] **FR 6: Radio Station / Track Details Modal on Clicking Active Station Name** `[DONE]`
  - *Description:* Clicking the name of a radio station while it is actively playing pops up a details modal screen presenting rich metadata about the station, live stream status, genre/bitrate info, stream link, and currently playing track info.
  - *Associated Commits:* `0e42f2e`

- [x] **FR 7: Internet Radio Directory Expansion (12+ Verified HTTPS Streams)** `[DONE]`
  - *Description:* Expand curated internet radio directory with high-fidelity streams including WQXR 105.9 FM, KNKX 88.5 FM, SomaFM PopTron, Indie Pop Rocks, Beat Blender, Seven Inch Soul, Left Coast 70s, Folk Forward, Boot Liquor, ThistleRadio, Fluid, and SF 10-33.
  - *Associated Commits:* `e09a85b`

- [x] **FR 8: Radio Station Real-Time Search & Multi-Criteria Sorting** `[DONE]`
  - *Description:* Add interactive real-time search filtering across station names, genres, descriptions, and countries, paired with multi-criteria sorting (Default, Name A-Z, Name Z-A, Genre A-Z, Bitrate).
  - *Associated Commits:* `2ab1654`

- [x] **FR 9: Dedicated Starred Radio Stations Grouping & Reactive Rendering** `[DONE]`
  - *Description:* Display starred radio stations first in a dedicated section at the top of the radio view with dynamic item count, followed by all remaining stations, updating reactively on star toggles without interrupting playback.
  - *Associated Commits:* `2ab1654`

- [x] **FR 10: Move App Version Information from Main Page to Settings About Section** `[DONE]`
  - *Description:* Remove release version display from the persistent main page footer and add a dedicated "About LocalJam" section in the Settings view showing the running version, release date, and interactive Release Notes modal dialog trigger.
  - *Associated Commits:* `f6af12b`

- [x] **FR 11: Remove Visual Accessibility Section from Settings View** `[DONE]`
  - *Description:* Remove the redundant "Visual Accessibility" section from the Settings view while retaining all color-blind accessible UI labels and focus indicators.
  - *Associated Commits:* `f6af12b`

- [x] **FR 12: Recently Played Radio Streams Section above Starred Stations** `[DONE]`
  - *Description:* Add a "Recently Played" stream section rendered above the "★ Starred Radio Stations" section in the Radio view, persisting `lastPlayedAt` timestamps in IndexedDB whenever a radio station is played.
  - *Associated Commits:* `c5a5fb0`

- [x] **FR 13: Expand Top Navigation Search Bar Width** `[DONE]`
  - *Description:* Expand the width of `.search-box` and `.search-box-wrapper` in the top header from 360px to 520px for improved search query visibility.
  - *Associated Commits:* `6b0d0ec`

- [x] **FR 14: Move GitHub Repository Link to Settings About Section** `[DONE]`
  - *Description:* Relocate the external GitHub repository link from the top navigation bar to the new "About LocalJam" section in the Settings view.
  - *Associated Commits:* `f6af12b`

- [x] **FR 15: Curated Radio Catalog Expansion (Kids & Family + News & Talk)** `[DONE]`
  - *Description:* Expand curated internet radio directory with dedicated **Kids & Family** genre category (Fun Kids Radio UK, Fun Kids Junior, Radio Art Lullabies, Radio Art Peaceful Solo Piano, Radio Art Mozart for Children, SomaFM Covers) and premier **News & Talk** streams (NPR 24/7 Live Stream, KQED 88.5 FM, WBEZ 91.5 FM, RFI English, WGBH 89.7 FM) accompanied by custom accessible SVG fallback artwork badges.
  - *Associated Commits:* `97dcea4`

- [x] **FR 16: Radio and Mobile UX Simplification & Responsive Overhaul** `[DONE]`
  - *Description:* Simplify radio station card controls, add circular station navigation (`audioEngine.playNextStation()`, `audioEngine.playPreviousStation()`) mapped to player bar next/prev and keyboard media keys (`ArrowLeft`/`ArrowRight`), implement responsive column hiding on mobile devices (`.col-album`, `.col-duration`, `.col-bitrate`), add mobile bottom sheet drag handle, and provide clear search query button.
  - *Associated Commits:* `f52bd39`

- [x] **FR 17: Dedicated Full Player View, Embedded Visualizer, & Station Expansion** `[DONE]`
  - *Description:* Remove duplicative Now Playing hero banner from Radio View in favor of the persistent mini player bar. Create dedicated Full Player screen (`#/player`) with metadata, transport controls, timeline, volume, and technical badges. Embed real-time Web Audio API visualizer with accessible ON/OFF toggle switch (OFF by default) and mode selectors (`bars`, `wave`, `nebula`, `starfield`), automatically hiding the mini-player bar when on `#/player`. Expand curated radio catalog with 11 verified HTTPS stations across College & University (KZSU, KOHL, KALX, KSCU, WPRB, WMBR), Rock (The Current 89.3, SomaFM Left Coast 70s), Pop (Dance Wave!), and Lo-Fi (Chillsky, Lofi Radio).
  - *Associated Commits:* `9eb2574`

- [x] **FR 18 / Issue 25: One-Screen Minimalist Player Redesign (v2 Architecture)** `[DONE]`
  - *Description:* Implement the approved one-screen minimalist player redesign specification (`docs/design/2026-09-15-minimalist-player-redesign.md`):
    - Update GitHub Actions release framework to support automated test, release, and deploy on `v2`.
    - Pure pointer gesture classifier (`src/ui/gestures.js`) with pointer capture, long-press timer, and horizontal swipe classification.
    - Pure browse query model (`src/ui/browse-model.js`) for local library and internet radio streams.
    - Transient toast notification host (`src/ui/components/toast.js`) with `aria-live="polite"` support.
    - L1 Browse Sheet (`src/ui/components/browse-sheet.js`) with tabs, search filter, sort controls, and category chips.
    - L2 Overflow Menu (`src/ui/components/overflow-menu.js`) with double-coded labels and 8-store reset confirmation.
    - Library source abstraction (`src/ui/library-source.js`) separating folder picker and background rescan.
    - 6-Row Stage Viewport (`src/ui/stage.js`) with status chips, artwork/canvas visualizer, metadata, timeline/stream telemetry, transport controls, and Dual-Source Handle Bar (`[ Local ] · [ Radio ]`).
    - Layer Stack Coordinator (`src/ui/layers.js`) with LIFO dialog stack, backdrop dismiss, Escape dismiss, URL hash synchronization (`#/browse?tab=...`), and error boundary.
    - Keyboard Manager (`src/ui/keyboard.js`) mapped to §5.2 shortcut matrix with text input suppression.
    - Minimalist shell container in `index.html` with cold-start hydration and debounced persistence in `src/main.js`.
    - Dead code elimination: deleted obsolete router (`src/ui/router.js`), 10 legacy views (`src/ui/views/*`), obsolete components (`player-bar.js`, `queue-drawer.js`, `station-modal.js`, `visualizer-overlay.js`), and obsolete tests.
    - Updated `sw.js` app shell asset manifest to 37 live assets and updated security tests.
- [x] **FR 19: Fix Stage Viewport Styles Mismatch & Add v2 Redirect Route** `[DONE]`
  - *Description:* Resolve visual layout collapse on Stage by aligning `src/ui/app.css` and `src/ui/stage.js` selectors and element class names. Correct fallback artwork icon path from `./icons/icon-192.svg` to `./public/icons/icon-192.svg` with station SVG fallback on load errors. Add `v2/index.html` and `404.html` to cleanly resolve and redirect `/v2` requests to canonical root application on GitHub Pages. Bump Service Worker cache to `localjam-v2026.09.041` and include redirect assets.
- [x] **FR 20: Radio Stream Fallback Hardening, BBC 6 Music Migration, and SW Cache Invalidation** `[DONE]`
  - *Description:* Harden audio engine radio stream fallback and error recovery to cleanly unload media elements on failure, prevent format errors, and transition cleanly to `[OFFLINE]`. Replace decommissioned BBC 6 Music stream with NTS Radio 1 (`https://stream-relay-geo.ntslive.net/stream`), add automatic hydration migration in `src/main.js` and `src/radio/stations.js`, and bump Service Worker cache to `localjam-v2026.09.042` to invalidate stale caches.
- [x] **FR 21: Dual-Source Handle Bar Option Switching & Tap Gesture Fix (Desktop & Android)** `[DONE]`
  - *Description:* Resolve switching failure between Local and Radio options on Desktop and Android caused by container-level `setPointerCapture` in `src/ui/gestures.js` suppressing synthetic click events on child buttons, and direct `onOpenBrowse` bindings overriding source switching in `src/ui/stage.js`. Defer `setPointerCapture` in `attachGestures` to `onPointerMove` only when movement exceeds `TAP_MAX_PX` (10px) to preserve native child button clicks. Wire `localPill` and `radioPill` so tapping the inactive option triggers `deps.onToggleSource?.()` while tapping the active option opens the respective browse sheet (`deps.onOpenBrowse?.()`), and convert `barDot` to a semantic `<button type="button">` with focus ring and keyboard activation.
  - *Associated Commits:* `002bd7d`
- [x] **FR 22: Host v2 Player at /LocalJam/v2 Without Redirect** `[DONE]`
  - *Description:* Resolve `/LocalJam/v2` redirect loop and host the v2 branch player directly at `/LocalJam/v2`. Replace client-side redirect in `v2/index.html` with the complete v2 application shell incorporating `<base href="../" />`, mounting `#stage-root`, `#layer-root`, `#toast-root`, and `#aria-live-region`, and loading `./src/main.js` with matching Content Security Policy. Update `404.html` with boundary-safe regex matching (`/^(.*\/v2)(?:\/.*)?$/`) to preserve the `/v2` path on deep links, update `sw.js` navigation fallback to serve `./v2/index.html` when offline for `/v2` routes, and bump Service Worker cache to `localjam-v2026.09.043`.
  - *Associated Commits:* `640c635`
- [x] **FR 23: Prompt Music Folder Selection on Local Source Toggle When Library is Empty** `[DONE]`
  - *Description:* Resolve silent `[NO LOCAL TRACKS]` toast failure when switching to Local with an empty library. Update `togglePlaybackSource` in `src/main.js` to automatically invoke `pickFolder()` (requesting the user to choose a local folder for media), index selected files, queue tracks, and immediately start playback.
  - *Associated Commits:* `d8aec8e`
- [x] **FR 24: L2 Overflow Menu Styling & Responsive Glassmorphic Popover Alignment** `[DONE]`
  - *Description:* Resolve visual layout collapse and raw unstyled button appearance in L2 Overflow Menu caused by mismatched CSS class names in `src/ui/app.css`. Align all selectors with `src/ui/components/overflow-menu.js` (`.overflow-panel`, `.overflow-row`, `.overflow-label`, `.overflow-state`, `.overflow-volume-row`, `.overflow-volume-slider`, `.overflow-close-btn`, `.sheet-drag-handle`, `.overflow-row-destructive`), update `.layer-backdrop` to fixed full-screen layout with centered popover on desktop and slide-up bottom sheet on mobile, and bump Service Worker cache to `localjam-v2026.09.044`.
  - *Associated Commits:* `2b209d7`
- [x] **FR 25: Radio Stream Fallback Hardening, KOHL Endpoint Update, & Browse Header Styling** `[DONE]`
  - *Description:* Resolve premature `[STREAM OFFLINE]` toast errors during internet radio playback by guarding audio element error listeners in `src/player/audio-engine.js` so Web Audio radio attempts do not transition to `streamState='error'` when standalone `radioAudio` fallback is pending. Fix `prevAudio` reference error in `playRadio` and restore synthetic visualizer spectrum and waveform generators for CORS-isolated radio streams. Update KOHL 89.3 FM endpoint to verified live HTTPS stream (`https://ice10.securenetsystems.net/KOHL`). Reconcile Browse Sheet header and chip CSS selectors in `src/ui/app.css` (`.browse-header`, `.segmented-tabs`, `.tab-btn`, `.browse-folder-btn`, `.browse-close-btn`, `.browse-chips-bar`, `.chip`, `.browse-sort-select`) to eliminate raw browser button borders, and bump Service Worker cache to `localjam-v2026.09.045`.
  - *Associated Commits:* `d1d6785`

- [x] **FR 26: Remove v2 Branch Release, Deploy, and CI Workflow Triggers Following Main Merge and Archival** `[DONE]`
  - *Description:* Remove `v2` branch triggers from `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, and `.github/workflows/release.yml` now that branch `v2` has been archived (`archive/v2`) and merged into `main`. Ensure all releases, deployments, and CI actions run exclusively on `main`.
  - *Associated Commits:* `b5a3dd4`

- [x] **FR 27: Fix Bottom Sheet Dismissal, Touch Scrolling Isolation, and Structured List Layout** `[DONE]`
  - *Description:* Resolve non-functional 'x' close buttons on Browse Sheet and Overflow Menu by passing `onClose: () => layers.close()` in `src/main.js`, adding a re-entrancy guard to `LayerController.prototype.close` in `src/ui/layers.js`, and dispatching `layer-close` events. Restore bottom sheet scrolling by configuring `.browse-sheet-content`, `.browse-list-container`, `.browse-list`, and `.overflow-content` as flex scroll containers with `-webkit-overflow-scrolling: touch`, and refining `attachGestures` in `src/ui/gestures.js` to prevent pointer capture during touch scrolling when elements lack matching swipe handlers. Reorganize track and station rows with a dedicated `.browse-row-main` vertical stack for primary (title/station) and secondary (artist/genre) labels, right-aligned trailing badges, and animated cyan playing indicators. Bump Service Worker cache to `localjam-v2026.09.046`.
  - *Associated Commits:* `07cba54`, `22af00b`, `6eba438`

- [x] **FR 28: Fix PWA Update Prompt Loop and Service Worker Synchronization** `[DONE]`
  - *Description:* Resolve repeated "Update Available" notification prompt loop after clicking "Refresh Now" / "Restart Now". Route `version.js` through Network-First caching strategy in `sw.js` alongside `version.json` and `sw.js` to ensure `APP_VERSION` is never served from stale Cache-First storage during active deployments. Extend `applyUpdate` controllerchange fallback timeout to 2500ms and add `sessionStorage` debounce tracking (`localjam_applied_update`) to suppress duplicate prompts across consecutive reloads.
  - *Associated Commits:* `3a706fb`

- [x] **FR 29: In-App PWA State Diagnostics and Feedback Mechanism** `[DONE]`
  - *Description:* Implement comprehensive in-app diagnostics collector and feedback modal accessible via L2 Overflow Menu (`[DEBUG]`). Inspects local PWA state including storage quota and usage, IndexedDB store record counts (tracks, playlists, favorites, history, roots), audio engine playback telemetry (source, AudioContext state, volume, EQ gains, visualizer mode), Service Worker lifecycle and cache manifests, display mode (`standalone` vs `browser`), and runtime error logs. Provides one-click Markdown report copying (`navigator.clipboard.writeText`), JSON export download, pre-populated GitHub issue URL generation, and user feedback notes. Bump Service Worker cache to `localjam-v2026.09.047`.
  - *Associated Commits:* `b2b0f8c`

- [x] **FR 30: Audio Visualizer Initialization, Feedback UI Discoverability, and Track Selection Fixes** `[DONE]`
  - *Description:* Resolve three issues in the application shell:
    1. *Audio Visualizer Blank Box:* Initialize the visualizer canvas via `visualizer.init(visualizerCanvas)` on stage construction and within `setVisualizer` in `src/ui/stage.js`, ensuring `ctx` is not null. Keep visualizer animation loop active when `visualizerEnabled` is true rather than pausing into a blank canvas while audio is idle. Fix `onToggleVisualizer` in `src/main.js` and `src/ui/keyboard.js` to query actual enabled state (`isVisualizerEnabled`) instead of `vizCanvas.style.display !== 'none'` (which previously evaluated true constantly and toggled the visualizer off every time).
    2. *Feedback UI Discoverability:* Expose the Diagnostics & Feedback modal prominently in the interface by adding a direct `Feedback` button to Stage Row 1 (`.stage-btn-feedback` in `.stage-row1-actions` alongside overflow menu) and Browse Sheet Row 1 (`.browse-feedback-btn` alongside `+ Folder`), and adding keyboard shortcuts (`KeyD` and `Shift+Slash` / `?`) to toggle the feedback layer in `src/ui/keyboard.js`.
    3. *Source Switching & Track Selection Bug:* Fix the inverted argument ordering in `layers.register('browse', ...)` in `src/main.js` (`onPlayTrack: (track, tracks, index)` instead of `(track, index, tracks)`), preventing `setQueue` from clearing the queue or throwing `TypeError` when clicking another track. Update `togglePlaybackSource` in `src/main.js` so switching from Radio to Local when no prior track was selected opens the library browse sheet and displays `[CHOOSE A TRACK]` rather than arbitrarily auto-playing `available[0]`. Bump Service Worker cache to `localjam-v2026.09.048`.
  - *Associated Commits:* `722a141`, `e2453a8`, `343306c`

- [x] **FR 31: Fix Browser Initialization ReferenceError, Appearance Deprecation, and Permissions-Policy Warning** `[DONE]`
  - *Description:* Resolve browser console errors and deprecation warnings:
    1. *Initialization ReferenceError (`equalizer is not defined`):* In `src/main.js`, explicitly import `{ equalizer } from './player/equalizer.js'`, eliminating the fatal bootstrap crash during `createFeedbackModal` initialization and restoring stage mounting.
    2. *Non-Standard `slider-vertical` Deprecation:* In `src/ui/app.css`, remove `-webkit-appearance: slider-vertical;` from `.eq-slider` while preserving standardized `writing-mode: vertical-lr; direction: rtl;`, eliminating Chromium's deprecation console warning.
    3. *Permissions-Policy Header Warnings:* In `sw.js`, add `sanitizeNavigationResponse` to intercept document navigation requests and replace GitHub Pages' edge-injected unrecognized/deprecated Privacy Sandbox features (`browsing-topics`, `run-ad-auction`, `join-ad-interest-group`, `private-state-token-redemption`, `private-state-token-issuance`, `private-aggregation`, `attribution-reporting`) with the clean, standardized permissions policy (`accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()`). Bump Service Worker cache to `localjam-v2026.09.049`.
  - *Associated Commits:* `237b105`

- [x] **FR 32: Repository Directory Structure Reorganization & Ruthless Simplification** `[DONE]`
  - *Description:* Streamline repository root and eliminate legacy staging artifacts:
    1. *Markdown Reorganization:* Consolidate 6 loose investigation, audit, and critique reports (`PWA_UPDATE_INVESTIGATION_REPORT.md`, `RADIO_MOBILE_UX_REPORT.md`, `SECURITY_REPORT.md`, `UX_CRITIQUE_REPORT.md`, `UX_REVIEW_REPORT.md`, `VISUALIZER_INVESTIGATION_REPORT.md`) into `docs/reports/` and move `CHECKLIST.md` to `docs/CHECKLIST.md`. Add `docs/README.md` navigation index and update `test/hygiene.test.js` to inspect `docs/CHECKLIST.md`.
    2. *Obsolete `v2/` Application Shell Removal:* Delete redundant `v2/` directory (`v2/index.html`) created during earlier multi-branch transition. Root `index.html` is the sole, authoritative one-screen minimalist player shell.
    3. *Obsolete `404.html` Fallback Removal:* Remove `404.html` introduced solely for legacy `/v2` subpath redirection. LocalJam is a hash-routed SPA (`/#/`, `/#/browse`) that does not require server-side subpath rewrites.
    4. *Service Worker & Asset Streamlining:* In `sw.js`, remove `./404.html` and `./v2/index.html` from `APP_SHELL_ASSETS`, simplify offline navigation fallback to `./index.html`, and bump cache version to `localjam-v2026.09.050`. Update `test/pwa/pwa-assets.test.js` to assert single authoritative shell and absence of legacy artifacts.
    5. *Documentation Synchronization:* Update `README.md`, `GEMINI.md`, and `PROMPT.md` to reflect the streamlined layout.

