/**
 * NIS Controller — Controlador global invisible
 * F5 Hardening:
 * - No usa back nativo del historial
 * - No ejecuta transacciones
 * - Solo emite navegación visual segura
 */

import { GestureEngine } from './gesture-engine.js';
import { processGuard } from './process-guard.js';
import { eventBus } from '../event-bus/event-bus.js';
import { CORE_EVENTS } from '../event-bus/event-types.js';

const STANDARD_BLOCK_MESSAGE = 'Finaliza, guarda o cancela el proceso antes de salir.';

export class NISController {
  constructor() {
    this.engine = null;
    this.initialized = false;
  }

  init(target = document.body) {
    if (this.initialized) {
      console.debug('[NIS] Already initialized. Skipping duplicate listeners.');
      return;
    }

    if (!target) {
      throw new Error('[NIS] target element is required');
    }

    this.engine = new GestureEngine(target, {
      threshold: 60,
      onSwipe: (payload) => this.handleSwipe(payload),
      onDoubleTap: (payload) => this.handleDoubleTap(payload)
    });

    this.initialized = true;
    console.debug('[NIS] Initialized 2.0 Hardening (Invisible)');
  }

  handleSwipe(payload) {
    const direction = typeof payload === 'string' ? payload : payload?.direction;

    if (!direction) return;

    if (!processGuard.canNavigate()) {
      this.emitBlocked(processGuard.blockNavigationMessage());
      return;
    }

    const gesturePayload = {
      gesture: 'swipe',
      direction,
      transactional: false,
      source: 'NIS_CONTROLLER'
    };

    this.emitGesture(gesturePayload);

    if (direction === 'right') {
      this.navigateBackVisual();
    }

    if (direction === 'left') {
      this.navigateForwardVisual();
    }
  }

  handleDoubleTap(payload) {
    const gesturePayload = {
      gesture: 'doubletap',
      direction: 'none',
      transactional: false,
      source: 'NIS_CONTROLLER',
      original: payload || null
    };

    this.emitGesture(gesturePayload);

    window.dispatchEvent(new CustomEvent('nis:doubletap', {
      detail: gesturePayload
    }));
  }

  navigateBackVisual() {
    const currentPath = window.location.hash.replace('#', '') || '/';

    if (currentPath && currentPath !== '/') {
      window.dispatchEvent(new CustomEvent('mg:navigate', {
        detail: {
          path: '/',
          source: 'NIS_SWIPE_RIGHT',
          transactional: false
        }
      }));
      return;
    }

    window.dispatchEvent(new CustomEvent('nis:home-boundary', {
      detail: {
        path: '/',
        source: 'NIS_SWIPE_RIGHT',
        transactional: false
      }
    }));
  }

  navigateForwardVisual() {
    window.dispatchEvent(new CustomEvent('nis:forward', {
      detail: {
        source: 'NIS_SWIPE_LEFT',
        transactional: false,
        action: 'NOOP_SAFE'
      }
    }));
  }

  emitGesture(payload) {
    eventBus.publish({
      type: CORE_EVENTS.NIS_GESTURE || 'NIS_GESTURE',
      payload
    });

    window.dispatchEvent(new CustomEvent('nis:gesture', {
      detail: payload
    }));
  }

  emitBlocked(message = STANDARD_BLOCK_MESSAGE) {
    const payload = {
      message,
      type: 'warning',
      source: 'PROCESS_GUARD',
      transactional: false
    };

    eventBus.publish({
      type: CORE_EVENTS.UI_NOTICE || 'UI_NOTICE',
      payload
    });

    window.dispatchEvent(new CustomEvent('nis:blocked', {
      detail: payload
    }));
  }

  destroy() {
    if (this.engine && typeof this.engine.destroy === 'function') {
      this.engine.destroy();
    }

    this.engine = null;
    this.initialized = false;
  }
}

export const nisController = new NISController();
export default nisController;
