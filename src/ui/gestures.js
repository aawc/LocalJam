/**
 * LocalJam - Pointer Gesture Recognition & Binding Engine
 * Pure gesture classification (tap, double-tap, swipe, long-press) and
 * high-performance DOM Pointer Events binder with touch-action safety.
 */

export const TAP_MAX_PX = 10;
export const TAP_MAX_MS = 500;
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_MAX_PX = 24;
export const SWIPE_MIN_PX = 48;
export const SWIPE_MAX_MS = 800;
export const SWIPE_AXIS_RATIO = 1.5;
export const LONG_PRESS_MS = 500;

/**
 * Classifies pointer delta into a canonical gesture.
 * Strict boundaries per §5.1: tap movement < 10px, duration < 500ms.
 * @param {{ dx: number, dy: number, dt: number }} delta
 * @returns {'tap' | 'swipe-left' | 'swipe-right' | 'swipe-up' | 'swipe-down' | 'none'}
 */
export function classifyPointerGesture({ dx, dy, dt }) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  // 1. Check Tap criteria: movement strictly below TAP_MAX_PX and duration strictly below TAP_MAX_MS
  if (absX < TAP_MAX_PX && absY < TAP_MAX_PX && dt < TAP_MAX_MS) {
    return 'tap';
  }

  // 2. Check Swipe criteria: minimum distance, maximum duration, and axis dominance
  if (dt <= SWIPE_MAX_MS) {
    if (absX >= SWIPE_MIN_PX && absX >= absY * SWIPE_AXIS_RATIO) {
      return dx < 0 ? 'swipe-left' : 'swipe-right';
    }
    if (absY >= SWIPE_MIN_PX && absY >= absX * SWIPE_AXIS_RATIO) {
      return dy < 0 ? 'swipe-up' : 'swipe-down';
    }
  }

  return 'none';
}

/**
 * Checks if movement and elapsed duration qualify as a long-press.
 * Movement strictly below TAP_MAX_PX and duration >= LONG_PRESS_MS.
 * @param {{ dx: number, dy: number, dt: number }} delta
 * @returns {boolean}
 */
export function isLongPress({ dx, dy, dt }) {
  return (
    Math.abs(dx) < TAP_MAX_PX &&
    Math.abs(dy) < TAP_MAX_PX &&
    dt >= LONG_PRESS_MS
  );
}

/**
 * Binds pointer event handlers to an element. Returns an unbind cleanup function.
 * @param {HTMLElement|null} el - Target DOM element
 * @param {{
 *   onTap?: (e: PointerEvent) => void,
 *   onDoubleTap?: (e: PointerEvent) => void,
 *   onSwipeLeft?: (e: PointerEvent) => void,
 *   onSwipeRight?: (e: PointerEvent) => void,
 *   onSwipeUp?: (e: PointerEvent) => void,
 *   onSwipeDown?: (e: PointerEvent) => void,
 *   onLongPress?: (e: PointerEvent) => void
 * }} handlers
 * @returns {() => void} Unbind cleanup function
 */
export function attachGestures(el, handlers = {}) {
  if (!el || typeof el.addEventListener !== 'function') {
    return () => {};
  }

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let activePointerId = null;
  let pointerCaptured = false;
  let longPressTimer = null;
  let longPressTriggered = false;
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let singleTapTimer = null;

  const onPointerDown = (e) => {
    // Only track primary pointer
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    startX = e.clientX || 0;
    startY = e.clientY || 0;
    startTime = Date.now();
    longPressTriggered = false;
    pointerCaptured = false;

    if (typeof handlers.onLongPress === 'function') {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        handlers.onLongPress(e);
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e) => {
    if (e.pointerId !== activePointerId) return;
    const dx = (e.clientX || 0) - startX;
    const dy = (e.clientY || 0) - startY;

    // If movement reaches or exceeds tap threshold, cancel long-press and engage pointer capture for swipe tracking
    if (Math.abs(dx) >= TAP_MAX_PX || Math.abs(dy) >= TAP_MAX_PX) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (!pointerCaptured && typeof el.setPointerCapture === 'function' && e.pointerId !== undefined) {
        try {
          el.setPointerCapture(e.pointerId);
          pointerCaptured = true;
        } catch (err) {
          if (err?.name !== 'NotFoundError' && err?.name !== 'InvalidStateError') {
            console.warn(`[Gestures] setPointerCapture failed (${err?.name}): ${err?.message}`);
          }
        }
      }
    }
  };

  const onPointerUp = (e) => {
    if (e.pointerId !== activePointerId) return;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (pointerCaptured && typeof el.releasePointerCapture === 'function' && e.pointerId !== undefined) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (err) {
        if (err?.name !== 'NotFoundError' && err?.name !== 'InvalidStateError') {
          console.warn(`[Gestures] releasePointerCapture failed (${err?.name}): ${err?.message}`);
        }
      }
    }
    pointerCaptured = false;

    activePointerId = null;

    if (longPressTriggered) {
      return;
    }

    const dx = (e.clientX || 0) - startX;
    const dy = (e.clientY || 0) - startY;
    const dt = Date.now() - startTime;

    const gesture = classifyPointerGesture({ dx, dy, dt });

    if (gesture === 'tap') {
      const now = Date.now();
      const distFromLastTap = Math.hypot((e.clientX || 0) - lastTapX, (e.clientY || 0) - lastTapY);

      if (
        typeof handlers.onDoubleTap === 'function' &&
        now - lastTapTime <= DOUBLE_TAP_MS &&
        distFromLastTap < DOUBLE_TAP_MAX_PX
      ) {
        if (singleTapTimer) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
        }
        lastTapTime = 0;
        handlers.onDoubleTap(e);
      } else {
        lastTapTime = now;
        lastTapX = e.clientX || 0;
        lastTapY = e.clientY || 0;

        if (typeof handlers.onDoubleTap === 'function') {
          singleTapTimer = setTimeout(() => {
            singleTapTimer = null;
            if (typeof handlers.onTap === 'function') {
              handlers.onTap(e);
            }
          }, DOUBLE_TAP_MS);
        } else if (typeof handlers.onTap === 'function') {
          handlers.onTap(e);
        }
      }
    } else if (gesture === 'swipe-left' && typeof handlers.onSwipeLeft === 'function') {
      handlers.onSwipeLeft(e);
    } else if (gesture === 'swipe-right' && typeof handlers.onSwipeRight === 'function') {
      handlers.onSwipeRight(e);
    } else if (gesture === 'swipe-up' && typeof handlers.onSwipeUp === 'function') {
      handlers.onSwipeUp(e);
    } else if (gesture === 'swipe-down' && typeof handlers.onSwipeDown === 'function') {
      handlers.onSwipeDown(e);
    }
  };

  const onPointerCancel = (e) => {
    if (e.pointerId !== activePointerId) return;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (pointerCaptured && typeof el.releasePointerCapture === 'function' && e.pointerId !== undefined) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (err) {
        if (err?.name !== 'NotFoundError' && err?.name !== 'InvalidStateError') {
          console.warn(`[Gestures] releasePointerCapture failed (${err?.name}): ${err?.message}`);
        }
      }
    }
    pointerCaptured = false;
    activePointerId = null;
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerCancel);

  return () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (singleTapTimer) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
    }
    activePointerId = null;
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerCancel);
  };
}
