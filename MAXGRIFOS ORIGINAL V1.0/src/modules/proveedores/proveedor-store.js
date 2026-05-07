import {
  saveProveedor,
  getProveedor,
  getAllProveedores,
  saveWithOutbox,
} from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';

export { getAllProveedores };

export async function nitProveedorExists(nit, excludeId = null) {
  const all = await getAllProveedores();
  return all.some((p) => p.nit === String(nit).trim() && p.id !== excludeId);
}

export async function createProveedor(data, options = {}) {
  if (!options.__fromHandler) {
    throw new Error('STORE_ACCESS_DENIED: createProveedor requiere __fromHandler.');
  }

  const normalizedNit = String(data.nit ?? '').trim();
  const identityKey = `PROV:${normalizedNit}`;

  const dup = await nitProveedorExists(normalizedNit);
  if (dup) throw new Error(`NIT ${normalizedNit} ya registrado.`);

  const now = new Date().toISOString();
  const proveedor = {
    id: identityKey,
    identity_key: identityKey,
    razon_social: String(data.razon_social ?? '').toUpperCase(),
    nombre_establecimiento: String(data.nombre_establecimiento ?? '').toUpperCase(),
    nit: normalizedNit,
    dv: data.dv ?? '',
    ciudad: String(data.ciudad ?? '').toUpperCase(),
    direccion: data.direccion ?? '',
    telefono: data.telefono ?? '',
    celular: data.celular ?? '',
    contacto: data.contacto ?? '',
    asesor: String(data.asesor ?? '').toUpperCase(),
    descuento: parseFloat(data.descuento) || 0,
    forma_pago: data.forma_pago ?? 'CONTADO',
    cuenta_bancaria: data.cuenta_bancaria ?? '',
    created_at: now,
    updated_at: now,
    created_by: 'local',
    updated_by: 'local',
    version: 1,
    status: 'active',
    sync_status: navigator.onLine ? 'pending' : 'offline',
    idempotency_key: identityKey,
  };

  await saveWithOutbox('proveedores', proveedor, {
    type: 'CREATE', entity: 'proveedor', entity_id: proveedor.id, payload: proveedor,
    idempotency_key: `OUTBOX:proveedores:${proveedor.id}:CREATE`,
  });
  eventBus.emit(Events.PROVEEDOR_CREADO, { proveedor });
  return proveedor;
}

export async function updateProveedor(id, data, options = {}) {
  if (!options.__fromHandler) {
    throw new Error('STORE_ACCESS_DENIED: updateProveedor requiere __fromHandler.');
  }

  const existing = await getProveedor(id);
  if (!existing) throw new Error('Proveedor no encontrado');

  const updated = {
    ...existing,
    razon_social: data.razon_social != null ? String(data.razon_social).toUpperCase() : existing.razon_social,
    nombre_establecimiento: data.nombre_establecimiento != null ? String(data.nombre_establecimiento).toUpperCase() : existing.nombre_establecimiento,
    dv: data.dv ?? existing.dv,
    ciudad: data.ciudad != null ? String(data.ciudad).toUpperCase() : existing.ciudad,
    direccion: data.direccion ?? existing.direccion,
    telefono: data.telefono ?? existing.telefono,
    celular: data.celular ?? existing.celular,
    contacto: data.contacto ?? existing.contacto,
    asesor: data.asesor != null ? String(data.asesor).toUpperCase() : existing.asesor,
    descuento: data.descuento != null ? (parseFloat(data.descuento) || 0) : existing.descuento,
    forma_pago: data.forma_pago ?? existing.forma_pago,
    cuenta_bancaria: data.cuenta_bancaria ?? existing.cuenta_bancaria,
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: Number(existing.version ?? 0) + 1,
    sync_status: 'pending',
  };

  await saveWithOutbox('proveedores', updated, {
    type: 'UPDATE', entity: 'proveedor', entity_id: id, payload: updated,
    idempotency_key: `OUTBOX:proveedores:${id}:UPDATE:${updated.version}`,
  });
  eventBus.emit(Events.PROVEEDOR_ACTUALIZADO, { proveedor: updated });
  return updated;
}

export async function deactivateProveedor(id, options = {}) {
  if (!options.__fromHandler) {
    throw new Error('STORE_ACCESS_DENIED: deactivateProveedor requiere __fromHandler.');
  }

  const existing = await getProveedor(id);
  if (!existing) throw new Error('Proveedor no encontrado');
  if (existing.status === 'inactive') throw new Error('El proveedor ya está inactivo');

  const updated = {
    ...existing,
    status: 'inactive',
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: Number(existing.version ?? 0) + 1,
    sync_status: 'pending',
  };

  await saveWithOutbox('proveedores', updated, {
    type: 'DEACTIVATE', entity: 'proveedor', entity_id: id, payload: { id },
    idempotency_key: `OUTBOX:proveedores:${id}:DEACTIVATE:${updated.version}`,
  });
  eventBus.emit(Events.PROVEEDOR_DESACTIVADO, { proveedor: updated });
  return updated;
}

export async function activateProveedor(id, options = {}) {
  if (!options.__fromHandler) {
    throw new Error('STORE_ACCESS_DENIED: activateProveedor requiere __fromHandler.');
  }

  const existing = await getProveedor(id);
  if (!existing) throw new Error('Proveedor no encontrado');
  if (existing.status === 'active') throw new Error('El proveedor ya está activo');

  const updated = {
    ...existing,
    status: 'active',
    updated_at: new Date().toISOString(),
    updated_by: 'local',
    version: Number(existing.version ?? 0) + 1,
    sync_status: 'pending',
  };

  await saveWithOutbox('proveedores', updated, {
    type: 'UPDATE', entity: 'proveedor', entity_id: id, payload: updated,
    idempotency_key: `OUTBOX:proveedores:${id}:ACTIVATE:${updated.version}`,
  });
  eventBus.emit(Events.PROVEEDOR_ACTIVADO, { proveedor: updated });
  return updated;
}
