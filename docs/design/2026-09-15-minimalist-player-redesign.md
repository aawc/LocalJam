# LocalJam — One-Screen Minimalist Redesign

**Status:** Proposal, awaiting approval
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

This proposal replaces that shell with a **single persistent screen** exposing **6 controls**, and
demotes everything else to two progressive layers reachable by one or two deliberate gestures.

| Metric | [BEFORE] Current | [AFTER] Proposed |
| --- | ---: | ---: |
| Interactive controls visible at rest (desktop) | 24 | 6 |
| Interactive controls visible at rest (mobile) | 14 | 6 |
| Hash routes | 10 | 2 |
| UI view modules (`src/ui/views/`) | 10 | 0 |
| UI component modules (`src/ui/components/`) | 7 | 6 |
| `src/ui/app.css` line count | 2138 | ≤ 700 (target) |
| Taps to play an indexed local song from cold start | 2 (nav → row) | 2 (handle → row) |
| Taps to play a radio station from cold start | 2 (nav → card) | 3 (handle → tab → row) |

**Be honest about the trade:** this redesign does not make playback faster to reach. Local playback
is at parity, and **radio costs one extra tap** because stations now live behind a tab inside the
sheet rather than behind their own nav link. The gain is the 24 → 6 and 14 → 6 reduction in
standing visual and cognitive load, not step count. If radio is the dominant use case, that extra
tap is a real cost and the tab order should default to whichever tab was last used (it does — §4.2).

Nothing in the audio, metadata, storage, or radio-catalog layers changes. This is a UI-shell
replacement, not an engine rewrite.

---

## 1. Decisions Already Made (do not relitigate)

Confirmed by the repository owner on 2026-09-15:

1. **Hard replace.** The sidebar, mobile bottom navigation, top bar, and 10-route view shell are
   deleted outright. There is no feature flag and no fallback to the old UI.
2. **Features that survive** (as modes inside the new layers, not as separate screens):
   Albums browse, Artists browse, Favorites/starred, History/recents, 10-band equalizer, audio
   visualizer, radio genre filters, radio sort order, app version display, folder rescan.
3. **Features that are deleted from the codebase:** Playlists UI, crossfade setting, global
   library search box, custom-radio-station entry form, queue drawer, settings/diagnostics page.
   The settings page's **`Reset library` action survives** as a single row at the bottom of the
   overflow menu, behind a confirmation (approved 2026-09-15; see §4.3.1). Storage-tier
   diagnostics and the crossfade slider do not survive.
4. Track and station **starring remains** regardless of the Favorites surface.

The three interpretations in §1.1 were reviewed and approved by the owner on 2026-09-15. They are
settled, not open.

### 1.1 Interpretations the implementer must honour

These are decisions derived from the above; they are called out so they are not silently reversed.

- **"Global search across library" = the persistent top-bar search box only.** It is deleted, along
  with the `Ctrl+K` shortcut. A *filter input inside the browse sheet* is retained, because a
  1000-station catalog and an arbitrarily large local library are unusable without one. This is a
  single input that exists only while the sheet is open.
- **`addCustomStation()` in `src/radio/stations.js` is kept; only its UI is deleted.** The function
  carries the HTTPS/protocol validation that `test/security.test.js` SEC-09 exercises. Deleting it
  would delete security coverage to save an unreachable 40 lines. Flagged in §9 as reversible.
- **The IndexedDB `playlists` object store is left in place.** The Playlists UI is deleted, but the
  v1 schema and any user data in it are untouched by normal operation. No migration, no destructive
  delete. If playlists are ever restored, the data is still there. The one exception is the explicit
  `Reset library` action (§4.3.1), which wipes it along with everything else.
- **Deleting the queue drawer changes queue semantics** rather than removing the queue: see §4.5.

---

## 2. Design Principles

1. **The app is the player.** The Now Playing screen is not a route; it is the application. It is
   never navigated away from — other surfaces are drawn *on top of* it.
2. **Six controls, no more.** Anything that is not required to (a) see what is playing, (b) start
   or stop it, (c) move within or between items, or (d) pick something else to play, is not on the
   stage.
3. **One gesture to choose, two gestures to configure.** Picking music is one action away. Changing
   how music sounds or behaves is two.
4. **Every gesture has a keyboard and pointer equivalent.** Gestures are an accelerator, never the
   only path. This is an accessibility requirement, not a nicety.
5. **Transient feedback replaces permanent chrome.** State changes that used to be shown by a
   persistent icon (shuffle on, muted, starred) are announced by a 1.6 s toast plus the ARIA live
   region, and are inspectable in the overflow layer.
6. **Radio and local files are the same object.** One stage, one transport, one browse sheet with
   two tabs. The only difference is that a station has no duration, so the progress line becomes a
   status line.

---

## 3. Layer Model

```
L0  STAGE          always visible, non-dismissible          the player
L1  BROWSE SHEET   one gesture (swipe up / handle / L / /)  choose what to play
L2  OVERFLOW       two gestures (long-press artwork / .)    star, shuffle, repeat, volume,
                                                            EQ, visualizer, rescan, version
L2' EQ SHEET       from L2 or E                             10-band equalizer
L2" NOTES MODAL    from L2 version row                      release notes
LX  UPDATE BANNER  system-driven, unchanged                 PWA update available
```

Only one of L1 / L2 / L2' / L2" is open at a time. `Escape` (or swipe down, or backdrop click)
closes the topmost layer.

---

## 4. Screen Specifications

### 4.1 L0 — Stage

Centred column, `max-width: 420px`, vertically centred in the viewport, `100dvh` tall, no scroll.

