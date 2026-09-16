# LocalJam — One-Screen Minimalist Redesign (v2 — Post-Critique Revision)

**Status:** Approved Architecture & Implementation Specification
**Date:** 2026-09-15
**Scope:** Complete replacement of the LocalJam UI shell for both local-file playback and internet radio
**Audience:** An implementing agent (LLM) with no prior context on this repository

---

## 0. Executive Summary

LocalJam currently presents **24 interactive controls at rest on desktop** before the user has
played a single note: 10 sidebar links, 1 global search box, and 13 player-bar controls (artwork,
star, shuffle, previous, play/pause, next, repeat, seek, visualizer, equalizer, queue, mute,
volume). On mobile (`max-width: 768px`) the sidebar and the player-bar right cluster are hidden,
leaving **14**: 6 bottom-nav links, 1 search box, and 7 player-bar controls. These are spread over
**10 hash routes** and **19 UI modules** (10 views, 7 components, router, keyboard). The
application is a music player wearing the costume of a media library manager.

This redesign replaces that shell with a **single persistent screen (L0 Stage)** exposing **8
focused interactive targets** organized into 5 visual groups, and demotes configuration and library management to progressive layers reachable by deliberate gestures or keyboard shortcuts.

| Metric | [BEFORE] Current Shell | [AFTER] Initial Proposal (`123751d`) | [AFTER] Revised Redesign (v2) |
| --- | ---: | ---: | ---: |
| Interactive controls visible at rest (desktop) | 24 | 6 | 8 |
| Interactive controls visible at rest (mobile) | 14 | 6 | 8 |
| Hash routes | 10 | 2 | 2 |
| UI view modules (`src/ui/views/`) | 10 | 0 | 0 |
| UI component modules (`src/ui/components/`) | 7 | 6 | 6 |
| `src/ui/app.css` line count | 2138 | ≤ 700 (target) | ≤ 700 (target) |
| Taps to resume playback on cold start | 2 (nav → row/card) | 2 (handle → row) | **1 (`Space` / Play button)** |
| Taps to pick a different local song from cold start | 2 (nav → row) | 2 (handle → row) | **2 (`[Local]` pill → row)** |
| Taps to pick a different radio station from cold start | 2 (nav → card) | 3 (handle → tab → row) | **2 (`[Radio]` pill → row)** |
| Gestures to toggle between Local track & Radio station | 2 (nav → card/row) | 3 (handle → tab → row) | **1 (swipe handle bar or press `X`)** |

Nothing in the core audio pipeline (`src/player/audio-engine.js`), metadata parser (`src/metadata/*`), IndexedDB storage schema (`src/storage/db.js`), or radio station catalog (`src/radio/stations.js`) is destructively altered. This is a complete UI-shell replacement paired with proper cold-start state hydration.

---

### 0.1 Adversarial Critique of Initial Proposal (`123751d`)

An adversarial technical audit of the initial minimalist redesign proposal (`123751d`) against the codebase and the goal ("allow the user to play and control the music easily and cut the rest of the clutter") identified six substantive architectural and UX defects. Every defect is resolved in this v2 specification:

1. **`[CRITIQUE-01]` Self-Inflicted Radio Regression (3 Taps vs. 2 Taps):**
   - *Flaw in `123751d`:* The initial proposal explicitly conceded a usability regression for internet radio: cold-start station selection increased from 2 taps to 3 taps (`handle → Radio tab → station row`) because Radio was hidden behind a segmented control inside the Browse Sheet while the Stage bottom bar (`Row 6`) was a single generic handle (`________ / Library`).
   - *Resolution:* Replace the single bottom handle with a **Dual-Source Handle Bar** (`[ Local ] · [ Radio ]`). Tapping `[ Local ]` (or swiping up on the left/center of the Stage) opens the Browse Sheet directly to the `Library` tab (2 taps to play). Tapping `[ Radio ]` (or swiping up on the right side of the Stage) opens the Browse Sheet directly to the `Radio` tab (**2 taps to play**, eliminating the regression). Furthermore, swiping horizontally across the Dual-Source Handle Bar (or pressing `X`) immediately switches active playback between the last-played Local track and the last-played Radio station in **1 gesture** without opening any sheet.

2. **`[CRITIQUE-02]` Zero Discoverability of L2 Overflow Menu & Wasted Stage Targets:**
   - *Flaw in `123751d`:* Row 1 (`[SHUFFLE] [REPEAT ONE]`) was specified as non-interactive dead text, while single-tapping the large 280px center Artwork duplicated the 56px Play/Pause button located 40px below it. Meanwhile, the entire L2 Overflow Menu (containing Equalizer, Star, Volume slider, Rescan, and Reset) was hidden behind an invisible 500ms long-press on the artwork—leading directly to Risk #1 ("Discoverability collapses").
   - *Resolution:*
     - Make Row 1 interactive and self-discoverable: always render an explicit, keyboard-focusable `[ ••• ]` pill button on the right side of Row 1 (`aria-label="More options and settings"`). Active status chips on the left (`[SHUFFLE]`, `[REPEAT ONE]`, `[EQ]`, `[★]`) are interactive pill buttons (clicking `[SHUFFLE]` disables shuffle; clicking `[★]` unstars).
     - Reassign Artwork gestures: **Single tap on Artwork/Canvas** toggles the Audio Visualizer on/off (or cycles through `VISUALIZER_MODES` when active), promoting the Visualizer from 2 layers deep directly to the primary Stage. **Double-tap on Artwork** (or `F` key) toggles Star/Favorite with immediate `[STARRED]` toast feedback. **Long-press (500ms) or Right-click on Artwork** (or clicking `[ ••• ]` / pressing `.`) opens the L2 Overflow Menu.

3. **`[CRITIQUE-03]` Missing Desktop/Laptop Volume Ergonomics:**
   - *Flaw in `123751d`:* Deleting the persistent player bar removed the volume slider without providing a pointer gesture on the Stage, forcing desktop mouse/trackpad users to open L2 Overflow just to adjust volume.
   - *Resolution:* Bind `wheel` (mouse wheel / two-finger vertical touchpad scroll) anywhere on the Stage container to adjust volume by `±5%` per wheel tick (`audioEngine.setVolume`), firing a transient `[VOLUME 75%]` toast with zero permanent visual chrome. Middle-click on Stage (or `M` key) toggles mute (`[MUTED]` / `[UNMUTED]`).

4. **`[CRITIQUE-04]` Uncalled `getPlaybackState()` & Dead "Nothing Playing" Cold Start:**
   - *Flaw in `123751d`:* `db.getPlaybackState()` and `db.savePlaybackState()` exist in `src/storage/db.js:467-484`, but **no code in `src/` ever calls them**. On cold start or page reload, `audioEngine.currentTrack` and `currentStation` are `null`. Even if the user has 1,000 tracks indexed in IndexedDB, the Stage renders a dead `Nothing playing` empty state on every startup.
   - *Resolution:*
     - **Cold-Start Hydration (`src/main.js`):** During `initApp()`, read `await db.getPlaybackState()`, `await db.getAllTracks()`, and `await loadStations(db)` (from `src/radio/stations.js:950`). Restore `volume`, `muted`, `shuffle`, and `repeat`. Hydrate `audioEngine` in a ready/paused state (`isPlaying: false`) with the last-played track (setting `queueManager.setQueue(availableTracks, index)`) or last-played radio station (`audioEngine.isRadio = true; audioEngine.currentStation = station`). If no saved state exists, default to `availableTracks[0]` (if local tracks exist) or `CURATED_STATIONS[0]`.
     - **1-Tap Resume:** Because `audioEngine.play()` (`src/player/audio-engine.js:570-588`) automatically invokes `playRadio(this.currentStation)` or `playTrack(queueManager.getCurrent().track)` when `audio.src` is empty, returning users see their last-played track or station artwork and title immediately on startup and resume playback in **1 tap** (`Space` or Play button).
     - **Tier 2 Session-File Re-Auth Prompt:** On non-Chromium browsers (Firefox/Safari) where `hasFileSystemAccess()` is `false` and `sessionRegistry.getFile(track.id)` is empty after page reload, local files cannot be read until the user re-selects the folder. When `stage.js` detects a hydrated local track whose file is unavailable in `sessionRegistry` and lacks a persistent `FileSystemFileHandle`, Row 6 displays a prominent `[ Re-open music folder to play ]` pill button that invokes `pickFolder()` directly.

