# LocalJam: Authoritative Production Architecture & Specification

**Tagline:** *Your music. Your device.*  
**Application Type:** Progressive Web App (PWA) — Privacy-First, Local-First Music & Media Player  
**Target Environments:** Android (Chrome), iOS/iPadOS (Safari PWA), Desktop (Chrome, Edge, Firefox, Safari), Hosted on GitHub Pages  
**Author:** Varun Khaneja <git.bin@khaneja.org>  

---

## 1. Product Vision & Principles

LocalJam is a desktop-grade, privacy-first audio and media player built entirely with standard web platform technologies. It allows users to index, organize, and play their personal music collections directly from their local filesystem without uploading files or copying them into internal browser storage.

### Core Product Principles
1. **Zero Uploads & Zero Unrequested Duplication:** The user's local filesystem is the single authoritative source of truth. LocalJam stores metadata, playlist definitions, and playback state in IndexedDB, but never duplicates audio media files by default.
2. **True Cross-Platform Resilience (Tiered Storage):** Seamlessly operates across Chromium Desktop (File System Access API with persistent handles), Desktop Firefox / Safari (session-based directory imports with persistent metadata), and Mobile devices (file picker fallbacks).
3. **Zero-Dependency Lightweight Core:** Built with modern vanilla Web Standards (ES Modules, Web Audio API, IndexedDB, Service Workers, Canvas) and zero bloated runtime libraries.
4. **Color-Blind Accessible & Keyboard-First Design:** Complete WCAG 2.1 AA compliance with dual-coded status indicators (color + distinct SVG icons + text labels), high-contrast focus rings, and an extensive keyboard navigation matrix.
5. **Instant Offline PWA & GitHub Pages Subpath Ready:** Loads instantly offline via Cache-First Service Worker, handles subpath hosting (`https://<user>.github.io/LocalJam/`) via relative assets and Hash-Based routing (`/#/`).

---

## 2. Tiered Storage & Filesystem Persistence Architecture

Browsers exhibit asymmetric filesystem capabilities. LocalJam implements a **Two-Tier Storage Abstraction**:

```text
                                  [ User Action ]
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
       [ Chromium Desktop (Tier 1) ]             [ Firefox / Safari / Mobile (Tier 2) ]
                   │                                           │
      showDirectoryPicker()                      <input type="file" webkitdirectory>
                   │                                           │
      FileSystemDirectoryHandle                               FileList (Ephemeral Memory)
                   │                                           │
    ┌──────────────┴──────────────┐             ┌──────────────┴──────────────┐
    ▼                             ▼             ▼                             ▼
Persist Handle in IDB       Extract Meta    In-Memory File Registry     Extract Meta
(Perms Retained on Reload)        │         (Re-connect on Reload)            │
    │                             ▼             │                             ▼
    └───────────────────────> IndexedDB <───────┴─────────────────────────────┘
                              (Tracks, Playlists, State)
```

### Tier 1: Persistent FSAA (Chromium Desktop: Chrome, Edge, Brave, Opera)
- Uses `window.showDirectoryPicker({ mode: 'read' })`.
- Serializes `FileSystemDirectoryHandle` into IndexedDB (`roots` store).
- On application launch:
  1. Retrieve `FileSystemDirectoryHandle` from IndexedDB.
  2. Query permission via `await handle.queryPermission({ mode: 'read' })`.
  3. If status is `'granted'`, immediately unlock library for playback.
  4. If status is `'prompt'`, render a clear `[Action Required: Re-authorize Music Folder]` prompt on the first user interaction.

### Tier 2: Session-Only Ephemeral File Registry with Persistent Metadata (Firefox, Safari, Mobile Chrome/iOS)
- Uses `<input type="file" webkitdirectory multiple>` or `<input type="file" multiple accept="audio/*,video/*">`.
- Persists all metadata, playlists, history, and favorites in IndexedDB keyed by a deterministic identifier:  
  `id = sha256(relativePath + ":" + size + ":" + lastModified)`.
- Maintains an in-memory `SessionFileRegistry` (`Map<string, File>`).
- On page reload:
  - Library metadata remains fully visible and navigable offline.
  - Track rows display a `[Needs Reconnection]` indicator.
  - Clicking "Reconnect Folder" triggers directory re-selection. LocalJam performs an $O(N)$ reconciliation matching scanned files against existing IDs by relative path and size without re-parsing binary audio tags.

---

## 3. Authoritative IndexedDB Schema (`LocalJamDB_v1`)

LocalJam uses IndexedDB for persistent state with compound indices:

