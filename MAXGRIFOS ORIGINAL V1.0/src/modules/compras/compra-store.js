// Módulo centralizado para operaciones de compras con enforcement progresivo

import {
  saveCompra,
  saveCompraItem,
  getCompra,
  getAllCompras,
} from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { runtimeGuard } from '../observability/runtime-guard.js';
import { enforcement } from '../observability/enforcement-progressive.js';

function _mdm(extra = {}) {
  if (!extra.idempotency_key) {
    throw new Error('idempotency_key determinista requerido.');
  }
  const now = new Date().toISOString();
  return {
    created_at: extra.created_at ?? now,
    updated_at: now,
    created_by: extra.created_by ?? 'local',
    updated_by: 'local',
    version: Number(extra.version ?? 0) + 1,
    status: extra.status ?? 'active',
    sync_status: extra.sync_status ?? 'pending',
    ...extra,
  };
}

export async function guardarCompra(data, options = {}) {
  const { compra, items } = data;

  if (!options.__fromHandler) {
    enforcement.enforce('guardarCompra', {
      module: 'compras',
      entity_id: compra?.id,
      fromHandler: false,
    });
    runtimeGuard.report({
      type: 'STORE_VIOLATION',
      module: 'compras',
      action: 'guardarCompra',
      entity_id: compra?.id,
      key: compra?.idempotency_key,
    });
    throw new Error('STORE_ACCESS_DENIED: guardarCompra requiere __fromHandler.');
  }

  if (!compra || !Array.isArray(items) || items.length === 0) {
    throw new Error('Compra o items vacíos');
  }

  await saveCompra(compra);

  const savedItems = [];
  for (const item of items) {
    const savedItem = {
      ...item,
      id: item.id ?? `ITEM:${compra.id}:${item.product_id}`,
      compra_id: compra.id,
      updated_at: new Date().toISOString(),
      status: item.status ?? 'active',
      sync_status: item.sync_status ?? 'pending',
      idempotency_key: item.idempotency_key ?? `COMPRA:${compra.id}:PRODUCT:${item.product_id}`,
    };
    await saveCompraItem(savedItem);
    savedItems.push(savedItem);
  }

  eventBus.emit(Events.COMPRA_CREADA, { compra, items: savedItems });

  return { compra, items: savedItems };
}

export async function recibirCompra(data, options = {}) {
  const { compra, items, factura_proveedor = '' } = data;

  if (!options.__fromHandler) {
    enforcement.enforce('recibirCompra', {
      module: 'compras',
      entity_id: compra?.id,
      fromHandler: false,
    });
    runtimeGuard.report({
      type: 'STORE_VIOLATION',
      module: 'compras',
      action: 'recibirCompra',
      entity_id: compra?.id,
      key: compra?.idempotency_key,
    });
    throw new Error('STORE_ACCESS_DENIED: recibirCompra requiere __fromHandler.');
  }

  if (!compra || !items || items.length === 0) {
    throw new Error('Compra o items vacíos');
  }

  // Calcular totales
  const totalSubtotal = items.reduce(
    (sum, i) => sum + (Number(i.cantidad) * Number(i.costo_unitario)),
    0
  );
  const iva = Math.round(totalSubtotal * 0.19);
  const total = totalSubtotal + iva;

  // Actualizar compra a estado recibida
  const updated = {
    ...compra,
    updated_at: new Date().toISOString(),
    version: (compra.version ?? 0) + 1,
    estado: 'recibida',
    factura_proveedor,
    subtotal: totalSubtotal,
    iva,
    total,
  };

  // Guardar compra actualizada
  await saveCompra(updated);

  // Guardar/actualizar items
  const savedItems = [];
  for (const item of items) {
    const savedItem = {
      ...item,
      id: item.id ?? `ITEM:${updated.id}:${item.product_id}`,
      compra_id: updated.id,
      updated_at: new Date().toISOString(),
      status: 'active',
      sync_status: 'pending',
      idempotency_key:
        item.idempotency_key ??
        `COMPRA:${updated.id}:PRODUCT:${item.product_id}`,
    };
    await saveCompraItem(savedItem);
    savedItems.push(savedItem);
  }

  // Emitir evento de compra recibida
  eventBus.emit(Events.COMPRA_RECEPCIONADA, {
    compra: updated,
    items: savedItems,
    total,
  });

  return { compra: updated, items: savedItems };
}

export async function getCompraCompleta(compraId) {
  const compra = await getCompra(compraId);
  if (!compra) return null;
  return compra;
}

export async function getComprasActivas() {
  const all = await getAllCompras();
  return all.filter((c) => c.estado !== 'recibida' && c.status === 'active');
}

export async function getComprasRecibidas() {
  const all = await getAllCompras();
  return all.filter((c) => c.estado === 'recibida' && c.status === 'active');
}
