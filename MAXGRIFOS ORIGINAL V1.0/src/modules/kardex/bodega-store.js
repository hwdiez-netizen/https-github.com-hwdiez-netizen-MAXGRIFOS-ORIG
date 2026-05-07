import { saveBodega, getBodega, getAllBodegas, addToSyncQueue } from '../../db/local-db.js';
import { mockApi } from '../../mock/mock-api.js';
import { eventBus, Events } from '../../events/domain-events.js';

async function _trySyncBodega(type, id, payload) {
  try {
    if (type === 'CREATE') await mockApi.createBodega(payload);
    else if (type === 'UPDATE') await mockApi.updateBodega(id, payload);
    await saveBodega({ ...payload, sync_status: 'synced' });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, { id, status: 'synced' });
  } catch {
    await addToSyncQueue({
      type,
      entity: 'bodega',
      entity_id: id,
      payload,
      created_at: new Date().toISOString(),
    });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, { id, status: 'pending' });
  }
}

export const BODEGA_CENTRAL_ID = 'BODEGA_CENTRAL';
export const BODEGA_PEDIDOS_ID = 'PEDIDOS';
export const BODEGA_DESACTIVADOS_ID = 'BODEGA_DESACTIVADOS';
export const BODEGA_GARANTIAS_ID = 'BODEGA_GARANTIAS';

const BODEGAS_SISTEMA = [
  {
    id: BODEGA_CENTRAL_ID,
    nombre: 'Bodega Central',
    tipo: 'central',
    configurable: false,
    visible_manual: true,
    descripcion: 'Bodega principal de almacenamiento',
  },
  {
    id: BODEGA_PEDIDOS_ID,
    nombre: 'Pedidos',
    tipo: 'transit',
    configurable: false,
    visible_manual: true,
    descripcion: 'Bodega transitoria — stock apartado por pedidos activos',
  },
  {
    id: BODEGA_DESACTIVADOS_ID,
    nombre: 'Desactivados',
    tipo: 'system',
    configurable: false,
    visible_manual: false,
    status: 'active',
    descripcion: 'Bodega de sistema para stock retirado por desactivacion de producto',
  },
  {
    id: BODEGA_GARANTIAS_ID,
    nombre: 'Garantías',
    tipo: 'garantias',
    configurable: false,
    visible_manual: true,
    descripcion: 'Productos recibidos por garantia pendientes de nota credito de proveedor',
  },
];

export async function seedBodegas() {
  const existing = await getAllBodegas();
  for (const def of BODEGAS_SISTEMA) {
    if (!existing.find((b) => b.id === def.id)) {
      const now = new Date().toISOString();
      await saveBodega({
        ...def,
        created_at: now,
        updated_at: now,
        created_by: 'system',
        updated_by: 'system',
        version: 1,
        status: 'active',
        sync_status: 'synced',
        idempotency_key: crypto.randomUUID(),
      });
    }
  }
}

export async function getBodegas() {
  const all = await getAllBodegas();
  return all.filter((b) => b.status === 'active' && b.visible_manual !== false);
}

export async function getBodegasConSistema() {
  const all = await getAllBodegas();
  return all.filter((b) => b.status === 'active');
}

export async function getBodegaById(id) {
  return getBodega(id);
}

export async function createBodegaSateliteTemporal(sessionId) {
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const now = new Date().toISOString();
  const bodega = {
    id: `INVGEN_${sessionId.slice(0, 8).toUpperCase()}`,
    nombre: `INVENTARIO_GENERAL_${ts}`,
    tipo: 'satellite_inventario',
    es_temporal: true,
    session_id: sessionId,
    configurable: false,
    visible_manual: false,
    descripcion: 'Bodega temporal automática para sesión de Inventario General — NO modificar manualmente',
    created_at: now,
    updated_at: now,
    created_by: 'system',
    updated_by: 'system',
    version: 1,
    status: 'active',
    sync_status: 'pending',
    idempotency_key: `INVGEN_BODEGA_${sessionId}`,
  };
  await saveBodega(bodega);
  eventBus.emit(Events.BODEGA_CREATED, bodega);
  return bodega;
}

export async function createBodegaSatelite(data) {
  const now = new Date().toISOString();
  const bodega = {
    id: crypto.randomUUID(),
    nombre: String(data.nombre ?? '').toUpperCase(),
    tipo: 'satellite',
    configurable: true,
    descripcion: data.descripcion ?? '',
    created_at: now,
    updated_at: now,
    created_by: 'local',
    updated_by: 'local',
    version: 1,
    status: 'active',
    sync_status: 'pending',
    idempotency_key: crypto.randomUUID(),
  };
  await saveBodega(bodega);
  eventBus.emit(Events.BODEGA_CREATED, bodega);
  if (navigator.onLine) {
    await _trySyncBodega('CREATE', bodega.id, bodega);
  } else {
    await addToSyncQueue({
      type: 'CREATE',
      entity: 'bodega',
      entity_id: bodega.id,
      payload: bodega,
      created_at: new Date().toISOString(),
    });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, { id: bodega.id, status: 'pending' });
  }
  return bodega;
}

export async function updateBodegaSatelite(id, data) {
  const existing = await getBodega(id);
  if (!existing || !existing.configurable) throw new Error('Bodega no editable');
  const updated = {
    ...existing,
    nombre: String(data.nombre ?? existing.nombre).toUpperCase(),
    descripcion: data.descripcion ?? existing.descripcion,
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: existing.version + 1,
    sync_status: 'pending',
  };
  await saveBodega(updated);
  eventBus.emit(Events.BODEGA_UPDATED, updated);
  if (navigator.onLine) {
    await _trySyncBodega('UPDATE', id, updated);
  } else {
    await addToSyncQueue({
      type: 'UPDATE',
      entity: 'bodega',
      entity_id: id,
      payload: updated,
      created_at: new Date().toISOString(),
    });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, { id, status: 'pending' });
  }
  return updated;
}

export async function closeBodegaSateliteInventario(bodegaId) {
  const existing = await getBodega(bodegaId);
  if (!existing) return;
  const updated = {
    ...existing,
    status: 'closed',
    solo_lectura: true,
    updated_at: new Date().toISOString(),
    updated_by: 'system',
    version: (existing.version ?? 1) + 1,
    sync_status: 'pending',
  };
  await saveBodega(updated);
}

export async function deactivateBodegaSatelite(id) {
  const existing = await getBodega(id);
  if (!existing || !existing.configurable) throw new Error('Bodega no editable');
  const updated = {
    ...existing,
    status: 'inactive',
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: existing.version + 1,
    sync_status: 'pending',
  };
  await saveBodega(updated);
  return updated;
}