```text
LocalJamDB_v1
├── roots           (Key: id [UUID])
├── tracks          (Key: id [Deterministic Hash])
├── artwork         (Key: artworkId [Album/Artist Hash])
├── playlists       (Key: id [UUID])
├── favorites       (Key: trackId [String])
├── playHistory     (Key: id [Auto-Increment])
├── stations        (Key: id [String])
├── playbackState   (Key: key ["singleton"])
└── settings        (Key: key ["singleton"])
```

### Object Store Specifications

#### 1. `roots`
- **Fields:** `{ id: string, name: string, type: 'fsaa'|'session', handle: FileSystemDirectoryHandle|null, addedAt: number, lastScannedAt: number, trackCount: number }`

#### 2. `tracks`
- **Fields:** `{ id: string, rootId: string, relativePath: string, filename: string, size: number, mtime: number, title: string, artist: string, album: string, albumArtist: string, genre: string, year: number|null, trackNumber: number|null, discNumber: number|null, duration: number, bitrate: number|null, sampleRate: number|null, artworkId: string|null, isMissing: boolean, dateAdded: number }`
- **Indexes:**
  - `by_root_path`: `[rootId, relativePath]` (unique)
  - `by_artist`: `artist`
  - `by_album`: `[albumArtist, album]`
  - `by_album_name`: `album`
  - `by_title`: `title`
  - `by_genre`: `genre`
  - `by_date_added`: `dateAdded`
  - `by_missing`: `isMissing`

#### 3. `artwork`
- **Fields:** `{ artworkId: string, mimeType: string, thumbnailDataUrl: string (max 256x256 WebP/JPEG, ~15KB) }`
- **Memory Optimization:** Artwork is deduplicated by artist and album. Large multi-megabyte embedded images are downsampled to lightweight 256x256 thumbnails to prevent IndexedDB storage quota exhaustion.

#### 4. `playlists`
- **Fields:** `{ id: string, name: string, description: string, createdAt: number, updatedAt: number, trackIds: string[], coverArtworkId: string|null }`

#### 5. `favorites`
- **Fields:** `{ trackId: string, favoritedAt: number }`

#### 6. `playHistory`
- **Fields:** `{ id: number (auto), trackId: string, playedAt: number, playbackDuration: number, completed: boolean }`
- **Indexes:** `by_played_at`: `playedAt`

#### 7. `stations`
- **Fields:** `{ id: string, name: string, description: string, streamUrl: string, homepageUrl: string, favicon: string, genre: string, country: string, bitrate: string, isCustom: boolean, isFavorite: boolean }`

#### 8. `playbackState`
- **Fields:** `{ key: "singleton", currentTrackId: string|null, position: number, queue: Array<{ uid: string, trackId: string }>, queueIndex: number, shuffle: boolean, repeat: 'off'|'all'|'one', volume: number, muted: boolean, eqGains: number[], visualizerType: string }`

#### 9. `settings`
- **Fields:** `{ key: "singleton", theme: 'dark', crossfadeSeconds: number, visualizerEnabled: boolean, colorblindMode: string, sleepTimerMinutes: number|null }`

---

## 4. Zero-Dependency Chunked Binary Metadata Engine

To prevent Out-Of-Memory (OOM) browser crashes when scanning tens of thousands of tracks, LocalJam parses binary headers by reading only small slices (`file.slice(0, 131072)` — 128 KB):

### 1. ID3v2 Parser (`MP3`, `AIFF`)
- **Header:** Verifies `ID3` magic bytes (0x49, 0x44, 0x33), reads major version (2.2, 2.3, 2.4), flags, and decodes 28-bit synchsafe header size.
- **Frames:** Reads frame headers and extracts:
  - `TIT2` (Title), `TPE1` (Lead Artist), `TPE2` (Album Artist), `TALB` (Album), `TRCK` (Track Number), `TPOS` (Disc Number), `TCON` (Genre), `TYER` / `TDRC` (Year).
  - `APIC` (Attached Picture): Extracts MIME type, picture type (0x03 = Cover Front), and raw image byte slice.
- **Encodings:** Supports ISO-8859-1 (0x00), UTF-16 with BOM (0x01), UTF-16BE (0x02), and UTF-8 (0x03) using `TextDecoder`.
- **ID3v1 Fallback:** Reads `file.slice(-128)` for legacy `TAG` records.

### 2. FLAC & Ogg Vorbis Parser (`FLAC`, `OGG`, `OPUS`)
- **FLAC Magic:** Verifies `fLaC` (0x66, 0x4C, 0x61, 0x43).
- **Metadata Blocks:** Traverses `METADATA_BLOCK_HEADER`:
  - `Block 0 (STREAMINFO)`: Extracts sample rate, channels, and total samples to calculate exact duration in seconds.
  - `Block 4 (VORBIS_COMMENT)`: Parses UTF-8 vendor string and comment vector (`TITLE=`, `ARTIST=`, `ALBUM=`, `ALBUMARTIST=`, `TRACKNUMBER=`, `GENRE=`, `DATE=`).
  - `Block 6 (PICTURE)`: Parses picture type, MIME string, description, and raw image bytes.

