// Reacts to ProductCreated domain event and registers the initial stock movement in Kardex.
// This keeps Producto module decoupled from Kardex (P8 — event-driven, no direct calls).
import { eventBus, Events } from '../../events/domain-events.js';
import { createMovimiento } from '../kardex/kardex-store.js';
import { BODEGA_CENTRAL_ID } from '../kardex/bodega-store.js';

let _initialized = false;

export function initProductKardexListener() {
  if (_initialized) return;
  _initialized = true;

  eventBus.on(Events.PRODUCT_CREATED, async ({ payload: product }) => {
    if (!(Number(product.cantidad) > 0)) return;
    try {
      await createMovimiento({
        product_id: product.id,
        tipo: 'ENTRADA_COMPRA',
        bodega_id: BODEGA_CENTRAL_ID,
        cantidad: Number(product.cantidad),
        costo_unitario: Math.round(Number(product.costo ?? 0)),
        observacion: 'Saldo inicial al crear producto',
        idempotency_key: `INIT_${product.id}`,
      });
    } catch (err) {
      console.warn('[ProductKardexListener] Error al registrar saldo inicial en Kardex:', err?.message);
    }
  });
}
