import {
  saveLista, getLista, getAllListas, getListasByFormaPago,
  savePrecioItem, getPrecioItemsByLista,
  addToSyncQueue, getSyncQueue, claimSyncQueueItem, updateSyncQueueItem, removeSyncQueueItem,
  saveTrazabilidad, getAllTrazabilidad, clearTestData,
} from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { mockApi } from '../../mock/mock-api.js';

// ── Fuente única de verdad para FORMA DE PAGO ─────────────────
export const FORMA_PAGO_OPTIONS = [
  { value: 'CONTADO_B2B',     label: 'CONTADO B2B' },
  { value: 'CREDITO_15',      label: 'CREDITO 15 DIAS' },
  { value: 'CREDITO_30',      label: 'CREDITO 30 DIAS' },
  { value: 'CREDITO_45',      label: 'CREDITO 45 DIAS' },
  { value: 'B2C_REDES',       label: 'B2C REDES SOCIALES' },
  { value: 'B2C_CONSTRUCTOR', label: 'B2C CONSTRUCTOR' },
];

export const FORMA_PAGO_LABELS = Object.fromEntries(
  FORMA_PAGO_OPTIONS.map((o) => [o.value, o.label])
);

// Aliases de compatibilidad hacia atrás
export const TIPOS_CLIENTE = FORMA_PAGO_OPTIONS.map((o) => o.value);
export const LABELS_TIPO_CLIENTE = FORMA_PAGO_LABELS;

const LEGACY_MAP = {
  CONTADO:                  'CONTADO_B2B',
  B2B_CONTADO:              'CONTADO_B2B',
  CONTADO_BSB:              'CONTADO_B2B',
  CONTADO_B2B:              'CONTADO_B2B',
  B2C:                      'B2C_REDES',
  B2C_REDES:                'B2C_REDES',
  B2C_PROYECTO:             'B2C_CONSTRUCTOR',
  B2C_CONSTRUCTOR:          'B2C_CONSTRUCTOR',
  B2C_CONSTRUCTOR_PROYECTO: 'B2C_CONSTRUCTOR',
  CREDITO_15:               'CREDITO_15',
  CREDITO_30:               'CREDITO_30',
  CREDITO_45:               'CREDITO_45',
  CREDITO_15_DIAS:          'CREDITO_15',
  CREDITO_30_DIAS:          'CREDITO_30',
  CREDITO_45_DIAS:          'CREDITO_45',
  B2B_CREDITO_15:           'CREDITO_15',
  B2B_CREDITO_30:           'CREDITO_30',
  B2B_CREDITO_45:           'CREDITO_45',
};

export function normalizeFormaPago(formaPago) {
  const raw = String(formaPago ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
  return LEGACY_MAP[raw] ?? raw;
}

function _mdm(extra = {}) {
  const now = new Date().toISOString();
  return {
    created_at: now, updated_at: now,
    created_by: 'local-user', updated_by: 'local-user',
    version: 1, status: 'active', sync_status: 'pending',
    deleted_at: null,
    ...extra,
  };
}

async function _trySyncLista(type, id, payload) {
  try {
    if (type === 'CREATE') await mockApi.createListaPrecios(payload);
    else if (type === 'UPDATE') await mockApi.updateListaPrecios(id, payload);
    else throw new Error(`Operacion de sync no soportada: ${type}`);
    await saveLista({ ...payload, sync_status: 'synced' });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, { id, entity: 'lista_precios', status: 'synced', source: 'try_sync' });
  } catch (error) {
    const errorMsg = error?.message ?? String(error);
    await addToSyncQueue({ type, entity: 'lista_precios', entity_id: id, payload, created_at: new Date().toISOString() });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, { id, entity: 'lista_precios', status: 'pending', source: 'try_sync', error: errorMsg });
  }
}

export async function crearLista(data) {
  const id = crypto.randomUUID();
  const forma_pago = normalizeFormaPago(data.forma_pago ?? data.tipo_cliente ?? '');
  if (!forma_pago) throw new Error('La forma de pago es obligatoria.');

  const existentes = await getListasByFormaPago(forma_pago);
  const existente = existentes.find((l) => l.estado_proceso !== 'cancelada');
  if (existente) {
    throw new Error(`Ya existe la lista "${existente.nombre}" para esta forma de pago. Edítela desde el listado.`);
  }

  const lista = {
    id,
    nombre: data.nombre,
    forma_pago,
    tipo_cliente: forma_pago,
    descripcion: data.descripcion ?? '',
    activa: false,
    estado_proceso: 'creacion',
    ..._mdm({ idempotency_key: `LISTA:CREATE:${forma_pago}:${data.nombre.replace(/\s+/g, '')}` }),
  };
  await saveLista(lista);
  eventBus.emit(Events.LISTA_PRECIOS_CREADA, { lista });
  if (navigator.onLine) {
    await _trySyncLista('CREATE', id, lista);
  } else {
    await addToSyncQueue({ type: 'CREATE', entity: 'lista_precios', entity_id: id, payload: lista, created_at: new Date().toISOString() });
  }
  return lista;
}