5. **`[CRITIQUE-05]` Contradictory Folder Import / Rescan Spec (`library-source.js`) & Hidden Folder Addition:**
   - *Flaw in `123751d`:* Section 7.5 claimed `rescan()` "Re-runs reconciliation against the stored directory handles", yet instructed the implementer to "Port verbatim from... `src/ui/views/settings-view.js`". In `settings-view.js:181-208`, the rescan button **never called `db.getAllDirectoryHandles()`**—it simply called `window.showDirectoryPicker()` again! Furthermore, once a single track was imported, the empty-state `Open music folder` button disappeared from the Stage, leaving no direct button to add another folder.
   - *Resolution:*
     - Specify two distinct functions in `src/ui/library-source.js`:
       1. `pickFolder({ onProgress, fileList })`: Prompts via `window.showDirectoryPicker({ mode: 'read' })` (or `<input type="file" webkitdirectory>`) and runs `reconciler.reconcileDirectoryHandle` or `reconciler.reconcileFileList`.
       2. `rescan({ onProgress })`: Calls `const roots = await db.getAllDirectoryHandles()`. On Chromium Tier 1 (`roots.length > 0`), iterates each stored root handle, verifies/requests permission via `root.handle.queryPermission({ mode: 'read' })` / `requestPermission({ mode: 'read' })`, and runs `reconciler.reconcileDirectoryHandle(root.handle, onProgress)` silently without opening a folder picker dialog. Falls back to `pickFolder` only if no handles are stored or on Tier 2 browsers.
     - Add an explicit `[+ Folder]` button in the Browse Sheet header (`Library` tab) so users can add new folders at any time in 1 gesture, and include both `Add music folder…` (`pickFolder`) and `Rescan library` (`rescan`) in the L2 Overflow Menu.

6. **`[CRITIQUE-06]` Pre-Existing Database Reset Defect (`RESET_STORE_NAMES`):**
   - Static analysis of `src/storage/db.js` vs `src/ui/views/settings-view.js` revealed that `settings-view.js` iterates `['tracks','albums','artists','playlists','favorites','history','artwork','directoryHandles','settings']`—four of which (`albums`, `artists`, `history`, `directoryHandles`) do not exist in IndexedDB, causing `IDBDatabase.transaction()` to throw an unhandled `NotFoundError` after wiping `tracks`. This redesign fixes the bug via `RESET_STORE_NAMES = ['roots','tracks','artwork','playlists','favorites','playHistory','playbackState','settings']` and enforces a regression test in Task 5 that parses `src/storage/db.js` to verify store names.

---

## 1. Decisions Already Made (do not relitigate)

Confirmed by the repository owner on 2026-09-15:

1. **Hard replace.** The sidebar, mobile bottom navigation, top bar, and 10-route view shell are
   deleted outright. There is no feature flag and no fallback to the old UI.
2. **Features that survive** (as modes inside the new layers, not as separate screens):
   Albums browse, Artists browse, Favorites/starred, History/recents, 10-band equalizer, audio
   visualizer, radio genre filters, radio sort order, app version display, folder import & rescan.
3. **Features that are deleted from the codebase:** Playlists UI, crossfade setting, global
   library search box, custom-radio-station entry form, queue drawer, settings/diagnostics page.
   The settings page's **`Reset library` action survives** as a single row at the bottom of the
   overflow menu, behind a confirmation (approved 2026-09-15; see §4.3.1). Storage-tier
   diagnostics and the crossfade slider do not survive.
4. Track and station **starring remains** regardless of the Favorites surface.

### 1.1 Interpretations the implementer must honour

These decisions derive from the above and must not be silently reversed:

- **"Global search across library" = the persistent top-bar search box only.** It is deleted, along
  with the `Ctrl+K` shortcut. A *filter input inside the browse sheet* is retained, because a
  curated/searchable station catalog and an arbitrarily large local library are unusable without one. This
  input exists only while the browse sheet is open.
- **`addCustomStation()` in `src/radio/stations.js` is kept; only its UI is deleted.** The function
  carries the HTTPS/protocol validation that `test/security.test.js` SEC-09 exercises. Deleting it
  would delete security coverage to save an unreachable 40 lines.
- **The IndexedDB `playlists` object store is left in place.** The Playlists UI is deleted, but the
  v1 schema and any user data in it are untouched by normal operation. No migration, no destructive
  delete. The one exception is the explicit `Reset library` action (§4.3.1), which wipes it along
  with everything else.
- **Deleting the queue drawer changes queue semantics** rather than removing the queue: see §4.5.

---

## 2. Design Principles

1. **The app is the player.** The Now Playing screen (Stage) is not a route; it is the application.
   It is never navigated away from — other surfaces are drawn *on top of* it.
2. **Focused Stage, zero clutter.** Only controls required to (a) see what is playing, (b) start,
   pause, seek, or skip it, (c) toggle visualizer/favorite/options, or (d) open Local or Radio
   browsing are on the Stage.
3. **One gesture to choose or switch source, two gestures to configure.** Resuming playback is 1 tap.
   Switching between Local and Radio is 1 horizontal swipe (or `X`). Opening Local or Radio browse
   is 1 tap (`[Local]` or `[Radio]` handle pill). Changing audio configuration (EQ, repeat, shuffle,
   rescan, reset) is 2 gestures (`[ ••• ]` overflow pill → row).
4. **Every gesture has a keyboard and pointer equivalent.** Gestures are an accelerator, never the
   only path. This is a strict accessibility requirement.
5. **Transient feedback replaces permanent chrome.** State changes (shuffle, repeat, volume, star,
   visualizer mode) are announced by a 1.6 s toast plus the ARIA live region, reflected as text
   chips in Row 1 when non-default, and inspectable in the L2 Overflow Menu.
6. **Radio and local files share a unified stage and transport.** One stage, one transport, one
   browse sheet with two tabs (`Library` and `Radio`). For radio streams (which have no duration),
   the seek slider becomes a double-coded stream status line.

---

## 3. Layer Model

```
L0  STAGE          always visible, non-dismissible          the player & visualizer canvas
L1  BROWSE SHEET   one gesture ([Local]/[Radio] pill / L)   choose tracks or radio stations
L2  OVERFLOW       one/two gestures ([•••] pill / . /       star, shuffle, repeat, volume,
                   long-press artwork)                      EQ, visualizer, import/rescan, reset
L2' EQ SHEET       from L2 or E                             10-band equalizer
L2" NOTES MODAL    from L2 version row                      release notes
LX  UPDATE BANNER  system-driven, unchanged                 PWA update available
```

Only one of L1 / L2 / L2' / L2" is open at a time. `Escape` (or swipe down, or backdrop click)
closes the topmost layer.

---

## 4. Screen Specifications

### 4.1 L0 — Stage (Desktop & Mobile Layouts)

The Stage (`L0`) is a single persistent, non-scrolling viewport (`100dvh`). On desktop, the 420px player column is vertically and horizontally centred in the viewport with generous ambient breathing room; mouse-wheel vertical scroll anywhere on the viewport adjusts volume (`±5%`). On mobile (`max-width: 768px`), the column fills the viewport width (`padding: 16px 20px`) with ergonomic thumb-zone spacing at the bottom.

#### Desktop Stage Layout (`1280x800` Viewport — Local Track Playing)

```text
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|                          +--- [420px Centred Player Column] ---+                                 |
|                          |                                     |                                 |
|   [Row 1: Status/Menu]   |  [★] [SHUFFLE] [REPEAT ONE]  [ ••• ]|  <- Interactive chips + L2 pill |
|                          |                                     |                                 |
|                          |     +-------------------------+     |                                 |
|                          |     |                         |     |  <- 280x280 Artwork / Canvas    |
|                          |     |    [ALBUM ARTWORK]      |     |     - Tap: Toggle/Cycle Viz     |
|   [Row 2: Artwork/Viz]   |     |           or            |     |     - Double-Tap: Toggle Star   |
|                          |     |  [AUDIO VISUALIZER]     |     |     - Long-Press/Right-Click:   |
|                          |     |   (bars/wave/nebula)    |     |       Open L2 Overflow          |
|                          |     +-------------------------+     |                                 |
|                          |                                     |                                 |
|   [Row 3: Metadata]      |            Midnight City            |  <- Title (18px / 600 weight)   |
|                          |     M83 — Hurry Up, We're Dreaming  |  <- Subtitle (14px / secondary) |
|                          |                                     |                                 |
|   [Row 4: Timeline]      |  ===================[●]-----------  |  <- Interactive range seek bar  |
|                          |  1:42                        -2:21  |  <- 11px monospace timestamps   |
|                          |                                     |                                 |
|   [Row 5: Transport]     |         ( |<< )   ( || )   ( >>| )  |  <- Prev (44px), Play (56px),   |
|                          |                                     |     Next (44px)                 |
|                          |                                     |                                 |
|   [Row 6: Source Bar]    |      [  ● Local  ]   ·   [ Radio ]  |  <- Dual-Source Handle Bar      |
|                          |                                     |     - Tap pill: Open L1 Sheet   |
|                          +-------------------------------------+     - Swipe L/R or press 'X':   |
|                                                                        Instant Source Toggle     |
|   (Mouse wheel vertical scroll anywhere on Stage = Volume ±5% with transient [VOLUME 75%] toast) |
+--------------------------------------------------------------------------------------------------+
```

