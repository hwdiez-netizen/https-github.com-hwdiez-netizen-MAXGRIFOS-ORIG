import {
  saveDinamica, getDinamica, getAllDinamicasDB,
  saveDinamicaAudit, getDinamicaAuditByDinamica,
  addToSyncQueue, getSyncQueue, claimSyncQueueItem, updateSyncQueueItem, removeSyncQueueItem,
} from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { mockApi } from '../../mock/mock-api.js';

function _mdm(extra = {}) {
  const now = new Date().toISOString();
  return {
    created_at: now, updated_at: now,
    created_by: 'local-user', updated_by: 'local-user',
    version: 1, status: 'active', sync_status: 'pending',
    idempotency_key: extra.idempotency_key ?? crypto.randomUUID(),
    deleted_at: null,
    ...extra,
  };
}

async function _audit(dinamicaId, tipo, snapshot = {}) {
  const entry = {
    id: crypto.randomUUID(),
    dinamica_id: dinamicaId,
    tipo,
    snapshot,
    created_at: new Date().toISOString(),
  };
  await saveDinamicaAudit(entry);
  return entry;
}

async function _trySyncDinamica(type, id, payload) {
  try {
    if (type === 'CREATE') await mockApi.createDinamica(payload);
    else if (type === 'UPDATE') await mockApi.updateDinamica(id, payload);
    else throw new Error(`Operacion de sync no soportada para dinamicas: ${type}`);
    await saveDinamica({ ...payload, sync_status: 'synced' });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id,
      entity: 'dinamica_comercial',
      status: 'synced',
      source: 'try_sync',
    });
  } catch (error) {
    const errorMsg = error?.message ?? String(error);
    console.warn('[Sync][Dinamica] Error en sincronizacion inmediata', {
      type,
      entity_id: id,
      error: errorMsg,
    });
    await addToSyncQueue({ type, entity: 'dinamica_comercial', entity_id: id, payload, created_at: new Date().toISOString() });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id,
      entity: 'dinamica_comercial',
      status: 'pending',
      source: 'try_sync',
      error: errorMsg,
    });
  }
}

export async function crearDinamica(data) {
  const id = crypto.randomUUID();
  const dinamica = {
    id,
    nombre: data.nombre,
    fecha_inicio: data.fecha_inicio ?? null,
    fecha_fin: data.fecha_fin ?? null,
    condiciones: data.condiciones ?? '',
    activa: false,
    estado_proceso: 'creacion',
    ..._mdm({ idempotency_key: `DINAMICA:CREATE:${data.nombre.replace(/\s+/g, '')}` }),
  };
  await saveDinamica(dinamica);
  await _audit(id, 'CREACION', { nombre: dinamica.nombre });
  eventBus.emit(Events.DINAMICA_CREADA, { dinamica });
  if (navigator.onLine) await _trySyncDinamica('CREATE', id, dinamica);
  else await addToSyncQueue({ type: 'CREATE', entity: 'dinamica_comercial', entity_id: id, payload: dinamica, created_at: new Date().toISOString() });
  return dinamica;
}

