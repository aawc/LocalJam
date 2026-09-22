# GEMINI.md - LocalJam Development Context & Standards

## Project Identity
- **Repository:** LocalJam (Varun Khaneja <git.bin@khaneja.org>)
- **Type:** Progressive Web App (PWA) / Local-First Audio Player
- **Core Technology:** Vanilla JavaScript (ES Modules), Web Audio API, IndexedDB, Service Workers, HTML5/CSS3.
- **Testing:** Node.js 22 built-in test runner (`node --test`).

---

## Architectural Principles

1. **Local-First & Zero Duplication:**
   - The user's filesystem is the authoritative media store.
   - IndexedDB (`LocalJamDB_v1`) stores tracks, metadata, playlists, artwork thumbnails (max 256x256), history, and playback state.
   - Audio files are never permanently cloned into IndexedDB by default.

2. **Two-Tier Storage Abstraction:**
   - **Tier 1 (Chromium Desktop):** File System Access API (`showDirectoryPicker`) storing persistent directory handles.
   - **Tier 2 (Firefox, Safari, Mobile):** Session-based file registry with persistent metadata indexing and deterministic IDs.

3. **Zero-Dependency Chunked Metadata Parser:**
   - ID3v2 (v2.2, v2.3, v2.4 with APIC artwork extraction).
   - FLAC (STREAMINFO, VORBIS_COMMENT, PICTURE).
   - M4A/MP4 (`moov.udta.meta.ilst` atoms).
   - Smart filename heuristics for non-tagged audio.
   - Memory safety: inspects 128 KB chunk slices (`file.slice(0, 131072)`) to prevent browser tab out-of-memory crashes.

4. **Hybrid Audio Engine:**
   - Dual-element audio crossfading with `HTMLAudioElement` and Web Audio API graph (`MediaElementSourceNode` -> 10-Band BiquadFilter EQ -> GainNode -> AnalyserNode -> AudioContext destination).
   - Graceful fallback for CORS-restricted internet radio streams.
   - Lockscreen integration via Media Session API.

5. **Color-Blind Safe Visual Accessibility & Keyboard-First Design:**
   - Dual-coding for all statuses: explicit text labels (`[PASS]`, `[FAIL]`, `[AVAILABLE]`, `[MISSING]`, `[WARN]`), distinct SVG icons, and accessible color palettes (Cyan `#38bdf8`, Amber `#fbbf24`, Rose `#f43f5e`, Purple `#a855f7`).
   - High-contrast focus rings and full keyboard navigation.

6. **PWA & GitHub Pages Compatibility:**
   - Relative asset paths (`./`).
   - Hash-based routing (`/#/`) with clean single-shell architecture (`index.html`).
   - Cache-first Service Worker (`sw.js`).

7. **Release Automation & Dynamic Semantic Tagging:**
   - GitHub Actions workflow (`.github/workflows/release.yml`) dynamically generates timestamped semantic tags (`v$yyyy.$mm.$nnn`) using bash date commands and zero-padded GitHub run numbers (`$(printf "%03d" ${{ github.run_number }})`).
   - Automatically pushes release tags to repository (`git push origin "${TAG_NAME}"`) and bundles standalone offline zip distributions.

8. **One-Screen Minimalist Player & Layer Architecture:**
   - Unified 6-row Stage (`src/ui/stage.js`) without persistent sidebars or footers: Status Chips, Artwork/Visualizer Canvas, Track & Station Metadata, Timeline Scrubber / Stream Telemetry, Transport Cluster (Previous, Rewind 15s [Local], Play/Pause, Forward 15s [Local], Next), and Dual-Source Handle Bar (`[ Local ] · [ Radio ]`) with active-browse / inactive-toggle pill taps and semantic separator button.
   - L1 Browse Sheet (`src/ui/components/browse-sheet.js`) for library and radio queries with URL hash sync (`#/browse?tab=...`).
   - L2 Overflow Menu (`src/ui/components/overflow-menu.js`) for auxiliary controls with 8 verified stores wiped on reset (`RESET_STORE_NAMES`).
   - Layer Stack Coordinator (`src/ui/layers.js`) managing LIFO dialog stack with focus trapping and error boundary.
   - Pure pointer gesture classifier (`src/ui/gestures.js`) with deferred pointer capture on movement threshold (`TAP_MAX_PX = 10`) to preserve child button clicks, long-press timers, and swipe heuristics.
   - Global keyboard navigation matrix (`src/ui/keyboard.js`) mapped to exact §5.2 controls.

---

## Public Repository & Sanitization Standards