### 3. M4A / MP4 ISO Base Media Atom Parser (`M4A`, `AAC`, `MP4`)
- **Atom Traversal:** Recursively parses 8-byte atom headers `[4-byte length, 4-byte fourcc]` to navigate `moov` -> `udta` -> `meta` -> `ilst`.
- **Metadata Atoms:** Reads `©nam` (Title), `©ART` (Artist), `aART` (Album Artist), `©alb` (Album), `trkn` (Track), `disk` (Disc), `©day` (Year), `©gen` / `gnre` (Genre), and `covr` (Artwork).

### 4. Filename & Directory Heuristics Fallback
When embedded tags are absent, the parser derives clean metadata from path patterns:
- `Artist/Album/01 - Song Title.mp3` -> Artist, Album, Track 1, Title.
- `01. Artist - Song.flac` -> Track 1, Artist, Title.
- `Song Title.wav` -> Title.

---

## 5. 3-Way Filesystem Reconciliation Engine

When the user rescans a library or starts the app:
1. **Scan Discovery:** Traverses directory handles or session file lists, producing `{ relativePath, size, mtime, handle }`.
2. **Database Reconciliation:**
   - **Unmodified:** `relativePath` matches DB AND `size === db.size` AND `abs(mtime - db.mtime) < 1000ms`. Retains existing metadata without re-reading files.
   - **Modified:** `relativePath` matches DB but size/mtime changed. Re-parses binary metadata and updates DB.
   - **Renamed / Moved Heuristic:** Missing DB records are matched against new unscanned files where `filename === db.filename` AND `size === db.size`. Updates `relativePath` while preserving Track ID, playlists, and favorites.
   - **Deleted / Missing:** Unmatched DB records are marked `isMissing = true` (soft delete) with a distinct visual badge. Playlists retain track references.

---

## 6. Hybrid Audio Engine, Equalizer, Visualizer & Media Session

LocalJam implements a hybrid Web Audio API and HTMLAudioElement playback engine:

```text
[Local Media Object URL] ──> [HTMLAudioElement A/B] ──> [MediaElementSourceNode]
                                                                  │
                                                                  ▼
                                                      [10-Band BiquadFilter EQ]
                                                                  │
                                                                  ▼
                                                      [GainNode (Crossfader)]
                                                                  │
                                                                  ▼
                                                      [AnalyserNode (FFT 2048)]
                                                                  │
                                                                  ▼
                                                      [AudioContext.destination]

[Internet Radio Stream]  ──> [HTMLAudioElement Radio]
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼ (CORS Permitted)                      ▼ (CORS Blocked)
      [MediaElementSourceNode]                   [Direct Speaker Output]
                 │                               (EQ/Visualizer Gracefully Disabled)
                 ▼
      [Web Audio Graph]
```

### Key Audio Engine Capabilities
1. **Object URL Lifecycle & Memory Leak Protection:** Maintains an active URL registry. Revokes obsolete object URLs via `URL.revokeObjectURL()` immediately when a track completes or changes.
2. **10-Band Graphic Equalizer:** ISO Standard center frequencies: 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz with presets (Flat, Bass Boost, Treble Boost, Rock, Pop, Jazz, Vocal).
3. **Canvas Visualizer:** High-performance real-time visualization fed by `AnalyserNode`:
   - Spectrum Bars (with peak decay meters)
   - Oscilloscope Waveform
   - Circular Frequency Nebula
   - Audio Starfield
4. **Internet Radio & CORS Resilience:** Curated HTTPS radio streams (Radio Paradise Main, Mellow, Rock, World/Eclectic; SomaFM Groove Salad, DEF CON Radio; BBC Radio 6; KEXP). If an external stream blocks Web Audio CORS, audio falls back to direct `HTMLAudioElement` speaker output without crashing the player.
5. **Media Session API Integration:** Sets lockscreen metadata (title, artist, album, multi-size artwork icons) and handles action events (`play`, `pause`, `previoustrack`, `nexttrack`, `seekbackward`, `seekforward`, `seekto`). Synchronizes position state via `navigator.mediaSession.setPositionState()`.

---

## 7. Color-Blind Accessible Design & Keyboard Matrix

LocalJam enforces complete red-green color blindness accessibility (Protanopia, Deuteranopia, Tritanopia) and full keyboard navigation.