#### Mobile Stage Layout (`390x844` Viewport — Radio Station Live & Tier 2 Prompt Variants)

```text
+------------------------------------------+      +------------------------------------------+
|  [★] [EQ]                        [ ••• ] |      |                                  [ ••• ] |
|                                          |      |                                          |
|      +----------------------------+      |      |      +----------------------------+      |
|      |                            |      |      |      |                            |      |
|      |     [STATION FAVICON /     |      |      |      |       [ALBUM ARTWORK]      |      |
|      |      VISUALIZER CANVAS]    |      |      |      |                            |      |
|      |                            |      |      |      |                            |      |
|      +----------------------------+      |      |      +----------------------------+      |
|                                          |      |                                          |
|              SomaFM: Groove Salad        |      |               Midnight City              |
|            Ambient · Chillout · US       |      |        M83 — Hurry Up, We're Dreaming    |
|                                          |      |                                          |
|          ● [LIVE] · 128 kbps AAC         |      |    ====================================  |
|        (Double-coded status line)        |      |    0:00                           -4:03  |
|                                          |      |                                          |
|         ( |<< )    ( || )    ( >>| )     |      |         ( |<< )    ( |> )    ( >>| )     |
|                                          |      |                                          |
|            __________________            |      |            __________________            |
|      [  Local  ]   ·   [  ● Radio  ]     |      |   [ 📁 Re-open folder ]  ·  [ Radio ]    |
+------------------------------------------+      +------------------------------------------+
  [Variant A: Internet Radio Live Stream]           [Variant B: Tier 2 Firefox/Safari Reload]
  - Seek slider replaced by double-coded status     - Hydrated from db.getPlaybackState()
  - Prev/Next step through visible station list     - Tapping [📁 Re-open folder] invokes
  - Active pill shows "● Radio"                       pickFolder() and resumes in 1 gesture
```

**Control inventory (8 interactive targets in 5 visual groups):**
1. **Row 1 Right (`[ ••• ]` pill button):** Always visible (`aria-label="More options and settings"`). Clicking opens L2 Overflow. Active status chips on the left (`[★]`, `[SHUFFLE]`, `[REPEAT ALL]`, `[REPEAT ONE]`, `[EQ]`, `[MUTED]`) appear only when non-default and act as direct toggle buttons (e.g. clicking `[SHUFFLE]` turns shuffle off).
2. **Row 2 (`Artwork / Visualizer Canvas`):**
   - **Single tap / click:** Toggles the Audio Visualizer on/off. When the visualizer is already enabled, single-tapping cycles to the next mode in `VISUALIZER_MODES` (`bars` → `wave` → `nebula` → `starfield` → off) and fires a toast (`[VISUALIZER: BARS]`).
   - **Double-tap:** Toggles Star/Favorite on the current track or station, updates the `[★]` chip in Row 1, and fires `[STARRED]` / `[UNSTARRED]`.
   - **Long-press (500ms) / Right-click:** Opens L2 Overflow Menu.
3. **Row 4 (`Seek Slider` or `Radio Status Line`):**
   - For local tracks: interactive `<input type="range">` seek bar with `current` (`1:42`) and `remaining` (`-2:21`) monospace timestamps.
   - For radio stations: double-coded status line (no range input).
4. **Row 5 (`Transport Cluster`):** Previous (`|<<`), Play/Pause (`|>` / `||`), Next (`>>|`).
5. **Row 6 (`Dual-Source Handle Bar`):** Contains two distinct pill buttons: `[ Local ]` and `[ Radio ]`.
   - The active playback source displays a leading indicator dot (`● Local` or `● Radio`) and high-contrast border.
   - Tapping `[ Local ]` (or swiping up on the left/center) opens L1 Browse Sheet directly on the `Library` tab.
   - Tapping `[ Radio ]` (or swiping up on the right) opens L1 Browse Sheet directly on the `Radio` tab.
   - **Horizontal swipe across Row 6** (or pressing `X` on keyboard): switches playback immediately between the last-played Local track and last-played Radio station without opening any sheet.

**Stage Pointer Wheel Volume Control:**
Scrolling the mouse wheel or two-finger touchpad vertically anywhere on the Stage adjusts volume by `±5%` per tick (`audioEngine.setVolume(clamp(vol ± 0.05))`) and displays the transient `[VOLUME 75%]` toast. Middle-clicking anywhere on the Stage (or pressing `M`) toggles mute (`[MUTED]` / `[UNMUTED]`).

**Radio Status Line Variant (Row 4):**
Derived from `streamState` *and* `isPlaying` emitted by `audioEngine.subscribe()`. Note that `notifyState()` emits `streamState: this.isRadio ? this.streamState : (this.isPlaying ? 'playing' : 'idle')`, and `pause()` sets a non-errored stream back to `'idle'` (there is no `'paused'` string value):

| Condition | Text | Icon | Colour token |
| --- | --- | --- | --- |
| `streamState === 'connecting'` | `[CONNECTING]` | `▲` | `--accent-amber` |
| `streamState === 'buffering'` | `[BUFFERING]` | `⏳` | `--accent-amber` |
| `streamState === 'error'` | `[OFFLINE]` | `✖` | `--accent-rose` |
| `streamState === 'playing'` and `isPlaying` | `[LIVE] · 128 kbps` | `●` | `--accent-cyan` |
| `streamState === 'idle'` or not `isPlaying` | `[READY]` | `●` | `--text-secondary` |

Every status is double-coded (bracketed text label + distinct glyph shape + colour token). Never rely on colour alone. Previous/next traverse the **visible station list** (§4.5).

**Cold-Start Hydration & Empty States:**
1. **Hydrated State (Tracks or Stations Exist in IndexedDB):**
   On application startup (`src/main.js`), `db.getPlaybackState()` hydrates the last-played track or station into `audioEngine` in a ready/paused state (`isPlaying: false`). The user never sees a blank player on reload—artwork, title, artist/station, and duration are rendered immediately, and pressing `Space` or Play (`|>`) starts audio in **1 gesture**.
2. **Tier 2 Session-File Re-Authentication State (Firefox / Safari after page reload):**
   On browsers without the File System Access API (`hasFileSystemAccess() === false`), IndexedDB retains all track metadata and artwork across reloads, but `sessionRegistry.getFile(track.id)` is empty until the user re-selects their folder. When a hydrated local track has no `File` in `sessionRegistry` and no persistent `FileSystemFileHandle`, Row 6 displays an explicit prompt button: `[ 📁 Re-open music folder to play ]` alongside `[ Radio ]`. Tapping it invokes `pickFolder()`, restores `sessionRegistry` entries, and immediately starts playback.
3. **True First-Run Empty State (Zero Indexed Tracks & No Saved Radio State):**
   When `tracks` is empty and no station has been played: artwork slot renders a muted disc glyph, title reads `Nothing playing`, subtitle reads `Open a local music folder or tune in to internet radio`, transport buttons are `disabled` with `aria-disabled="true"`, and Row 6 renders two primary action pills: `[ 📁 Open music folder ]` (calls `pickFolder()`) and `[ 📻 Listen to radio ]` (opens L1 on the `Radio` tab).

**Artwork sourcing.** Reuse existing behaviour: `track.artwork.dataUrl` → `db.getArtwork(track.artworkId).thumbnailDataUrl` → `public/icons/icon-192.svg`. For stations: `station.favicon` → `getStationFallbackArtwork(station)`. Attach an `error` listener programmatically (never an inline `onerror=` attribute — SEC-06 forbids inline handlers).

---

### 4.2 L1 — Browse Sheet (Desktop & Mobile Layouts)

On Desktop, L1 opens as a centred glass modal dialog (`max-width: 720px`, `max-height: 720px`, `border-radius: 20px`) over a `--modal-backdrop-glass` overlay. On Mobile (`max-width: 768px`), L1 slides up as a bottom sheet (`height: 88dvh`, full width, `border-radius: 24px 24px 0 0`) with a drag-to-dismiss grab handle at the top.

#### Desktop Browse Sheet (`Library` Tab vs. `Radio` Tab)

