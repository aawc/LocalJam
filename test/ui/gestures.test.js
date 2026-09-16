import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAP_MAX_PX,
  TAP_MAX_MS,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_MAX_PX,
  SWIPE_MIN_PX,
  SWIPE_MAX_MS,
  SWIPE_AXIS_RATIO,
  LONG_PRESS_MS,
  classifyPointerGesture,
  isLongPress,
  attachGestures
} from '../../src/ui/gestures.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mockTarget() {
  const listeners = {};
  const el = {
    addEventListener(event, handler) {
      listeners[event] = handler;
    },
    removeEventListener(event, handler) {
      if (listeners[event] === handler) delete listeners[event];
    },
    setPointerCapture() {},
    releasePointerCapture() {}
  };
  return { listeners, el };
}

describe('Gesture Recognition & Classification Engine', () => {
  it('exports verified threshold constants', () => {
    assert.equal(TAP_MAX_PX, 10);
    assert.equal(TAP_MAX_MS, 500);
    assert.equal(DOUBLE_TAP_MS, 300);
    assert.equal(DOUBLE_TAP_MAX_PX, 24);
    assert.equal(SWIPE_MIN_PX, 48);
    assert.equal(SWIPE_MAX_MS, 800);
    assert.equal(SWIPE_AXIS_RATIO, 1.5);
    assert.equal(LONG_PRESS_MS, 500);
  });

  it('classifies small, quick movements as tap with strict boundaries', () => {
    assert.equal(classifyPointerGesture({ dx: 3, dy: 2, dt: 120 }), 'tap');
    assert.equal(classifyPointerGesture({ dx: -5, dy: 4, dt: 450 }), 'tap');
    assert.equal(classifyPointerGesture({ dx: 0, dy: 0, dt: 50 }), 'tap');
    assert.equal(classifyPointerGesture({ dx: 9, dy: 0, dt: 499 }), 'tap');
    // Exclusive boundaries: >= 10px or >= 500ms are NOT taps
    assert.equal(classifyPointerGesture({ dx: 10, dy: 0, dt: 200 }), 'none');
    assert.equal(classifyPointerGesture({ dx: 0, dy: 10, dt: 200 }), 'none');
    assert.equal(classifyPointerGesture({ dx: 0, dy: 0, dt: 500 }), 'none');
  });

  it('classifies horizontal and vertical swipes meeting thresholds', () => {
    assert.equal(classifyPointerGesture({ dx: -60, dy: 10, dt: 200 }), 'swipe-left');
    assert.equal(classifyPointerGesture({ dx: 60, dy: 10, dt: 200 }), 'swipe-right');
    assert.equal(classifyPointerGesture({ dx: 5, dy: -80, dt: 300 }), 'swipe-up');
    assert.equal(classifyPointerGesture({ dx: 5, dy: 80, dt: 300 }), 'swipe-down');
  });

  it('rejects swipes that fail distance, ratio, or time thresholds', () => {
    // Below minimum distance (47px < 48px)
    assert.equal(classifyPointerGesture({ dx: 47, dy: 0, dt: 200 }), 'none');
    // Fails axis dominance ratio (60 / 50 = 1.2 < 1.5)
    assert.equal(classifyPointerGesture({ dx: 60, dy: 50, dt: 200 }), 'none');
    // Too slow (900ms > 800ms)
    assert.equal(classifyPointerGesture({ dx: 60, dy: 5, dt: 900 }), 'none');
    // Movement exceeds tap threshold but does not reach swipe distance
    assert.equal(classifyPointerGesture({ dx: 25, dy: 5, dt: 200 }), 'none');
  });

  it('correctly evaluates isLongPress condition with strict boundaries', () => {
    assert.equal(isLongPress({ dx: 2, dy: 2, dt: 600 }), true);
    assert.equal(isLongPress({ dx: 0, dy: 0, dt: 500 }), true);
    assert.equal(isLongPress({ dx: 9, dy: 0, dt: 500 }), true);
    // Boundary checks
    assert.equal(isLongPress({ dx: 10, dy: 0, dt: 600 }), false);
    assert.equal(isLongPress({ dx: 0, dy: 10, dt: 600 }), false);
    assert.equal(isLongPress({ dx: 2, dy: 2, dt: 499 }), false);
  });

  it('attachGestures safely handles null or missing elements', () => {
    const unbind = attachGestures(null, {});
    assert.equal(typeof unbind, 'function');
    assert.doesNotThrow(() => unbind());
  });

  it('fires onLongPress after threshold and suppresses onTap', async () => {
    const { listeners, el } = mockTarget();
    let longPressed = 0;
    let tapped = 0;

    attachGestures(el, {
      onTap: () => { tapped++; },
      onLongPress: () => { longPressed++; }
    });

    listeners.pointerdown({ clientX: 10, clientY: 10, pointerId: 1 });
    await delay(LONG_PRESS_MS + 40);
    listeners.pointerup({ clientX: 11, clientY: 11, pointerId: 1 });

    assert.equal(longPressed, 1);
    assert.equal(tapped, 0, 'long-press must short-circuit onTap');
  });

  it('cancels pending long-press once movement exceeds TAP_MAX_PX', async () => {
    const { listeners, el } = mockTarget();
    let longPressed = 0;

    attachGestures(el, {
      onLongPress: () => { longPressed++; }
    });

    listeners.pointerdown({ clientX: 10, clientY: 10, pointerId: 1 });
    listeners.pointermove({ clientX: 30, clientY: 10, pointerId: 1 }); // 20px > 10px
    await delay(LONG_PRESS_MS + 40);

    assert.equal(longPressed, 0, 'movement beyond TAP_MAX_PX must cancel long-press');
  });

  it('defers onTap and fires onDoubleTap for two taps within DOUBLE_TAP_MS', async () => {
    const { listeners, el } = mockTarget();
    let tapped = 0;
    let doubleTapped = 0;

    attachGestures(el, {
      onTap: () => { tapped++; },
      onDoubleTap: () => { doubleTapped++; }
    });

    // Tap 1
    listeners.pointerdown({ clientX: 100, clientY: 100, pointerId: 1 });
    listeners.pointerup({ clientX: 100, clientY: 100, pointerId: 1 });
    assert.equal(tapped, 0, 'first tap is deferred while onDoubleTap is registered');

    // Tap 2 within DOUBLE_TAP_MS and < DOUBLE_TAP_MAX_PX
    listeners.pointerdown({ clientX: 102, clientY: 101, pointerId: 1 });
    listeners.pointerup({ clientX: 102, clientY: 101, pointerId: 1 });
    await delay(DOUBLE_TAP_MS + 60);

    assert.equal(doubleTapped, 1);
    assert.equal(tapped, 0, 'double tap must suppress single tap');
  });

  it('emits single onTap when no second tap arrives within DOUBLE_TAP_MS', async () => {
    const { listeners, el } = mockTarget();
    let tapped = 0;

    attachGestures(el, {
      onTap: () => { tapped++; },
      onDoubleTap: () => {}
    });

    listeners.pointerdown({ clientX: 100, clientY: 100, pointerId: 1 });
    listeners.pointerup({ clientX: 100, clientY: 100, pointerId: 1 });

    await delay(DOUBLE_TAP_MS + 60);
    assert.equal(tapped, 1, 'deferred tap should fire after timeout');
  });

  it('unbind cancels pending long-press and deferred-tap timers', async () => {
    const { listeners: l1, el: el1 } = mockTarget();
    let longPressed = 0;
    const unbind1 = attachGestures(el1, {
      onLongPress: () => { longPressed++; }
    });
    l1.pointerdown({ clientX: 10, clientY: 10, pointerId: 1 });
    unbind1();

    const { listeners: l2, el: el2 } = mockTarget();
    let tapped = 0;
    const unbind2 = attachGestures(el2, {
      onTap: () => { tapped++; },
      onDoubleTap: () => {}
    });
    l2.pointerdown({ clientX: 50, clientY: 50, pointerId: 1 });
    l2.pointerup({ clientX: 50, clientY: 50, pointerId: 1 });
    unbind2();

    await delay(LONG_PRESS_MS + 60);
    assert.equal(longPressed, 0, 'unbind must clear pending long-press timer');
    assert.equal(tapped, 0, 'unbind must clear pending deferred-tap timer');
  });

  it('dispatches every swipe direction to its own handler', () => {
    const seen = [];
    const { listeners, el } = mockTarget();

    attachGestures(el, {
      onSwipeLeft: () => seen.push('left'),
      onSwipeRight: () => seen.push('right'),
      onSwipeUp: () => seen.push('up'),
      onSwipeDown: () => seen.push('down')
    });

    const swipe = (x1, y1, x2, y2) => {
      listeners.pointerdown({ clientX: x1, clientY: y1, pointerId: 1 });
      listeners.pointerup({ clientX: x2, clientY: y2, pointerId: 1 });
    };

    swipe(200, 100, 120, 105); // swipe-left: dx=-80, dy=5
    swipe(100, 100, 180, 105); // swipe-right: dx=80, dy=5
    swipe(100, 200, 105, 120); // swipe-up: dx=5, dy=-80
    swipe(100, 100, 105, 180); // swipe-down: dx=5, dy=80

    assert.deepEqual(seen, ['left', 'right', 'up', 'down']);
  });

  it('fires onTap synchronously when onDoubleTap is not bound and unbinds all listeners', () => {
    const { listeners, el } = mockTarget();
    let tapped = 0;
    const unbind = attachGestures(el, { onTap: () => { tapped++; } });

    assert.equal(Object.keys(listeners).length, 4, 'binds pointerdown/move/up/cancel');

    listeners.pointerdown({ clientX: 10, clientY: 10, pointerId: 1 });
    listeners.pointerup({ clientX: 11, clientY: 11, pointerId: 1 });
    assert.equal(tapped, 1, 'onTap fires immediately when no onDoubleTap is registered');

    unbind();
    assert.equal(Object.keys(listeners).length, 0, 'unbind removes every listener');
  });

  it('pointercancel aborts the gesture without firing handlers', async () => {
    const { listeners, el } = mockTarget();
    let longPressed = 0;
    let tapped = 0;

    attachGestures(el, {
      onTap: () => { tapped++; },
      onLongPress: () => { longPressed++; }
    });

    listeners.pointerdown({ clientX: 10, clientY: 10, pointerId: 1 });
    listeners.pointercancel({ clientX: 10, clientY: 10, pointerId: 1 });
    await delay(LONG_PRESS_MS + 40);

    assert.equal(longPressed, 0);
    assert.equal(tapped, 0);
  });
});
