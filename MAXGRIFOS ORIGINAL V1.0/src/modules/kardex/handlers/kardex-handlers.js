/**
 * HANDLERS — Capa centralizada de entrada de acciones de Kardex/Bodega
 * Rol: validar contract, llamar store, NO contiene lógica nueva
 */

import {
  createBodegaSatelite as _createBodegaSatelite,
  updateBodegaSatelite as _updateBodegaSatelite,
  deactivateBodegaSatelite as _deactivateBodegaSatelite,
} from '../bodega-store.js';
import {
  createMovimiento as _createMovimiento,
  registrarGarantia as _registrarGarantia,
  descargarGarantiasPorNC as _descargarGarantiasPorNC,
} from '../kardex-store.js';
import { checkEnterprisePermiso, resolveEnterpriseCtx } from '../../../handlers/rbac-enterprise.js';
import { logRbacAction } from '../../../handlers/rbac-audit.js';

function _audit(action, ctx) {
  const effectiveCtx = resolveEnterpriseCtx(ctx);
  const base = {
    user: effectiveCtx?.user ?? null,
    role: effectiveCtx?.role ?? null,
    action,
  };

  try {
    checkEnterprisePermiso(action, effectiveCtx);
    logRbacAction({ ...base, result: 'ALLOW' });
  } catch (error) {
    logRbacAction({ ...base, result: 'DENY' });
    throw error;
  }
}

/**
 * handleCrearBodega
 * Capa de entrada para crear bodega satélite
 * @param {Object} data - datos de bodega (nombre, ubicacion, sistema)
 * @returns {Promise<Object>} bodega creada
 */
export async function handleCrearBodega(data) {
  // Validación de contract
  if (!data) {
    throw new Error('Datos de bodega requeridos');
  }
  if (!data.nombre || !String(data.nombre).trim()) {
    throw new Error('Nombre de bodega es obligatorio');
  }
  if (!data.ubicacion || !String(data.ubicacion).trim()) {
    throw new Error('Ubicación es obligatoria');
  }

  // Llamar store existente — SIN lógica nueva
  return await _createBodegaSatelite(data);
}

/**
 * handleActualizarBodega
 * Capa de entrada para actualizar bodega
 * @param {string} bodegaId - ID de bodega
 * @param {Object} data - datos a actualizar
 * @returns {Promise<Object>} bodega actualizada
 */
export async function handleActualizarBodega(bodegaId, data) {
  // Validación de contract
  if (!bodegaId || !String(bodegaId).trim()) {
    throw new Error('ID de bodega requerido');
  }
  if (!data) {
    throw new Error('Datos de actualización requeridos');
  }

  // Llamar store existente — SIN lógica nueva
  return await _updateBodegaSatelite(bodegaId, data);
}

/**
 * handleDesactivarBodega
 * Capa de entrada para desactivar bodega
 * @param {string} bodegaId - ID de bodega
 * @returns {Promise<Object>} bodega desactivada
 */
export async function handleDesactivarBodega(bodegaId) {
  // Validación de contract
  if (!bodegaId || !String(bodegaId).trim()) {
    throw new Error('ID de bodega requerido');
  }

  // Llamar store existente — SIN lógica nueva
  return await _deactivateBodegaSatelite(bodegaId);
}

export async function handleCrearMovimientoKardex(data, ctx) {
  _audit('crearMovimientoKardex', ctx);
  return await _createMovimiento(data, { __fromHandler: true });
}

export async function handleRegistrarGarantiaKardex(data, ctx) {
  _audit('registrarGarantiaKardex', ctx);
  return await _registrarGarantia(data);
}

export async function handleRegistrarNcGarantiaKardex(data, ctx) {
  _audit('registrarNcGarantiaKardex', ctx);
  return await _descargarGarantiasPorNC(data);
}