export async function actualizarDinamica(id, data) {
  const dinamica = await getDinamica(id);
  if (!dinamica) throw new Error('Dinámica no encontrada');
  const updated = {
    ...dinamica,
    nombre: data.nombre ?? dinamica.nombre,
    fecha_inicio: data.fecha_inicio ?? dinamica.fecha_inicio,
    fecha_fin: data.fecha_fin ?? dinamica.fecha_fin,
    condiciones: data.condiciones ?? dinamica.condiciones,
    estado_proceso: dinamica.estado_proceso === 'creacion' ? 'creacion' : 'edicion',
    updated_at: new Date().toISOString(),
    updated_by: 'local-user',
    version: dinamica.version + 1,
    sync_status: 'pending',
  };
  await saveDinamica(updated);
  await _audit(id, 'MODIFICACION', { nombre: updated.nombre, estado_proceso: updated.estado_proceso });
  eventBus.emit(Events.DINAMICA_ACTUALIZADA, { dinamica: updated });
  if (navigator.onLine) await _trySyncDinamica('UPDATE', id, updated);
  else await addToSyncQueue({ type: 'UPDATE', entity: 'dinamica_comercial', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  return updated;
}

export async function activarDinamica(id) {
  const dinamica = await getDinamica(id);
  if (!dinamica) throw new Error('Dinámica no encontrada');
  const updated = {
    ...dinamica, activa: true, estado_proceso: 'activa',
    updated_at: new Date().toISOString(), updated_by: 'local-user',
    version: dinamica.version + 1, sync_status: 'pending',
  };
  await saveDinamica(updated);
  await _audit(id, 'ACTIVACION', { snapshot: { nombre: updated.nombre, fecha_inicio: updated.fecha_inicio, fecha_fin: updated.fecha_fin } });
  eventBus.emit(Events.DINAMICA_ACTIVADA, { dinamica: updated });
  if (navigator.onLine) await _trySyncDinamica('UPDATE', id, updated);
  else await addToSyncQueue({ type: 'UPDATE', entity: 'dinamica_comercial', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  return updated;
}

export async function desactivarDinamica(id) {
  const dinamica = await getDinamica(id);
  if (!dinamica) throw new Error('Dinámica no encontrada');
  const updated = {
    ...dinamica, activa: false, estado_proceso: 'inactiva',
    updated_at: new Date().toISOString(), updated_by: 'local-user',
    version: dinamica.version + 1, sync_status: 'pending',
  };
  await saveDinamica(updated);
  await _audit(id, 'DESACTIVACION', { nombre: updated.nombre });
  eventBus.emit(Events.DINAMICA_DESACTIVADA, { dinamica: updated });
  if (navigator.onLine) await _trySyncDinamica('UPDATE', id, updated);
  else await addToSyncQueue({ type: 'UPDATE', entity: 'dinamica_comercial', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  return updated;
}

export async function ponerDinamicaEnStandby(id, motivo = '') {
  const dinamica = await getDinamica(id);
  if (!dinamica) throw new Error('Dinámica no encontrada');
  const updated = {
    ...dinamica, activa: false, estado_proceso: 'standby',
    updated_at: new Date().toISOString(), updated_by: 'local-user',
    version: dinamica.version + 1, sync_status: 'pending',
  };
  await saveDinamica(updated);
  await _audit(id, 'STANDBY', { motivo });
  eventBus.emit(Events.DINAMICA_EN_STANDBY, { dinamica: updated });
  if (navigator.onLine) await _trySyncDinamica('UPDATE', id, updated);
  else await addToSyncQueue({ type: 'UPDATE', entity: 'dinamica_comercial', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  return updated;
}

export async function reanudarDinamica(id) {
  const dinamica = await getDinamica(id);
  if (!dinamica) throw new Error('Dinámica no encontrada');
  const updated = {
    ...dinamica, estado_proceso: 'edicion',
    updated_at: new Date().toISOString(), updated_by: 'local-user',
    version: dinamica.version + 1, sync_status: 'pending',
  };
  await saveDinamica(updated);
  await _audit(id, 'MODIFICACION', { accion: 'reanudada_desde_standby' });
  eventBus.emit(Events.DINAMICA_ACTUALIZADA, { dinamica: updated });
  if (navigator.onLine) await _trySyncDinamica('UPDATE', id, updated);
  else await addToSyncQueue({ type: 'UPDATE', entity: 'dinamica_comercial', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  return updated;
}

export async function cancelarDinamica(id, motivo = '') {
  const dinamica = await getDinamica(id);
  if (!dinamica) throw new Error('Dinámica no encontrada');
  const now = new Date().toISOString();
  const updated = {
    ...dinamica, activa: false, estado_proceso: 'cancelada',
    status: 'inactive', deleted_at: now,
    updated_at: now, updated_by: 'local-user',
    version: dinamica.version + 1, sync_status: 'pending',
  };
  await saveDinamica(updated);
  await _audit(id, 'CANCELACION', { motivo });
  eventBus.emit(Events.DINAMICA_CANCELADA, { dinamica: updated });
  if (navigator.onLine) await _trySyncDinamica('UPDATE', id, updated);
  else await addToSyncQueue({ type: 'UPDATE', entity: 'dinamica_comercial', entity_id: id, payload: updated, created_at: new Date().toISOString() });
  return updated;
}

export async function getDinamicaCompleta(id) {
  const dinamica = await getDinamica(id);
  if (!dinamica) return null;
  const auditoria = await getDinamicaAuditByDinamica(id);
  return { dinamica, auditoria };
}

export async function getAllDinamicas() {
  return getAllDinamicasDB();
}

export async function processSyncQueueDinamicas() {
  const queue = await getSyncQueue();
  const items = queue.filter((i) => i.entity === 'dinamica_comercial' && (!i.status || i.status === 'pending' || i.status === 'processing'));
  for (const item of items) {
    const claimed = await claimSyncQueueItem(item.id, 'dinamica_sync');
    if (!claimed) continue;

    try {
      if (claimed.type === 'CREATE') await mockApi.createDinamica(claimed.payload);
      else if (claimed.type === 'UPDATE') await mockApi.updateDinamica(claimed.entity_id, claimed.payload);
      else throw new Error(`Operacion de cola no soportada para dinamicas: ${claimed.type}`);
      await saveDinamica({ ...claimed.payload, sync_status: 'synced' });
      await removeSyncQueueItem(claimed.id);
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'dinamica_comercial',
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
      if (exhausted) {
        await saveDinamica({ ...claimed.payload, sync_status: 'error' });
      }
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'dinamica_comercial',
        status: nextStatus,
        source: 'sync_queue',
        error: errorMsg,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
      });
      console.warn('[Sync][Dinamica] Error en cola de sincronizacion', {
        entity_id: claimed.entity_id,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
        exhausted,
        error: errorMsg,
      });
    }
  }
}
