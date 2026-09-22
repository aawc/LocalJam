# LocalJam

> **Your music. Your device.**
>
> 🌐 **Live Deployed App:** [https://varun.khaneja.org/LocalJam/](https://varun.khaneja.org/LocalJam/)

LocalJam is a privacy-first, local-first music and media player built as a Progressive Web App (PWA). It provides a polished, desktop-grade listening experience directly in the browser while keeping your personal music files strictly on your local device.

---

## Key Features

- **Privacy-First & Local-First:** Your files are never uploaded, sent to third-party servers, or duplicated into browser storage. LocalJam indexes metadata into IndexedDB and accesses your audio directly from your local filesystem.
- **Extreme Minimalist & Tactile Design:** Built on Dieter Rams' *"Less, but better"* principle with a deep matte slate palette, Swiss typography, tabular monospace metrics, subtle glassmorphic backdrop filters, and refined micro-interactions.
- **Cross-Platform Resilience (Tiered Storage):**
  - **Tier 1 (Chromium Desktop):** Uses the File System Access API (`showDirectoryPicker`) for persistent directory handles and background re-authorization.
  - **Tier 2 (Firefox, Safari, Android & iOS):** Session-based file registry with persistent metadata indexing and fast $O(N)$ folder re-association.
- **Zero-Dependency Chunked Binary Metadata Engine:** Custom high-performance binary parsers for ID3v2 (v2.2, v2.3, v2.4 with APIC cover extraction), FLAC (STREAMINFO, VORBIS_COMMENT, PICTURE), M4A/MP4 (`moov.udta.meta.ilst`), and smart filename heuristics. Reads only 128 KB headers to prevent out-of-memory issues.
- **Hybrid Web Audio Engine:**
  - 10-band graphic equalizer with presets (Flat, Rock, Pop, Jazz, Bass Boost, Vocal, Treble Boost).
  - Real-time canvas audio visualizers (Spectrum Bars, Oscilloscope Waveform, Circular Nebula, Starfield).
  - Media Session API integration with lockscreen album art and timeline synchronization.
  - Seamless memory management with automatic `URL.revokeObjectURL()` lifecycle.
- **Unified One-Screen Stage Viewport:** A distraction-free 6-row player canvas (Status Chips, Artwork/Visualizer Canvas, Track & Station Metadata, Timeline Scrubber / Live Telemetry, Transport Cluster, and Dual-Source Handle Bar) with zero permanent sidebar or footer chrome.
- **Dual-Source Audio Architecture:** Seamless instant switching between your local music library and 45+ curated internet radio streams via the Dual-Source Handle Bar (`[ Local ] · [ Radio ]`) or keyboard shortcut (`X`).
- **Layered Sheet & Modal Hierarchy (L1 / L2):**
  - **L1 Browse Sheet (`src/ui/components/browse-sheet.js`):** Unified slide-up browser for local songs, albums, artists, playlists, favorites, and live radio streams with instant filter search.
  - **L2 Overflow Menu (`src/ui/components/overflow-menu.js`):** Auxiliary controls (Star, Shuffle, Repeat, Volume, Equalizer, Visualizer, Folder Import, Rescan, Release Notes, and confirmed Library Reset).
- **Tactile Gesture & Keyboard Navigation:** Swipe horizontally across the source bar to switch audio sources, tap artwork to cycle visualizers, double-tap to star/favorite, long-press to open overflow menu, and use wheel or middle-click anywhere on stage for volume and mute.
- **Red-Green Color Blindness Accessible:** Designed with dual-coded status indicators (explicit text labels `[PASS]`, `[FAIL]`, `[LIVE]`, `[READY]`, `[STARRED]`, `[DESTRUCTIVE]` + distinct geometric symbols), high-contrast focus rings, and accessible color palettes.
- **Standardized Release Management & Semantic Tagging:** Dynamic timestamped semantic tagging (`v$yyyy.$mm.$nnn`), automated repository tag push, and integrated release notes modal listing commit history and highlights.
- **Automatic Update Detection & Refresh Toast:** Background update checker with Service Worker `updatefound` listeners and `version.json` polling providing one-click seamless application refresh.
- **100% Offline PWA & GitHub Pages Ready:** Cache-first Service Worker with relative asset paths for effortless deployment to GitHub Pages subpaths.

---

## Architecture Overview

```text
User Filesystem (Authoritative Source)
         │
         ▼
[LocalJam Two-Tier Storage Abstraction]
   ├── Chromium Desktop: FileSystemDirectoryHandle (Persistent)
   └── Firefox / Safari / Mobile: Session Registry + Deterministic Metadata Indexing
         │
         ▼
[IndexedDB (LocalJamDB_v1)]
   ├── roots (Directory handles / Root configurations)
   ├── tracks (Metadata index, durations, genres, years, tags)
   ├── artwork (Deduplicated 256x256 thumbnail cache)
   ├── playlists (Custom user playlists)
   ├── favorites (Starred tracks)
   ├── playHistory (Playback log)
   ├── stations (Curated & custom internet radio)
   ├── playbackState (Queue, position, active track, repeat/shuffle)
   └── settings (Theme, equalizer gains, crossfade)
         │
         ▼
[Hybrid Audio Engine] ──> Web Audio API Graph (EQ, Analyser) ──> Speakers
```

### UI Layer & Stage Hierarchy

```text
┌─────────────────────────────────────────────────────────────────┐
│                      Layer Root (L1 / L2)                       │
│  ├── L1: Browse Sheet (#/browse?tab=library|radio)              │
│  ├── L2: Overflow Menu (•••)                                    │
│  ├── L2: 10-Band Equalizer Modal                                │
│  └── L2: Release Notes Dialog                                   │
├─────────────────────────────────────────────────────────────────┤
│                     Stage Root (L0 Viewport)                    │
│  ├── Row 1: Status Chips [★][SHUFFLE][EQ] + [•••] Menu Trigger  │
│  ├── Row 2: 280x280 Artwork / Real-Time Canvas Visualizer       │
│  ├── Row 3: Track Title / Station Metadata                      │
│  ├── Row 4: Timeline Scrubber / Live Stream Telemetry           │
│  ├── Row 5: Transport Cluster (⏮  ↺15  ▶ / ⏸  ↻15  ⏭)           │
│  └── Row 6: Dual-Source Handle Bar [ Local ] · [ Radio ]        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Getting Started & Local Development

LocalJam has zero runtime dependencies and requires only modern Node.js (Node 22+) for running the test harness and local development server.

### Prerequisites

- Node.js v22.0.0 or higher

### Running Locally

To start the built-in development server:

```bash
node server.js
```

Then open your browser to:
`http://localhost:3000`

---

## Running Automated Tests

LocalJam uses Node.js 22's built-in test runner with strict assertions:

```bash
# Run all unit, integration, and hygiene test suites
node --test
```

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `ArrowLeft` / `ArrowRight` | Seek backward / forward 5s (local tracks) |
| `Shift + ArrowLeft` / `Shift + ArrowRight` | Previous / Next track |
| `ArrowUp` / `ArrowDown` | Volume +5% / -5% with `[VOLUME XX%]` toast |
| `M` | Toggle Mute with `[MUTED]` toast |
| `X` | Switch audio source (Local Files ⇋ Internet Radio) |
| `S` | Toggle Shuffle (tracks only) with `[SHUFFLE: ON/OFF]` toast |
| `R` | Cycle Repeat (`off` -> `all` -> `one`, tracks only) |
| `F` | Toggle Star / Favorite with `[STARRED]` toast |
| `E` | Toggle 10-Band Equalizer modal |
| `V` | Cycle Canvas Visualizer mode (Off -> Bars -> Wave -> Nebula -> Starfield) |
| `L` | Toggle Browse Sheet (Local Library tab) |
| `Shift + L` | Open Browse Sheet (Internet Radio tab) |
| `/` | Open Browse Sheet with focus in search |
| `.` | Open Overflow Menu (`•••`) |
| `Escape` | Dismiss active input / Close topmost layer |

---

## Deployment & Live Access

LocalJam is deployed and accessible at:
- 🌐 **Production URL:** [https://varun.khaneja.org/LocalJam/](https://varun.khaneja.org/LocalJam/)

LocalJam is configured with relative asset paths and hash-based routing (`/#/`), making it directly hostable via GitHub Pages:

1. Push this repository to the remote (`git@github.com:aawc/LocalJam.git`).
2. In the repository settings on GitHub, navigate to **Settings > Pages**.
3. Select **Deploy from a branch** and choose `main` (root directory `/`).
4. LocalJam will be live at `https://aawc.github.io/LocalJam/` (or your custom domain).


## Documentation & Repository Layout

Detailed technical specifications, implementation roadmaps, audit reports, and task tracking records are consolidated in the `docs/` directory:

- 📖 **[Documentation Index](docs/README.md):** Overview of all repository specifications, plans, and reports.
- 📋 **[Task Execution Checklist](docs/CHECKLIST.md):** Chronological log of resolved issues, feature requests, and associated commit hashes.
- 📐 **[Minimalist Player Specification](docs/design/2026-09-15-minimalist-player-redesign.md):** Architectural specification for the unified Stage viewport and Dual-Source audio engine.
- 🛡️ **[Security Audit Report](docs/reports/SECURITY_REPORT.md):** Security analysis, CSP policies, and response sanitization.
- 📊 **[Audit & Investigation Reports](docs/reports/):** Deep-dive reports on PWA lifecycle, streaming UX, and Web Audio visualizers.

---

## License

MIT License. Designed and engineered for privacy and local ownership of your media.
