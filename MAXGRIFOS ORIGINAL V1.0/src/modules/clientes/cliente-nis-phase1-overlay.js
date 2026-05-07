const CLIENTES_NIS_STYLE_ID = 'clientes-nis-phase1-style';
const SWIPE_MIN_DISTANCE = 50;
const SWIPE_MAX_VERTICAL_RATIO = 0.7;

function ensureClientesNisStyle() {
  if (document.getElementById(CLIENTES_NIS_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CLIENTES_NIS_STYLE_ID;
  style.textContent = `
    .clientes-nis-screen {
      width: 100%;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
      touch-action: pan-y;
    }
    .clientes-nis-screen .list-container {
      width: 100%;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .clientes-nis-screen .cliente-card {
      touch-action: pan-y;
      -webkit-user-select: none;
      user-select: none;
    }
    .clientes-nis-screen .cliente-card.nis-swipe-target {
      border: 1px solid #cbd5e1;
    }
    .clientes-nis-screen .cliente-card.nis-swipe-target::after {
      content: 'Desliza <- para abrir cliente';
      display: block;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
    }
    .clientes-nis-screen button,
    .clientes-nis-screen .btn-action,
    .clientes-nis-screen .btn-primary,
    .clientes-nis-screen .btn-secondary,
    .clientes-nis-screen .sub-tab,
    .clientes-nis-screen input,
    .clientes-nis-screen select {
      min-height: 44px;
    }
    .clientes-nis-screen .card-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .clientes-nis-screen .detail-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
  `;

  document.head.appendChild(style);
}

function extractTouchPoint(touchEventList) {
  if (!touchEventList || touchEventList.length !== 1) return null;
  return touchEventList[0];
}

function isHorizontalSwipe(dx, dy) {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return false;
  const verticalRatio = Math.abs(dy) / Math.max(Math.abs(dx), 1);
  return verticalRatio <= SWIPE_MAX_VERTICAL_RATIO;
}

function isInteractiveTarget(node) {
  const element = node instanceof Element ? node : null;
  if (!element) return false;
  return Boolean(element.closest('button, input, select, textarea, a'));
}

export function applyClientesNisPhase1Overlay(container) {
  ensureClientesNisStyle();
  container.classList.add('clientes-nis-screen');
}

export function bindSwipeLeftOnList(element, onSwipeLeft) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const onTouchStart = (event) => {
    if (isInteractiveTarget(event.target)) {
      tracking = false;
      return;
    }
    const point = extractTouchPoint(event.touches);
    if (!point) {
      tracking = false;
      return;
    }
    startX = point.clientX;
    startY = point.clientY;
    tracking = true;
  };

  const onTouchEnd = (event) => {
    if (!tracking) return;
    tracking = false;

    const point = extractTouchPoint(event.changedTouches);
    if (!point) return;

    const dx = point.clientX - startX;
    const dy = point.clientY - startY;
    if (!isHorizontalSwipe(dx, dy)) return;
    if (dx < 0) {
      event.stopPropagation();
      onSwipeLeft();
    }
  };

  const onTouchCancel = () => {
    tracking = false;
  };

  element.addEventListener('touchstart', onTouchStart, { passive: true });
  element.addEventListener('touchend', onTouchEnd, { passive: true });
  element.addEventListener('touchcancel', onTouchCancel, { passive: true });

  return () => {
    element.removeEventListener('touchstart', onTouchStart);
    element.removeEventListener('touchend', onTouchEnd);
    element.removeEventListener('touchcancel', onTouchCancel);
  };
}

export function bindSwipeRightToBack(element, onBack) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const onTouchStart = (event) => {
    if (isInteractiveTarget(event.target)) {
      tracking = false;
      return;
    }
    const point = extractTouchPoint(event.touches);
    if (!point) {
      tracking = false;
      return;
    }
    startX = point.clientX;
    startY = point.clientY;
    tracking = true;
  };

  const onTouchEnd = (event) => {
    if (!tracking) return;
    tracking = false;

    const point = extractTouchPoint(event.changedTouches);
    if (!point) return;

    const dx = point.clientX - startX;
    const dy = point.clientY - startY;
    if (!isHorizontalSwipe(dx, dy)) return;
    if (dx > 0) {
      event.stopPropagation();
      onBack();
    }
  };

  const onTouchCancel = () => {
    tracking = false;
  };

  element.addEventListener('touchstart', onTouchStart, { passive: true });
  element.addEventListener('touchend', onTouchEnd, { passive: true });
  element.addEventListener('touchcancel', onTouchCancel, { passive: true });

  return () => {
    element.removeEventListener('touchstart', onTouchStart);
    element.removeEventListener('touchend', onTouchEnd);
    element.removeEventListener('touchcancel', onTouchCancel);
  };
}
