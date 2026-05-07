// NIS SwipeController — detects horizontal swipe gestures on a DOM element.
// Horizontal swipe with insufficient vertical deviation triggers onSwipeLeft / onSwipeRight.
// Vertical scroll is never intercepted (complies with §NIS rule: vertical = exploración).
export class SwipeController {
  constructor(element, { onSwipeLeft, onSwipeRight, minDistance = 50, maxVerticalRatio = 0.7 } = {}) {
    this._el = element;
    this._onSwipeLeft = onSwipeLeft;
    this._onSwipeRight = onSwipeRight;
    this._minDistance = minDistance;
    this._maxVerticalRatio = maxVerticalRatio;
    this._startX = 0;
    this._startY = 0;
    this._tracking = false;

    this._handleTouchStart = this._onTouchStart.bind(this);
    this._handleTouchEnd = this._onTouchEnd.bind(this);
    this._handleTouchCancel = this._onTouchCancel.bind(this);

    element.addEventListener('touchstart', this._handleTouchStart, { passive: true });
    element.addEventListener('touchend', this._handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', this._handleTouchCancel, { passive: true });
  }

  _onTouchStart(e) {
    if (e.touches.length !== 1) { this._tracking = false; return; }
    this._startX = e.touches[0].clientX;
    this._startY = e.touches[0].clientY;
    this._tracking = true;
  }

  _onTouchEnd(e) {
    if (!this._tracking) return;
    this._tracking = false;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - this._startX;
    const dy = touch.clientY - this._startY;

    if (Math.abs(dx) < this._minDistance) return;
    // Reject if vertical component is dominant (the gesture is a scroll, not a swipe).
    if (Math.abs(dy) / Math.abs(dx) > this._maxVerticalRatio) return;

    if (dx < 0) this._onSwipeLeft?.();
    else this._onSwipeRight?.();
  }

  _onTouchCancel() {
    this._tracking = false;
  }

  destroy() {
    this._el.removeEventListener('touchstart', this._handleTouchStart);
    this._el.removeEventListener('touchend', this._handleTouchEnd);
    this._el.removeEventListener('touchcancel', this._handleTouchCancel);
  }
}
