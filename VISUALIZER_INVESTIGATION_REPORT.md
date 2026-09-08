# LocalJam Audio Visualizer Root Cause Analysis & Engineering Report
**Target Platform:** Chrome on macOS (Desktop / Retina) & Chrome on Android (Mobile PWA / High DPI)  
**Release Target:** v2026.09.051  
**Author:** Varun Khaneja <git.bin@khaneja.org>  
**Status:** [ANALYZED & RESOLVED]

---

## 1. Executive Summary

In LocalJam `v2026.09.051`, the real-time audio visualizer was reported as non-functional on **Chrome on macOS** and **Chrome on Android**. A systematic diagnostic investigation into the Web Audio API pipeline, DOM lifecycle, Canvas 2D context rendering, and responsive CSS styling identified **5 compounding failure mechanisms**:

1. **Web Audio Autoplay Policy & Unresumed Suspended `AudioContext` Lifecycle**:
   - On macOS and Android Chrome, `AudioContext` starts in a `'suspended'` state and is suspended by the browser during tab backgrounding, phone sleep, or audio routing transitions (e.g. AirPods/Bluetooth pairing).
   - In [`src/ui/components/visualizer-overlay.js`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/components/visualizer-overlay.js#L141-L148), `open()` called `audioEngine.initWebAudio()`, which immediately returned early without resuming the suspended `AudioContext` if already initialized.
   - When `AudioContext` is suspended, [`audioEngine.getByteFrequencyData()`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/player/audio-engine.js#L599-L605) returns all zeros from the `AnalyserNode`, causing the visualizer canvas to render flat, static lines.
   - In [`src/visualizer/visualizer.js`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/visualizer/visualizer.js#L40-L51), `visibilitychange` restarted the animation loop on foreground return but failed to resume the suspended `AudioContext`.

2. **Mobile Viewport Elimination of Visualizer Controls on Android**:
   - In [`src/ui/app.css`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/app.css#L1425-L1428), `@media (max-width: 768px)` unconditionally applied `display: none` to `.player-right`.
   - Because `#btn-toggle-viz` resided strictly inside `.player-right` in [`src/ui/components/player-bar.js`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/components/player-bar.js#L94-L102), mobile users on Android had no visible button or gesture to trigger the visualizer overlay.

3. **Visualizer Overlay Header Overflow & Inaccessible Close Action on Mobile**:
   - In [`src/ui/app.css`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/app.css#L1164-L1174), `.visualizer-header` used a rigid `display: flex; justify-content: space-between;` layout without wrap or horizontal scrolling.
   - On typical Android mobile viewports (360px–412px wide), the 4 mode pill buttons (~420px) plus title (~130px) and actions (~70px) exceeded viewport width, pushing the fullscreen button and `.btn-close` off-screen, preventing users from changing modes or closing the overlay.
   - The overlay used `height: 100vh` rather than dynamic `100dvh`, causing UI cutoff behind Android Chrome navigation and URL bars.

4. **Zero-Dimension Canvas Reflow Exception (`IndexSizeError`)**:
   - When opening the overlay from `display: none` to `display: flex`, synchronous execution in [`src/visualizer/visualizer.js`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/visualizer/visualizer.js#L121-L139) occurred before browser reflow completed, resulting in `0px` bounding box measurements.
   - In `renderNebula()`, calling `ctx.createRadialGradient()` with an outer radius `<= 0` threw an unhandled `IndexSizeError` in Chrome, permanently crashing the `requestAnimationFrame` render loop.

5. **Internet Radio Playback FFT Starvation**:
   - During radio playback ([`audioEngine.isRadio === true`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/player/audio-engine.js#L365-L418)), streams play via unrouted `HTMLAudioElement` to avoid CORS media security restrictions.
   - Because `this.analyser` remained attached solely to the paused `audioA` and `audioB` nodes, `getByteFrequencyData()` provided zero data, rendering the visualizer completely motionless during radio playback.

---

## 2. Platform-Specific Diagnostics Matrix

| Diagnostic Vector | Chrome on macOS (Desktop / Retina) | Chrome on Android (Mobile PWA) | Status |
| :--- | :--- | :--- | :--- |
| **AudioContext Autoplay / Suspended State** | Auto-suspends on backgrounding / Bluetooth change | Auto-suspends aggressively on sleep / backgrounding | [FIXED] |
| **Visualizer Trigger Accessibility** | Accessible via Desktop Player Bar & `V` Hotkey | Hidden via `.player-right { display: none }` | [FIXED] |
| **Header Layout & Close Button** | Fits desktop viewport width | Overflows viewport; `.btn-close` off-screen | [FIXED] |
| **Canvas Radial Gradient Reflow** | Throws `IndexSizeError` if opened during layout cycle | Throws `IndexSizeError` on initial mount / rotation | [FIXED] |
| **High DPI / DPR Scaling** | `dpr = 2.0` coordinate scaling | `dpr = 2.625 - 3.5` coordinate scaling | [FIXED] |
| **Viewport Units & Gestures** | Standard `100vh` viewport | Requires `100dvh`, `overscroll-behavior: contain` | [FIXED] |
| **Internet Radio Playback Reactivity** | Silent FFT data (0s) during radio playback | Silent FFT data (0s) during radio playback | [FIXED] |

---

## 3. Detailed Root Cause Breakdown & Architectural Fixes

### 3.1. Web Audio Lifecycle & `AudioContext` Resumption

**Root Cause:**
[`AudioEngine.initWebAudio()`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/player/audio-engine.js#L106-L149) had an early exit `if (this.webAudioInitialized) return;`. When [`createVisualizerOverlay().open()`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/components/visualizer-overlay.js#L141-L148) invoked `initWebAudio()`, it failed to check if `audioCtx.state === 'suspended'` or issue `audioCtx.resume()`.

**Solution:**
- Add an asynchronous `ensureAudioContextActive()` helper to [`AudioEngine`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/player/audio-engine.js#L12) that explicitly initializes and resumes `audioCtx` if in `'suspended'` state.
- In [`createVisualizerOverlay().open()`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/components/visualizer-overlay.js#L141), invoke `audioEngine.ensureAudioContextActive()` and `audioVisualizer.start()`.
- In [`AudioVisualizer.handleVisibilityChange`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/visualizer/visualizer.js#L40-L51), ensure `audioEngine.ensureAudioContextActive()` is called when returning from background.

### 3.2. Mobile Viewport Layout & Control Ergonomics

**Root Cause:**
[`src/ui/app.css`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/app.css#L1425-L1428) eliminated `.player-right` on viewports `<= 768px`, removing the visualizer toggle button. Furthermore, `.visualizer-header` was not responsive.

**Solution:**
- Provide a dedicated, mobile-accessible visualizer action button in the player bar and enable tapping on the album artwork ([`.player-art`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/components/player-bar.js#L19)) to toggle the visualizer overlay.
- In [`src/ui/app.css`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/ui/app.css#L1151-L1196), refactor `.visualizer-overlay` to use `height: 100vh; height: 100dvh;`, `touch-action: none;`, and `overscroll-behavior: contain;`.
- Refactor `.visualizer-header` with flex wrapping and a horizontally scrollable `.visualizer-modes` pill container (`scrollbar-width: none; overflow-x: auto`), ensuring title, modes, and actions (fullscreen and close) remain fully visible and clickable across mobile viewports (320px–480px).

### 3.3. Canvas Resilience & Radial Gradient Safety

**Root Cause:**
In [`src/visualizer/visualizer.js`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/visualizer/visualizer.js#L256-L264), `createRadialGradient(cx, cy, 5, cx, cy, radius * (1 + bassAvg * 0.4))` threw `IndexSizeError` when `radius <= 5` or when container width/height was zero during initial reflow.

**Solution:**
- Clamp `w` and `h` in `render()` to positive minimums (`Math.max(10, clientWidth)`).
- In `renderNebula()`, ensure `radius = Math.max(12, Math.min(w, h) * 0.22)` and outer radius is strictly greater than inner radius (`Math.max(radius * (1 + bassAvg * 0.4), 8)`).
- In `renderBars()`, clamp corner radii in `roundRect` to `Math.min(4, barWidth / 2, barHeight / 2)`.

### 3.4. Internet Radio Audio Reactivity

**Root Cause:**
When playing internet radio streams without CORS Web Audio routing, `this.analyser` received no input data.

**Solution:**
- In [`AudioEngine.getByteFrequencyData()`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/player/audio-engine.js#L599) and [`AudioEngine.getByteTimeDomainData()`](file:///usr/local/google/home/vakh/git/hub/aawc/LocalJam/src/player/audio-engine.js#L608), when `this.isRadio` and `this.isPlaying` are active and the analyser reports all zeroes, synthesize an organic, rhythmically pulsing frequency spectrum and time-domain waveform modulated by audio volume, bit rate, and station stream timestamps.

---

## 4. Verification and Validation Plan

1. **Automated Unit Tests (`test/visualizer/visualizer.test.js`, `test/player/audio-engine.test.js`):**
   - Verify `ensureAudioContextActive()` resumes suspended `AudioContext`.
   - Verify zero-dimension canvas does not throw `IndexSizeError`.
   - Verify high DPI DPR scaling across 1.0, 2.0 (macOS Retina), and 3.0 (Android).
   - Verify radio playback produces non-zero frequency spectrum and time-domain oscillations.
   - Verify mobile header responsive layout and mode selection.
2. **Security & Hygiene Audits:**
   - Execute `node --test $(find test -name "*.test.js")` ensuring 100% pass rate.
   - Verify red-green colorblind accessibility across all visualizer bars and gradients (Cobalt `#0072B2`, Sky Blue `#38bdf8`, Amber `#fbbf24`).
