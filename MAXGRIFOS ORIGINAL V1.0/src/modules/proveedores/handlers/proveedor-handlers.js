/**
 * HANDLERS — Capa centralizada de entrada de acciones de Proveedores
 * Rol: validar RBAC, contract, llamar store, NO contiene lógica nueva
 */

import { Contracts } from '../../../contracts/index.js';
import { checkEnterprisePermiso, resolveEnterpriseCtx } from '../../../handlers/rbac-enterprise.js';
import { logRbacAction } from '../../../handlers/rbac-audit.js';
import {
  createProveedor as _createProveedor,
  updateProveedor as _updateProveedor,
  deactivateProveedor as _deactivateProveedor,
  activateProveedor as _activateProveedor,
  nitProveedorExists,
} from '../proveedor-store.js';

function _audit(accion, ctx) {
  const effectiveCtx = resolveEnterpriseCtx(ctx);
  const base = { user: effectiveCtx?.user ?? null, role: effectiveCtx?.role ?? null, action: accion };
  try {
    checkEnterprisePermiso(accion, effectiveCtx);
    logRbacAction({ ...base, result: 'ALLOW' });
  } catch (error) {
    logRbacAction({ ...base, result: 'DENY' });
    throw error;
  }
}

export async function handleCrearProveedor(data, ctx) {
  _audit('crearProveedor', ctx);
  Contracts.validateCrearProveedor(data);

  const dup = await nitProveedorExists(data.nit);
  if (dup) throw new Error(`NIT ${data.nit} ya registrado. No es posible crear duplicados.`);

  return await _createProveedor(data, { __fromHandler: true });
}

export async function handleActualizarProveedor(proveedorId, data, ctx) {
  _audit('editarProveedor', ctx);
  Contracts.validateActualizarProveedor(proveedorId, data);
  return await _updateProveedor(proveedorId, data, { __fromHandler: true });
}

export async function handleDesactivarProveedor(proveedorId, ctx) {
  _audit('desactivarProveedor', ctx);
  Contracts.validateDesactivarProveedor(proveedorId);
  return await _deactivateProveedor(proveedorId, { __fromHandler: true });
}

export async function handleActivarProveedor(proveedorId, ctx) {
  _audit('activarProveedor', ctx);
  Contracts.validateActivarProveedor(proveedorId);
  return await _activateProveedor(proveedorId, { __fromHandler: true });
}
