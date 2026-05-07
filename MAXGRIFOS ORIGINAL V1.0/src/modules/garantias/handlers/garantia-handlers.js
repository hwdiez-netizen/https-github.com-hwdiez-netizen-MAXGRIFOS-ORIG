import { checkEnterprisePermiso, resolveEnterpriseCtx } from '../../../handlers/rbac-enterprise.js';
import { logRbacAction } from '../../../handlers/rbac-audit.js';
import { updateEstadoGarantia as _updateEstadoGarantia } from '../garantia-store.js';
import { registrarGarantia as _registrarGarantia, descargarGarantiasPorNC as _descargarGarantiasPorNC } from '../../kardex/kardex-store.js';

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

export async function handleTransicionarGarantia(id, nuevoEstado, meta = {}, ctx) {
  _audit('transicionarGarantia', ctx);
  if (!id || !String(id).trim()) throw new Error('ID de garantia requerido');
  if (!nuevoEstado || !String(nuevoEstado).trim()) throw new Error('Estado de garantia requerido');
  return await _updateEstadoGarantia(id, nuevoEstado, meta);
}

export async function handleRegistrarGarantia(data, ctx) {
  _audit('registrarGarantia', ctx);
  return await _registrarGarantia(data);
}

export async function handleRegistrarNcGarantia(data, ctx) {
  _audit('registrarNcGarantia', ctx);
  return await _descargarGarantiasPorNC(data);
}