```
+--------------------------------------------------+
|  [SHUFFLE]  [REPEAT ONE]              (status)   |   <- row 1, text chips, hidden when default
|                                                  |
|          +--------------------------+            |
|          |                          |            |
|          |        ARTWORK           |            |   <- row 2, tap = play/pause
|          |     (or visualizer)      |            |      long-press = L2
|          |                          |            |      swipe left/right = next/prev
|          +--------------------------+            |
|                                                  |
|            Midnight City                         |   <- row 3, title  (18px / 600)
|            M83 — Hurry Up, We're Dreaming        |      subtitle (14px / secondary)
|                                                  |
|   ========================------------------     |   <- row 4, 3px progress line
|   1:42                                  -2:18    |      11px mono, current / remaining
|                                                  |
|              (<<)      ( > )      (>>)           |   <- row 5, transport, 56px play button
|                                                  |
|                  ________                        |   <- row 6, grab handle + label
|                   Library                        |      tap or swipe up = L1
+--------------------------------------------------+
```

**Control inventory (exactly 6 interactive targets):** artwork, previous, play/pause, next, seek
line, handle. The status chips in row 1 are text, not buttons.

**Radio variant.** Row 4 is replaced by a status line derived from the `streamState` field emitted
by `audioEngine.subscribe()`. Note that `streamState` is **not** a complete description of playback:
`notifyState()` emits `streamState: this.isRadio ? this.streamState : (this.isPlaying ? 'playing' :
'idle')`, and on the radio path the only values ever set are `idle`, `connecting`, `buffering`,
`playing`, and `error`. **There is no `'paused'` value** — `pause()` sets a non-errored stream back
to `'idle'`. The last two rows below must therefore be derived from `streamState` *and* `isPlaying`:

| Condition | Text | Icon | Colour token |
| --- | --- | --- | --- |
| `streamState === 'connecting'` | `[CONNECTING]` | `▲` | `--accent-amber` |
| `streamState === 'buffering'` | `[BUFFERING]` | `⏳` | `--accent-amber` |
| `streamState === 'error'` | `[OFFLINE]` | `✖` | `--accent-rose` |
| `streamState === 'playing'` and `isPlaying` | `[LIVE] · 128 kbps` | `●` | `--accent-cyan` |
| `streamState === 'idle'` or not `isPlaying` | `[READY]` | `●` | `--text-secondary` |

Every status is double-coded (bracketed text label + distinct glyph shape + colour). Never colour
alone. Previous/next traverse the **visible station list** (see §4.5), not the full catalog.

**Empty state** (no indexed tracks, nothing playing): artwork slot renders a muted disc glyph,
title reads `Nothing playing`, transport buttons are `disabled` with `aria-disabled="true"`, and the
handle label becomes a primary button `Open music folder`, with a secondary text button
`Listen to radio` that opens L1 on the Radio tab.

**Artwork sourcing.** Reuse existing behaviour: `track.artwork.dataUrl` →
`db.getArtwork(track.artworkId).thumbnailDataUrl` → `public/icons/icon-192.svg`. For stations:
`station.favicon` → `getStationFallbackArtwork(station)`. Attach an `error` listener (never an
inline `onerror=` attribute — SEC-06 forbids inline handlers).

### 4.2 L1 — Browse Sheet

Bottom sheet. Mobile: `88dvh`, full width, `border-radius: 24px 24px 0 0`. Desktop: centred,
`max-width: 720px`, `max-height: 720px`, radius on all corners. Backdrop
`--modal-backdrop-glass`, click-to-dismiss.

```
+--------------------------------------------------+
|                   ________                       |  grab handle (swipe down = close)
|  [ Library | Radio ]        [ filter... ]   (X)  |  segmented tabs + filter input + close
|  (Songs)(Albums)(Artists)(Starred)(Recent)       |  context chips, horizontally scrollable
|--------------------------------------------------|
|    Midnight City            M83          4:03    |  <- 48px rows, single line
|    Outro                    M83          3:41    |
|  | Wait                     M83          4:24    |  <- leading bar = playing + "PLAYING" label
|    ...                                           |
+--------------------------------------------------+
```

**Tabs.** `Library` and `Radio`. Last used tab persists via `db.setSetting('browse.tab', ...)`.

**Context chips.**

- Library: `Songs` (default) · `Albums` · `Artists` · `Starred` · `Recent`
- Radio: `★` · then every entry of `HIGH_LEVEL_GENRES` from `src/radio/stations.js`, followed by a
  `<select>` sort control with the existing options (`default`, `name-asc`, `name-desc`,
  `genre-asc`, `bitrate-desc`). **Do not prepend an `All` chip** — `HIGH_LEVEL_GENRES[0]` is
  already `'All'` and is the default selection. Prepending one renders it twice.

**Rows.** Uniform 48px (52px on coarse pointers), three fields: primary (title / album / artist /
station name), secondary (artist / track count / genre · country), trailing (duration / bitrate).
No tables, no album art thumbnails in rows, no per-row action buttons on mobile. The playing row
gets a 3px leading bar in `--accent-cyan` **and** a visually-hidden `PLAYING` text label.

**Row interactions.**

| Input | Action |
| --- | --- |
| Tap / click / `Enter` | Play the row, then close the sheet |
| Long-press (500 ms) / right-click / `F` while row focused | Toggle star, show toast, keep sheet open |
| `Albums` / `Artists` row tap | Drill in: list becomes that album's/artist's tracks, a back chip appears showing the name |
| Back chip / `Escape` / swipe right on the list | Leave the drill-in, return to the chip's root list |

