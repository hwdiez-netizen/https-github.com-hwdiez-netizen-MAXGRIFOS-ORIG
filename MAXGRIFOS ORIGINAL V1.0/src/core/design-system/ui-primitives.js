/**
 * UI Primitives - Componentes base de UI para V2
 */

export const MG_STYLES = {
  CARD: 'mg-card',
  CARD_INTERACTIVE: 'mg-card mg-card-interactive',
  BTN: 'mg-btn',
  BTN_PRIMARY: 'mg-btn mg-btn-primary',
  BTN_SECONDARY: 'mg-btn mg-btn-secondary',
  BTN_NEON: 'mg-btn mg-btn-neon',
  BTN_DANGER: 'mg-btn mg-btn-danger',
  BTN_GHOST: 'mg-btn mg-btn-ghost',
  INPUT: 'mg-input',
  SELECT: 'mg-select',
  BADGE: 'mg-badge',
  BADGE_SUCCESS: 'mg-badge mg-badge-success',
  BADGE_WARNING: 'mg-badge mg-badge-warning',
  BADGE_DANGER: 'mg-badge mg-badge-danger',
  KPI_CARD: 'mg-kpi-card',
  EMPTY_STATE: 'mg-empty-state',
  LOADING_STATE: 'mg-loading-state',
  SYNC_INDICATOR: 'mg-sync-indicator',
};

export function createMGElement(tag, classes = '', content = '') {
  const el = document.createElement(tag);
  if (classes) el.className = classes;
  if (content) el.innerHTML = content;
  return el;
}

export function createMGButton(label, type = 'primary', onClick = null) {
  const btn = createMGElement('button', MG_STYLES[`BTN_${type.toUpperCase()}`] || MG_STYLES.BTN_PRIMARY, label);
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}
