// maxgrifos-flags.js — archivo externo servido por 'self'
// CSP: script-src 'self' — no requiere 'unsafe-inline'
// Debe cargarse ANTES de kardex-vnext-overlay.js y del bundle principal
window.__MAXGRIFOS_FLAGS__ = Object.freeze({
  build_id: 'dev',
  kardex_vnext_enabled: false,
  kardex_vnext_shadow_mode: true,
  kardex_vnext_cutover_stage: 'off',
  kardex_vnext_canary_percent: 0,
  kardex_vnext_live_event_types: [
    'FacturaEmitida',
    'RemisionEmitida',
    'GarantiaReconocida',
    'CompraRecepcionada',
    'DevolucionClienteRecibida',
    'NotaCreditoProveedorEmitida',
  ],
  kardex_vnext_legacy_writer_active: true,
  kardex_domain_listeners_enabled: true,
  event_store_enabled: true,
  outbox_reconciler_enabled: true,
  offline_state_black_enabled: true,
  audit_helpers_enabled: true,
});
