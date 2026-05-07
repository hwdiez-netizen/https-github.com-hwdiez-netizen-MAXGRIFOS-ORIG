/**
 * Module Entry Contract
 * Valida la intención de entrada a un módulo.
 * 
 * Basado en NIS 2.0 Hardening:
 * - Valida estructura de entrada.
 * - No ejecuta lógica de negocio.
 * - Idempotencia requerida.
 */

export const validateModuleEntry = (intent) => {
  const issues = [];
  
  if (!intent) {
    return { ok: false, code: 'MISSING_INTENT', message: 'Intento de entrada nulo' };
  }

  // 1. Validar Identidad del Módulo
  if (!intent.moduleId) {
    issues.push('moduleId is required');
  }

  // 2. Validar Ruta
  if (!intent.route) {
    issues.push('route is required');
  }

  // 3. Validar Idempotencia
  if (!intent.idempotency_key) {
    issues.push('idempotency_key is required for audit');
  }

  // 4. Validar Origen
  if (!intent.source) {
    issues.push('source is required for tracking');
  }

  const ok = issues.length === 0;

  return {
    ok,
    code: ok ? 'VALID_ENTRY' : 'INVALID_ENTRY',
    message: ok ? 'Entrada validada correctamente' : 'Errores de validación detectados',
    issues,
    normalized: ok ? {
      moduleId: intent.moduleId,
      route: intent.route,
      idempotency_key: intent.idempotency_key,
      source: intent.source,
      audit_marker: 'MODULE_ENTRY_CONTRACT_V1',
      metadata: intent.metadata || {}
    } : null
  };
};