**Filter input.** Debounced 120 ms, filters the currently displayed list only. Library filter
matches title, artist, album. Radio filter matches name, genre, category, description, country
(port the existing predicate from `src/ui/views/radio-view.js`). Cleared on tab change.

**Focus management.** On open, focus moves to the filter input. Focus is trapped inside the sheet.
On close, focus returns to the handle. `role="dialog"`, `aria-modal="true"`,
`aria-label="Browse library and radio"`.

### 4.3 L2 — Overflow Menu

Mobile: compact bottom sheet. Desktop: popover anchored to the artwork, `max-width: 320px`.
Rows are 44px, left-labelled, right-stated. All state is rendered as **text**, not icon colour.

| Row | Right-hand state | Applies to |
| --- | --- | --- |
| Star | `[STARRED]` / `[NOT STARRED]` | tracks + stations |
| Shuffle | `[ON]` / `[OFF]` | tracks only (hidden for radio) |
| Repeat | `[OFF]` / `[ALL]` / `[ONE]` | tracks only (hidden for radio) |
| Volume | inline slider + `[MUTED]` when muted | both |
| Equalizer | `[FLAT]` or `[CUSTOM]` | both |
| Visualizer | `[ON — BARS]` / `[OFF]`, tap cycles modes when on | both |
| Rescan music folder | track count, e.g. `412 tracks` | both |
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
const RESET_STORE_NAMES = [
  'roots', 'tracks', 'artwork', 'playlists',
  'favorites', 'playHistory', 'playbackState', 'settings'
];
```

`stations` is deliberately excluded so the curated catalog, any custom stations, and station stars
survive a library reset. This preserves the current intent — `stations` was never in the old array
either. Wrap the loop in `try`/`catch`, log failures with
`console.error('[Reset] Failed to clear store', storeName, err)`, and continue to the next store so
one failure cannot abort the whole wipe.

### 4.4 L2' — Equalizer Sheet

`src/ui/components/eq-modal.js` is **kept as-is functionally** and restyled to match the sheet
presentation (same backdrop, same radius, same close affordances). Opened from L2 or `E`.

### 4.5 Queue Semantics Without a Queue Drawer

This is the single most behaviour-affecting deletion; specify it exactly.

- Playing row *i* of the currently visible, filtered, sorted **library** list calls
  `queueManager.setQueue(visibleTracks, i)` then
  `audioEngine.playTrack(queueManager.getCurrentTrack())`.
- Playing a **station** calls `audioEngine.setStationCatalog(visibleStations)` **before**
  `audioEngine.playRadio(station)`, so that stage next/prev traverse exactly the list the user was
  looking at. (Today `radio-view.js` sets the catalog to the entire station list regardless of the
  active filter — the new behaviour is deliberately different and more predictable.)
- "The visible list is the queue." There is no separate queue object to inspect, reorder, or
  remove from. `queueManager` itself is unchanged; only its UI is gone.

---

## 5. Interaction Reference

### 5.1 Gestures

| Gesture | Target | Action | Non-gesture equivalent |
| --- | --- | --- | --- |
| Tap | artwork | Play / pause | `Space`, play button |
| Swipe left | stage | Next track / station | `Shift+→`, next button |
| Swipe right | stage | Previous track / station | `Shift+←`, prev button |
| Swipe up | stage / handle | Open browse sheet | `L`, tap handle |
| Swipe down | sheet / overflow | Close topmost layer | `Escape`, close button, backdrop click |
| Long-press 500 ms | artwork | Open overflow menu | `.` (period), right-click |
| Long-press 500 ms | sheet row | Toggle star + toast | right-click, `F` when row focused |

Thresholds (implemented in `src/ui/gestures.js`, unit-tested):

- Tap: movement `< 10 px` on both axes and duration `< 500 ms`.
- Swipe: dominant-axis distance `>= 48 px`, dominant axis `>= 1.5 x` the other axis, duration `<= 800 ms`.
- Long-press: duration `>= 500 ms` with movement `< 10 px` on both axes.

Implementation notes: use Pointer Events (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`)
with `setPointerCapture`. Set `touch-action: manipulation` on the stage and `preventDefault()` on
`contextmenu` for the artwork and sheet rows so the long-press does not race the platform context
menu. Respect `prefers-reduced-motion` (already handled globally in `src/ui/theme.css`) by skipping
sheet slide animations.

### 5.2 Keyboard Map

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Seek −5 s / +5 s (no-op for radio) |
| `Shift+←` / `Shift+→` | Previous / next |
| `↑` / `↓` | Volume ±5 % + toast |
| `M` | Mute toggle |
| `S` | Shuffle toggle (tracks only) |
| `R` | Cycle repeat (tracks only) |
| `F` | Star / unstar current item (or focused sheet row) |
| `E` | Equalizer sheet |
| `V` | Visualizer on / off |
| `L` | Open / close browse sheet |
| `/` | Open browse sheet and focus its filter input |
| `.` | Open overflow menu |
| `Escape` | Close topmost layer; blur input if typing |

**Removed:** `Q` (queue drawer), `Ctrl+K` / `Cmd+K` (global search). All shortcuts remain
suppressed while focus is in an `INPUT`, `TEXTAREA`, or `contentEditable` element, exactly as
`src/ui/keyboard.js` does today.

---

## 6. Module Architecture

### 6.1 Files to Add

