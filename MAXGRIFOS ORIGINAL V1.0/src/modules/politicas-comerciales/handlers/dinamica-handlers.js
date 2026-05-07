import { checkEnterprisePermiso, resolveEnterpriseCtx } from '../../../handlers/rbac-enterprise.js';
import { logRbacAction } from '../../../handlers/rbac-audit.js';
import { activarDinamica as _activarDinamica, desactivarDinamica as _desactivarDinamica } from '../dinamica-store.js';

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

export async function handleActivarDinamicaComercial(id, ctx) {
  _audit('activarDinamicaComercial', ctx);
  return await _activarDinamica(id);
}

export async function handleDesactivarDinamicaComercial(id, ctx) {
  _audit('desactivarDinamicaComercial', ctx);
  return await _desactivarDinamica(id);
}
