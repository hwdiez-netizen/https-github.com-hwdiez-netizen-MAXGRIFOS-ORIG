/**
 * Gesture Engine — NIS 2.0 Hardening
 * Detecta gestos móviles sin ejecutar transacciones.
 * Emite únicamente intenciones visuales seguras.
 */

export class GestureEngine {
  constructor(element, options = {}) {
    if (!element) {
      throw new Error('[GestureEngine] element is required');
    }

    this.element = element;
    this.threshold = Math.max(Number(options.threshold || 60), 50);
    this.verticalTolerance = Number(options.verticalTolerance || 12);
    this.doubleTapDelay = Number(options.doubleTapDelay || 280);

    this.onSwipe = typeof options.onSwipe === 'function' ? options.onSwipe : () => {};
    this.onDoubleTap = typeof options.onDoubleTap === 'function' ? options.onDoubleTap : () => {};

    this.startX = 0;
    this.startY = 0;
    this.lastTapAt = 0;
    this.verticalDominant = false;
    this.destroyed = false;

    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);

    this.init();
  }

  init() {
    this.element.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.element.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    this.element.addEventListener('touchend', this.handleTouchEnd, { passive: true });
  }

  handleTouchStart(event) {
    if (this.destroyed || !event.touches || event.touches.length === 0) return;

    const touch = event.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.verticalDominant = false;
  }

  handleTouchMove(event) {
    if (this.destroyed || !event.touches || event.touches.length === 0) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - this.startX;
    const deltaY = touch.clientY - this.startY;

    if (Math.abs(deltaY) > Math.abs(deltaX) + this.verticalTolerance) {
      this.verticalDominant = true;
    }
  }

  handleTouchEnd(event) {
    if (this.destroyed || !event.changedTouches || event.changedTouches.length === 0) return;

    const touch = event.changedTouches[0];
    const endX = touch.clientX;
    const endY = touch.clientY;

    const deltaX = endX - this.startX;
    const deltaY = endY - this.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    const now = Date.now();
    const isTap = absX < 10 && absY < 10;

    if (isTap) {
      if (now - this.lastTapAt <= this.doubleTapDelay) {
        this.lastTapAt = 0;
        this.onDoubleTap({
          gesture: 'doubletap',
          direction: 'none',
          deltaX,
          deltaY,
          source: 'NIS_GESTURE_ENGINE'
        });
        return;
      }

      this.lastTapAt = now;
      return;
    }

    if (this.verticalDominant || absY > absX) {
      return;
    }

    if (absX >= this.threshold) {
      const direction = deltaX > 0 ? 'right' : 'left';

      this.onSwipe({
        gesture: 'swipe',
        direction,
        deltaX,
        deltaY,
        source: 'NIS_GESTURE_ENGINE'
      });
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.element.removeEventListener('touchstart', this.handleTouchStart);
    this.element.removeEventListener('touchmove', this.handleTouchMove);
    this.element.removeEventListener('touchend', this.handleTouchEnd);

    this.destroyed = true;
  }
}

export default GestureEngine;