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
  - *Associated Commits:* `51360b0`, `[PENDING]`

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

