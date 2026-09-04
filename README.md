# LocalJam

> **Your music. Your device.**

LocalJam is a privacy-first, local-first music and media player built as a Progressive Web App (PWA). It provides a polished, desktop-grade listening experience directly in the browser while keeping your personal music files strictly on your local device.

---

## Key Features

- **Privacy-First & Local-First:** Your files are never uploaded, sent to third-party servers, or duplicated into browser storage. LocalJam indexes metadata into IndexedDB and accesses your audio directly from your local filesystem.
- **Cross-Platform Resilience (Tiered Storage):**
  - **Tier 1 (Chromium Desktop):** Uses the File System Access API (`showDirectoryPicker`) for persistent directory handles and background re-authorization.
  - **Tier 2 (Firefox, Safari, Android & iOS):** Session-based file registry with persistent metadata indexing and fast $O(N)$ folder re-association.
- **Zero-Dependency Chunked Binary Metadata Engine:** Custom high-performance binary parsers for ID3v2 (v2.2, v2.3, v2.4 with APIC cover extraction), FLAC (STREAMINFO, VORBIS_COMMENT, PICTURE), M4A/MP4 (`moov.udta.meta.ilst`), and smart filename heuristics. Reads only 128 KB headers to prevent out-of-memory issues.
- **Hybrid Web Audio Engine:**
  - 10-band graphic equalizer with presets (Flat, Rock, Pop, Jazz, Bass Boost, Vocal, Treble Boost).
  - Real-time canvas audio visualizers (Spectrum Bars, Oscilloscope Waveform, Circular Nebula, Starfield).
  - Media Session API integration with lockscreen album art and timeline synchronization.
  - Seamless memory management with automatic `URL.revokeObjectURL()` lifecycle.
- **Internet Radio:** Curated HTTPS internet radio stations (Radio Paradise, SomaFM, DEF CON Radio, BBC Radio 6, KEXP) with CORS-resilient direct playback.
- **Red-Green Color Blindness Accessible:** Designed with dual-coded status indicators (color + distinct SVG icons + text labels), high-contrast dark theme, and visible focus rings.
- **Global Keyboard Controls:** Complete hotkey matrix for playback, volume, seeking, queue, equalizer, visualizer, and search.
- **100% Offline PWA & GitHub Pages Ready:** Cache-first Service Worker with hash-based client routing (`/#/`) and relative asset paths for effortless deployment to GitHub Pages subpaths.

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
`http://localhost:3000` (or `http://xlarge-n2-96.c.googlers.com:3000`)

---

## Running Automated Tests

LocalJam uses Node.js 22's built-in test runner with strict assertions:

```bash
# Run all unit and integration test suites
node --test test/**/*.test.js
```

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `ArrowRight` / `ArrowLeft` | Seek forward / backward 5s |
| `Shift + ArrowRight` / `Shift + ArrowLeft` | Next track / Previous track |
| `ArrowUp` / `ArrowDown` | Volume +5% / -5% |
| `M` | Toggle Mute |
| `S` | Toggle Shuffle |
| `R` | Cycle Repeat (`off` -> `all` -> `one`) |
| `Q` | Toggle Queue Drawer |
| `E` | Toggle 10-Band Equalizer |
| `V` | Toggle Full-Screen Visualizer |
| `/` or `Ctrl+K` | Focus Search Bar |
| `Escape` | Close Overlays / Modals |

---

## Deploying to GitHub Pages

LocalJam is configured with relative asset paths and hash-based routing (`/#/`), making it ready for GitHub Pages:

1. Push this repository to your GitHub account (e.g. `https://github.com/<username>/LocalJam`).
2. In the repository settings, navigate to **Pages**.
3. Select **Deploy from a branch** and choose `main` (root directory `/`).
4. LocalJam will be live at `https://<username>.github.io/LocalJam/`.

---

## License

MIT License. Designed and engineered for privacy and local ownership of your media.
