# LocalJam Radio & Mobile UX Simplification & Static Analysis Report

**Product:** LocalJam (Local-First Web Audio Player & Internet Radio PWA)  
**Author:** Varun Khaneja <git.bin@khaneja.org>  
**Date:** 2026-09-14  
**Status:** `[APPROVED]`  

---

## 1. Executive Summary & Design Vision

LocalJam is a local-first audio player and curated internet radio Progressive Web App (PWA). Under the minimalist design doctrine of Dieter Rams (*"Less, but better"* / *"Weniger, aber besser"*), an audio interface should be quiet, intuitive, and tactile—getting out of the way so the audio experience takes center stage.

This report documents a comprehensive static analysis of the LocalJam codebase, evaluating:
1. **Radio & Streaming Mode Usability:** Station discovery, stream lifecycle feedback (connecting, buffering, live, offline), and transport controls (next/previous station cycling).
2. **Mobile Form Factor Ergonomics:** Vertical viewport real estate, bottom floating layer collisions, thumb-reachability, 44px+ touch target standards, and responsive layout behavior.
3. **Audio Engine Architecture:** Stream connection state machine, error recovery, crossfade method consistency, and MediaSession lockscreen integration.
4. **Accessibility & Colorblind Safety:** Strict double-encoding (unambiguous geometric icons + text tokens + colorblind-safe palettes).

---

## 2. Executive Usability Audit & Severity Matrix

