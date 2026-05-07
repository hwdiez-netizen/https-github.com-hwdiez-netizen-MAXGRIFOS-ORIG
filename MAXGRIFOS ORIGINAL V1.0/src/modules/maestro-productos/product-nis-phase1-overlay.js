const PRODUCTS_NIS_STYLE_ID = 'products-nis-phase1-style';
const SWIPE_MIN_DISTANCE = 50;
const SWIPE_MAX_VERTICAL_RATIO = 0.7;

function ensureProductsNisStyle() {
  if (document.getElementById(PRODUCTS_NIS_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = PRODUCTS_NIS_STYLE_ID;
  style.textContent = `
    .products-nis-screen {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      touch-action: pan-y;
    }
    .products-nis-screen .list-container,
    .products-nis-screen .form-container {
      width: 100%;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .products-nis-screen .card-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .products-nis-screen .product-card {
      touch-action: pan-y;
      -webkit-user-select: none;
      user-select: none;
    }
    .products-nis-screen .product-card.nis-swipe-target {
      position: relative;
      border: 1px solid #cbd5e1;
    }
    .products-nis-screen .product-card.nis-swipe-target::after {
      content: 'Desliza <- para detalle';
      display: block;
      margin-top: 8px;
      font-size: 12px;
      color: #475569;
      font-weight: 600;
    }
    .products-nis-screen button,
    .products-nis-screen .btn-action,
    .products-nis-screen .btn-primary,
    .products-nis-screen .btn-secondary,
    .products-nis-screen .status-toggle,
    .products-nis-screen .sub-tab {
      min-height: 44px;
    }
    .products-nis-screen .status-toggle {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #d1d5db;
      width: 100%;
      box-sizing: border-box;
      justify-content: space-between;
    }
    .products-nis-screen .detail-actions {
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

export function applyProductsNisPhase1Overlay(container) {
  ensureProductsNisStyle();
  container.classList.add('products-nis-screen');
}

export function bindSwipeLeftToOpenDetail(cardElement, onOpenDetail) {
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
    if (dx < 0) onOpenDetail();
  };

  const onTouchCancel = () => {
    tracking = false;
  };

  cardElement.addEventListener('touchstart', onTouchStart, { passive: true });
  cardElement.addEventListener('touchend', onTouchEnd, { passive: true });
  cardElement.addEventListener('touchcancel', onTouchCancel, { passive: true });

  return () => {
    cardElement.removeEventListener('touchstart', onTouchStart);
    cardElement.removeEventListener('touchend', onTouchEnd);
    cardElement.removeEventListener('touchcancel', onTouchCancel);
  };
}

export function bindSwipeLeftOnCatalog(catalogElement, onOpenDetail) {
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
    if (dx < 0) onOpenDetail();
  };

  const onTouchCancel = () => {
    tracking = false;
  };

  catalogElement.addEventListener('touchstart', onTouchStart, { passive: true });
  catalogElement.addEventListener('touchend', onTouchEnd, { passive: true });
  catalogElement.addEventListener('touchcancel', onTouchCancel, { passive: true });

  return () => {
    catalogElement.removeEventListener('touchstart', onTouchStart);
    catalogElement.removeEventListener('touchend', onTouchEnd);
    catalogElement.removeEventListener('touchcancel', onTouchCancel);
  };
}

export function bindSwipeRightToBack(element, onBack) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const onTouchStart = (event) => {
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
    if (dx > 0) onBack();
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
