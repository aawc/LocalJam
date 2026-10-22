# LocalJam Audio Lifecycle & Duration Diagnostics Engineering Report
**Target Platform:** Chrome on Android 10+ (Mobile PWA / Standalone) & Chromium Desktop  
**Release Target:** v2026.10.142  
**Author:** Varun Khaneja <git.bin@khaneja.org>  
**Status:** [ANALYZED & RESOLVED]  

---

## 1. Executive Summary

Based on the diagnostic telemetry captured in `v2026.10.141` (`Linux armv81`, Chrome 158 PWA standalone mode), two critical playback anomalies were investigated:
1. **"Song duration shows as infinity"** during local track playback (reproduced on MP4/M4A/WebM media containers loaded via File System Access API / Blob URLs).
2. **"Music stops playing if I lock screen or minimize app"** on Android Chrome PWA.

A rigorous audit of the Web Audio graph, HTMLMediaElement lifecycle, Media Session API integration, and metadata reconciliation revealed four compounding defect mechanisms:
- **Non-Finite Duration Propagation:** When Chromium streams or decodes media from Blob URLs without fixed duration headers, `HTMLMediaElement.duration` evaluates to `Infinity`. In [`src/player/audio-engine.js`](./src/player/audio-engine.js#L403-L407), `get duration()` returned `(audio && audio.duration) || ...`, propagating `Infinity` directly to callers.
- **Duration Formatter Explosion:** In [`src/ui/browse-model.js`](./src/ui/browse-model.js#L27-L32), `formatDuration(seconds)` guarded only with `if (!seconds || isNaN(seconds) || seconds < 0) return '0:00'`. Because `Infinity` is truthy, not `NaN`, and not `< 0`, `Math.floor(Infinity / 60)` returned `Infinity` and `Infinity % 60` returned `NaN`, producing literal `"Infinity:NaN"` strings in [`src/ui/stage.js`](./src/ui/stage.js#L798-L799) and setting `seekSlider.max = "Infinity"`.
- **Media Session Position State Exception:** In [`src/player/audio-engine.js`](./src/player/audio-engine.js#L1057-L1071), `syncMediaSessionPosition()` passed `audio.duration` directly to `navigator.mediaSession.setPositionState()`. Under W3C specifications, `setPositionState` throws an unhandled `TypeError` when passed non-finite numbers. This crashed position synchronization on every `timeupdate` tick.
- **Missing `playbackState` & AudioContext Background Suspension:** LocalJam never set `navigator.mediaSession.playbackState` (`'playing' | 'paused' | 'none'`) anywhere in the application, and omitted the `stop` action handler. On Android Chrome, the operating system media framework requires an active `MediaSession` with `playbackState = 'playing'` to maintain audio focus and keep the background foreground service alive. When the screen turned off or the app was minimized, Android OS dropped audio focus and suspended the tab's renderer process. Furthermore, the Web Audio graph's `AudioContext` was left suspended without automated recovery listeners.

---

## 2. Telemetry Analysis

From the diagnostic snapshot:
- **PWA Display Mode:** `standalone` (Android 10 armv81)
- **Audio Engine:** `Local — Playing (AudioContext: running)`
- **Current Track:** `durationSec: 0`, `format: "unknown"` (`Billboard hot 100 this week - Best pop music playlist on spotify 2023 mp4`)
- **IndexedDB Reconciler Anomaly:** In [`src/storage/reconciler.js`](./src/storage/reconciler.js#L289-L312), `newTrack` construction omitted `format: meta.format || fallback.format`, causing all library tracks to store `undefined` and report `format: "unknown"`.

---

## 3. Detailed Technical Root Causes & Remediation

### 3.1. Issue 1: Song Duration Showing as Infinity

#### Failure Mechanism
1. Chromium's media pipeline treats local Blob URLs (`blob:https://...`) without moov duration metadata as potentially live or unbounded streams, returning `audio.duration === Infinity`.
2. `AudioEngine.duration` getter executed:
   ```javascript
   // [ORIGINAL - VULNERABLE]
   get duration() {
     if (this.isRadio) return 0;
     const audio = this.getActiveAudio();
     return (audio && audio.duration) || (this.currentTrack?.duration) || this._savedDuration || 0;
   }
   ```
   Because `Infinity` is truthy, the getter immediately returned `Infinity` rather than falling back to known metadata or finite numbers.
3. In [`src/ui/stage.js`](./src/ui/stage.js#L255), transport logic used `const dur = audioEngine.duration || Infinity;`, and scrubber logic computed `remainingTimeEl.textContent = '-' + formatDuration(Math.max(0, (duration || 0) - currentTime));`.
4. `formatDuration(Infinity)` calculated:
   - `mins = Math.floor(Infinity / 60)` &rarr; `Infinity`
   - `secs = Math.floor(Infinity % 60)` &rarr; `NaN`
   - Output string: `"Infinity:NaN"` displayed to user.

#### Architectural Remediation
1. **Finite Duration Guarding in Engine:** In [`src/player/audio-engine.js`](./src/player/audio-engine.js), enforce strict `Number.isFinite()` validation in `get duration()`, `set duration()`, and `seek()`:
   ```javascript
   // [MODIFIED - RESILIENT]
   get duration() {
     if (this.isRadio) return 0;
     const audio = this.getActiveAudio();
     const audioDur = (audio && Number.isFinite(audio.duration) && audio.duration > 0) ? audio.duration : null;
     const trackDur = (this.currentTrack && Number.isFinite(this.currentTrack.duration) && this.currentTrack.duration > 0) ? this.currentTrack.duration : null;
     const savedDur = (Number.isFinite(this._savedDuration) && this._savedDuration > 0) ? this._savedDuration : null;
     return audioDur || trackDur || savedDur || 0;
   }
   ```
2. **Chromium Blob URL Duration Resolution:** Listen for `loadedmetadata` and `durationchange`. When `audio.duration === Infinity`, attach a one-time `timeupdate` listener and temporarily set `audio.currentTime = 1e101`. Chromium immediately decodes to the end of the blob, establishes the finite duration, fires `durationchange`, and the listener restores `currentTime` to the original position.
3. **Track Metadata Duration Backfill:** Once finite duration is obtained from the audio element, update `this.currentTrack.duration` and persist to IndexedDB via `db.putTrack()`.
4. **Formatter Robustness:** In [`src/ui/browse-model.js`](./src/ui/browse-model.js#L27-L32), replace `isNaN(seconds)` with `!Number.isFinite(seconds)`:
   ```javascript
   // [MODIFIED - RESILIENT]
   export function formatDuration(seconds = 0) {
     if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '0:00';
     const mins = Math.floor(seconds / 60);
     const secs = Math.floor(seconds % 60);
     return `${mins}:${secs.toString().padStart(2, '0')}`;
   }
   ```
5. **Stage Scrubber Sanitization:** In [`src/ui/stage.js`](./src/ui/stage.js#L796-L800), sanitize `safeDuration`:
   - `seekSlider.max = String(Math.max(1, safeDuration || 100));`
   - If `safeDuration <= 0`, display `'--:--'` for remaining time rather than negative or erroneous values.

---

### 3.2. Issue 2: Music Stopping on Screen Lock or App Minimization

#### Failure Mechanism
1. **Absence of `playbackState` Declaration:**
   The Media Session API specification requires web applications to declare `navigator.mediaSession.playbackState` (`'none'`, `'paused'`, or `'playing'`). LocalJam never updated this property.
   On Android, Chrome uses `mediaSession.playbackState` to update the native Android `MediaSession` and maintain audio focus. Without `'playing'`, Android OS treats the PWA as background-idle when the screen turns off or app switches, revoking audio focus and suspending the browser process.
2. **Crashing `setPositionState` Calls:**
   On every `timeupdate` tick, `syncMediaSessionPosition()` called `navigator.mediaSession.setPositionState({ duration: audio.duration, ... })`. When `audio.duration` was `Infinity`, the browser threw `TypeError: Failed to execute 'setPositionState' on 'MediaSession': The provided double value is non-finite.`. This prevented Android lockscreen controls from syncing.
3. **Missing `stop` Action Handler:**
   Android media services dispatch `stop` commands during system audio routing changes and Bluetooth disconnection. Without a registered `stop` handler, media controls could not manage complete session teardown.
4. **Web Audio Graph Suspension on Visibility Change:**
   Android Chrome suspends `AudioContext` instances during background state changes. Because `audioA` and `audioB` are routed into `createMediaElementSource()`, suspending `AudioContext` completely mutes output at the destination node. The engine lacked listeners on `audioCtx.onstatechange` or `document.visibilitychange` to maintain active audio context state.

#### Architectural Remediation
1. **Centralized MediaSession Playback State Management:**
   Add `setMediaSessionPlaybackState(state)` to [`src/player/audio-engine.js`](./src/player/audio-engine.js) and synchronize it across all state transitions:
   - On `play()`, `playTrack()`, `playRadio()`, and audio element `'playing'` event: `'playing'`.
   - On `pause()` and user-initiated pause events: `'paused'`.
   - On `stop()`, error, or idle stream state: `'none'`.
2. **Safe `setPositionState`:**
   In `syncMediaSessionPosition()`, validate that both `duration` and `currentTime` are strictly finite and `duration > 0` before calling `setPositionState()`.
3. **Register `stop` Action Handler:**
   In `initMediaSession()`, register `navigator.mediaSession.setActionHandler('stop', () => this.stop());`.
4. **Background Interruption & Visibility Recovery:**
   - Listen to `statechange` on `this.audioCtx`: If `this.isPlaying` is true and `this.audioCtx.state === 'suspended'`, immediately trigger `this.audioCtx.resume()`.
   - Add a `visibilitychange` listener in `AudioEngine`: When `document.hidden` toggles, verify that `navigator.mediaSession.playbackState === 'playing'`, invoke `ensureAudioContextActive()`, and verify that the active audio element remains in playing state.
   - In the audio element `'pause'` event handler: Distinguish user-initiated pause (`this.isPlaying === false`) from external background suspension (`document.hidden && this.isPlaying === true`). If paused externally by browser throttling while playing, immediately invoke `audio.play()` to sustain background playback.

---

## 4. Verification & Regression Matrix

| Test Suite / Assertion | Verification Command | Pre-Fix Behavior | Post-Fix Behavior | Status |
| :--- | :--- | :--- | :--- | :--- |
| `formatDuration(Infinity)` | `node test/ui/browse-model.test.js` | `"Infinity:NaN"` | `"0:00"` | `[PASS]` |
| `formatDuration(NaN)` | `node test/ui/browse-model.test.js` | `"0:00"` | `"0:00"` | `[PASS]` |
| `AudioEngine.duration` non-finite clamp | `node test/player/audio-engine.test.js` | Returned `Infinity` | Returns finite fallback or `0` | `[PASS]` |
| `setPositionState` non-finite guard | `node test/player/audio-engine.test.js` | Threw `TypeError` | Safe finite pass-through | `[PASS]` |
| `mediaSession.playbackState` lifecycle | `node test/player/audio-engine.test.js` | Never set (`undefined`) | Sets `'playing'`, `'paused'`, `'none'` | `[PASS]` |
| `mediaSession` `stop` handler | `node test/player/audio-engine.test.js` | Missing | Registered and calls `stop()` | `[PASS]` |
| Track `format` preservation in reconciler | `node test/storage/reconciler.test.js` | Dropped (`undefined`) | Persists `meta.format` | `[PASS]` |
| Full regression test suite | `node test/<suite>.test.js` | 52 test suites pass | 52 test suites pass | `[PASS]` |

---

## 5. Summary of Modified Components

1. [`docs/reports/AUDIO_LIFECYCLE_DIAGNOSTIC_REPORT.md`](./docs/reports/AUDIO_LIFECYCLE_DIAGNOSTIC_REPORT.md): Diagnostic investigation and architectural analysis.
2. [`src/ui/browse-model.js`](./src/ui/browse-model.js): Robust non-finite guard in `formatDuration`.
3. [`src/player/audio-engine.js`](./src/player/audio-engine.js): Finite duration getter/setter/seek, Chromium Infinity duration resolution, MediaSession `playbackState`, `stop` handler, safe `setPositionState`, and background visibility recovery.
4. [`src/ui/stage.js`](./src/ui/stage.js): Scrubber and timeline duration formatting sanitization.
5. [`src/storage/reconciler.js`](./src/storage/reconciler.js): Preservation of `format` field during track reconciliation.
6. [`test/ui/browse-model.test.js`](./test/ui/browse-model.test.js): Comprehensive duration formatting tests.
7. [`test/player/audio-engine.test.js`](./test/player/audio-engine.test.js): Duration sanitization, MediaSession lifecycle, and background recovery unit tests.
8. [`test/helpers/mock-dom.js`](./test/helpers/mock-dom.js): Mock `navigator.mediaSession` support for headless tests.