| Path | Export | Responsibility |
| --- | --- | --- |
| `src/ui/gestures.js` | `classifyPointerGesture`, `isLongPress`, `attachGestures`, threshold constants | Pure gesture classification + a thin DOM binder |
| `src/ui/browse-model.js` | `filterTracks`, `buildLibraryRows`, `filterStations`, `buildStationRows` | Pure data selection/shaping. All list logic lives here so it is testable without a DOM |
| `src/ui/library-source.js` | `pickFolder`, `rescan`, `hasFileSystemAccess` | Owns folder acquisition: `showDirectoryPicker` on Chromium, `webkitdirectory` input fallback elsewhere, and the `reconciler.reconcileDirectoryHandle` / `reconcileFileList` calls with progress reporting. Ports this behaviour out of the deleted `home-view.js` and `settings-view.js`, which are its only current implementations |
| `src/ui/stage.js` | `createStage(deps)` | L0 rendering + `audioEngine.subscribe` binding + **ownership of the visualizer canvas and the `AudioVisualizer` lifecycle** (see §7.4) |
| `src/ui/layers.js` | `LayerController`, `layers` | Layer stack, hash sync, sanitized error boundary |
| `src/ui/components/browse-sheet.js` | `createBrowseSheet(deps)` | L1 |
| `src/ui/components/overflow-menu.js` | `createOverflowMenu(deps)` | L2 |
| `src/ui/components/toast.js` | `createToastHost`, `showToast` | Transient feedback + ARIA live announcement |

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
| `src/main.js` | Drop all route registration and view imports; mount stage, layers, toast host, EQ sheet, release-notes modal, update banner; keep the audio-unlock listeners, the `version.json` fetch, and the entire service-worker registration block unchanged |
| `src/ui/keyboard.js` | New map per §5.2; drop `Q` and `Ctrl+K`; route `L`, `/`, `.`, `F` through `layers` |
| `src/ui/app.css` | Full rewrite. Target ≤ 700 lines. Delete all `.app-sidebar`, `.mobile-nav`, `.top-bar`, `.player-bar`, `.track-table`, `.card-grid`, `.stat-card`, `.hero-*`, `.queue-*`, `.media-card`, `.view-*` rules. Keep and restyle: modal/backdrop, EQ modal, update banner, focus rings, `.sr-only` usage |
| `src/ui/theme.css` | Remove `--sidebar-width`, `--player-height`, `--player-height-mobile`, `--mobile-nav-height`, `--topbar-height`. Add `--stage-max: 420px`, `--sheet-max: 720px`, `--row-h: 48px`, `--row-h-coarse: 52px`. Keep every colour token unchanged |
| `sw.js` | Rebuild `APP_SHELL_ASSETS` from the post-deletion file list; bump `CACHE_NAME`. `test/pwa/pwa-assets.test.js` asserts every listed asset exists on disk, so a stale entry is a hard test failure |
| `src/ui/components/app-footer.js` → `src/ui/components/release-notes-modal.js` | Rename file and export (`createAppFooter` → `createReleaseNotesModal`). It has always been a release-notes modal, not a footer. Update `src/main.js`, the `window.localjamReleaseNotesModal` wiring, and rename `test/ui/app-footer.test.js` → `test/ui/release-notes-modal.test.js` |

### 6.4 Files Explicitly Untouched

`src/player/audio-engine.js`, `src/player/queue.js`, `src/player/equalizer.js`,
`src/storage/*`, `src/metadata/*`, `src/visualizer/visualizer.js`, `src/utils/sanitize.js`,
`src/version.js`, `src/ui/components/update-banner.js`, `server.js`, `manifest.webmanifest`,
`.github/workflows/release.yml`.

`src/radio/stations.js` keeps every export; only its UI consumers change.

---

## 7. API Contracts for New Modules

Implement exactly these signatures; the tests in §8 depend on them.

### 7.1 `src/ui/gestures.js`

```js
export const TAP_MAX_PX = 10;
export const TAP_MAX_MS = 500;
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
 * handlers: { onTap, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onLongPress }
 * Every handler is optional. Uses Pointer Events; no-ops when `el` is falsy.
 * @returns {() => void}
 */
export function attachGestures(el, handlers) {}
```

Classification precedence: long-press is decided by the timer during the press and short-circuits
`onTap`; otherwise `classifyPointerGesture` decides. A movement that satisfies neither tap nor
swipe returns `'none'`.

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
  `?tab=radio`); closing it returns to `#/`. A `hashchange` to `#/` closes the browse layer. This
  makes the Android/browser back button close the sheet, preserving the repository's hash-routing
  principle without a view router. `overflow`, `eq`, and `notes` do not touch the hash.
- Error boundary: if a layer factory throws, render a `layer-error` block whose message is passed
  through `escapeHtml` from `src/utils/sanitize.js`. This replaces the router error boundary that
  `test/security.test.js` SEC-07 covers today.

### 7.4 `src/ui/stage.js`

```js
/**
 * @param {{ onOpenBrowse:Function, onOpenOverflow:Function, onPickFolder:Function }} deps
 * @returns {{ element: HTMLElement, destroy: () => void,
 *             setVisualizer: (enabled:boolean) => void,
 *             setVisualizerMode: (modeId:string) => void }}
 */
export function createStage(deps) {}
```

Subscribes to `audioEngine.subscribe(state => ...)` and updates in place — it must never re-render
its whole `innerHTML` on a state tick (the current `player-view.js` pattern of rebuilding strings
on every tick is what makes the visualizer and the seek slider fight each other).

**The stage owns the visualizer.** `src/ui/components/visualizer-overlay.js` and
`src/ui/views/player-view.js` are the only two places that currently construct an `AudioVisualizer`,
and both are deleted, so without this the surviving `src/visualizer/visualizer.js` would have no
caller. Port the lifecycle from `player-view.js`:

- Render a `<canvas>` in the artwork slot, hidden by default (visualizer starts **off**).
- Lazily `new AudioVisualizer(canvas)` on first enable; call `setMode(modeId)` with a value from
  `VISUALIZER_MODES`, then `resize()`, then `start()` only when `audioEngine.isPlaying`.
- On state ticks: `start()` when playing, `pause()` when not.
- `setVisualizer(false)` hides the canvas, shows the artwork, and calls `pause()`.
- `destroy()` calls `visualizer.destroy()` and unsubscribes.
- Tapping the canvas cycles to the next mode in `VISUALIZER_MODES` (the stage's only nested
  gesture); the overflow row reflects the current mode as `[ON — <MODE>]`.

Persist the on/off flag and mode via `db.setSetting('viz.enabled', …)` and
`db.setSetting('viz.mode', …)`.

### 7.5 `src/ui/library-source.js`

```js
/** True when the File System Access API is available (Chromium desktop). */
export function hasFileSystemAccess() {}

/**
 * Prompts for a music folder and indexes it. On Chromium uses showDirectoryPicker({mode:'read'})
 * + reconciler.reconcileDirectoryHandle; elsewhere the caller must supply a FileList obtained
 * from a `webkitdirectory` input, which is passed to reconciler.reconcileFileList.
 * Swallows AbortError (user cancelled) and resolves false; logs and rethrows anything else.
 * @param {{ onProgress?: (p:{parsedCount:number}) => void, fileList?: FileList }} opts
 * @returns {Promise<boolean>} true when at least one track was indexed
 */
export async function pickFolder(opts) {}

/** Re-runs reconciliation against the stored directory handles. */
export async function rescan(opts) {}
```

Port verbatim from the deleted `src/ui/views/home-view.js` (the `showDirectoryPicker` branch, the
`webkitdirectory` fallback input, and the `parsedCount` progress callback) and
`src/ui/views/settings-view.js` (the rescan branch). Replace the `alert()` calls with toasts. This
module is what backs the empty-state `Open music folder` button (§4.1), the overflow
`Rescan music folder` row (§4.3), and manual test rows 2 and 3.

### 7.6 `src/ui/components/browse-sheet.js`

```js
export function createBrowseSheet({ onPlayTrack, onPlayStation, onToast }) {
  // returns { element, onOpen(props), onClose(), focusFirst() }
}
```

### 7.7 `src/ui/components/overflow-menu.js`

```js
/** The corrected object-store list from §4.3.1. Exported from THIS module so Task 5 can assert it. */
export const RESET_STORE_NAMES = [
  'roots', 'tracks', 'artwork', 'playlists',
  'favorites', 'playHistory', 'playbackState', 'settings'
];

export function createOverflowMenu({
  onOpenEq, onOpenNotes, onRescan, onReset, onToggleVisualizer, onToast
}) {
  // returns { element, onOpen(), onClose(), focusFirst() }
}
```

`onReset` must not be invoked until the confirmation resolves affirmatively; the menu owns the
confirmation prompt, the caller owns the clearing and the reload.

### 7.8 `src/ui/components/toast.js`

```js
export function createToastHost() {} // returns { element, show(message) }
export function showToast(message) {} // module-level convenience; also writes the message
                                      // into #aria-live-region
```

Toasts: 1.6 s, bottom-centre above the transport, `role="status"`, text-only, no colour-only
meaning (`[STARRED] Midnight City`, `[SHUFFLE ON]`, `[VOLUME 65%]`).

---

## 8. Implementation Plan

Testing stack is unchanged: Node.js 22 built-in runner, `npm test` → `node --test`, ES modules,
no dependencies. Tests run without a browser, so DOM-dependent modules are asserted through
`innerHTML` strings (matching the existing convention in `test/ui/components.test.js`), and all
non-trivial logic is pushed into pure modules that get real assertions.

Every task below is a single atomic commit authored as `Varun Khaneja <git.bin@khaneja.org>`,
reviewed by an independent subagent before committing, and pushed to `github-aawc` immediately
after commit.

### Task 0 — Pre-flight (mandatory)

1. `git status --short` must be empty. If it is not, HALT and ask the owner. Never revert or delete
   uncommitted work autonomously.
2. `git branch --show-current` must be `main` (or an explicitly agreed feature branch).
3. Run the suite and record the baseline. Measured on 2026-09-15 at commit `e8cbf7c`:
   **213 tests, 213 pass, 0 fail, 0 skipped**. Every later task is judged against this number.
   Invoke it as `node --test` from the repository root; `npm test` is equivalent but `npm` is not
   guaranteed to be on `PATH` in every environment.

4. Read `GEMINI.md` and `PROMPT.md` before writing code.

### Task 1 — `src/ui/gestures.js`

- **Audit:** none (new module, no dependents yet).
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
  - `attachGestures(null, {})` returns a function and does not throw
  Confirm the suite fails before the module exists.
- **GREEN:** implement the module.
- **Verify:** `npm test`. Record raw output.

### Task 2 — `src/ui/browse-model.js`

- **Audit:** read the filter/sort predicates in `src/ui/views/radio-view.js`
  (`getFilteredAndSortedStations`) and `src/ui/views/songs-view.js` before porting.