1. **Public Open-Source Environment:**
   - This is a public open-source project hosted on GitHub (`aawc/LocalJam`).
   - Strict host neutrality and zero corporate metadata leakage must be maintained at all times.
   - Prohibited content includes:
     - Machine-specific hostnames, private cloudtop/workstation aliases, or corporate intranet domain names.
     - Internal corporate directory hierarchies, proprietary monorepo paths, or local user home directory paths.
     - Proprietary code review tags, internal issue tracking identifiers, or company-internal tool references.
     - Corporate or internal employer email addresses. Author and committer identity must strictly use the public author configuration: `Varun Khaneja <git.bin@khaneja.org>`.
   - All documentation, configuration examples, and local server guides must reference standard localhost (`http://localhost:3000`) or the official public domain.
   - All commits and pull requests must pass automated hygiene checks prior to committing.

2. **No Local File Paths in Documentation:**
   - Never commit local absolute filesystem paths (such as `file:///path/to/file`, `/usr/local/google/home/username`, `/home/username`, `/Users/username`, `C:\Users\username`, or `/tmp/scratch`) into repository documentation, specifications, plans, design documents, investigation reports, code comments, or tracked markdown files.
   - In all repository documentation and reports, strictly reference files using repository-relative paths (e.g., `./src/player/audio-engine.js`, `src/ui/app.css#L45-L60`, or `docs/architecture.md`).
   - Chat responses and ephemeral UI artifacts may use `file:///` links for interactive editor navigation, but all content written to repository-tracked files MUST strictly use repository-relative paths.

---

## Task Execution & Verification Standards

- **Multi-Task Tracking:** When performing multiple tasks, maintain an explicit checklist of all known remaining tasks, updating their status (`[PENDING]`, `[IN_PROGRESS]`, `[DONE]`) as each item is completed.
- **Atomic Commits:** Every commit must be atomic, single-purpose, and independently reviewable.
- **Author Identity:** Author for all commits: `Varun Khaneja <git.bin@khaneja.org>`.
- **Commit Hygiene:** No internal tracking tags, private issue links, or company-specific annotations in git commit messages.
- **Subagent Review:** Every commit must be reviewed by an expert subagent prior to committing.
- **Automated Verification:** Automated tests must run with concrete inputs, real assertions, and pass 100%.
- **Remote Synchronization:** After each commit, the local branch changes must be pushed immediately to the `github-aawc` remote (`git push github-aawc <branch>`).
- **Visual Change Verification & Artifact Capture (Before and After):**
  - **Trigger Criteria:** Mandatory for any modification affecting UI layout, styling, typography, theme, modal sheets, controls, visualizer rendering, or animations. Purely non-visual changes (such as metadata parsers, storage engine algorithms, and non-UI utilities) are exempt.
  - **Capture Discipline:** Prior to altering UI code, capture the baseline ("before") state of the target component or viewport in its active, idle, or relevant interaction state. After applying modifications, capture the corresponding modified ("after") state under identical viewport dimensions, theme, and data fixtures. Both states must be preserved to provide verifiable visual regression evidence.
  - **Strict In-Repository Artifact Placement:** All screenshots and visual artifacts MUST reside directly within the repository structure under `./docs/artifacts/visual/<feature>/` (for example, `./docs/artifacts/visual/browse-sheet/`). External, temporary, or user directory paths outside the repository boundary (such as `/tmp`, `~/.gemini/jetski/brain/`, or `$HOME/`) are strictly prohibited.
  - **Deterministic Naming Convention:** Artifact filenames must adhere strictly to the pattern:
    - `<scope>-<state>-<viewport>-before.png`
    - `<scope>-<state>-<viewport>-after.png`
    - Segments: `<scope>` indicates the component in kebab-case (for example, `stage` or `browse-sheet-radio`), `<state>` indicates interaction condition (for example, `idle`, `playing-local`, or `buffering`), and `<viewport>` indicates form factor dimensions (for example, `desktop-1280x800` or `mobile-390x844`).
  - **Red-Green Colorblind Accessibility:** Visual comparisons presented in documentation, pull requests, or task reports must employ explicit comparison blocks or structured tables with distinct textual headers (such as `[BEFORE]` vs `[AFTER]` formatted columns). Never rely on color differentiation alone; pair all state transitions with dual-coded status labels.
  - **Pragmatic Headless Fallback:** In headless or non-interactive environments without a display server (e.g., CI runners, containerized sandboxes), visual capture must not fail silently or generate synthetic dummy files. Instead, record `[VISUAL CAPTURE: DEFERRED (HEADLESS ENVIRONMENT)]` in the task report and commit description, citing the specific runtime constraint, and substantiate visual correctness through automated DOM structure and layout test assertions.
  - **Mandatory Commit Description Citation:** Any commit introducing or modifying visual UI elements must explicitly cite or link the before and after visual artifacts in the commit description using repository-relative paths (for example, `./docs/artifacts/visual/<feature>/<scope>-<state>-<viewport>-before.png` and `-after.png`). If visual capture was deferred due to a headless or non-interactive environment, the commit description must explicitly record `[VISUAL CAPTURE: DEFERRED (HEADLESS ENVIRONMENT)]` along with the specific technical rationale.
