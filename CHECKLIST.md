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
  - *Associated Commits:* `[PENDING]`

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
