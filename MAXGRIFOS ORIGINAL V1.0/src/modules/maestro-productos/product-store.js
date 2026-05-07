import {
  saveProduct,
  saveProductWithSyncQueue,
  getProduct,
  getAllProducts,
  getProductsBySku,
  updateProductSyncStatus,
  addToSyncQueue,
  getSyncQueue,
  claimSyncQueueItem,
  updateSyncQueueItem,
  removeSyncQueueItem,
} from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { mockApi } from '../../mock/mock-api.js';
import { getReservedStock } from '../../services/stock-guard.js';

function hasStableValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function normalizeProductKeyPart(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildProductIdentity(data) {
  const rawSku = data.sku ? normalizeProductKeyPart(data.sku) : '';

  if (rawSku) {
    return {
      id: `PRODUCT:${rawSku}`,
      identity_key: `PRODUCT:SKU:${rawSku}`,
      idempotency_key: `PRODUCT:SKU:${rawSku}`,
    };
  }

  const rawName = normalizeProductKeyPart(data.nombre);
  const rawRef = normalizeProductKeyPart(data.ref_proveedor);

  if (rawName && rawRef) {
    return {
      id: `PRODUCT:REF:${rawRef}:NAME:${rawName}`,
      identity_key: `PRODUCT:REF:${rawRef}:NAME:${rawName}`,
      idempotency_key: `PRODUCT:REF:${rawRef}:NAME:${rawName}`,
    };
  }

  throw new Error('[ProductStore] No se puede construir identidad determinista de producto sin SKU o referencia/nombre');
}

function buildProduct(data) {
  const now = new Date().toISOString();
  const identity = buildProductIdentity(data);

  return {
    ...data,
    id: hasStableValue(data.id) ? data.id : identity.id,
    identity_key: hasStableValue(data.identity_key) ? data.identity_key : identity.identity_key,
    idempotency_key: hasStableValue(data.idempotency_key) ? data.idempotency_key : identity.idempotency_key,
    created_at: hasStableValue(data.created_at) ? data.created_at : now,
    updated_at: now,
    created_by: hasStableValue(data.created_by) ? data.created_by : 'local-user',
    updated_by: 'local-user',
    version: Number.isFinite(Number(data.version)) ? Number(data.version) : 1,
    status: hasStableValue(data.status) ? data.status : 'active',
    sync_status: 'pending',
    costo: data.costo ?? 0,
    cantidad: data.cantidad ?? 0,
  };
}

function normalizeCosto(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function trySyncNow(type, entityId, payload) {
  try {
    if (type === 'CREATE') await mockApi.createProduct(payload);
    else if (type === 'UPDATE') await mockApi.updateProduct(entityId, payload);
    else if (type === 'DEACTIVATE') await mockApi.discontinueProduct(entityId);
    else throw new Error(`Operacion de sync no soportada para productos: ${type}`);

    await updateProductSyncStatus(entityId, 'synced');

    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id: entityId,
      entity: 'product',
      status: 'synced',
      source: 'try_sync',
    });
  } catch (error) {
    const errorMsg = error?.message ?? String(error);

    console.warn('[Sync][Product] Error en sincronizacion inmediata', {
      type,
      entity_id: entityId,
      error: errorMsg,
    });

    await addToSyncQueue({
      type,
      entity: 'product',
      entity_id: entityId,
      payload,
      idempotency_key: `SYNC:${type}:${entityId}`,
      created_at: new Date().toISOString(),
    });

    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id: entityId,
      entity: 'product',
      status: 'pending',
      source: 'try_sync',
      error: errorMsg,
    });
  }
}

export async function skuExists(sku, excludeId = null) {
  const matches = await getProductsBySku(sku);
  return matches.some((p) => p.id !== excludeId);
}

