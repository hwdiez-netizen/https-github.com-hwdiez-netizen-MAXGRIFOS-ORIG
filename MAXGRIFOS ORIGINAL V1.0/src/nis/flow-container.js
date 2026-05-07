// NIS FlowContainer — Navigation & Interaction System core engine.
// Implements §NIS ERP-CONSTITUTION V1.3:
//   - Slide-based flow with horizontal swipe navigation
//   - Emits all 8 mandatory NIS events via domain event bus
//   - Persists flow state in sessionStorage for resume capability
//   - Never blocks vertical scroll; only intercepts horizontal swipe
//
// Slide definition: { step: string, label: string, mount: (container, api) => component|null }
//   - mount() must return a component with optional { unmount(), canUnmount() } or null.
//   - api provides: next(), prev(), save(), standby(), cancel()
import { SwipeController } from './swipe-controller.js';

const NIS_STYLES_ID = 'nis-global-styles';

function injectNisStyles() {
  if (document.getElementById(NIS_STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = NIS_STYLES_ID;
  style.textContent = `
    .nis-flow-wrapper {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      position: relative;
      background: var(--surface, #fff);
      border-radius: var(--radius, 8px);
      box-shadow: var(--shadow, 0 1px 3px rgba(0, 0, 0, 0.1));
    }
    .nis-progress-bar {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      padding: 10px 16px 6px;
      flex-shrink: 0;
      border-bottom: 1px solid var(--border, #e5e7eb);
    }
    .nis-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--border, #d1d5db);
      transition: background 0.25s, transform 0.25s;
      display: inline-block;
    }
    .nis-dot.active {
      background: var(--primary, #0D47D9);
      transform: scale(1.35);
    }
    .nis-dot.done {
      background: var(--success, #6ee7b7);
    }
    .nis-slide-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      padding-bottom: env(safe-area-inset-bottom);
    }
    .nis-slide-enter {
      animation: nisSlideIn 0.22s ease-out;
    }
    @keyframes nisSlideIn {
      from { opacity: 0; transform: translateX(24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .nis-slide-enter-back {
      animation: nisSlideInBack 0.22s ease-out;
    }
    @keyframes nisSlideInBack {
      from { opacity: 0; transform: translateX(-24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .nis-confirmation-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 24px;
      text-align: center;
      gap: 12px;
      min-height: 60vh;
    }
    .nis-confirmation-icon { font-size: 56px; }
    .nis-confirmation-sku {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 1px;
      color: var(--primary, #0D47D9);
      font-family: monospace;
    }
    .nis-confirmation-name {
      font-size: 15px;
      color: var(--text-secondary, #374151);
      max-width: 280px;
    }
    .nis-confirmation-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
      max-width: 280px;
      margin-top: 8px;
    }
  `;
  document.head.appendChild(style);
}

export class FlowContainer {
  constructor(mainContent, { module, slides, eventBus, Events }) {
    this._mainContent = mainContent;
    this._module = module;
    this._slides = slides;
    this._eventBus = eventBus;
    this._Events = Events;
    this._currentIndex = 0;
    this._direction = 'forward'; // used for animation class
    this._swipe = null;
    this._innerComponent = null;
    this._wrapper = null;
    this._slideEl = null;
    this._unsubs = [];
  }

  // ── Public lifecycle ────────────────────────────────────────────────────────

  mount(startIndex = 0) {
    injectNisStyles();
    this._currentIndex = startIndex;
    this._renderShell();
    this._setupSwipe();

    const resumed = startIndex > 0;
    if (resumed) {
      this._emit(this._Events.FLOW_RESUMED);
    } else {
      this._emit(this._Events.FLOW_OPENED);
    }
    this._mountSlide();
  }

  async canUnmount() {
    if (this._innerComponent?.canUnmount) {
      return this._innerComponent.canUnmount();
    }
    return true;
  }

  unmount() {
    this._standby(); // persist state before unmount
    this._teardownInner();
    this._swipe?.destroy();
    this._unsubs.forEach((u) => u());
    this._unsubs = [];
  }

  // ── Navigation API (exposed to slides) ─────────────────────────────────────

  next() {
    if (this._currentIndex >= this._slides.length - 1) return;
    const fromStep = this._slides[this._currentIndex]?.step ?? String(this._currentIndex);
    this._currentIndex++;
    this._direction = 'forward';
    this._emit(this._Events.SLIDE_SWIPED_NEXT, {
      step_from: fromStep,
      step_to: this._slides[this._currentIndex]?.step ?? String(this._currentIndex),
    });
    this._mountSlide();
  }

  prev() {
    if (this._currentIndex <= 0) return;
    const fromStep = this._slides[this._currentIndex]?.step ?? String(this._currentIndex);
    this._currentIndex--;
    this._direction = 'back';
    this._emit(this._Events.SLIDE_SWIPED_PREV, {
      step_from: fromStep,
      step_to: this._slides[this._currentIndex]?.step ?? String(this._currentIndex),
    });
    this._mountSlide();
  }

  // ── Internal render ─────────────────────────────────────────────────────────

  _renderShell() {
    this._mainContent.innerHTML = '';

    this._wrapper = document.createElement('div');
    this._wrapper.className = 'nis-flow-wrapper';
    this._wrapper.dataset.nisModule = this._module;

    const progressBar = document.createElement('div');
    progressBar.className = 'nis-progress-bar';
    progressBar.id = `nis-pb-${this._module}`;

    this._slideEl = document.createElement('div');
    this._slideEl.className = 'nis-slide-content';

    this._wrapper.appendChild(progressBar);
    this._wrapper.appendChild(this._slideEl);
    this._mainContent.appendChild(this._wrapper);

    this._updateProgress();
  }

  _updateProgress() {
    const bar = this._wrapper?.querySelector(`#nis-pb-${this._module}`);
    if (!bar) return;
    bar.innerHTML = this._slides.map((s, i) => {
      const cls = i === this._currentIndex ? 'nis-dot active'
        : i < this._currentIndex ? 'nis-dot done' : 'nis-dot';
      return `<span class="${cls}" title="${s.label ?? i + 1}" aria-label="${s.label ?? `Paso ${i + 1}`}"></span>`;
    }).join('');
  }

  _mountSlide() {
    this._teardownInner();
    this._slideEl.innerHTML = '';

    const slide = this._slides[this._currentIndex];
    if (!slide) return;

    const animClass = this._direction === 'back' ? 'nis-slide-enter-back' : 'nis-slide-enter';
    this._slideEl.classList.remove('nis-slide-enter', 'nis-slide-enter-back');
    // Trigger reflow so animation replays.
    void this._slideEl.offsetWidth; // eslint-disable-line no-void
    this._slideEl.classList.add(animClass);

    this._innerComponent = slide.mount(this._slideEl, this._makeApi()) ?? null;
    this._updateProgress();
    this._emit(this._Events.SLIDE_VIEWED);
    this._persistState();
  }

  _teardownInner() {
    try { this._innerComponent?.unmount?.(); } catch { /* noop */ }
    this._innerComponent = null;
  }

  _setupSwipe() {
    this._swipe = new SwipeController(this._mainContent, {
      onSwipeLeft: () => this.next(),
      onSwipeRight: () => this.prev(),
    });
  }

  // ── Slide API factory ────────────────────────────────────────────────────────

  _makeApi() {
    return {
      next: () => this.next(),
      prev: () => this.prev(),
      save: () => this._save(),
      standby: () => this._standby(),
      cancel: () => this._cancel(),
    };
  }

  _save() {
    this._emit(this._Events.FLOW_SAVED);
    this._clearState();
  }

  _standby() {
    this._emit(this._Events.FLOW_STANDBY);
    this._persistState();
  }

  _cancel() {
    this._emit(this._Events.FLOW_CANCELLED);
    this._clearState();
  }

  // ── Event emission ────────────────────────────────────────────────────────────

  _emit(type, extra = {}) {
    const slide = this._slides[this._currentIndex];
    this._eventBus.emit(type, {
      module: this._module,
      slide_index: this._currentIndex,
      step: slide?.step ?? String(this._currentIndex),
      total_slides: this._slides.length,
      sync_status: navigator.onLine ? 'online' : 'offline',
      ...extra,
    });
  }

  // ── State persistence (sessionStorage — offline-safe) ───────────────────────

  _persistState() {
    try {
      sessionStorage.setItem(`nis_flow_${this._module}`, JSON.stringify({
        slideIndex: this._currentIndex,
        timestamp: new Date().toISOString(),
      }));
    } catch { /* noop — storage quota or private browsing */ }
  }

  _clearState() {
    try { sessionStorage.removeItem(`nis_flow_${this._module}`); } catch { /* noop */ }
  }

  static resumeState(module) {
    try {
      const raw = sessionStorage.getItem(`nis_flow_${module}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}