```text
+--------------------------------------------------------------------------+
|  [ ● Library |   Radio   ]     [+ Folder]   [ 🔍 Filter tracks... ]  (X) | <- Header Row 1
|  ( ● Songs ) ( Albums ) ( Artists ) ( Starred ) ( Recent )               | <- Header Row 2 (Chips)
|--------------------------------------------------------------------------|
|    Midnight City                 M83 · Hurry Up, We're Dreaming     4:03 | <- 48px uniform row
|    Outro                         M83 · Hurry Up, We're Dreaming     3:41 |
| █| Wait [PLAYING]                M83 · Hurry Up, We're Dreaming     4:24 | <- 3px cyan bar + label
|    Intro                         M83 · Hurry Up, We're Dreaming     5:22 |
|    Reunion                       M83 · Hurry Up, We're Dreaming     3:55 |
|     Raconte-Moi Une Histoire      M83 · Hurry Up, We're Dreaming     4:09 |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  [   Library | ● Radio   ]                  [ 🔍 Filter stations... ] (X)| <- [+ Folder] hidden
|  ( ★ ) ( ● All ) ( Ambient ) ( Electronic ) ( Jazz ) ...  [Sort: Name v] | <- Genre chips + Sort
|--------------------------------------------------------------------------+
| █| SomaFM: Groove Salad [PLAYING]   Ambient · Chillout · US     128 kbps | <- Playing station
|    SomaFM: Drone Zone               Ambient · Space · US        128 kbps |
|    Radio Paradise (Main Mix)        Eclectic · Rock · US        320 kbps |
|    FIP Radio                        Eclectic · Jazz · FR        128 kbps |
+--------------------------------------------------------------------------+
```

#### Mobile Browse Sheet (`88dvh` Bottom Sheet with Drill-In State)

```text
+------------------------------------------+
|                 ________                 | <- Swipe down handle to dismiss
|  [ ● Library | Radio ]  [+ Folder]   (X) |
|  [ 🔍 Filter tracks...                 ] |
|  ( ← Back to Albums )  Album: Cosmos     | <- Drill-in breadcrumb chip
|------------------------------------------|
| █| Track 01 [PLAYING]    Artist A   3:12 | <- 52px coarse-pointer row height
|    Track 02              Artist A   4:05 |    Tap row = Play & close sheet
|    Track 03 [MISSING]    Artist A   2:50 |    Long-press row = Toggle Star
+------------------------------------------+
```

**Header Controls:**
- **Segmented Tabs:** `Library` and `Radio`. Opening via Stage `[ Local ]` pill selects `Library`; opening via Stage `[ Radio ]` pill selects `Radio`. Switching tabs persists via `db.setSetting('browse.tab', ...)`.
- **`[+ Folder]` Button (`Library` tab only):** Compact button (`aria-label="Add music folder"`) in the header that invokes `pickFolder({ onProgress })` so users can import additional music directories at any time in 1 click without opening L2 Overflow. Hidden when the `Radio` tab is active.
- **Filter Input:** Debounced 120 ms, filters the currently displayed list only. Cleared on tab change.
- **Close Button (`X`):** Closes L1 sheet.

**Context chips:**
- Library: `Songs` (default) · `Albums` · `Artists` · `Starred` · `Recent`
- Radio: `★` · then every entry of `HIGH_LEVEL_GENRES` from `src/radio/stations.js`, followed by a
  `<select>` sort control with the existing options (`default`, `name-asc`, `name-desc`,
  `genre-asc`, `bitrate-desc`). **Do not prepend an `All` chip** — `HIGH_LEVEL_GENRES[0]` is
  already `'All'` and is the default selection. Prepending one renders it twice.

**Rows.** Uniform 48px (52px on coarse pointers), three fields: primary (title / album / artist /
station name), secondary (artist / track count / genre · country), trailing (duration / bitrate).
No tables, no album art thumbnails in rows, no per-row action buttons on mobile. The playing row
gets a 3px leading bar in `--accent-cyan` **and** a visually-hidden `PLAYING` text label.

**Row interactions:**

| Input | Action |
| --- | --- |
| Tap / click / `Enter` | Play the row, then close the sheet |
| Long-press (500 ms) / right-click / `F` while row focused | Toggle star, show toast (`[STARRED]` / `[UNSTARRED]`), keep sheet open |
| `Albums` / `Artists` row tap | Drill in: list becomes that album's/artist's tracks, a back chip (`← Album Name`) appears |
| Back chip / `Escape` / swipe right on the list | Leave the drill-in, return to the chip's root list |

**Filter matching:** Library filter matches title, artist, album. Radio filter matches name, genre, category, description, country (port predicate from `src/ui/views/radio-view.js`).

**Focus management:** On open, focus moves to the filter input. Focus is trapped inside the sheet.
On close, focus returns to the Stage handle pill that opened it. `role="dialog"`, `aria-modal="true"`,
`aria-label="Browse library and radio"`.

---

### 4.3 L2 — Overflow Menu (Desktop Popover & Mobile Bottom Sheet)

On Desktop, clicking `[ ••• ]` (or right-clicking the Artwork) opens a floating popover anchored to the top-right of the Stage (`max-width: 320px`). On Mobile, it opens as a compact bottom sheet. Rows are 44px, left-labelled, right-stated. All state is rendered as **explicit bracketed text**, never icon colour alone.

```text
+----------------------------------------------+
|  Star                          [STARRED]     | <- Toggles track/station favorite
|  Shuffle                            [ON]     | <- Hidden when playing Radio
|  Repeat                            [ONE]     | <- Cycles [OFF] -> [ALL] -> [ONE]
|  Volume        [======●===]        [75%]     | <- Inline slider + [MUTED] tag if muted
|  Equalizer                      [CUSTOM]     | <- Opens L2' 10-Band EQ Sheet
|  Visualizer                  [ON — BARS]     | <- Cycles modes or toggles off
|----------------------------------------------|
|  Add music folder…              [IMPORT]     | <- Calls pickFolder()
|  Rescan library             [412 tracks]     | <- Calls rescan() on stored handles
|  LocalJam v2026.09.004   [RELEASE NOTES]     | <- Opens L2" Release Notes Modal
|----------------------------------------------|
|  Reset library             [DESTRUCTIVE]     | <- Confirmation prompt -> full wipe
+----------------------------------------------+
```

| Row | Right-hand state | Applies to |
| --- | --- | --- |
| Star | `[STARRED]` / `[NOT STARRED]` | tracks + stations |
| Shuffle | `[ON]` / `[OFF]` | tracks only (hidden for radio) |
| Repeat | `[OFF]` / `[ALL]` / `[ONE]` | tracks only (hidden for radio) |
| Volume | inline slider + `[MUTED]` when muted | both |
| Equalizer | `[FLAT]` or `[CUSTOM]` | both |
| Visualizer | `[ON — BARS]` / `[OFF]`, tap cycles modes when on | both |
| Add music folder… | `[IMPORT]` (calls `pickFolder`) | both |
| Rescan library | track count, e.g. `412 tracks` (calls `rescan`) | both |
| LocalJam `v2026.09.004` | `[RELEASE NOTES]` | both |
| Reset library | `[DESTRUCTIVE]` | both |

There is no settings page, no storage-tier diagnostics panel, and no crossfade control. The reset
action survives as the last row, visually separated by a divider and rendered in `--accent-rose`
**with** the `[DESTRUCTIVE]` text tag, never colour alone.

#### 4.3.1 `Reset library` semantics

Tapping the row opens a confirmation (`window.confirm` is acceptable and matches current
behaviour). On confirm, clear the object stores listed below, announce
`[RESET] Library cleared` via a toast, then `window.location.reload()`.

**The store list must be corrected during the port — do not copy the existing array.** Static
analysis of `src/storage/db.js` shows the nine stores actually created by the v1 upgrade handler
are `roots`, `tracks`, `artwork`, `playlists`, `favorites`, `playHistory`, `stations`,
`playbackState`, `settings`. The array in `src/ui/views/settings-view.js` names `albums`,
`artists`, `history`, and `directoryHandles`, **none of which exist**, and omits `roots`,
`playHistory`, and `playbackState`, which do. See §9.8 for the consequence.

Correct list to clear:

```js
export const RESET_STORE_NAMES = [
  'roots', 'tracks', 'artwork', 'playlists',
  'favorites', 'playHistory', 'playbackState', 'settings'
];
```

`stations` is deliberately excluded so the curated catalog, any custom stations, and station stars
survive a library reset. Wrap the loop in `try`/`catch`, log failures with
`console.error('[Reset] Failed to clear store', storeName, err)`, and continue to the next store so
one failure cannot abort the whole wipe.

---

### 4.4 L2' — Equalizer Sheet

`src/ui/components/eq-modal.js` is **kept as-is functionally** and restyled to match the sheet
presentation (same backdrop, same radius, same close affordances). Opened from L2 or `E`.

---

### 4.5 Queue Semantics Without a Queue Drawer

This is the single most behaviour-affecting deletion; specify it exactly:

- Playing row *i* of the currently visible, filtered, sorted **library** list calls
  `queueManager.setQueue(visibleTracks, i)` then
  `audioEngine.playTrack(queueManager.getCurrentTrack())`.