- **RED:** `test/ui/browse-model.test.js` with fixture arrays of 4 tracks and 4 stations:
  - `filterTracks` matches on title, artist, and album, case-insensitively; empty query is identity.
  - `buildLibraryRows({mode:'albums', ...})` collapses 4 tracks across 2 albums into 2 rows whose
    `trailing` reads `2 tracks`.
  - `buildLibraryRows({mode:'albums', drill:{kind:'album', name:'Cosmos'}})` returns only the 2
    Cosmos tracks, `kind === 'track'`.
  - `buildLibraryRows({mode:'starred'})` returns only favourites.
  - `buildLibraryRows({mode:'recent'})` preserves history order.
  - A track with `isMissing: 1` appears in `songs` with `[MISSING]` in `trailing` and is absent
    from `albums`/`artists`.
  - `filterStations(stations, {genre:'Favorites'})` returns only `isFavorite` stations.
  - `filterStations(stations, {sort:'name-asc'})` returns names in ascending order (assert the
    exact expected array).
  - `filterStations(stations, {sort:'bitrate-desc'})` orders `320 kbps` before `128 kbps`.
- **GREEN + Verify** as above.

### Task 3 — `src/ui/components/toast.js`

- **RED:** `test/ui/toast.test.js` — `createToastHost().show('[STARRED] X')` puts the string in the
  host's `innerHTML`; two rapid calls leave exactly one visible toast; the host element carries
  `role="status"`.
- **GREEN + Verify.**

### Task 4 — `src/ui/components/browse-sheet.js`

- **Audit:** read the mock-DOM helpers at the top of `test/ui/components.test.js` and reuse that
  harness rather than inventing a second one.
- **RED:** `test/ui/browse-sheet.test.js`:
  - the returned `element` has `role="dialog"` and `aria-modal="true"`;
  - markup contains both tab labels `Library` and `Radio`;
  - markup contains all five library chips;
  - markup contains a filter `input` with an `aria-label`;
  - markup contains **no** `onclick=` and **no** `onerror=` substrings (CSP / SEC-06);
  - a station whose name is a `<script>` payload is rendered escaped (assert `&lt;script&gt;`
    present, raw tag absent).
- **GREEN + Verify.**

### Task 5 — `src/ui/components/overflow-menu.js`

- **Audit:** read §4.3.1 and confirm the store names against `src/storage/db.js` yourself before
  writing the constant. Do not trust the array in `src/ui/views/settings-view.js`.
- **RED:** `test/ui/overflow-menu.test.js`:
  - markup contains the labels `Star`, `Shuffle`, `Repeat`, `Volume`, `Equalizer`, `Visualizer`,
    `Rescan music folder`, `Reset library`, and the string `LocalJam v`;
  - state is rendered as bracketed text (`[ON]`, `[OFF]`, `[DESTRUCTIVE]`);
  - no inline handlers;
  - **store-name regression test:** read `src/storage/db.js` from disk, extract every
    `createObjectStore('<name>'` occurrence into a `Set`, and assert that every entry of
    `RESET_STORE_NAMES` is a member of that set. Assert the exact expected array
    `['roots','tracks','artwork','playlists','favorites','playHistory','playbackState','settings']`
    and assert that `'stations'` is **not** in it. This test fails against the current
    `settings-view.js` array, which is the point: it pins the fix.
  - **confirmation test:** stub the confirmation to return `false` and assert the injected
    `onReset` spy was **not** called; stub it to return `true` and assert it was called exactly
    once.
- **GREEN + Verify.**

### Task 6 — `src/ui/library-source.js`

- **Audit:** read the `showDirectoryPicker` branch and `webkitdirectory` fallback in
  `src/ui/views/home-view.js`, and the rescan branch in `src/ui/views/settings-view.js`. These are
  the only implementations and both files are deleted in Task 11, so this port must land first.
- **RED:** `test/ui/library-source.test.js`:
  - `hasFileSystemAccess()` returns `false` when `globalThis.window` lacks `showDirectoryPicker`
    and `true` when a stub is present (restore the global in a `finally`);
  - `pickFolder()` resolves `false` and does **not** rethrow when the stubbed picker rejects with
    `Object.assign(new Error('x'), { name: 'AbortError' })`;
  - `pickFolder()` rethrows any non-`AbortError` rejection;
  - `pickFolder({ fileList })` with a stubbed `reconciler.reconcileFileList` forwards the list and
    reports progress through `onProgress`.
- **GREEN + Verify.**

### Task 7 — `src/ui/stage.js`

- **Audit:** read `notifyState()` in `src/player/audio-engine.js` and confirm the state fields
  (`isPlaying`, `isRadio`, `streamState`, `currentTrack`, `currentStation`, `currentTime`,
  `duration`, `volume`, `muted`, `repeat`, `shuffle` — 11 fields). Also read the visualizer
  lifecycle in `src/ui/views/player-view.js` (`setupVisualizerInstance`, `updateVisualizerState`)
  before porting it per §7.4.
- **RED:** `test/ui/stage.test.js` (mock `audioEngine` state by assigning fields before calling the
  factory, as `test/ui/views.test.js` does today):
  - local track: markup contains the title, the artist, a seek `input[type=range]`, and exactly
    three transport buttons;
  - radio station with `streamState: 'error'`: markup contains `[OFFLINE]` and `✖`, and contains
    no seek slider;
  - radio station with `streamState: 'playing'` and `isPlaying: false`: markup contains `[READY]`,
    **not** `[LIVE]` (this is the derived-state rule from §4.1 — `'paused'` is never emitted);
  - empty state: markup contains `Nothing playing` and `Open music folder`;
  - shuffle on: markup contains the text chip `[SHUFFLE]`;
  - a `<canvas>` exists in the artwork slot and is hidden while the visualizer is off;
  - `setVisualizer(true)` reveals the canvas and hides the artwork image;
  - no inline `onclick=` / `onerror=` anywhere.
