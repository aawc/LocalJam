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
   - Hash-based routing (`/#/`).
   - Cache-first Service Worker (`sw.js`).

---

## Verification & Subagent Review Requirements

- Every commit must be atomic, single-purpose, and independently reviewable.
- Author for all commits: `Varun Khaneja <git.bin@khaneja.org>`.
- No internal tracking tags (`TAG=agy`, `CONV=<id>`) in git commit messages.
- Every commit must be reviewed by an expert subagent prior to committing.
- Automated tests must run with concrete inputs, real assertions, and pass 100%.
- After each commit, the local branch changes must be pushed immediately to the `github-aawc` remote (`git push github-aawc <branch>`).

