// P9 ENFORCEMENT PROGRESIVO — Auditoría escalada por entorno
// DEV: console.warn | QA: warn + contador | PROD: bloqueo selectivo de acciones críticas

const ENVIRONMENTS = {
  dev: 'development',
  qa: 'qa',
  prod: 'production',
};

const CRITICAL_ACTIONS = [
  'createMovimiento',
  'crearPedido',
  'recibirCompra',
];

class EnforcementProgressive {
  constructor() {
    this._env = this._detectEnvironment();
    this._qaViolationCounter = {};
    this._blockListProd = new Set(CRITICAL_ACTIONS);
  }

  _detectEnvironment() {
    // Detecta entorno desde:
    // 1. window.__MAXGRIFOS_FLAGS__.environment (injected en runtime)
    // 2. location.hostname (local vs vercel vs prod)
    // 3. default: dev si no se puede determinar

    if (typeof window !== 'undefined' && window.__MAXGRIFOS_FLAGS__?.environment) {
      return window.__MAXGRIFOS_FLAGS__.environment;
    }

    if (typeof location !== 'undefined') {
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        return ENVIRONMENTS.dev;
      }
      if (location.hostname.includes('qa') || location.hostname.includes('staging')) {
        return ENVIRONMENTS.qa;
      }
      if (location.hostname.includes('maxgrifos') && !location.hostname.includes('dev')) {
        return ENVIRONMENTS.prod;
      }
    }

    return ENVIRONMENTS.dev; // fallback seguro
  }

  enforce(actionName, context = {}) {
    const {
      module = 'unknown',
      entity_id = null,
      fromHandler = false,
    } = context;

    // Si viene de handler (arquitectura correcta), no hacer nada
    if (fromHandler) {
      return { allowed: true };
    }

    const isCritical = this._blockListProd.has(actionName);
    const ts = new Date().toISOString();
    const record = {
      ts,
      action: actionName,
      module,
      entity_id,
      env: this._env,
      isCritical,
    };

    // DEV: solo warn visible en consola
    if (this._env === ENVIRONMENTS.dev) {
      console.warn(
        `[AUDIT][DEV] VIOLATION: action=${actionName} module=${module} id=${entity_id ?? 'null'}`
      );
      return { allowed: true };
    }

    // QA: warn + contador en memoria
    if (this._env === ENVIRONMENTS.qa) {
      const key = `${module}:${actionName}`;
      this._qaViolationCounter[key] = (this._qaViolationCounter[key] || 0) + 1;
      console.warn(
        `[AUDIT][QA] VIOLATION #${this._qaViolationCounter[key]}: action=${actionName} module=${module} id=${entity_id ?? 'null'}`
      );
      return { allowed: true };
    }

    // PROD: bloquear SOLO acciones críticas
    if (this._env === ENVIRONMENTS.prod) {
      if (isCritical) {
        const error = new Error(
          `CRÍTICA: ${actionName} llamada sin handler autorizado. Violación de arquitectura en ${module}.`
        );
        error.name = 'ArchitectureViolation';
        throw error;
      }
      // No crítica en PROD: solo warn visible
      console.warn(
        `[AUDIT][PROD] VIOLATION: action=${actionName} module=${module} id=${entity_id ?? 'null'}`
      );
      return { allowed: true };
    }

    return { allowed: true };
  }

  getQAStats() {
    return { ...this._qaViolationCounter };
  }

  resetQAStats() {
    this._qaViolationCounter = {};
  }

  getEnvironment() {
    return this._env;
  }

  isCriticalAction(actionName) {
    return this._blockListProd.has(actionName);
  }

  addCriticalAction(actionName) {
    this._blockListProd.add(actionName);
  }

  removeCriticalAction(actionName) {
    this._blockListProd.delete(actionName);
  }
}

// Singleton global
if (!window.__MAXGRIFOS_ENFORCEMENT) {
  window.__MAXGRIFOS_ENFORCEMENT = new EnforcementProgressive();
}

export const enforcement = window.__MAXGRIFOS_ENFORCEMENT;