<!-- mdformat off(reason: standard GFM table rendering in Critique and Code Search) -->
| Finding ID | Severity | UX Domain | Component / File | Root Cause & Usability Defect | Proposed Solution | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **UX-RAD-01** | `[CRITICAL]` | Radio Playback | [`audio-engine.js`](./src/player/audio-engine.js#L574-L590) | **Non-Functional Previous/Next Station Controls:** `audioEngine.next()` and `previous()` exit immediately with `if (this.isRadio) return;`, rendering player bar and lockscreen prev/next buttons dead during radio streaming. | Implement circular station navigation in `AudioEngine` when `isRadio` is active, cycling smoothly to next/previous stations and updating MediaSession metadata. | `[RESOLVED]` |
| **UX-RAD-02** | `[HIGH]` | Stream Lifecycle | [`audio-engine.js`](./src/player/audio-engine.js#L377-L488), [`player-bar.js`](./src/ui/components/player-bar.js#L78-L91) | **Missing Buffering & Reconnect Feedback:** Network stream buffering takes 1–3s on mobile with zero visual state change; network dropouts fail silently with only console logs. | Add explicit stream state machine (`connecting`, `buffering`, `playing`, `error`) with pulsing amber `[BUFFERING]`, cyan `[LIVE]` status, and auto-reconnect fallback on transient dropouts. | `[RESOLVED]` |
| **UX-MOB-01** | `[HIGH]` | Viewport Geometry | [`app.css`](./src/ui/app.css#L716-L733), [`theme.css`](./src/ui/theme.css#L35-L38) | **Excessive Vertical Real Estate Consumed by Floating Bars on Mobile:** Player bar (`88px`) + Mobile Nav (`64px`) consume `152px` (over 25% of viewport height on standard mobile devices). | Streamline mobile player bar to compact `60px` and mobile nav to `52px` (saving `40px` of vertical height) with clean safe-area inset padding. | `[RESOLVED]` |
| **UX-MOB-02** | `[HIGH]` | Player Ergonomics | [`player-bar.js`](./src/ui/components/player-bar.js#L18-L137), [`app.css`](./src/ui/app.css#L1448-L1469) | **Mobile Player Bar Overcrowding on Small Screens (<480px):** 3-column desktop layout crowds left artwork, title, center transport, and right buttons into a narrow strip, squeezing titles to <40px. | Implement responsive mobile mini-player: 44px artwork + compact title/genre on left, prominent thumb-friendly 44x44px Play/Pause + Prev/Next + Star controls on right; secondary actions accessible in station sheet. | `[RESOLVED]` |
| **UX-MOB-03** | `[HIGH]` | Radio View / Cards | [`radio-view.js`](./src/ui/views/radio-view.js#L80-L108), [`app.css`](./src/ui/app.css#L338-L368) | **Touch Interaction Ambiguity & Missing Hover:** Play button on cards relies on desktop `:hover`; card click vs star click creates touch target ambiguity on mobile touchscreens. | Render permanent, touch-friendly play trigger and distinct star button with 44px+ hit areas; provide a dedicated "Now Playing" Radio Hero Banner at the top of Radio View on mobile. | `[RESOLVED]` |
| **UX-MOB-04** | `[MEDIUM]` | Sheet Navigation | [`station-modal.js`](./src/ui/components/station-modal.js#L20-L102), [`app.css`](./src/ui/app.css#L1222-L1257) | **Awkward Desktop Modal on Mobile:** Centered modal with small top-right close button is difficult to navigate one-handed on mobile screens. | Convert station details modal to an ergonomic slide-up bottom sheet on mobile (<768px) with rounded top corners, swipe/tap backdrop dismiss, and thumb-accessible action buttons. | `[RESOLVED]` |
| **UX-MOB-05** | `[MEDIUM]` | Form Responsiveness | [`radio-view.js`](./src/ui/views/radio-view.js#L321-L338) | **Rigid 4-Column "Add Custom Stream" Form:** Desktop grid layout (`grid-template-columns: 1fr 1fr 120px auto;`) overflows horizontally on mobile viewports. | Make Custom Station form responsive: single-column stack on mobile with full-width touch-friendly inputs and action buttons. | `[RESOLVED]` |
| **UX-MOB-06** | `[MEDIUM]` | Toolbar / Search | [`radio-view.js`](./src/ui/views/radio-view.js#L279-L316) | **Cluttered Search & Filter Controls on Mobile:** Search input and sort dropdown wrap awkwardly; no quick clear button on search input. | Provide unified mobile search toolbar with clear `(×)` action button, compact sort selector, and smooth horizontal genre chip scrolling with overflow fading masks. | `[RESOLVED]` |
| **UX-MOB-07** | `[MEDIUM]` | Table Legibility | [`songs-view.js`](./src/ui/views/songs-view.js#L88-L132), [`favorites-view.js`](./src/ui/views/favorites-view.js) | **Table Column Cramming on Mobile:** `#`, `Title`, `Artist`, `Album`, `Time`, and `Fav` columns create horizontal crowding on mobile viewports (<640px). | Responsively hide `Album` and `#` track columns on small screens, prioritizing high-legibility `Title`, `Artist`, `Duration`, and `Fav` actions. | `[RESOLVED]` |
| **UX-ENG-01** | `[LOW]` | Settings View | [`settings-view.js`](./src/ui/views/settings-view.js#L20), [`audio-engine.js`](./src/player/audio-engine.js) | **Missing Crossfade Duration Methods in AudioEngine:** `settings-view.js` calls `audioEngine.setCrossfadeDuration(val)` which throws a TypeError because `AudioEngine` only defines `this.crossfadeSeconds`. | Implement `setCrossfadeDuration(seconds)` and `get crossfadeDuration()` in `AudioEngine`. | `[RESOLVED]` |
<!-- mdformat on -->

---

## 3. Deep-Dive Findings & Architectural Specifications

### 3.1. Radio Navigation & Previous/Next Station Cycling

#### Usability Flaw
When streaming an internet radio station, the center player controls display Previous Station and Next Station buttons, and mobile lockscreens display skip buttons. However, `AudioEngine.previous()` and `AudioEngine.next()` execute `if (this.isRadio) return;`, rendering all previous/next interactions completely non-operational.

#### Architectural Solution
1. Maintain active station catalog reference in `AudioEngine` (loaded from IndexedDB / curated list).
2. When `isRadio` is active:
   - `audioEngine.next()` advances to `(currentIndex + 1) % stationList.length` and initiates playback.
   - `audioEngine.previous()` retreats to `(currentIndex - 1 + stationList.length) % stationList.length`.
3. Support MediaSession API `previoustrack` and `nexttrack` handlers for seamless lockscreen and headphone remote station changing.

```
[BEFORE: Radio Transport Deadlock]
User taps [Next Station] -> audioEngine.next() -> if (this.isRadio) return; -> [NO ACTION]

[AFTER: Smooth Circular Station Cycling]
User taps [Next Station] -> audioEngine.next() -> cycles to next curated station -> playRadio(nextStation) -> updates MediaSession & UI [PASS]
```

---

### 3.2. Stream Connection & Buffering Lifecycle State Machine

#### Usability Flaw
Radio stream connection latency on mobile cellular networks typically ranges from 500ms to 3000ms. Currently, the UI provides no intermediate feedback during stream buffering, leading users to believe playback failed or tapped buttons didn't register. If network connection drops temporarily, the audio element triggers an error event with no user-visible retry affordance.

#### Architectural Solution
Implement explicit stream state management within `AudioEngine`:
```
[Stream State Machine]
( Idle ) ---> [playRadio(station)] ---> ( Connecting )
                                             |
                                             v
( Playing ) <--- [canplay / playing] <--- ( Buffering )
     |
     +--- [network error] ---> ( Reconnecting ) ---> ( Error / Offline )
                                     |
                                     +--- [retry success] ---> ( Playing )
```

Visual tokens for player bar and station cards:
- `[CONNECTING]`: Pulsing amber capsule with `⏳ Connecting...`
- `[BUFFERING]`: Amber wave beacon with `⏳ Buffering...`
- `[LIVE]`: Sky blue glowing beacon with `● LIVE • 128 kbps`
- `[RECONNECT]`: Rose badge with automatic graceful retry (1 retry attempt on network blip)

---

### 3.3. Mobile Viewport Geometry & Compact Mini-Player Bar

#### Usability Flaw
On mobile screens (<= 768px), the floating player bar (`88px`) and mobile navigation bar (`64px`) consume `152px` of vertical height at the bottom of the screen. Combined with the top header (`60px`), over `212px` of vertical screen real estate is lost, crowding song lists and station grids into a cramped viewing area.

```
[BEFORE: Heavy Bottom Floating Stack (152px)]
+------------------------------------------+
| Header Bar (60px)                        |
+------------------------------------------+
| Squeezed Content Area (~450px)           |
|                                          |
|                                          |
+------------------------------------------+
| Mobile Navigation Bar (64px)             |
+------------------------------------------+
| Heavy Player Details Bar (88px)          |
+------------------------------------------+
```

#### Architectural Solution
1. Optimize mobile dimensions:
   - Streamline `--player-height-mobile: 60px`
   - Streamline `--mobile-nav-height: 52px`
   - Total mobile bottom height: `112px` (saving **40px** of vertical screen space).
2. Adjust `.content-scrollable` dynamic bottom scroll padding:
   ```css
   @media (max-width: 768px) {
     .content-scrollable {
       padding: 16px 14px calc(var(--player-height-mobile, 60px) + var(--mobile-nav-height, 52px) + env(safe-area-inset-bottom, 0px) + 24px) 14px;
       scroll-padding-bottom: calc(var(--player-height-mobile, 60px) + var(--mobile-nav-height, 52px) + env(safe-area-inset-bottom, 0px) + 24px);
     }
   }
   ```

```
[AFTER: Streamlined Ergonomic Layout (112px Bottom Height)]
+------------------------------------------+
| Header Bar (56px)                        |
+------------------------------------------+
| Expanded Content Area (~500px+)          |
| Full Breathing Room & Scroll Clearance   |
|                                          |
+------------------------------------------+
| Mobile Nav Bar (52px)                    |
+------------------------------------------+
| Compact Mini-Player (60px)               |
+------------------------------------------+
```

---

### 3.4. Mobile Mini-Player Ergonomics & Touch Controls

#### Usability Flaw
On viewports < 480px, attempting to render a 3-column desktop layout (artwork, title, full transport row, live badge, volume/EQ/visualizer/queue buttons) causes severe horizontal crowding, truncating titles and shrinking touch targets below accessible thresholds.

#### Architectural Solution
On mobile viewports (< 768px):
- **Left Column:** 40px rounded artwork + Station Name / Track Title + Subtitle. Clicking opens the slide-up Station Details / Now Playing sheet.
- **Right Column:** Thumb-friendly transport row:
  - `[Previous Station]` (38x38px touch target)
  - `(( Play/Pause ))` (44x44px primary accent circle)
  - `[Next Station]` (38x38px touch target)
  - `[★ Star]` favorite button (38x38px touch target)
- Secondary controls (EQ, Visualizer, Queue) are cleanly accessible through the slide-up Station Details sheet.

```
[AFTER: Mobile Mini-Player Layout (<768px)]
+-------------------------------------------------------------------+
| [Art 40px] Station Name           |  [Prev]  (( PLAY 44px )) [Next] [★] |
|            Genre • Country        |                                    |
+-------------------------------------------------------------------+
```

---

### 3.5. Dedicated "Now Playing" Radio Hero Banner & Card Touch Refinements

#### Usability Flaw
When streaming radio on mobile, finding the currently playing station among 34 cards across 10 sections requires extensive scrolling. Furthermore, hover-only play buttons are inaccessible on touch screens.

#### Architectural Solution
1. **Dedicated Now Playing Hero Banner:** When a radio station is active, Radio View renders a high-visibility, compact Now Playing banner at the top of the view:
   - Live pulsating cyan waveform beacon.
   - Station artwork, title, genre, country, and bitrate.
   - Large Play/Pause, Previous Station, Next Station, and Visualizer toggle triggers.
   - Quick trigger to open Station Details sheet.
2. **Mobile Card Grid & Permanent Touch Affordance:**
   - 2-column mobile grid (`minmax(140px, 1fr)` on mobile).
   - Clear, permanently visible Play/Pause touch indicator on cards with active playing glowing ring.
   - Independent Star button with 44px hit area to prevent accidental playback triggers when toggling favorites.

---

### 3.6. Slide-Up Mobile Station Details Bottom Sheet

#### Usability Flaw
Centered desktop modal dialogs are difficult to operate one-handed on mobile devices.

#### Architectural Solution
On mobile screens (`max-width: 768px`):
- Modal slides up smoothly from bottom (`transform: translateY(100%)` to `transform: translateY(0)`).
- Top rounded corners (`border-radius: 20px 20px 0 0`).
- Tactile top drag handle indicator.
- Large, thumb-friendly full-width action buttons: Website, Favorite, 10-Band EQ, Audio Visualizer, Copy Stream URL.

---

### 3.7. Accessibility & Red-Green Colorblind Compliance

LocalJam strictly adheres to double-encoding across all UI states:
- `[PASS]` / `[LIVE]` / `[AVAILABLE]`: Sky Blue (`#38bdf8`) / Cobalt Blue (`#0072B2`) paired with pulsing round dot `●` or checkmark.
- `[BUFFERING]` / `[CONNECTING]` / `[WARN]`: Amber (`#fbbf24`) paired with hourglass `⏳` or triangle `▲`.
- `[FAIL]` / `[OFFLINE]` / `[MISSING]`: Rose (`#f43f5e`) paired with distinct error circle `✖` or cross.
- Text contrast ratios >= 4.5:1 for standard text and >= 3:1 for graphical interface components.

---

## 4. Implementation Roadmap

- `[x]` **Task 1:** Author and commit this report (`RADIO_MOBILE_UX_REPORT.md`).
- `[x]` **Task 2:** Implement Radio Station Queue & Prev/Next Station Cycling in `src/player/audio-engine.js` and `src/radio/stations.js`.
- `[x]` **Task 3:** Implement Stream Connection & Buffering Lifecycle State Machine in `src/player/audio-engine.js`.
- `[x]` **Task 4:** Refactor Mobile Layout & Design Tokens in `src/ui/theme.css` and `src/ui/app.css` (compact mobile player bar `60px`, mobile nav `52px`, mobile bottom sheet styles).
- `[x]` **Task 5:** Refactor `src/ui/components/player-bar.js` with responsive mobile mini-player, stream buffering feedback, and radio previous/next station controls.
- `[x]` **Task 6:** Refactor `src/ui/views/radio-view.js` with Dedicated "Now Playing" Radio Hero, responsive search toolbar with clear action, responsive custom stream form, and touch-friendly 2-column mobile card grid.
- `[x]` **Task 7:** Refactor `src/ui/components/station-modal.js` with slide-up mobile bottom sheet styling and thumb-reachable action buttons.
- `[x]` **Task 8:** Add Crossfade duration getter/setter in `src/player/audio-engine.js` and refine responsive table columns in `src/ui/views/songs-view.js` and `src/ui/app.css`.
- `[x]` **Task 9:** Author automated unit and integration tests covering radio navigation, stream state tracking, mobile viewport responsiveness, and station modal interactions in `test/`.
- `[x]` **Task 10:** Independent subagent code review, documentation synchronization (`CHECKLIST.md`, `README.md`, `PROMPT.md`, `GEMINI.md`), atomic commits, and remote push.

---

*Report prepared and certified for atomic commit in LocalJam repository.*

