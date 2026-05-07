import {
  savePedido, getPedido, getAllPedidos,
  savePedidoItem, getPedidoItems,
  saveSagaLog, getSagaLog,
  updatePedidoSyncStatus,
  addToSyncQueue, getSyncQueue, claimSyncQueueItem, updateSyncQueueItem, removeSyncQueueItem,
  getNextConsecutivo,
  saveWithOutbox,
} from '../../db/local-db.js';
import { mockApi } from '../../mock/mock-api.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { runtimeGuard } from '../observability/runtime-guard.js';
import { enforcement } from '../observability/enforcement-progressive.js';
import { validarTransicion } from './pedido-contracts.js';

export const ESTADOS_ACTIVOS = ['creacion', 'edicion', 'standby', 'creado', 'picking', 'packing', 'facturado', 'remisionado', 'despacho'];
export const ESTADOS_TERMINALES = ['pod', 'anulado', 'cancelado'];

function _generateDeterministicId(prefix, key) {
  return `${prefix}:${key}`;
}

function _mdm(extra = {}) {
  const now = new Date().toISOString();
  return { created_at: now, updated_at: now, created_by: 'local', updated_by: 'local', version: 1, status: 'active', sync_status: 'pending', ...extra };
}

export async function crearPedido(data, options = {}) {
  if (!options.__fromHandler) {
    enforcement.enforce('crearPedido', {
      module: 'pedidos',
      entity_id: data?.cliente_id,
      fromHandler: false,
    });
    runtimeGuard.report({
      type: 'STORE_VIOLATION',
      module: 'pedidos',
      action: 'crearPedido',
      entity_id: data?.cliente_id,
      key: data?.idempotency_key,
    });
    throw new Error('STORE_ACCESS_DENIED:pedidos:crearPedido');
  }

  if (!data?.idempotency_key) {
    throw new Error('PEDIDOS_IDEMPOTENCY_KEY_REQUIRED');
  }

  if (!data?.cliente_id && !data?.cliente_nit && !data?.cliente_nombre) {
    throw new Error('PEDIDOS_CLIENTE_REQUIRED');
  }

  if (!Array.isArray(data?.items) || data.items.length === 0) {
    throw new Error('PEDIDOS_ITEMS_REQUIRED');
  }

  for (const [index, it] of data.items.entries()) {
    if (!it?.product_id) throw new Error(`PEDIDOS_ITEM_PRODUCT_ID_REQUIRED:${index}`);
    if (!it?.product_sku) throw new Error(`PEDIDOS_ITEM_PRODUCT_SKU_REQUIRED:${index}`);
    if (!(Number(it?.cantidad) > 0)) throw new Error(`PEDIDOS_ITEM_CANTIDAD_REQUIRED:${index}`);
  }

  const consecutivo = await getNextConsecutivo('PED');
  const id = _generateDeterministicId('PEDIDO', data.idempotency_key);
  const now = new Date().toISOString();

  const pedido = {
    id,
    consecutivo,
    qr_code: `MGP:${id}:${consecutivo}`,
    cliente_id:     data.cliente_id     ?? `CLIENTE:${data.cliente_nit ?? data.cliente_nombre}`,
    cliente_nombre: data.cliente_nombre ?? 'MOSTRADOR',
    cliente_nit:    data.cliente_nit    ?? '',
    estado:         'creado',
    documento_id:   null,
    observacion:    data.observacion    ?? '',
    ..._mdm({ version: 1 }),
    created_at: now, updated_at: now,
  };

  // AUDIT-FAILED-20260425T0117Z Fix 3 — outbox atómico (EXCEPCIÓN §1.1)
  await saveWithOutbox('pedidos', pedido, {
    type: 'CREATE', entity: 'pedido', entity_id: id, payload: pedido,
    idempotency_key: `OUTBOX:pedidos:${id}:CREATE`,
  });

  const items = [];
  for (const it of (data.items ?? [])) {
    const itemId = _generateDeterministicId(`PED:${id}:ITEM`, it.product_id);
    const item = {
      id:                itemId,
      pedido_id:         id,
      product_id:        it.product_id,
      product_sku:       it.product_sku,
      product_name:      it.product_name,
      cantidad_pedida:   Number(it.cantidad),
      cantidad_picking:  Number(it.cantidad),
      precio_unitario:   Number(it.precio_unitario ?? 0),
      subtotal:          Number(it.cantidad) * Number(it.precio_unitario ?? 0),
      precio_origen:     it.precio_origen ?? null,
      ..._mdm({ idempotency_key: `PED:${id}:ITEM:${it.product_id}` }),
    };
    await savePedidoItem(item);
    items.push(item);
  }

  await _logSaga(id, 'CREADO', { consecutivo });
  eventBus.emit(Events.PEDIDO_CREATED, { pedido, items });
  if (navigator.onLine) processSyncQueuePedidos().catch(() => {});
  return { pedido, items };
}