### Color-Blind Safe Design System
- **Dual-Coding Mandate:** Never convey status using color alone. Every indicator pairs color with distinct SVG icons and explicit text labels:
  - `[PASS]` / `[AVAILABLE]`: Cyan/Teal (`#38bdf8`) + Checkmark `✓`
  - `[WARN]` / `[RECONNECT]`: Amber (`#fbbf24`) + Triangle `▲`
  - `[FAIL]` / `[MISSING]`: Rose/Magenta (`#f43f5e`) + Slashed Circle `⊘`
  - `[PLAYING]`: Purple (`#a855f7`) + Sound Wave Bars `ılı`
- **High Contrast Dark Theme:**
  - Background: `#0b0f17` | Card/Surface: `#131a26` | Border: `#1e293b`
  - Text Primary: `#f8fafc` | Text Muted: `#94a3b8`
  - Focus Ring: `outline: 2px solid #38bdf8; outline-offset: 2px`

### Global Keyboard Navigation Matrix
- `Space`: Play / Pause (guarded when typing in search or text inputs)
- `ArrowRight` / `ArrowLeft`: Seek forward / backward 5 seconds
- `Shift + ArrowRight` / `Shift + ArrowLeft`: Next / Previous track
- `ArrowUp` / `ArrowDown`: Volume +5% / -5%
- `M`: Toggle Mute
- `S`: Toggle Shuffle
- `R`: Cycle Repeat Mode (`off` -> `all` -> `one`)
- `Q`: Toggle Playback Queue Drawer
- `E`: Toggle Equalizer Modal
- `V`: Toggle Audio Visualizer Mode
- `/` or `Ctrl+K` / `Cmd+K`: Focus Search Input
- `Escape`: Close Modals / Overlays / Unfocus Search

---

## 8. PWA, Service Worker & GitHub Pages Subpath Specification

LocalJam is engineered to run seamlessly as an offline PWA on any subpath or custom domain:

1. **Relative Path Resolution:** All asset links in `index.html`, CSS, and JavaScript use relative paths (`./`) rather than root-relative paths (`/`), ensuring instant functionality under `https://<username>.github.io/LocalJam/`.
2. **Hash-Based Client Router:** Uses `/#/home`, `/#/songs`, `/#/albums`, `/#/artists`, `/#/genres`, `/#/playlists`, `/#/favorites`, `/#/history`, `/#/radio`, `/#/settings`. Hash routing prevents 404 errors on GitHub Pages without requiring server rewrite configuration.
3. **Cache-First App Shell Service Worker:**
   - Caches HTML, CSS, JavaScript modules, fonts, and SVG icons.
   - Explicitly bypasses `blob:`, `data:`, and streaming internet radio audio URLs from Cache Storage.
   - Includes update notification when a new service worker version is waiting.
4. **Web App Manifest (`manifest.webmanifest`):**
   - Configures `display: "standalone"`, `start_url: "./index.html"`, `theme_color: "#0b0f17"`, and standard icon sets (192x192, 512x512, maskable).

---

## 9. Automated Testing Harness (Node 22 Built-In Test Runner)

LocalJam enforces automated unit and integration tests using `node:test` and `node:assert/strict`:

- **Execution Command:** `node --test test/**/*.test.js`
- **Test Suites:**
  1. `test/metadata/id3v2.test.js`: Synthetic ArrayBuffer fixtures verifying synchsafe integer math, ID3v2.3/v2.4 frame decoding (TIT2, TPE1, TALB, APIC), UTF-8/UTF-16 encodings, and corrupted stream recovery.
  2. `test/metadata/flac.test.js`: FLAC header magic, STREAMINFO duration calculations, VORBIS_COMMENT tag vectors, and PICTURE block extraction.
  3. `test/metadata/m4a.test.js`: ISO Base Media File Format atom tree navigation (`moov.udta.meta.ilst`) for M4A/AAC tags.
  4. `test/metadata/filename.test.js`: Filename heuristic parser handling structured folders and non-tagged media.
  5. `test/storage/reconciler.test.js`: 3-way filesystem diffing (additions, modifications, heuristic renames, soft-deleted missing files).
  6. `test/player/queue.test.js`: Queue operations (enqueue, insert next, reorder, Fisher-Yates shuffle retaining active track, repeat modes).
  7. `test/player/equalizer.test.js`: 10-band EQ gain clamping, frequency map, and preset curves.
  8. `test/radio/stations.test.js`: Curated radio stream metadata validation and HTTPS URL formatting.
  9. `test/pwa/pwa-assets.test.js`: Service worker asset manifest completeness, manifest.webmanifest format validation, and relative path integrity.

---

## 10. Implementation Deliverables & Quality Bar

Every component must contain complete, functional logic. No bare `TODO`, `pass`, or placeholder stubs. All commits must be small, single-purpose, and independently verified. After each commit, local branch changes must be pushed immediately to the `github-aawc` remote.