export async function actualizarLista(id, data) {
  const lista = await getLista(id);
  if (!lista) throw new Error('Lista no encontrada');
  const updated = {
    ...lista,
    nombre: data.nombre ?? lista.nombre,
    descripcion: data.descripcion ?? lista.descripcion,
    estado_proceso: lista.estado_proceso === 'creacion' ? 'creacion' : 'edicion',
    updated_at: new Date().toISOString(),
    updated_by: 'local-user',
    version: lista.version + 1,
    sync_status: 'pending',
    idempotency_key: `LISTA:UPDATE:${id}:V${lista.version + 1}`,
  };
  await saveLista(updated);
  eventBus.emit(Events.LISTA_PRECIOS_ACTUALIZADA, { lista: updated });
  if (navigator.onLine) {
    await _trySyncLista('UPDATE', id, updated);
  } else {
    await addToSyncQueue({ type: 'UPDATE', entity: 'lista_precios', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  }
  return updated;
}

export async function activarLista(id) {
  const lista = await getLista(id);
  if (!lista) throw new Error('Lista no encontrada');

  const activeItems = (await getPrecioItemsByLista(id)).filter((i) => i.status === 'active');
  if (activeItems.length === 0) {
    throw new Error('No se puede activar una lista sin precios activos. Capture al menos un precio antes de activar.');
  }

  const now = new Date().toISOString();
  const forma_pago = lista.forma_pago ?? lista.tipo_cliente;
  const existentes = await getListasByFormaPago(forma_pago);
  for (const ex of existentes) {
    if (ex.id === id) continue;
    if (ex.estado_proceso === 'activa') {
      const suspended = {
        ...ex, activa: false, estado_proceso: 'suspendida',
        updated_at: now, updated_by: 'local-user',
        version: ex.version + 1, sync_status: 'pending',
        idempotency_key: `LISTA:SUSPEND:${ex.id}:V${ex.version + 1}`,
      };
      await saveLista(suspended);
      eventBus.emit(Events.LISTA_PRECIOS_SUSPENDIDA, { lista: suspended });
    } else if (['creacion', 'edicion', 'standby'].includes(ex.estado_proceso)) {
      const cancelled = {
        ...ex, activa: false, estado_proceso: 'cancelada', status: 'inactive', deleted_at: now,
        updated_at: now, updated_by: 'local-user',
        version: ex.version + 1, sync_status: 'pending',
        idempotency_key: `LISTA:CANCEL:${ex.id}:V${ex.version + 1}`,
      };
      await saveLista(cancelled);
      eventBus.emit(Events.LISTA_PRECIOS_CANCELADA, { lista: cancelled });
    }
  }

  const updated = {
    ...lista, activa: true, estado_proceso: 'activa',
    updated_at: now, updated_by: 'local-user',
    version: lista.version + 1, sync_status: 'pending',
    idempotency_key: `LISTA:ACTIVATE:${id}:V${lista.version + 1}`,
  };
  await saveLista(updated);
  eventBus.emit(Events.LISTA_PRECIOS_ACTIVADA, { lista: updated });
  if (navigator.onLine) {
    await _trySyncLista('UPDATE', id, updated);
  } else {
    await addToSyncQueue({ type: 'UPDATE', entity: 'lista_precios', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  }
  return updated;
}

export async function suspenderLista(id) {
  const lista = await getLista(id);
  if (!lista) throw new Error('Lista no encontrada');
  const updated = {
    ...lista, activa: false, estado_proceso: 'suspendida',
    updated_at: new Date().toISOString(), updated_by: 'local-user',
    version: lista.version + 1, sync_status: 'pending',
    idempotency_key: `LISTA:SUSPEND:${id}:V${lista.version + 1}`,
  };
  await saveLista(updated);
  eventBus.emit(Events.LISTA_PRECIOS_SUSPENDIDA, { lista: updated });
  if (navigator.onLine) await _trySyncLista('UPDATE', id, updated);
  else await addToSyncQueue({ type: 'UPDATE', entity: 'lista_precios', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  return updated;
}

export async function ponerListaEnStandby(id) {
  const lista = await getLista(id);
  if (!lista) throw new Error('Lista no encontrada');
  const updated = {
    ...lista, activa: false, estado_proceso: 'standby',
    updated_at: new Date().toISOString(), updated_by: 'local-user',
    version: lista.version + 1, sync_status: 'pending',
    idempotency_key: `LISTA:STANDBY:${id}:V${lista.version + 1}`,
  };
  await saveLista(updated);
  eventBus.emit(Events.LISTA_PRECIOS_EN_STANDBY, { lista: updated });
  if (navigator.onLine) await _trySyncLista('UPDATE', id, updated);
  else await addToSyncQueue({ type: 'UPDATE', entity: 'lista_precios', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  return updated;
}

export async function reanudarListaDesdeStandby(id) {
  const lista = await getLista(id);
  if (!lista) throw new Error('Lista no encontrada');
  const updated = {
    ...lista, estado_proceso: 'edicion',
    updated_at: new Date().toISOString(), updated_by: 'local-user',
    version: lista.version + 1, sync_status: 'pending',
    idempotency_key: `LISTA:REANUDAR:${id}:V${lista.version + 1}`,
  };
  await saveLista(updated);
  eventBus.emit(Events.LISTA_PRECIOS_ACTUALIZADA, { lista: updated });
  if (navigator.onLine) await _trySyncLista('UPDATE', id, updated);
  else await addToSyncQueue({ type: 'UPDATE', entity: 'lista_precios', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  return updated;
}

export async function cancelarLista(id) {
  const lista = await getLista(id);
  if (!lista) throw new Error('Lista no encontrada');
  const now = new Date().toISOString();
  const updated = {
    ...lista, activa: false, estado_proceso: 'cancelada',
    status: 'inactive', deleted_at: now,
    updated_at: now, updated_by: 'local-user',
    version: lista.version + 1, sync_status: 'pending',
    idempotency_key: `LISTA:CANCEL:${id}:V${lista.version + 1}`,
  };
  await saveLista(updated);
  eventBus.emit(Events.LISTA_PRECIOS_CANCELADA, { lista: updated });
  if (navigator.onLine) await _trySyncLista('UPDATE', id, updated);
  else await addToSyncQueue({ type: 'UPDATE', entity: 'lista_precios', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  return updated;
}

export async function guardarPrecioItems(listaId, nuevosItems = []) {
  const now = new Date().toISOString();
  const actuales = await getPrecioItemsByLista(listaId);
  const previosByProduct = new Map();
  for (const it of actuales.filter((i) => i.status === 'active')) {
    previosByProduct.set(it.product_id, { item: it, valor: Number(it.precio_venta) || 0 });
  }
  const creados = [];
  for (const it of nuevosItems) {
    const idemKey = "LP:" + listaId + ":" + it.product_id;
    const previo = previosByProduct.get(it.product_id);

    // Handle DEACTIVATE action
    if (it._action === 'DEACTIVATE') {
      if (previo) {
        const deactivatedItem = {
          id: idemKey,
          lista_id: listaId,
          product_id: it.product_id,
          product_sku: it.product_sku,
          product_name: it.product_name,
          precio_venta: previo.item.precio_venta,
          created_at: previo.item.created_at,
          updated_at: now,
          created_by: previo.item.created_by,
          updated_by: 'local-user',
          version: previo.item.version + 1,
          status: 'inactive',
          sync_status: 'pending',
          idempotency_key: idemKey,
          deleted_at: now,
        };
        await savePrecioItem(deactivatedItem);
        creados.push(deactivatedItem);
        await eventBus.emit(Events.PRECIO_ITEM_CHANGED, {
          _idempotency_key: "EVT:PRECIO_CHANGED:" + idemKey,
          lista_id: listaId,
          product_id: it.product_id,
          product_sku: it.product_sku,
          product_name: it.product_name,
          valor_anterior: previo.valor,
          valor_nuevo: null,
          usuario: 'local-user',
          motivo: 'BAJA_PRECIO',
        });
      }
      continue;
    }

    const precio = Number(it.precio_venta ?? 0);
    if (precio <= 0) continue;

    if (previo && previo.valor === precio) {
      continue;
    }

    const item = {
      id: idemKey,
      lista_id: listaId,
      product_id: it.product_id,
      product_sku: it.product_sku,
      product_name: it.product_name,
      precio_venta: precio,
      created_at: previo ? previo.item.created_at : now,
      updated_at: now,
      created_by: previo ? previo.item.created_by : 'local-user',
      updated_by: 'local-user',
      version: previo ? previo.item.version + 1 : 1,
      status: 'active',
      sync_status: 'pending',
      idempotency_key: idemKey,
      deleted_at: null,
    };

    await savePrecioItem(item);
    creados.push(item);

    await eventBus.emit(Events.PRECIO_ITEM_CHANGED, {
      _idempotency_key: "EVT:PRECIO_CHANGED:" + idemKey,
      lista_id: listaId,
      product_id: it.product_id,
      product_sku: it.product_sku,
      product_name: it.product_name,
      valor_anterior: previo ? previo.valor : null,
      valor_nuevo: precio,
      usuario: 'local-user',
      motivo: previo ? 'CAMBIO_PRECIO' : 'ALTA_PRECIO',
    });
  }
  // MERGE: productos no incluidos en nuevosItems se conservan activos
  return creados;
}

export async function getListaCompleta(id) {
  const lista = await getLista(id);
  if (!lista) return null;
  const allItems = await getPrecioItemsByLista(id);
  return { lista, items: allItems.filter((i) => i.status === 'active') };
}

export async function getAllListasPrecios() {
  return getAllListas();
}

export async function getListaActivaPorFormaPago(formaPago) {
  const normalized = normalizeFormaPago(formaPago);
  if (!normalized) return null;
  const all = await getListasByFormaPago(normalized);
  return all.find((l) => l.estado_proceso === 'activa') ?? null;
}

export const getListaActivaPorTipoCliente = getListaActivaPorFormaPago;

// ── Trazabilidad ──────────────────────────────────────────────
export async function registrarCambioLista(listaId, { campos = [], preciosModificados = 0 } = {}) {
  const registro = {
    id: crypto.randomUUID(),
    lista_id: listaId,
    fecha: new Date().toISOString(),
    campos_modificados: campos,
    precios_modificados: preciosModificados,
  };
  await saveTrazabilidad(registro);
  return registro;
}

export async function getUltimoCambioTodasListas() {
  const all = await getAllTrazabilidad();
  const byLista = new Map();
  for (const r of all) {
    const prev = byLista.get(r.lista_id);
    if (!prev || r.fecha > prev.fecha) byLista.set(r.lista_id, r);
  }
  return Array.from(byLista.values());
}

// ── Limpieza datos de prueba ──────────────────────────────────
export async function limpiarDatosPrueba() {
  await clearTestData();
}

// ── Procesamiento de sync queue ───────────────────────────────
export async function processSyncQueueListasPrecios() {
  const queue = await getSyncQueue();
  const items = queue.filter((i) => i.entity === 'lista_precios' && (!i.status || i.status === 'pending' || i.status === 'processing'));
  for (const item of items) {
    const claimed = await claimSyncQueueItem(item.id, 'lista_precios_sync');
    if (!claimed) continue;
    try {
      if (claimed.type === 'CREATE') await mockApi.createListaPrecios(claimed.payload);
      else if (claimed.type === 'UPDATE') await mockApi.updateListaPrecios(claimed.entity_id, claimed.payload);
      else throw new Error(`Operacion no soportada: ${claimed.type}`);
      await saveLista({ ...claimed.payload, sync_status: 'synced' });
      await removeSyncQueueItem(claimed.id);
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id, entity: 'lista_precios', status: 'synced', source: 'sync_queue',
        recovered: (claimed.retry_count ?? 0) > 0 || item.status === 'processing',
        retry_count: claimed.retry_count ?? 0,
      });
    } catch (err) {
      const errorMsg = err?.message ?? String(err);
      const retries = (claimed.retry_count ?? 0) + 1;
      const exhausted = retries >= (claimed.max_retries ?? 3);
      await updateSyncQueueItem(claimed.id, {
        retry_count: retries, status: exhausted ? 'failed' : 'pending',
        error: errorMsg, last_error_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (exhausted) await saveLista({ ...claimed.payload, sync_status: 'error' });
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id, entity: 'lista_precios',
        status: exhausted ? 'error' : 'pending', source: 'sync_queue',
        error: errorMsg, retry_count: retries, max_retries: claimed.max_retries ?? 3,
      });
    }
  }
}