- Playing a **station** calls `audioEngine.setStationCatalog(visibleStations)` **before**
  `audioEngine.playRadio(station)`, so that Stage next/prev traverse exactly the list the user was
  looking at. (Today `radio-view.js` sets the catalog to the entire station list regardless of the
  active filter — the new behaviour is deliberately different and more predictable.)
- "The visible list is the queue." There is no separate queue object to inspect, reorder, or
  remove from. `queueManager` itself is unchanged; only its UI is gone.

---

## 5. Interaction Reference

### 5.1 Gestures & Pointer Actions

| Gesture / Pointer Action | Target | Action | Non-gesture / Keyboard equivalent |
| --- | --- | --- | --- |
| Single tap / click | artwork / canvas | Toggle visualizer on/off (or cycle mode when on) | `V`, L2 Visualizer row |
| Double-tap / double-click | artwork | Toggle Star / Favorite + toast | `F`, Row 1 `[★]` chip, L2 Star row |
| Long-press 500 ms / right-click | artwork | Open L2 Overflow Menu | `.` (period), Row 1 `[ ••• ]` pill |
| Mouse wheel vertical scroll | stage | Adjust volume ±5 % + `[VOLUME n%]` toast | `↑` / `↓`, L2 Volume slider |
| Middle-click | stage | Toggle mute + `[MUTED]` / `[UNMUTED]` toast | `M`, Row 1 `[MUTED]` chip |
| Swipe left | stage | Next track / station | `Shift+→`, Next button (`>>`) |
| Swipe right | stage | Previous track / station | `Shift+←`, Prev button (`<<`) |
| Tap `[ Local ]` pill / swipe up left | stage handle bar | Open Browse Sheet on `Library` tab | `L`, `/` |
| Tap `[ Radio ]` pill / swipe up right | stage handle bar | Open Browse Sheet on `Radio` tab | `Shift+L` |
| Horizontal swipe | stage handle bar | Switch between Local track & Radio station | `X` |
| Swipe down | sheet / overflow | Close topmost layer | `Escape`, close button (`X`), backdrop click |
| Long-press 500 ms / right-click | sheet row | Toggle star + toast (sheet stays open) | `F` when row focused |

Thresholds (implemented in `src/ui/gestures.js`, unit-tested):

- Tap: movement `< 10 px` on both axes and duration `< 500 ms`.
- Double-tap: two taps within `<= 300 ms` and `< 24 px` spatial distance.
- Swipe: dominant-axis distance `>= 48 px`, dominant axis `>= 1.5 x` the other axis, duration `<= 800 ms`.
- Long-press: duration `>= 500 ms` with movement `< 10 px` on both axes.