export async function getPedidoCompleto(pedidoId) {
  const pedido = await getPedido(pedidoId);
  if (!pedido) return null;
  const allItems = await getPedidoItems(pedidoId);
  const items    = allItems.filter((i) => i.status === 'active');
  const log      = await getSagaLog(pedidoId);
  return { pedido, items, log };
}

export async function getPedidos() { return getAllPedidos(); }

export async function getPedidosActivos() {
  const all = await getAllPedidos();
  return all.filter((p) => ESTADOS_ACTIVOS.includes(p.estado));
}

export async function actualizarEstado(pedidoId, nuevoEstado, extra = {}, options = {}) {
  if (!options.__fromHandler) throw new Error('STORE_ACCESS_DENIED:pedidos:actualizarEstado');
  const pedido = await getPedido(pedidoId);
  if (!pedido) throw new Error('Pedido no encontrado');
  validarTransicion(pedido.estado, nuevoEstado);
  const updated = {
    ...pedido,
    estado: nuevoEstado,
    ...extra,
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: pedido.version + 1,
    sync_status: 'pending',
  };
  await saveWithOutbox('pedidos', updated, {
    type: 'UPDATE', entity: 'pedido', entity_id: pedidoId, payload: updated,
    idempotency_key: `OUTBOX:pedidos:${pedidoId}:${nuevoEstado}:${updated.version}`,
  });
  if (navigator.onLine) processSyncQueuePedidos().catch(() => {});
  return updated;
}

export async function actualizarPedidoEditable(pedidoId, data = {}, options = {}) {
  if (!options.__fromHandler) throw new Error('STORE_ACCESS_DENIED:pedidos:actualizarPedidoEditable');
  const pedido = await getPedido(pedidoId);
  if (!pedido) throw new Error('Pedido no encontrado');
  const updated = {
    ...pedido,
    cliente_id: data.cliente_id ?? pedido.cliente_id,
    cliente_nombre: data.cliente_nombre ?? pedido.cliente_nombre,
    cliente_nit: data.cliente_nit ?? pedido.cliente_nit,
    observacion: data.observacion ?? pedido.observacion,
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: pedido.version + 1,
    sync_status: 'pending',
  };
  await saveWithOutbox('pedidos', updated, {
    type: 'UPDATE', entity: 'pedido', entity_id: pedidoId, payload: updated,
    idempotency_key: `OUTBOX:pedidos:${pedidoId}:EDITABLE:${updated.version}`,
  });
  if (navigator.onLine) processSyncQueuePedidos().catch(() => {});
  return updated;
}

export async function agregarItemAlPicking(pedidoId, item, options = {}) {
  if (!options.__fromHandler) throw new Error('STORE_ACCESS_DENIED:pedidos:agregarItemAlPicking');
  if (!item?.product_id) throw new Error('PEDIDOS_ITEM_PRODUCT_ID_REQUIRED');
  const id = _generateDeterministicId(`PED:${pedidoId}:ITEM`, item.product_id);
  const now = new Date().toISOString();
  const newItem = {
    id,
    pedido_id:        pedidoId,
    product_id:       item.product_id,
    product_sku:      item.product_sku,
    product_name:     item.product_name,
    cantidad_pedida:  0,
    cantidad_picking: Number(item.cantidad_picking ?? 1),
    precio_unitario:  Number(item.precio_unitario ?? 0),
    subtotal:         Number(item.cantidad_picking ?? 1) * Number(item.precio_unitario ?? 0),
    precio_origen:    item.precio_origen ?? null,
    created_at: now, updated_at: now,
    created_by: 'local', updated_by: 'local',
    version: 1, status: 'active', sync_status: 'pending',
    idempotency_key: `PED:${pedidoId}:PICK_ADD:${item.product_id}`,
  };
  await savePedidoItem(newItem);
  return newItem;
}

