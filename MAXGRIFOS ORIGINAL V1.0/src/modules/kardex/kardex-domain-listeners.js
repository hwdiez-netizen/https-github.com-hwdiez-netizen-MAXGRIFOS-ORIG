/**
 * OVERLAY — kardex-domain-listeners.js
 * Constitución V1.3 §4: Descarga de stock vía eventos de dominio,
 * desacoplada de app.js (infraestructura).
 *
 * Activado por: window.__MAXGRIFOS_FLAGS__.kardex_domain_listeners_enabled = true
 * Cuando activo, el listener legacy en app.js es bloqueado por feature flag.
 * Idempotencia garantizada a nivel IDB (unique index v13 en idempotency_key).
 *
 * EXCEPCIÓN §1.1: overlay puro — NO modifica kardex-store.js ni pedido-store.js.
 */
import { eventBus, Events } from '../../events/domain-events.js';
import { liberarStockPorDocumento } from './kardex-store.js';

function _snapshotDocumentoToItems(documento) {
  const snapshot = Array.isArray(documento?.items_snapshot) ? documento.items_snapshot : [];
  return snapshot
    .map((item) => ({
      id: item.item_id ?? null,
      product_id: item.product_id,
      product_sku: item.product_sku,
      product_name: item.product_name,
      cantidad_picking: Number(item.cantidad ?? 0),
      precio_unitario: Number(item.precio_unitario ?? 0),
      status: 'active',
    }))
    .filter((item) => item.product_id && Number(item.cantidad_picking ?? 0) > 0);
}

export function initKardexDomainListeners() {
  const flags = window.__MAXGRIFOS_FLAGS__ ?? {};
  if (!flags.kardex_domain_listeners_enabled) return;

  eventBus.on(Events.FACTURA_EMITIDA, ({ payload }) => {
    const { pedido, documento } = payload;
    if (!pedido?.id) return;
    const items = _snapshotDocumentoToItems(documento);
    if (items.length === 0) {
      console.warn('[KardexListeners] Snapshot documental vacio en FACTURA_EMITIDA', {
        pedido_id: pedido.id,
        documento_id: documento?.id ?? null,
      });
      return;
    }
    liberarStockPorDocumento({
      pedido_id: pedido.id,
      items,
      documento_tipo: documento?.tipo ?? 'FAC',
    }).catch((err) => console.warn('[KardexListeners] Descarga FAC:', err?.message ?? err));
  });

  eventBus.on(Events.REMISION_EMITIDA, ({ payload }) => {
    const { pedido, documento } = payload;
    if (!pedido?.id) return;
    const items = _snapshotDocumentoToItems(documento);
    if (items.length === 0) {
      console.warn('[KardexListeners] Snapshot documental vacio en REMISION_EMITIDA', {
        pedido_id: pedido.id,
        documento_id: documento?.id ?? null,
      });
      return;
    }
    liberarStockPorDocumento({
      pedido_id: pedido.id,
      items,
      documento_tipo: documento?.tipo ?? 'REM',
    }).catch((err) => console.warn('[KardexListeners] Descarga REM:', err?.message ?? err));
  });

  console.info('[KardexListeners] Auto-listeners FacturaEmitida/RemisionEmitida activos (overlay v13).');
}
