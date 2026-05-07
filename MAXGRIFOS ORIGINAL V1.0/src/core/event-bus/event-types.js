/**
 * Definición de tipos de eventos globales
 */

export const CORE_EVENTS = {
  APP_READY: 'core:app-ready',
  NAVIGATION_CHANGED: 'core:navigation-changed',
  UI_NOTICE: 'ui:notice',
  NIS_GESTURE: 'nis:gesture',
  SYNC_STATUS_CHANGED: 'sync:status-changed',
};

export const DOMAIN_EVENTS = {
  // Placeholders para futuros módulos
  PRODUCT_UPDATED: 'domain:product-updated',
  ORDER_PLACED: 'domain:order-placed',
  LEDGER_ENTRY_CREATED: 'domain:ledger-entry-created',
};