- **GREEN + Verify.**

### Task 8 — `src/ui/layers.js`

- **RED:** `test/ui/layers.test.js`:
  - `open('browse')` then `top` === `'browse'`; `open('eq')` then `top` === `'eq'`; `close()` returns
    `top` to `'browse'`; `closeAll()` returns `top` to `null`;
  - a factory that throws an error whose message contains a `<script>` payload produces markup
    containing `&lt;script&gt;` and not the raw tag (this is the SEC-07 replacement);
  - opening `browse` sets `window.location.hash` to a string starting with `#/browse` (stub
    `globalThis.window` as `test/security.test.js` SEC-07 does, and restore it in a `finally`).
- **GREEN + Verify.**

### Task 9 — Rewrite `src/ui/keyboard.js`

- **Audit:** read `test/ui/keyboard.test.js` to see how synthetic events are constructed.
- **RED:** extend that test to assert the new map — `KeyL` opens the browse layer, `Period` opens
  overflow, `KeyF` triggers the favourite path, `KeyQ` does nothing, `Ctrl+K` does nothing, and
  shortcuts stay suppressed while `document.activeElement.tagName === 'INPUT'`.
- **GREEN + Verify.**

### Task 10 — Wire the shell (`index.html`, `src/main.js`, CSS)

- **Audit:** re-read `test/pwa/pwa-assets.test.js:75-78` (which asserts four `index.html` literals
  exactly) and `test/security.test.js:227-245` (SEC-02, which matches only the CSP meta by regex and
  checks its directives). Those are the only two tests that read `index.html` content.
- **RED:** add `test/ui/shell.test.js` asserting that `index.html` contains `id="stage-root"`,
  `id="layer-root"`, `id="toast-root"`, and contains **none** of `app-sidebar`, `mobile-nav`,
  `top-bar`, `player-bar-container`, `global-search-input`. Note that `id="aria-live-region"`
  already exists at `index.html:198` — assert it too, but as a **preservation** check; it is green
  from the start and must stay that way.
- **GREEN:** rewrite `index.html`, `src/main.js`, `src/ui/app.css`, `src/ui/theme.css`. In
  `src/main.js`, import the release-notes modal under its **current** name
  (`createAppFooter` from `./ui/components/app-footer.js`); Task 11 performs the rename and updates
  this import. The `window.localjamReleaseNotesModal` global already uses the final name
  (`src/main.js:78`) and does not change.
- **Verify:** `node --test`; then `npm start` (or `node server.js`) and load
  `http://localhost:3000` for §8.1 rows 1-15 and 17-20. **Row 16 (offline reload) is deferred to
  Task 11**, because `sw.js` still precaches the old file list until then.

### Task 11 — Delete dead code and refresh the service worker

- **Audit:** search for every remaining importer of the doomed modules before deleting anything
  (`rg -l "views/|player-bar|queue-drawer|station-modal|visualizer-overlay|ui/router"`). The
  expected set is exactly `test/ui/views.test.js`, `test/ui/router.test.js`,
  `test/ui/station-modal.test.js`, `test/ui/components.test.js`, and `test/security.test.js`. If
  anything else appears, stop and reconcile before deleting.
- **GREEN:**
  - delete the files listed in §6.2;
  - rename `app-footer.js` → `release-notes-modal.js` per §6.3 and update the Task 10 import;
  - rebuild `APP_SHELL_ASSETS` in `sw.js` from the post-deletion file list. It **must** still
    include `./src/utils/sanitize.js` (`test/pwa/pwa-assets.test.js:65` asserts this) and every
    entry must exist on disk (asserted at `:52-58`). **Do not hand-pick `CACHE_NAME`** — it is
    machine-generated by `syncServiceWorker()` in `scripts/generate-version.js:86-92` from the
    release tag. If you bump it locally for testing, keep the `localjam-` prefix that
    `test/pwa/pwa-assets.test.js:43` pins;
  - delete `test/ui/views.test.js`, `test/ui/router.test.js`, `test/ui/station-modal.test.js`;
  - update `test/ui/components.test.js` (drop the player-bar, queue-drawer, and station-modal
    cases; keep the EQ-modal case);
  - update `test/security.test.js` — SEC-03 retargets to the browse sheet's station rendering,
    SEC-04/06 retargets to the browse sheet and stage, SEC-07 is removed in favour of the
    `layers.js` test from Task 8.
  - **`test/radio/radio-navigation.test.js` needs no change.** It imports only `AudioEngine` and
    `CURATED_STATIONS` and drives `engine.setStationCatalog(...)` directly; it has no dependency on
    the view layer. Leave it alone.
- **Verify:** `node --test` must be fully green, plus §8.1 row 16. Confirm the pass count equals the
  Task 0 baseline (213) plus new cases minus the deliberately removed cases, and enumerate those
  removals in the commit message.

### Task 12 — Documentation synchronization (required by `GEMINI.md`)

Update `README.md` (feature list, keyboard table), `PROMPT.md` (architecture and UI specification
sections), `GEMINI.md` (architectural principles referencing the removed shell), and `CHECKLIST.md`
(new entry with the commit hashes). Use repository-relative paths only; no absolute local
filesystem paths anywhere in tracked files.

### Task 13 — Final verification and release

1. `node --test` — full suite; paste the raw summary line into the commit or PR body.
2. Manual matrix (§8.1), all 20 rows.
3. Independent subagent code review of the complete diff before the final push.
4. `git push github-aawc main`.

### 8.1 Manual Verification Matrix

