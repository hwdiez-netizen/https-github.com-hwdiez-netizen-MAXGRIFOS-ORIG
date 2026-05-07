/**
 * HANDLERS � Capa centralizada de entrada de acciones de Clientes
 * Rol: validar RBAC, contract, llamar store, NO contiene l�gica nueva
 */

import { Contracts } from '../../../contracts/index.js';
import { checkEnterprisePermiso, resolveEnterpriseCtx } from '../../../handlers/rbac-enterprise.js';
import { logRbacAction } from '../../../handlers/rbac-audit.js';
import {
  createCliente as _createCliente,
  updateCliente as _updateCliente,
  deactivateCliente as _deactivateCliente,
  activateCliente as _activateCliente,
  cedulaExists,
  nitExists,
} from '../cliente-store.js';

function _audit(accion, ctx) {
  const effectiveCtx = resolveEnterpriseCtx(ctx);
  const base = {
    user: effectiveCtx?.user ?? null,
    role: effectiveCtx?.role ?? null,
    action: accion,
  };

  try {
    checkEnterprisePermiso(accion, effectiveCtx);
    logRbacAction({ ...base, result: 'ALLOW' });
  } catch (error) {
    logRbacAction({ ...base, result: 'DENY' });
    throw error;
  }
}

export async function handleCreateCliente(data, ctx) {
  _audit('crearCliente', ctx);
  Contracts.validateCreateCliente(data);

  if (data.cedula) {
    const cedDup = await cedulaExists(data.cedula);
    if (cedDup) {
      throw new Error(`?? Registro duplicado: La c�dula "${data.cedula}" ya existe en el sistema.`);
    }
  }
  if (data.nit) {
    const nitDup = await nitExists(data.nit);
    if (nitDup) {
      throw new Error(`?? Registro duplicado: El NIT "${data.nit}" ya existe en el sistema.`);
    }
  }

  return await _createCliente(data, { __fromHandler: true });
}

export async function handleUpdateCliente(clienteId, data, ctx) {
  _audit('editarCliente', ctx);
  Contracts.validateUpdateCliente(clienteId, data);

  if (data.cedula) {
    const cedDup = await cedulaExists(data.cedula, clienteId);
    if (cedDup) {
      throw new Error(`?? Registro duplicado: La c�dula "${data.cedula}" ya existe en el sistema.`);
    }
  }
  if (data.nit) {
    const nitDup = await nitExists(data.nit, clienteId);
    if (nitDup) {
      throw new Error(`?? Registro duplicado: El NIT "${data.nit}" ya existe en el sistema.`);
    }
  }

  return await _updateCliente(clienteId, data, { __fromHandler: true });
}

export async function handleDeactivateCliente(clienteId, ctx) {
  _audit('desactivarCliente', ctx);
  if (!clienteId || !String(clienteId).trim()) {
    throw new Error('ID de cliente requerido');
  }

  return await _deactivateCliente(clienteId, { __fromHandler: true });
}

export async function handleActivateCliente(clienteId, ctx) {
  _audit('activarCliente', ctx);
  if (!clienteId || !String(clienteId).trim()) {
    throw new Error('ID de cliente requerido');
  }

  return await _activateCliente(clienteId, { __fromHandler: true });
}
