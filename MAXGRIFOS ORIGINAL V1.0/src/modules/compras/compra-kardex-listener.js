import { eventBus, Events } from '../../events/domain-events.js';
import { createMovimiento } from '../kardex/kardex-store.js';
import { updateProduct } from '../maestro-productos/product-store.js';
import { getProduct } from '../../db/local-db.js';
import { BODEGA_CENTRAL_ID } from '../kardex/bodega-store.js';

let _bound = false;

export function initCompraKardexListener() {
  if (_bound) return;
  _bound = true;

  eventBus.on(Events.COMPRA_RECEPCIONADA, async ({ payload }) => {
    const { compra, items } = payload ?? {};
    if (!compra || !Array.isArray(items)) return;

    for (const item of items) {
      if (!item.product_id) continue;
      const cantidad = Number(item.cantidad) || 0;
      const costo    = Number(item.costo_unitario) || 0;
      if (cantidad <= 0) continue;

      const bodegaId = item.bodega_id ?? BODEGA_CENTRAL_ID;
      const obsRef   = compra.factura_proveedor
        ? `OC ${compra.consecutivo} / Factura ${compra.factura_proveedor}`
        : `OC ${compra.consecutivo}`;

      try {
        await createMovimiento({
          product_id:      item.product_id,
          tipo:            'ENTRADA_COMPRA',
          cantidad,
          costo_unitario:  costo,
          bodega_id:       bodegaId,
          referencia:      compra.consecutivo,
          observacion:     `Recepción ${obsRef} — ${compra.proveedor_nombre ?? ''}`,
          idempotency_key: `ENTRADA_COMPRA:${compra.consecutivo}:${item.product_id}`,
        }, { __fromHandler: true });
      } catch (err) {
        console.error(`[CompraKardex] Error ingresando stock ${item.product_id}:`, err.message);
      }

      if (costo > 0) {
        try {
          const product = await getProduct(item.product_id);
          const costoAnterior = Number(product?.costo) || 0;
          if (costo !== costoAnterior) {
            await updateProduct(item.product_id, { costo }, {
              origen: 'COMPRA_RECEPCIONADA',
              referencia: compra.factura_proveedor ?? compra.consecutivo ?? null,
              compra_consecutivo: compra.consecutivo ?? null,
            });
          }
        } catch (err) {
          console.error(`[CompraKardex] Error actualizando costo ${item.product_id}:`, err.message);
        }
      }
    }
  });
}