Automated tests cannot cover gestures, layout, or audio. Run these by hand against
`http://localhost:3000` and record each result as `[PASS]` or `[FAIL]`.

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Cold start, empty library | Stage shows `Nothing playing` + `Open music folder` |
| 2 | Open folder (Chromium, `showDirectoryPicker`) | Scan progress shown on the handle label; stage becomes playable |
| 3 | Open folder (Firefox fallback `webkitdirectory`) | Same outcome via the file input path |
| 4 | Swipe up on stage | Browse sheet opens, filter focused |
| 5 | Tap a song row | Plays, sheet closes, stage updates within one animation frame |
| 6 | Swipe left / right on stage | Next / previous within the list that was visible when playback started |
| 7 | Long-press artwork | Overflow opens; platform context menu does **not** appear |
| 8 | Long-press a row | Star toggles, toast appears, sheet stays open |
| 9 | Radio tab → genre chip → station | Station plays; status line cycles `[CONNECTING]` → `[LIVE]` |
| 10 | Kill network mid-stream | Status line shows `[OFFLINE]` with `✖` |
| 11 | Android back button with sheet open | Sheet closes; app does not exit |
| 12 | `Escape` with EQ open over the sheet | EQ closes, sheet remains |
| 13 | Keyboard-only traversal | Every action in §5.2 reachable; focus ring always visible; focus trapped in sheet |
| 14 | Screen reader (VoiceOver or TalkBack) | Track changes, toasts, and layer changes are announced |
| 15 | Lock screen / Media Session | Title, artist, artwork, and transport still work |
| 16 | Offline reload (PWA) | App shell loads from cache with the new asset list |
| 17 | `prefers-reduced-motion: reduce` | No sheet slide or artwork pulse animation |
| 18 | 320 px-wide viewport | No horizontal scroll; all six stage controls reachable |
| 19 | Overflow → `Reset library` → cancel | Nothing is cleared; library still intact after reload |
| 20 | Overflow → `Reset library` → confirm | Tracks, artwork, stars, and history are gone after reload; **starred radio stations survive** (the `stations` store is not cleared) |

---

## 9. Risks, Costs, and Resolved Decisions

Stated plainly, because these are the parts that will hurt.

1. **Discoverability collapses.** Long-press and swipe are invisible affordances. Users who do not
   read documentation will never find the equalizer or the star control. Mitigation: the handle is
   labelled, the overflow menu is also reachable by right-click and by `.`, and a first-run toast
   can announce `Long-press the artwork for more`. This does not fully solve it. Accept or reject
   consciously.
2. **Database reset is retained** (§4.3.1), so the in-app recovery path for a corrupted IndexedDB
   survives the deletion of the settings page. Resolved 2026-09-15. The residual risk is that a
   destructive action now sits one long-press away from the artwork rather than behind a
   navigation step; the confirmation prompt and the `[DESTRUCTIVE]` tag are the only guards.
3. **Playlists data becomes unreachable.** The store is preserved (§1.1) but no UI reads it. If
   playlists ever return, they return intact; until then the data is dead weight.
4. **No visible queue.** Users cannot see or reorder what plays next. "The visible list is the
   queue" is predictable but strictly less capable than the drawer being deleted.
5. **The CSS rewrite is the highest-risk change** and the least test-covered. A 2138 → 700 line
   rewrite will regress something visual, most likely the EQ modal or the update banner. Budget
   manual QA time; the Node test suite will not catch it.
6. **Mobile long-press versus context menu** is browser-dependent. iOS Safari in particular fires a
   callout on long-press over images; `-webkit-touch-callout: none` plus `contextmenu` suppression
   is required and must be verified on a real device, not an emulator.
7. **Two entry points for the same list state** (chips plus filter plus drill-in) can produce
   confusing combinations, for example being drilled into an album with a filter still applied.
   Specified behaviour: changing a chip clears both the filter and the drill-in state.
8. **Pre-existing defect found while specifying the reset port: the current reset is broken.**
   This was found by static analysis on 2026-09-15 and is not caused by this redesign.

   Evidence: `src/storage/db.js` creates exactly nine stores — `roots`, `tracks`, `artwork`,
   `playlists`, `favorites`, `playHistory`, `stations`, `playbackState`, `settings`. The handler in
   `src/ui/views/settings-view.js` iterates
   `['tracks','albums','artists','playlists','favorites','history','artwork','directoryHandles','settings']`.
   Four of those nine names match no store.

   Derived failure mode (not observed at runtime — reproducing it requires a browser with a
   populated IndexedDB, which the Node test suite cannot provide): `getStore()` calls
   `db.transaction(storeName, mode)` with no guard, and `IDBDatabase.transaction()` raises
   `NotFoundError` for an unknown store. The loop clears `tracks`, then rejects on `albums`. The
   click handler has no `try`/`catch`, so the rejection is unhandled, the success alert never
   fires, and the page never reloads. Net effect: the user's tracks are wiped while history,
   favourites, playlists, artwork, roots, playback state, and settings all survive, with no error
   surfaced. That is arguably worse than the action failing outright.

   This redesign fixes it incidentally via §4.3.1 and the Task 5 regression test. **Confirm whether
   you want it fixed sooner as a standalone commit against the current UI**, since the redesign is
   a multi-day change and the broken reset is shipping today.

**Decisions resolved on 2026-09-15 (owner approved):**

- Reinstate `Reset library` in the overflow menu — **yes**, with the corrected store list (§4.3.1).
- Keep the per-sheet filter input — **yes** (§1.1).
- Keep `addCustomStation()` in the data layer with no UI — **yes** (§1.1).

No open decisions remain. The plan is ready to execute from Task 0.