export async function createProduct(data) {
  if (data.sku) {
    const dup = await skuExists(data.sku);
    if (dup) {
      throw new Error(`🔴 Registro duplicado: El SKU "${data.sku}" ya existe en el sistema. No es posible crear duplicados por integridad de datos.`);
    }
  }

  const product = buildProduct(data);

  if (navigator.onLine) {
    await saveProduct(product);
    eventBus.emit(Events.PRODUCT_CREATED, product);
    await trySyncNow('CREATE', product.id, product);
  } else {
    await saveProductWithSyncQueue(product, {
      type: 'CREATE',
      entity: 'product',
      entity_id: product.id,
      payload: product,
      created_at: new Date().toISOString(),
    });

    eventBus.emit(Events.PRODUCT_CREATED, product);
  }

  return product;
}

export async function updateProduct(id, data, options = {}) {
  const product = await getProduct(id);
  if (!product) return;

  if (data.sku && data.sku !== product.sku) {
    const dup = await skuExists(data.sku, id);
    if (dup) {
      throw new Error(`🔴 Registro duplicado: El SKU "${data.sku}" ya existe en el sistema. No es posible crear duplicados por integridad de datos.`);
    }
  }

  const hasCostoInPayload = Object.prototype.hasOwnProperty.call(data ?? {}, 'costo');
  const costoAnterior = normalizeCosto(product.costo);
  const costoNuevo = hasCostoInPayload ? normalizeCosto(data.costo) : costoAnterior;
  const costoCambio = hasCostoInPayload && costoNuevo !== costoAnterior;

  const updated = {
    ...product,
    ...data,
    updated_at: new Date().toISOString(),
    updated_by: 'local-user',
    version: product.version + 1,
    sync_status: 'pending',
  };

  if (navigator.onLine) {
    await saveProduct(updated);
    eventBus.emit(Events.PRODUCT_UPDATED, updated);
    await trySyncNow('UPDATE', id, updated);
  } else {
    await saveProductWithSyncQueue(updated, {
      type: 'UPDATE',
      entity: 'product',
      entity_id: id,
      payload: updated,
      created_at: new Date().toISOString(),
    });

    eventBus.emit(Events.PRODUCT_UPDATED, updated);
  }

  if (costoCambio && options.emitCostoTrace !== false) {
    await eventBus.emit(Events.COSTO_PRODUCTO_CAMBIADO, {
      product_id: id,
      product_sku: updated.sku ?? product.sku ?? null,
      product_name: updated.nombre ?? product.nombre ?? null,
      costo_anterior: costoAnterior,
      costo_nuevo: costoNuevo,
      origen: options.origen ?? 'PRODUCT_UPDATED',
      referencia: options.referencia ?? null,
      compra_consecutivo: options.compra_consecutivo ?? null,
      updated_by: updated.updated_by ?? 'local-user',
      updated_at: updated.updated_at ?? new Date().toISOString(),
    });
  }

  return updated;
}

export async function deactivateProduct(id) {
  const product = await getProduct(id);
  if (!product) return;
  if (product.status === 'inactive') return product;

  const stockPedidos = await getReservedStock(id);
  if (stockPedidos > 0) {
    throw new Error(
      `No se puede desactivar: el producto tiene ${stockPedidos} unidad(es) reservada(s) en pedidos activos. Resuelva o cancele los pedidos antes de continuar.`,
    );
  }

  const updated = {
    ...product,
    status: 'inactive',
    updated_at: new Date().toISOString(),
    updated_by: 'local-user',
    version: product.version + 1,
    sync_status: 'pending',
  };

  if (navigator.onLine) {
    await saveProduct(updated);
    eventBus.emit(Events.PRODUCT_DEACTIVATED, updated);
    await trySyncNow('DEACTIVATE', id, { id });
  } else {
    await saveProductWithSyncQueue(updated, {
      type: 'DEACTIVATE',
      entity: 'product',
      entity_id: id,
      payload: { id },
      created_at: new Date().toISOString(),
    });

    eventBus.emit(Events.PRODUCT_DEACTIVATED, updated);
  }

  return updated;
}