Implementation notes: use Pointer Events (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`)
with `setPointerCapture`. Set `touch-action: manipulation` on the stage and `preventDefault()` on
`contextmenu` for the artwork and sheet rows so long-press does not race the platform context
menu. Respect `prefers-reduced-motion` by skipping sheet slide animations.

### 5.2 Keyboard Map

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Seek −5 s / +5 s (no-op for radio) |
| `Shift+←` / `Shift+→` | Previous / next track or station |
| `↑` / `↓` | Volume ±5 % + toast |
| `M` | Mute toggle + toast |
| `X` | Instant source switch between last-played Local track and Radio station |
| `S` | Shuffle toggle (tracks only) + toast |
| `R` | Cycle repeat mode (`off` → `all` → `one`, tracks only) + toast |
| `F` | Star / unstar current item (or focused sheet row) + toast |
| `E` | Open / close Equalizer sheet |
| `V` | Toggle Visualizer on/off (or cycle mode) + toast |
| `L` | Open Browse Sheet (`Library` tab) / close if already open |
| `Shift+L` | Open Browse Sheet (`Radio` tab) |
| `/` | Open Browse Sheet and focus its filter input |
| `.` | Open / close L2 Overflow Menu |
| `Escape` | Close topmost layer; blur input if typing |

**Removed:** `Q` (queue drawer), `Ctrl+K` / `Cmd+K` (global search). All shortcuts remain
suppressed while focus is in an `INPUT`, `TEXTAREA`, or `contentEditable` element, matching
`src/ui/keyboard.js` today.

---

## 6. Module Architecture

### 6.1 Files to Add

| Path | Export | Responsibility |
| --- | --- | --- |
| `src/ui/gestures.js` | `classifyPointerGesture`, `isLongPress`, `attachGestures`, threshold constants | Pure gesture classification (tap, double-tap, swipe, long-press) + thin DOM binder |
| `src/ui/browse-model.js` | `filterTracks`, `buildLibraryRows`, `filterStations`, `buildStationRows` | Pure data selection/shaping testable without a DOM |
| `src/ui/library-source.js` | `pickFolder`, `rescan`, `hasFileSystemAccess` | Owns folder acquisition (`showDirectoryPicker` / `webkitdirectory`) and reconciliation against stored roots (`db.getAllDirectoryHandles()`) |
| `src/ui/stage.js` | `createStage(deps)` | L0 Stage rendering, `audioEngine.subscribe` binding, wheel volume handler, Dual-Source Handle Bar, Tier 2 re-auth prompt, and **ownership of the visualizer canvas and `AudioVisualizer` lifecycle** (§7.4) |
| `src/ui/layers.js` | `LayerController`, `layers` | Layer stack, hash sync (`#/browse?tab=library` / `#/browse?tab=radio`), sanitized error boundary |
| `src/ui/components/browse-sheet.js` | `createBrowseSheet(deps)` | L1 Browse Sheet with `Library`/`Radio` tabs, `[+ Folder]` button, chips, and filter input |
| `src/ui/components/overflow-menu.js` | `createOverflowMenu(deps)`, `RESET_STORE_NAMES` | L2 Overflow Menu with explicit bracketed state labels and corrected reset store list |
| `src/ui/components/toast.js` | `createToastHost`, `showToast`, `TOAST_DURATION_MS` | Transient 1.6 s visual feedback (`aria-hidden="true"`, `destroy()`) + single-announcer `#aria-live-region` synchronization |

### 6.2 Files to Delete

```
src/ui/router.js
src/ui/views/home-view.js
src/ui/views/songs-view.js
src/ui/views/albums-view.js
src/ui/views/artists-view.js
src/ui/views/playlists-view.js
src/ui/views/favorites-view.js
src/ui/views/history-view.js
src/ui/views/radio-view.js
src/ui/views/player-view.js
src/ui/views/settings-view.js
src/ui/components/player-bar.js
src/ui/components/queue-drawer.js
src/ui/components/station-modal.js
src/ui/components/visualizer-overlay.js
test/ui/views.test.js
test/ui/router.test.js
test/ui/station-modal.test.js
```

The `src/ui/views/` directory is removed entirely.

### 6.3 Files to Rewrite

| Path | Change |
| --- | --- |
| `index.html` | Strip sidebar, mobile nav, top bar, player mount. New body: `<div id="stage-root">`, `<div id="layer-root">`, `<div id="toast-root">`, `<div id="aria-live-region">`. **Keep verbatim:** the CSP `<meta>`, the relative manifest link, the relative favicon link, the `theme-color` meta, and the `./src/main.js` module script — `test/pwa/pwa-assets.test.js` and `test/security.test.js` SEC-02 assert on these exact strings |
| `src/main.js` | Drop all route registration and view imports; implement **cold-start playback state hydration (`db.getPlaybackState`) and debounced persistence (`db.savePlaybackState`)**; mount stage, layers, toast host, EQ sheet, release-notes modal, update banner; keep the audio-unlock listeners, the `version.json` fetch, and the entire service-worker registration block unchanged |
| `src/ui/keyboard.js` | New map per §5.2; drop `Q` and `Ctrl+K`; add `X` (source toggle), `Shift+L` (radio browse), route `L`, `/`, `.`, `F`, `V` through stage/layers |
| `src/ui/app.css` | Full rewrite. Target ≤ 700 lines. Delete all `.app-sidebar`, `.mobile-nav`, `.top-bar`, `.player-bar`, `.track-table`, `.card-grid`, `.stat-card`, `.hero-*`, `.queue-*`, `.media-card`, `.view-*` rules. Keep and restyle: modal/backdrop, EQ modal, update banner, focus rings, `.sr-only` usage |
| `src/ui/theme.css` | Remove `--sidebar-width`, `--player-height`, `--player-height-mobile`, `--mobile-nav-height`, `--topbar-height`. Add `--stage-max: 420px`, `--sheet-max: 720px`, `--row-h: 48px`, `--row-h-coarse: 52px`. Keep every colour token unchanged |
| `sw.js` | Rebuild `APP_SHELL_ASSETS` from the post-deletion file list; keep `./src/utils/sanitize.js`. Do not hand-edit `CACHE_NAME` prefix (`localjam-` is required by tests) |
| `src/ui/components/app-footer.js` → `src/ui/components/release-notes-modal.js` | Rename file and export (`createAppFooter` → `createReleaseNotesModal`). Update `src/main.js`, `window.localjamReleaseNotesModal` wiring, and rename `test/ui/app-footer.test.js` → `test/ui/release-notes-modal.test.js` |

### 6.4 Files Explicitly Untouched

`src/player/audio-engine.js`, `src/player/queue.js`, `src/player/equalizer.js`,
`src/storage/*`, `src/metadata/*`, `src/visualizer/visualizer.js`, `src/utils/sanitize.js`,
`src/version.js`, `src/ui/components/update-banner.js`, `server.js`, `manifest.webmanifest`,
`.github/workflows/release.yml`.

`src/radio/stations.js` keeps every export; only its UI consumers change.

---

## 7. API Contracts for New Modules

Implement exactly these signatures; the unit tests in §8 depend on them.

### 7.1 `src/ui/gestures.js`

```js
export const TAP_MAX_PX = 10;
export const TAP_MAX_MS = 500;
export const DOUBLE_TAP_MS = 300;
export const SWIPE_MIN_PX = 48;
export const SWIPE_MAX_MS = 800;
export const SWIPE_AXIS_RATIO = 1.5;
export const LONG_PRESS_MS = 500;

/**
 * @param {{dx:number, dy:number, dt:number}} delta
 * @returns {'tap'|'swipe-left'|'swipe-right'|'swipe-up'|'swipe-down'|'none'}
 */
export function classifyPointerGesture({ dx, dy, dt }) {}

/** @returns {boolean} */
export function isLongPress({ dx, dy, dt }) {}

/**
 * Binds pointer handlers to an element. Returns an unbind function.
 * handlers: { onTap, onDoubleTap, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onLongPress }
 * Every handler is optional. Uses Pointer Events; no-ops when `el` is falsy.
 * @returns {() => void}
 */
export function attachGestures(el, handlers) {}
```

Classification precedence: long-press is decided by the timer during the press and short-circuits
`onTap`; if `onDoubleTap` is provided, a second tap within `DOUBLE_TAP_MS` invokes `onDoubleTap`
instead of firing a second `onTap`; otherwise `classifyPointerGesture` decides.

### 7.2 `src/ui/browse-model.js`

```js
/** @typedef {{id:string, kind:'track'|'album'|'artist'|'station', primary:string,
 *             secondary:string, trailing:string, payload:object}} BrowseRow */

/** Case-insensitive match on title, artist, album. Empty query returns the input array. */
export function filterTracks(tracks, query) {}

/**
 * @param {{mode:'songs'|'albums'|'artists'|'starred'|'recent',
 *          tracks:Array, albums:Array, artists:Array, favorites:Array, history:Array,
 *          query:string, drill:{kind:'album'|'artist', name:string}|null}} input
 * @returns {BrowseRow[]}
 */
export function buildLibraryRows(input) {}

/**
 * Ports the filter/sort logic currently in src/ui/views/radio-view.js.
 * @param {Array} stations
 * @param {{genre:string, query:string,
 *          sort:'default'|'name-asc'|'name-desc'|'genre-asc'|'bitrate-desc'}} opts
 */
export function filterStations(stations, opts) {}

/** @returns {BrowseRow[]} */
export function buildStationRows(stations) {}
```

Rules: tracks with `isMissing` truthy are excluded from every library mode except `songs`, where
they render with a `[MISSING]` trailing label in `--accent-rose` and are not playable.
`genre === 'Favorites'` (chip `★`) filters on `station.isFavorite`. Sorting is stable.

### 7.3 `src/ui/layers.js`

```js
export class LayerController {
  /** @param {HTMLElement} rootEl */
  init(rootEl) {}
  /** @param {'browse'|'overflow'|'eq'|'notes'} name @param {object} [props] */
  open(name, props) {}
  /** Closes the topmost layer. */
  close() {}
  /** Closes all layers. */
  closeAll() {}
  /** @returns {string|null} */
  get top() {}
  /** Registers a layer factory: () => { element, onOpen?, onClose?, focusFirst? } */
  register(name, factory) {}
}
export const layers = new LayerController();
```

- Hash sync: opening `browse` sets `window.location.hash` to `#/browse?tab=library` (or
  `#/browse?tab=radio`); closing it returns to `#/`. A `hashchange` to `#/` closes the browse
  layer. This makes the Android/browser back button close the sheet. `overflow`, `eq`, and `notes`
  do not modify the hash.
- Error boundary: if a layer factory throws, render a `layer-error` block whose message is passed
  through `escapeHtml` from `src/utils/sanitize.js` (replaces SEC-07 coverage).

### 7.4 `src/ui/stage.js`

```js
/**
 * @param {{ onOpenBrowse: (tab:'library'|'radio') => void,
 *           onOpenOverflow: () => void,
 *           onPickFolder: () => Promise<boolean>,
 *           onToggleSource: () => Promise<void>,
 *           onToast: (msg:string) => void }} deps
 * @returns {{ element: HTMLElement, destroy: () => void,
 *             setVisualizer: (enabled:boolean) => void,
 *             setVisualizerMode: (modeId:string) => void }}
 */
export function createStage(deps) {}
```

Subscribes to `audioEngine.subscribe(state => ...)` and updates DOM nodes in place — never
rebuilding `innerHTML` on playback time ticks.

**Visualizer Ownership (`stage.js`):**
- Render `<canvas class="stage-visualizer-canvas">` inside the artwork container, hidden by default.
- Lazily instantiate `new AudioVisualizer(canvas)` on first enable; call `setMode(modeId)` with a
  mode from `VISUALIZER_MODES`, then `resize()`, then `start()` when `audioEngine.isPlaying`.
- Single-tapping the artwork container toggles visualizer on/off or cycles through `VISUALIZER_MODES`.
- Persist state via `db.setSetting('viz.enabled', ...)` and `db.setSetting('viz.mode', ...)`.

**Tier 2 Session-File Availability Check (`stage.js`):**
- When `state.currentTrack` is non-null and `!state.isRadio`, check if the track is playable in the current session:
  `const needsReauth = !hasFileSystemAccess() && !sessionRegistry.getFile(state.currentTrack.id) && !state.currentTrack.handle;`
- If `needsReauth` is `true`, render `[ 📁 Re-open music folder to play ]` in Row 6 (clicking invokes `deps.onPickFolder()`).

### 7.5 `src/ui/library-source.js`

```js
/** True when the File System Access API is available (Chromium desktop). */
export function hasFileSystemAccess() {}

/**
 * Prompts for a music folder and indexes it. On Chromium uses showDirectoryPicker({mode:'read'})
 * + reconciler.reconcileDirectoryHandle; elsewhere uses a FileList from a `webkitdirectory` input
 * passed to reconciler.reconcileFileList.
 * Swallows AbortError (user cancelled) and resolves false; logs and rethrows anything else.
 * @param {{ onProgress?: (p:{parsedCount:number, status?:string}) => void, fileList?: FileList }} [opts]
 * @returns {Promise<boolean>} true when at least one track was indexed
 */
export async function pickFolder(opts = {}) {}

/**
 * Re-runs reconciliation against stored directory handles in IndexedDB (`db.getAllDirectoryHandles()`).
 * On Chromium Tier 1: iterates stored roots, checks/requests read permission on each handle, and
 * calls reconciler.reconcileDirectoryHandle(root.handle, onProgress) WITHOUT opening a folder picker.
 * If no stored handles exist or on Tier 2 browsers, falls back to pickFolder(opts).
 * @param {{ onProgress?: (p:{parsedCount:number, status?:string}) => void }} [opts]
 * @returns {Promise<boolean>}
 */
export async function rescan(opts = {}) {}
```

This resolves `[CRITIQUE-05]` by properly separating new folder selection (`pickFolder`) from
background/stored-root reconciliation (`rescan`).

### 7.6 `src/ui/components/browse-sheet.js`

```js
export function createBrowseSheet({
  onPlayTrack, onPlayStation, onPickFolder, onToast
}) {
  // returns { element, onOpen(props), onClose(), focusFirst() }
}
```

### 7.7 `src/ui/components/overflow-menu.js`

```js
/** The corrected object-store list from §4.3.1. Exported so Task 5 can assert it against db.js. */
export const RESET_STORE_NAMES = [
  'roots', 'tracks', 'artwork', 'playlists',
  'favorites', 'playHistory', 'playbackState', 'settings'
];

export function createOverflowMenu({
  onOpenEq, onOpenNotes, onPickFolder, onRescan, onReset, onToggleVisualizer, onToast
}) {
  // returns { element, onOpen(), onClose(), focusFirst() }
}
```

`onReset` must not be invoked until `window.confirm` resolves affirmatively.

### 7.8 `src/ui/components/toast.js`

```js
export function createToastHost() {} // returns { element, show(message), destroy() }
export function showToast(message) {} // module-level convenience; writes to #aria-live-region
```

Toasts: 1.6 s duration, bottom-centre above transport. The visual host is `aria-hidden="true"`;
`#aria-live-region` is the single announcer, written from inside `show()` so that a direct
`host.show()` announces exactly once without double-speaking. Explicit bracketed status
labels (`[STARRED] Midnight City`, `[SHUFFLE ON]`, `[VOLUME 65%]`, `[SOURCE: RADIO]`).

### 7.9 Cold-Start Hydration & Source Toggle (`src/main.js`)

```js
/**
 * Hydrates audioEngine and queueManager on cold start from IndexedDB playbackState.
 * Ensures the Stage displays playable media immediately on launch (1-tap resume).
 */
export async function hydratePlaybackState() {}

/**
 * Switches active source between last-played Local track and last-played Radio station in 1 gesture.
 */
export async function togglePlaybackSource() {}
```

---

## 8. Implementation Plan

Testing stack is unchanged: Node.js 22 built-in runner (`node --test`), ES modules, zero external dependencies. DOM-dependent modules are asserted through `innerHTML` strings and mock event dispatchers.

Every task below is a single atomic commit authored as `Varun Khaneja <git.bin@khaneja.org>`,
reviewed by an independent subagent before committing, and pushed to `github-aawc` immediately
after commit.

### Task 0 — Pre-flight (mandatory)

1. `git status --short` must be empty. If it is not, HALT and ask the owner.
2. `git branch --show-current` must be `main` (or an explicitly agreed feature branch).
3. Run the test suite (`node --test`) and record the baseline. Measured on 2026-09-15 at commit `e8cbf7c`:
   **213 tests, 213 pass, 0 fail, 0 skipped**.
4. Read `GEMINI.md` and `PROMPT.md` before writing code.

### Task 1 — `src/ui/gestures.js`

- **RED:** create `test/ui/gestures.test.js`. Assert with independently computed values:
  - `classifyPointerGesture({dx: 3, dy: 2, dt: 120})` === `'tap'`
  - `classifyPointerGesture({dx: -60, dy: 10, dt: 200})` === `'swipe-left'`
  - `classifyPointerGesture({dx: 60, dy: 10, dt: 200})` === `'swipe-right'`
  - `classifyPointerGesture({dx: 5, dy: -80, dt: 300})` === `'swipe-up'`
  - `classifyPointerGesture({dx: 5, dy: 80, dt: 300})` === `'swipe-down'`
  - `classifyPointerGesture({dx: 47, dy: 0, dt: 200})` === `'none'` (below `SWIPE_MIN_PX`)
  - `classifyPointerGesture({dx: 60, dy: 50, dt: 200})` === `'none'` (fails the 1.5x ratio)
  - `classifyPointerGesture({dx: 60, dy: 5, dt: 900})` === `'none'` (too slow)
  - `isLongPress({dx: 2, dy: 2, dt: 600})` === `true`; `isLongPress({dx: 20, dy: 0, dt: 600})` === `false`
  - `attachGestures(null, {})` returns a function and does not throw.
- **GREEN + Verify:** implement `src/ui/gestures.js` and run `node --test`.

### Task 2 — `src/ui/browse-model.js`

- **Audit:** read the filter/sort predicates in `src/ui/views/radio-view.js` and `src/ui/views/songs-view.js`.
- **RED:** `test/ui/browse-model.test.js` with fixture arrays of 4 tracks and 4 stations:
  - `filterTracks` matches on title, artist, and album case-insensitively; empty query is identity.
  - `buildLibraryRows({mode:'albums', ...})` collapses 4 tracks across 2 albums into 2 rows whose `trailing` reads `2 tracks`.
  - `buildLibraryRows({mode:'albums', drill:{kind:'album', name:'Cosmos'}})` returns only the 2 Cosmos tracks (`kind === 'track'`).
  - `buildLibraryRows({mode:'starred'})` returns only favourites.
  - `buildLibraryRows({mode:'recent'})` preserves history order.
  - A track with `isMissing: 1` appears in `songs` with `[MISSING]` in `trailing` and is absent from `albums`/`artists`.
  - `filterStations(stations, {genre:'Favorites'})` returns only `isFavorite` stations.
  - `filterStations(stations, {sort:'name-asc'})` and `{sort:'bitrate-desc'}` return exact expected orders.
- **GREEN + Verify.**

### Task 3 — `src/ui/components/toast.js`

- **RED:** `test/ui/toast.test.js` — `createToastHost().show('[STARRED] X')` puts the string in the host's `innerHTML`; two rapid calls leave exactly one visible toast; the host element carries `role="status"`.
- **GREEN + Verify.**

### Task 4 — `src/ui/components/browse-sheet.js`

- **RED:** `test/ui/browse-sheet.test.js`:
  - returned `element` has `role="dialog"` and `aria-modal="true"`;
  - markup contains both tab labels `Library` and `Radio` plus the `[+ Folder]` button;
  - markup contains all five library chips (`Songs`, `Albums`, `Artists`, `Starred`, `Recent`);
  - markup contains a filter `input` with an `aria-label`;
  - markup contains **no** `onclick=` and **no** `onerror=` substrings (CSP / SEC-06);
  - a station whose name is a `<script>` payload is rendered escaped (`&lt;script&gt;`).
- **GREEN + Verify.**

### Task 5 — `src/ui/components/overflow-menu.js`

- **RED:** `test/ui/overflow-menu.test.js`:
  - markup contains `Star`, `Shuffle`, `Repeat`, `Volume`, `Equalizer`, `Visualizer`, `Add music folder`, `Rescan library`, `Reset library`, and `LocalJam v`;
  - state is rendered as bracketed text (`[ON]`, `[OFF]`, `[DESTRUCTIVE]`);
  - no inline handlers;
  - **store-name regression test:** read `src/storage/db.js` from disk, extract every `createObjectStore('<name>'` occurrence into a `Set`, and assert that every entry of `RESET_STORE_NAMES` is a member of that set. Assert the exact expected array `['roots','tracks','artwork','playlists','favorites','playHistory','playbackState','settings']` and assert that `'stations'` is **not** in it;
  - **confirmation test:** stub confirmation to return `false` -> `onReset` not called; return `true` -> `onReset` called once.
- **GREEN + Verify.**

### Task 6 — `src/ui/library-source.js`

- **RED:** `test/ui/library-source.test.js`:
  - `hasFileSystemAccess()` returns `false` when `window.showDirectoryPicker` is absent and `true` when present;
  - `pickFolder()` resolves `false` and does not throw when `showDirectoryPicker` rejects with `AbortError`;
  - `pickFolder({ fileList })` forwards `fileList` to `reconciler.reconcileFileList` and reports progress via `onProgress`;
  - `rescan()` calls `db.getAllDirectoryHandles()` and invokes `reconciler.reconcileDirectoryHandle` for each stored root handle when present, rather than calling `showDirectoryPicker()`.
- **GREEN + Verify.**

### Task 7 — `src/ui/stage.js`

- **RED:** `test/ui/stage.test.js`:
  - local track: markup contains title, artist, seek `input[type=range]`, three transport buttons, Row 1 `[ ••• ]` button, and Row 6 Dual-Source Handle Bar (`Local` and `Radio` pills);
  - radio station with `streamState: 'error'`: markup contains `[OFFLINE]` and `✖`, and no seek slider;
  - radio station with `streamState: 'playing'` and `isPlaying: false`: markup contains `[READY]`, **not** `[LIVE]`;
  - Tier 2 session-file missing state (`!hasFileSystemAccess()`, `sessionRegistry.getFile` returns null): markup contains `Re-open music folder to play`;
  - empty library state: markup contains `Nothing playing` and `Open music folder`;
  - shuffle on: Row 1 contains interactive chip `[SHUFFLE]`;
  - `<canvas>` exists in artwork slot, hidden by default, revealed by `setVisualizer(true)`;
  - no inline `onclick=` / `onerror=` anywhere.
- **GREEN + Verify.**

### Task 8 — `src/ui/layers.js`

- **RED:** `test/ui/layers.test.js`:
  - `open('browse')` -> `top === 'browse'`; `open('eq')` -> `top === 'eq'`; `close()` -> `top === 'browse'`; `closeAll()` -> `top === null`;
  - factory throwing `<script>` payload renders escaped `&lt;script&gt;` in error boundary (SEC-07 replacement);
  - `open('browse', { tab: 'radio' })` sets `window.location.hash` to `#/browse?tab=radio`.
- **GREEN + Verify.**

### Task 9 — Rewrite `src/ui/keyboard.js`

- **RED:** extend `test/ui/keyboard.test.js` to assert: `KeyL` opens browse (`Library` tab), `Shift+KeyL` opens browse (`Radio` tab), `KeyX` triggers source toggle, `Period` opens overflow, `KeyF` toggles star, `KeyV` toggles visualizer, `KeyQ` and `Ctrl+K` do nothing, and shortcuts stay suppressed inside `INPUT` elements.
- **GREEN + Verify.**

### Task 10 — Wire the shell (`index.html`, `src/main.js`, CSS) & Cold-Start Hydration

- **RED:** create `test/ui/shell.test.js` asserting `index.html` contains `id="stage-root"`, `id="layer-root"`, `id="toast-root"`, `id="aria-live-region"`, and none of `app-sidebar`, `mobile-nav`, `top-bar`, `player-bar-container`, `global-search-input`. Also test `hydratePlaybackState()` in `src/main.js`: given a mocked `db.getPlaybackState()` returning `{ isRadio: true, stationId: 's1', volume: 0.65 }`, calling `hydratePlaybackState()` sets `audioEngine.isRadio === true`, `audioEngine.currentStation.id === 's1'`, and `audioEngine.volume === 0.65` without auto-playing audio.
- **GREEN:** rewrite `index.html`, `src/main.js`, `src/ui/app.css`, `src/ui/theme.css`.
- **Verify:** `node --test`.

### Task 11 — Delete dead code and refresh the service worker

- **Audit:** search for remaining importers of deleted modules (`rg -l "views/|player-bar|queue-drawer|station-modal|visualizer-overlay|ui/router"`).
- **GREEN:**
  - delete files listed in §6.2;
  - rename `app-footer.js` → `release-notes-modal.js` and `test/ui/app-footer.test.js` → `test/ui/release-notes-modal.test.js`;
  - rebuild `APP_SHELL_ASSETS` in `sw.js` (preserving `./src/utils/sanitize.js` and `localjam-` cache prefix);
  - delete obsolete UI tests (`test/ui/views.test.js`, `test/ui/router.test.js`, `test/ui/station-modal.test.js`);
  - update `test/ui/components.test.js` and `test/security.test.js` (SEC-03, SEC-04/06, SEC-07).
- **Verify:** `node --test` 100% green.

### Task 12 — Documentation synchronization (required by `GEMINI.md`)

Update `README.md`, `PROMPT.md`, `GEMINI.md`, and `CHECKLIST.md` to reflect the one-screen minimalist architecture, Dual-Source Handle Bar, gesture/keyboard map, and cold-start hydration. Use repository-relative paths strictly.

### Task 13 — Final verification and release

1. `node --test` — confirm 100% pass rate.
2. Execute Manual Verification Matrix (§8.1).
3. Independent subagent code review of complete diff.
4. `git push github-aawc main`.

---

### 8.1 Manual Verification Matrix

Run against `http://localhost:3000` and record each as `[PASS]` or `[FAIL]`:

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Cold start, empty library & no history | Stage shows `Nothing playing` + `[ 📁 Open music folder ]` and `[ 📻 Listen to radio ]` pills |
| 2 | Cold start, indexed tracks exist | Stage immediately hydrates last-played track (artwork, title, duration visible); pressing `Space` plays in **1 gesture** |
| 3 | Cold start on Firefox/Safari (Tier 2 session expired) | Stage shows track info + `[ 📁 Re-open music folder to play ]` prompt in Row 6 |
| 4 | Open folder (Chromium `showDirectoryPicker`) | Scan progress shown on handle; library populated and playable |
| 5 | Open folder (Firefox fallback `webkitdirectory`) | Same outcome via file input fallback |
| 6 | Tap `[ Local ]` pill in Row 6 | Browse sheet opens directly on `Library` tab (**2 taps total to play any song**) |
| 7 | Tap `[ Radio ]` pill in Row 6 | Browse sheet opens directly on `Radio` tab (**2 taps total to play any station**) |
| 8 | Horizontal swipe on Row 6 (or press `X`) | Playback switches immediately between last Local track and last Radio station in **1 gesture** |
| 9 | Tap `[+ Folder]` button in Browse Sheet header | Opens folder picker directly from Browse Sheet without visiting L2 Overflow |
| 10 | Single-tap center Artwork | Toggles Audio Visualizer on/off; subsequent taps cycle visualizer modes (`BARS` → `WAVE` → `NEBULA` → `STARFIELD`) |
| 11 | Double-tap center Artwork (or press `F`) | Toggles Star/Favorite, updates Row 1 `[★]` chip, shows `[STARRED]` toast |
| 12 | Mouse wheel scroll up/down on Stage | Adjusts volume `±5%` per tick and shows `[VOLUME n%]` toast |
| 13 | Click Row 1 `[ ••• ]` pill (or long-press artwork) | Opens L2 Overflow Menu |
| 14 | Overflow → `Rescan library` on Chromium | Reconciles stored directory handles via `db.getAllDirectoryHandles()` without popping folder picker |
| 15 | Radio tab → genre chip → station row | Station plays; status line transitions `[CONNECTING]` → `[LIVE] · 128 kbps` |
| 16 | Kill network mid-stream | Status line shows `[OFFLINE]` with `✖` in `--accent-rose` |
| 17 | Android/browser Back button with Browse Sheet open | Sheet closes cleanly (`#/browse` → `#/`); app does not exit |
| 18 | `Escape` with EQ open over Browse Sheet | EQ closes first; Browse Sheet remains open |
| 19 | Keyboard-only traversal (`Tab`, `Space`, `X`, `L`, `Shift+L`, `.`, `V`, `E`) | Every action reachable; high-contrast focus ring always visible; focus trapped in open modal |
| 20 | Screen reader (VoiceOver / TalkBack) | Track changes, toasts, and layer changes announced via `#aria-live-region` |
| 21 | Lock screen / Media Session API | Artwork, title, artist/station, and transport controls function on OS lock screen |
| 22 | Offline reload (PWA Service Worker) | App shell loads 100% offline from updated `APP_SHELL_ASSETS` cache |
| 23 | Overflow → `Reset library` → cancel | Nothing cleared; library intact |
| 24 | Overflow → `Reset library` → confirm | All 8 `RESET_STORE_NAMES` stores cleared cleanly without `NotFoundError`; starred radio stations survive |

---

## 9. Risks, Mitigations, and Resolved Architectural Decisions

1. **Discoverability of secondary features (Resolved via `[CRITIQUE-02]`):**
   - *Risk in initial proposal:* Long-press on artwork was the sole pointer entry point to L2 Overflow, making Equalizer, Rescan, and Reset invisible to casual users.
   - *Mitigation:* Row 1 now permanently renders an explicit, high-contrast `[ ••• ]` button (`aria-label="More options and settings"`), and active modes (`[SHUFFLE]`, `[REPEAT]`, `[★]`) render as interactive pill buttons in Row 1.
2. **Radio access speed (Resolved via `[CRITIQUE-01]`):**
   - *Risk in initial proposal:* Radio playback regressed from 2 taps to 3 taps (`handle → tab → row`).
   - *Mitigation:* The Stage bottom bar is now a Dual-Source Handle Bar (`[ Local ] · [ Radio ]`). Tapping `[ Radio ]` opens the Browse Sheet directly to the `Radio` tab (2 taps total), and swiping horizontally across the bar (or pressing `X`) toggles between Local and Radio playback in 1 gesture.
3. **Cold-start empty stage syndrome (Resolved via `[CRITIQUE-04]`):**
   - *Risk in initial proposal:* Reloading the page always showed `Nothing playing` because `db.getPlaybackState()` was never called.
   - *Mitigation:* `src/main.js` hydrates the last-played track or station on startup so the Stage is immediately ready for 1-tap playback (`Space` or Play button).
4. **Database reset reliability (Resolved via `[CRITIQUE-06]`):**
   - *Pre-existing defect:* `src/ui/views/settings-view.js` iterated non-existent store names (`albums`, `artists`, `history`, `directoryHandles`), throwing an unhandled `NotFoundError` after wiping `tracks`.
   - *Mitigation:* `RESET_STORE_NAMES` in `src/ui/components/overflow-menu.js` uses the exact verified store names from `src/storage/db.js` (`roots`, `tracks`, `artwork`, `playlists`, `favorites`, `playHistory`, `playbackState`, `settings`), wrapped in per-store `try`/`catch`, and guarded by a mandatory unit test in Task 5.
5. **Playlists data preservation:**
   - The IndexedDB `playlists` store is untouched during normal operation so existing user playlists are preserved in storage even while the Playlists UI is removed.
6. **CSS rewrite verification:**
   - Reducing `src/ui/app.css` from 2,138 lines to `≤ 700` lines requires careful visual verification of the restyled `eq-modal.js`, `release-notes-modal.js`, and `update-banner.js` across mobile (`320px`) and desktop viewports using the 24-row manual verification matrix (§8.1).