export async function actualizarItemsPicking(pedidoId, ajustes) {
  // ajustes: [{ item_id, cantidad_picking }]
  const items = await getPedidoItems(pedidoId);
  for (const aj of ajustes) {
    const item = items.find((i) => i.id === aj.item_id);
    if (!item) continue;
    const updated = {
      ...item,
      cantidad_picking: Number(aj.cantidad_picking),
      subtotal: Number(aj.cantidad_picking) * item.precio_unitario,
      updated_at: new Date().toISOString(),
      updated_by: 'local',
      version: item.version + 1,
      sync_status: 'pending',
    };
    await savePedidoItem(updated);
  }
  return getPedidoItems(pedidoId);
}

export async function reemplazarItemsPedido(pedidoId, nuevosItems = []) {
  const actuales = await getPedidoItems(pedidoId);
  const now = new Date().toISOString();

  const actualesActivos = actuales.filter((i) => i.status === 'active');
  for (const item of actualesActivos) {
    await savePedidoItem({
      ...item,
      status: 'inactive',
      updated_at: now,
      updated_by: 'local',
      version: item.version + 1,
      sync_status: 'pending',
    });
  }

  const creados = [];
  for (const it of nuevosItems) {
    const cantidad = Number(it.cantidad ?? it.cantidad_pedida ?? 0);
    const precio = Number(it.precio_unitario ?? 0);
    const item = {
      id: _generateDeterministicId(`PED:${pedidoId}:ITEM`, it.product_id),
      pedido_id: pedidoId,
      product_id: it.product_id,
      product_sku: it.product_sku,
      product_name: it.product_name,
      cantidad_pedida: cantidad,
      cantidad_picking: cantidad,
      precio_unitario: precio,
      subtotal: cantidad * precio,
      precio_origen: it.precio_origen ?? null,
      created_at: now,
      updated_at: now,
      created_by: 'local',
      updated_by: 'local',
      version: 1,
      status: 'active',
      sync_status: 'pending',
      idempotency_key: `PED:${pedidoId}:ITEM:${it.product_id}`,
    };
    await savePedidoItem(item);
    creados.push(item);
  }

  await _logSaga(pedidoId, 'ITEMS_REEMPLAZADOS', {
    items_anteriores: actualesActivos.map((i) => ({
      id: i.id,
      product_sku: i.product_sku,
      product_name: i.product_name,
      cantidad_pedida: i.cantidad_pedida,
      precio_unitario: i.precio_unitario,
    })),
    items_nuevos_count: creados.length,
  });

  return creados;
}

export async function _logSaga(pedidoId, fase, meta = {}) {
  const entry = {
    id: _generateDeterministicId(`PED:${pedidoId}:SAGA`, `${fase}:${JSON.stringify(meta ?? {})}`),
    pedido_id: pedidoId,
    fase,
    meta,
    created_at: new Date().toISOString(),
  };
  await saveSagaLog(entry);
  return entry;
}

async function _trySyncNow(type, entityId, payload) {
  try {
    if (type === 'CREATE') await mockApi.createPedido(payload);
    else if (type === 'UPDATE') await mockApi.updatePedido(entityId, payload);
    else throw new Error(`Operacion de sync no soportada para pedidos: ${type}`);
    await updatePedidoSyncStatus(entityId, 'synced');
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id: entityId,
      entity: 'pedido',
      status: 'synced',
      source: 'try_sync',
    });
  } catch (error) {
    const errorMsg = error?.message ?? String(error);
    console.warn('[Sync][Pedido] Error en sincronizacion inmediata', {
      type,
      entity_id: entityId,
      error: errorMsg,
    });
    await addToSyncQueue({ type, entity: 'pedido', entity_id: entityId, payload, created_at: new Date().toISOString() });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id: entityId,
      entity: 'pedido',
      status: 'pending',
      source: 'try_sync',
      error: errorMsg,
    });
  }
}

export async function processSyncQueuePedidos() {
  const queue = await getSyncQueue();
  const items = queue.filter((i) => i.entity === 'pedido' && (!i.status || i.status === 'pending' || i.status === 'processing'));
  for (const item of items) {
    const claimed = await claimSyncQueueItem(item.id, 'pedido_sync');
    if (!claimed) continue;

    try {
      if (claimed.type === 'CREATE') await mockApi.createPedido(claimed.payload);
      else if (claimed.type === 'UPDATE') await mockApi.updatePedido(claimed.entity_id, claimed.payload);
      else throw new Error(`Operacion de cola no soportada para pedidos: ${claimed.type}`);
      await updatePedidoSyncStatus(claimed.entity_id, 'synced');
      await removeSyncQueueItem(claimed.id);
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'pedido',
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
      await updatePedidoSyncStatus(claimed.entity_id, nextStatus);
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'pedido',
        status: nextStatus,
        source: 'sync_queue',
        error: errorMsg,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
      });
      console.warn('[Sync][Pedido] Error en cola de sincronizacion', {
        entity_id: claimed.entity_id,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
        exhausted,
        error: errorMsg,
      });
    }
  }
}