export async function activateProduct(id) {
  const product = await getProduct(id);
  if (!product) return;

  const updated = {
    ...product,
    status: 'active',
    updated_at: new Date().toISOString(),
    updated_by: 'local-user',
    version: product.version + 1,
    sync_status: 'pending',
  };

  if (navigator.onLine) {
    await saveProduct(updated);
    eventBus.emit(Events.PRODUCT_ACTIVATED, updated);
    await trySyncNow('UPDATE', id, updated);
  } else {
    await saveProductWithSyncQueue(updated, {
      type: 'UPDATE',
      entity: 'product',
      entity_id: id,
      payload: updated,
      created_at: new Date().toISOString(),
    });

    eventBus.emit(Events.PRODUCT_ACTIVATED, updated);
  }

  return updated;
}

export async function deleteProduct(id) {
  const product = await getProduct(id);
  if (!product) return;

  const stockPedidos = await getReservedStock(id);
  if (stockPedidos > 0) {
    throw new Error(
      `No se puede eliminar: el producto tiene ${stockPedidos} unidad(es) reservada(s) en pedidos activos. Resuelva o cancele los pedidos antes de continuar.`,
    );
  }

  const deleted = {
    ...product,
    status: 'inactive',
    updated_at: new Date().toISOString(),
    updated_by: 'local-user',
    version: product.version + 1,
    sync_status: 'pending',
  };

  if (navigator.onLine) {
    await saveProduct(deleted);
    eventBus.emit(Events.PRODUCT_DELETED, { id, status: 'inactive' });
    await trySyncNow('DEACTIVATE', id, { id });
  } else {
    await saveProductWithSyncQueue(deleted, {
      type: 'DEACTIVATE',
      entity: 'product',
      entity_id: id,
      payload: { id },
      created_at: new Date().toISOString(),
    });

    eventBus.emit(Events.PRODUCT_DELETED, { id, status: 'inactive' });
  }
}

export async function getProducts() {
  return getAllProducts();
}

export async function processSyncQueue() {
  const queue = await getSyncQueue();
  const items = queue.filter(
    (item) =>
      (item.entity === 'product' || !item.entity) &&
      (!item.status || item.status === 'pending' || item.status === 'processing'),
  );

  for (const item of items) {
    const claimed = await claimSyncQueueItem(item.id, 'product_sync');
    if (!claimed) continue;

    try {
      if (claimed.type === 'CREATE') await mockApi.createProduct(claimed.payload);
      else if (claimed.type === 'UPDATE') await mockApi.updateProduct(claimed.entity_id, claimed.payload);
      else if (claimed.type === 'DEACTIVATE') await mockApi.discontinueProduct(claimed.entity_id);
      else throw new Error(`Operacion de cola no soportada para productos: ${claimed.type}`);

      await updateProductSyncStatus(claimed.entity_id, 'synced');
      await removeSyncQueueItem(claimed.id);

      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'product',
        status: 'synced',
        source: 'sync_queue',
        recovered: (claimed.retry_count ?? 0) > 0 || item.status === 'processing',
        retry_count: claimed.retry_count ?? 0,
      });
    } catch (err) {
      const errorMsg = err?.message ?? String(err);
      const retries = (claimed.retry_count ?? 0) + 1;
      const exhausted = retries >= (claimed.max_retries ?? 3);

      await updateSyncQueueItem(claimed.id, {
        retry_count: retries,
        status: exhausted ? 'failed' : 'pending',
        error: errorMsg,
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const nextStatus = exhausted ? 'error' : 'pending';
      await updateProductSyncStatus(claimed.entity_id, nextStatus);

      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'product',
        status: nextStatus,
        source: 'sync_queue',
        error: errorMsg,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
      });

      console.warn('[Sync][Product] Error en cola de sincronizacion', {
        entity_id: claimed.entity_id,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
        exhausted,
        error: errorMsg,
      });
    }
  }
}