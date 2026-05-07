import {
  saveCliente,
  getCliente,
  getAllClientes,
  getClientesByCedula,
  getClientesByNit,
  updateClienteSyncStatus,
  addToSyncQueue,
  getSyncQueue,
  claimSyncQueueItem,
  updateSyncQueueItem,
  removeSyncQueueItem,
  saveWithOutbox,
} from '../../db/local-db.js';
import { mockApi } from '../../mock/mock-api.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { runtimeGuard } from '../observability/runtime-guard.js';

function normalizePositiveInteger(value) {
  const normalized = Number.parseInt(String(value ?? '').replace(/\D+/g, ''), 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function normalizeBirthday(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // Legacy support: YYYY-MM-DD -> MM-DD
  const parts = raw.split('-');
  if (parts.length === 3) {
    const month = String(parts[1] ?? '').padStart(2, '0');
    const day = String(parts[2] ?? '').padStart(2, '0');
    return `${month}-${day}`;
  }
  if (parts.length === 2) {
    const month = String(parts[0] ?? '').padStart(2, '0');
    const day = String(parts[1] ?? '').padStart(2, '0');
    return `${month}-${day}`;
  }
  return '';
}

function hasStableValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function normalizeClienteKeyPart(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildClienteIdentity(data) {
  const rawNit = data.nit ? normalizeClienteKeyPart(data.nit) : '';
  if (rawNit) {
    return {
      id: `CLIENTE:NIT:${rawNit}`,
      identity_key: `CLIENTE:NIT:${rawNit}`,
      idempotency_key: `CLIENTE:NIT:${rawNit}`,
    };
  }

  const rawCedula = data.cedula ? normalizeClienteKeyPart(data.cedula) : '';
  if (rawCedula) {
    return {
      id: `CLIENTE:CEDULA:${rawCedula}`,
      identity_key: `CLIENTE:CEDULA:${rawCedula}`,
      idempotency_key: `CLIENTE:CEDULA:${rawCedula}`,
    };
  }

  throw new Error('[ClienteStore] No se puede construir identidad determinista de cliente sin NIT o cédula');
}

function ensureCreatedAt(value) {
  const raw = String(value ?? '').trim();
  return raw || new Date().toISOString();
}

export async function cedulaExists(cedula, excludeId = null) {
  const normalized = String(cedula).toUpperCase();
  try {
    const matches = await getClientesByCedula(normalized);
    return matches.some((c) => c.id !== excludeId);
  } catch (error) {
    // Compatibilidad con DBs legacy donde el indice pudo no haberse creado.
    const all = await getAllClientes();
    return all.some((c) => String(c?.cedula ?? '').toUpperCase() === normalized && c.id !== excludeId);
  }
}

export async function nitExists(nit, excludeId = null) {
  const normalized = String(nit).toUpperCase();
  try {
    const matches = await getClientesByNit(normalized);
    return matches.some((c) => c.id !== excludeId);
  } catch (error) {
    // Compatibilidad con DBs legacy donde el indice pudo no haberse creado.
    const all = await getAllClientes();
    return all.some((c) => String(c?.nit ?? '').toUpperCase() === normalized && c.id !== excludeId);
  }
}

export async function createCliente(data, options = {}) {
  // Enforcement suave: aviso si no viene de handler
  if (!options.__fromHandler) {
    runtimeGuard.report({
      type: 'STORE_VIOLATION',
      module: 'clientes',
      action: 'createCliente',
      entity_id: data?.id,
      key: data?.idempotency_key,
    });
  }

  const identity = buildClienteIdentity(data);
  const id = hasStableValue(data.id) ? data.id : identity.id;
  const now = new Date().toISOString();
  const cedula = data.cedula ? String(data.cedula).toUpperCase() : undefined;
  const nit    = data.nit    ? String(data.nit).toUpperCase()    : undefined;

  if (cedula) {
    const dup = await cedulaExists(cedula);
    if (dup) throw new Error(`🔴 Registro duplicado: La cédula "${cedula}" ya existe en el sistema. No es posible crear duplicados por integridad de datos.`);
  }
  if (nit) {
    const dup = await nitExists(nit);
    if (dup) throw new Error(`🔴 Registro duplicado: El NIT "${nit}" ya existe en el sistema. No es posible crear duplicados por integridad de datos.`);
  }

  const qrRef  = cedula || nit || id;
  const cliente = {
    id,
    razon_social: String(data.razon_social ?? '').toUpperCase(),
    nit,
    cedula,
    celular: data.celular ?? '',
    correo: data.correo ?? '',
    direccion: data.direccion ?? '',
    barrio: data.barrio ?? '',
    ciudad: String(data.ciudad ?? '').toUpperCase(),
    fecha_cumpleanos: normalizeBirthday(data.fecha_cumpleanos),
    contacto: data.contacto ?? '',
    forma_pago: data.forma_pago ?? '',
    cupo_credito: normalizePositiveInteger(data.cupo_credito),
    compra_minima: normalizePositiveInteger(data.compra_minima),
    horarios_atencion: data.horarios_atencion ?? '',
    qr_code: `MGC:${id}:${qrRef}`,
    created_at: now,
    updated_at: now,
    created_by: 'local',
    updated_by: 'local',
    version: 1,
    status: 'active',
    sync_status: 'pending',
    identity_key: hasStableValue(data.identity_key) ? data.identity_key : identity.identity_key,
    idempotency_key: hasStableValue(data.idempotency_key) ? data.idempotency_key : identity.idempotency_key,
  };

  // AUDIT-FAILED-20260425T0117Z Fix 3 — outbox atómico (EXCEPCIÓN §1.1)
  await saveWithOutbox('clientes', cliente, {
    type: 'CREATE', entity: 'cliente', entity_id: cliente.id, payload: cliente,
    idempotency_key: `OUTBOX:clientes:${cliente.id}:CREATE`,
  });
  eventBus.emit(Events.CLIENTE_CREATED, cliente);
  if (navigator.onLine) processSyncQueueClientes().catch(() => {});
  return cliente;
}

export async function updateCliente(id, data, options = {}) {
  // Enforcement suave: aviso si no viene de handler
  if (!options.__fromHandler) {
    console.warn('[ENFORCEMENT] Acceso directo a updateCliente — use handleUpdateCliente desde handler');
  }

  const existing = await getCliente(id);
  if (!existing) throw new Error('Cliente no encontrado');
  const createdAt = ensureCreatedAt(existing.created_at);

  const newCedula = data.cedula !== undefined ? (data.cedula ? String(data.cedula).toUpperCase() : undefined) : existing.cedula;
  const newNit    = data.nit    !== undefined ? (data.nit    ? String(data.nit).toUpperCase()    : undefined) : existing.nit;

  if (newCedula && newCedula !== existing.cedula) {
    const dup = await cedulaExists(newCedula, id);
    if (dup) throw new Error(`🔴 Registro duplicado: La cédula "${newCedula}" ya existe en el sistema. No es posible crear duplicados por integridad de datos.`);
  }
  if (newNit && newNit !== existing.nit) {
    const dup = await nitExists(newNit, id);
    if (dup) throw new Error(`🔴 Registro duplicado: El NIT "${newNit}" ya existe en el sistema. No es posible crear duplicados por integridad de datos.`);
  }

  const updated = {
    ...existing,
    created_at: createdAt,
    razon_social: String(data.razon_social ?? existing.razon_social).toUpperCase(),
    nit: newNit,
    cedula: newCedula,
    celular: data.celular ?? existing.celular,
    correo: data.correo ?? existing.correo,
    direccion: data.direccion ?? existing.direccion,
    barrio: data.barrio ?? existing.barrio,
    ciudad: String(data.ciudad ?? existing.ciudad).toUpperCase(),
    fecha_cumpleanos: data.fecha_cumpleanos !== undefined
      ? normalizeBirthday(data.fecha_cumpleanos)
      : existing.fecha_cumpleanos,
    contacto: data.contacto ?? existing.contacto,
    forma_pago: data.forma_pago ?? existing.forma_pago ?? '',
    cupo_credito: data.cupo_credito !== undefined
      ? normalizePositiveInteger(data.cupo_credito)
      : existing.cupo_credito,
    compra_minima: data.compra_minima !== undefined
      ? normalizePositiveInteger(data.compra_minima)
      : (existing.compra_minima ?? 0),
    horarios_atencion: data.horarios_atencion ?? existing.horarios_atencion,
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: Number(existing.version ?? 0) + 1,
    sync_status: 'pending',
  };

  await saveWithOutbox('clientes', updated, {
    type: 'UPDATE', entity: 'cliente', entity_id: id, payload: updated,
    idempotency_key: `OUTBOX:clientes:${id}:UPDATE:${updated.version}`,
  });
  eventBus.emit(Events.CLIENTE_UPDATED, updated);
  if (navigator.onLine) processSyncQueueClientes().catch(() => {});
  return updated;
}

export async function deactivateCliente(id, options = {}) {
  // Enforcement suave: aviso si no viene de handler
  if (!options.__fromHandler) {
    console.warn('[ENFORCEMENT] Acceso directo a deactivateCliente — use handleDeactivateCliente desde handler');
  }

  const existing = await getCliente(id);
  if (!existing) throw new Error('Cliente no encontrado');
  const updated = {
    ...existing,
    created_at: ensureCreatedAt(existing.created_at),
    status: 'inactive',
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: Number(existing.version ?? 0) + 1,
    sync_status: 'pending',
  };
  await saveWithOutbox('clientes', updated, {
    type: 'DEACTIVATE', entity: 'cliente', entity_id: id, payload: { id },
    idempotency_key: `OUTBOX:clientes:${id}:DEACTIVATE:${updated.version}`,
  });
  eventBus.emit(Events.CLIENTE_DISCONTINUED, updated);
  if (navigator.onLine) processSyncQueueClientes().catch(() => {});
  return updated;
}

export async function activateCliente(id, options = {}) {
  // Enforcement suave: aviso si no viene de handler
  if (!options.__fromHandler) {
    console.warn('[ENFORCEMENT] Acceso directo a activateCliente — use handleActivateCliente desde handler');
  }

  const existing = await getCliente(id);
  if (!existing) throw new Error('Cliente no encontrado');
  const updated = {
    ...existing,
    created_at: ensureCreatedAt(existing.created_at),
    status: 'active',
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: Number(existing.version ?? 0) + 1,
    sync_status: 'pending',
  };
  await saveWithOutbox('clientes', updated, {
    type: 'UPDATE', entity: 'cliente', entity_id: id, payload: updated,
    idempotency_key: `OUTBOX:clientes:${id}:ACTIVATE:${updated.version}`,
  });
  eventBus.emit(Events.CLIENTE_ACTIVATED, updated);
  if (navigator.onLine) processSyncQueueClientes().catch(() => {});
  return updated;
}

export const CLIENTE_MOSTRADOR_ID = 'MOSTRADOR';

export async function seedClienteMostrador() {
  const existing = await getCliente(CLIENTE_MOSTRADOR_ID);
  if (!existing) {
    const now = new Date().toISOString();
    await saveCliente({
      id: CLIENTE_MOSTRADOR_ID,
      razon_social: 'CLIENTE MOSTRADOR',
      nit: '222222222222',
      cedula: '',
      celular: '',
      correo: '',
      direccion: 'MOSTRADOR',
      barrio: '',
      ciudad: '',
      fecha_cumpleanos: '',
      contacto: '',
      forma_pago: 'CONTADO',
      cupo_credito: 0,
      compra_minima: 0,
      horarios_atencion: '',
      qr_code: `MGC:${CLIENTE_MOSTRADOR_ID}:222222222222`,
      created_at: now,
      updated_at: now,
      created_by: 'system',
      updated_by: 'system',
      version: 1,
      status: 'active',
      sync_status: 'synced',
      identity_key: 'CLIENTE:NIT:222222222222',
      idempotency_key: 'CLIENTE:NIT:222222222222',
    });
  }
}

export async function getClientes() {
  return getAllClientes();
}

export async function getClienteById(id) {
  return getCliente(id);
}

async function _trySyncNow(type, entityId, payload) {
  try {
    if (type === 'CREATE') await mockApi.createCliente(payload);
    else if (type === 'UPDATE') await mockApi.updateCliente(entityId, payload);
    else if (type === 'DEACTIVATE') await mockApi.discontinueCliente(entityId);
    else throw new Error(`Operacion de sync no soportada para clientes: ${type}`);
    await updateClienteSyncStatus(entityId, 'synced');
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id: entityId,
      entity: 'cliente',
      status: 'synced',
      source: 'try_sync',
    });
  } catch (error) {
    const errorMsg = error?.message ?? String(error);
    console.warn('[Sync][Cliente] Error en sincronizacion inmediata', {
      type,
      entity_id: entityId,
      error: errorMsg,
    });
    await addToSyncQueue({
      type,
      entity: 'cliente',
      entity_id: entityId,
      payload,
      created_at: new Date().toISOString(),
    });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id: entityId,
      entity: 'cliente',
      status: 'pending',
      source: 'try_sync',
      error: errorMsg,
    });
  }
}

export async function processSyncQueueClientes() {
  const queue = await getSyncQueue();
  const items = queue.filter((i) => i.entity === 'cliente' && (!i.status || i.status === 'pending' || i.status === 'processing'));
  for (const item of items) {
    const claimed = await claimSyncQueueItem(item.id, 'cliente_sync');
    if (!claimed) continue;

    try {
      if (claimed.type === 'CREATE') await mockApi.createCliente(claimed.payload);
      else if (claimed.type === 'UPDATE') await mockApi.updateCliente(claimed.entity_id, claimed.payload);
      else if (claimed.type === 'DEACTIVATE') await mockApi.discontinueCliente(claimed.entity_id);
      else throw new Error(`Operacion de cola no soportada para clientes: ${claimed.type}`);
      await updateClienteSyncStatus(claimed.entity_id, 'synced');
      await removeSyncQueueItem(claimed.id);
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'cliente',
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
      await updateClienteSyncStatus(claimed.entity_id, nextStatus);
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'cliente',
        status: nextStatus,
        source: 'sync_queue',
        error: errorMsg,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
      });
      console.warn('[Sync][Cliente] Error en cola de sincronizacion', {
        entity_id: claimed.entity_id,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
        exhausted,
        error: errorMsg,
      });
    }
  }
}