// --- NUEVAS REGLAS DE ESTADO Y FLUJO ---

export async function iniciarCreacion(data = {}, options = {}) {
  if (!options.__fromHandler) {
    enforcement.enforce('iniciarCreacion', {
      module: 'pedidos',
      entity_id: data?.cliente_id ?? data?.cliente_nit ?? data?.cliente_nombre,
      fromHandler: false,
    });
    runtimeGuard.report({
      type: 'STORE_VIOLATION',
      module: 'pedidos',
      action: 'iniciarCreacion',
      entity_id: data?.cliente_id ?? data?.cliente_nit ?? data?.cliente_nombre,
      key: data?.idempotency_key,
    });
    throw new Error('STORE_ACCESS_DENIED:pedidos:iniciarCreacion');
  }

  if (!data?.idempotency_key) {
    throw new Error('PEDIDOS_IDEMPOTENCY_KEY_REQUIRED');
  }

  if (!data?.cliente_id && !data?.cliente_nit && !data?.cliente_nombre) {
    throw new Error('PEDIDOS_CLIENTE_REQUIRED');
  }

  // Maneja la fase inicial (Creación) del proceso sin asentar definitivamente el pedido
  const consecutivo = await getNextConsecutivo('PED');
  const id = _generateDeterministicId('PEDIDO', data.idempotency_key);
  const now = new Date().toISOString();

  const pedido = {
    id,
    consecutivo,
    qr_code: `MGP:${id}:${consecutivo}`,
    cliente_id: data.cliente_id ?? `CLIENTE:${data.cliente_nit ?? data.cliente_nombre}`,
    cliente_nombre: data.cliente_nombre ?? 'MOSTRADOR',
    cliente_nit: data.cliente_nit ?? '',
    estado: 'creacion',
    documento_id: null,
    observacion: data.observacion ?? '',
    created_at: now,
    updated_at: now,
    created_by: 'local',
    updated_by: 'local',
    version: 1,
    status: 'active',
    sync_status: 'pending',
    idempotency_key: data.idempotency_key,
  };

  await savePedido(pedido);
  await _logSaga(id, 'CREACION_INICIADA', { consecutivo });
  return { pedido, items: [] };
}

export async function iniciarEdicion(pedidoId) {
  await _logSaga(pedidoId, 'EDICION_INICIADA', {});
  return actualizarEstado(pedidoId, 'edicion');
}

export async function ponerEnStandby(pedidoId, motivo = '') {
  await _logSaga(pedidoId, 'STANDBY', { motivo });
  return actualizarEstado(pedidoId, 'standby');
}

export async function cancelarProceso(pedidoId, motivo = '') {
  // REGLA ESTRICTA: "Cancelar" un proceso nunca anula ni elimina registros de la base de datos
  await _logSaga(pedidoId, 'PROCESO_CANCELADO', { motivo });
  return actualizarEstado(pedidoId, 'cancelado');
}

export async function getPedidosEnStandby() {
  // Gestión de Estado: El sistema debe llevar un registro (tracking) de todos los eventos en Standby
  const all = await getAllPedidos();
  return all.filter((p) => p.estado === 'standby');
}

// PED_F4 — Marca que el picking físico fue confirmado (sin cambio de estado FSM)
export async function marcarPickingFisicoConfirmado(pedidoId, options = {}) {
  if (!options.__fromHandler) throw new Error('STORE_ACCESS_DENIED:pedidos:marcarPickingFisicoConfirmado');
  const pedido = await getPedido(pedidoId);
  if (!pedido) throw new Error('Pedido no encontrado');
  if (pedido.picking_fisico_confirmado) return pedido;
  const updated = {
    ...pedido,
    picking_fisico_confirmado: true,
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: pedido.version + 1,
    sync_status: 'pending',
  };
  await saveWithOutbox('pedidos', updated, {
    type: 'UPDATE', entity: 'pedido', entity_id: pedidoId, payload: updated,
    idempotency_key: `OUTBOX:pedidos:${pedidoId}:PICKING_FISICO:${updated.version}`,
  });
  if (navigator.onLine) processSyncQueuePedidos().catch(() => {});
  return updated;
}
