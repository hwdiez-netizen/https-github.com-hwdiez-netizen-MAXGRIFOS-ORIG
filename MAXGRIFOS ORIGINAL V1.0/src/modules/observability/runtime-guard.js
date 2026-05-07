// P8 RUNTIME GUARD — Detecta llamadas a store sin handler
// Solo REGISTRA, NO bloquea. Anti-alucinacion obligatoria.

class RuntimeGuard {
  constructor(options = {}) {
    this._violations = []; // FIFO, max 500
    this._maxViolations = options.maxViolations || 500;
    this._statsAccum = {
      total_violations: 0,
      by_module: {},
      by_action: {},
    };
  }

  report(violation) {
    const {
      type = 'STORE_VIOLATION',
      module = 'unknown',
      action = 'unknown',
      entity_id = null,
      key = null,
    } = violation;

    const ts = new Date().toISOString();
    const record = {
      ts,
      type,
      module,
      action,
      entity_id,
      key,
    };

    // FIFO: si está lleno, elimina el más antiguo
    if (this._violations.length >= this._maxViolations) {
      this._violations.shift();
    }
    this._violations.push(record);

    // Stats
    this._statsAccum.total_violations++;
    this._statsAccum.by_module[module] = (this._statsAccum.by_module[module] || 0) + 1;
    this._statsAccum.by_action[action] = (this._statsAccum.by_action[action] || 0) + 1;

    // Console warning
    console.warn(
      `[AUDIT][store] mod=${module} act=${action} id=${entity_id ?? 'null'} key=${key ?? 'null'}`
    );
  }

  getViolations(limit = 50) {
    const n = Math.min(limit, this._violations.length);
    return this._violations.slice(-n).reverse(); // más recientes primero
  }

  getStats() {
    return {
      total: this._statsAccum.total_violations,
      by_module: { ...this._statsAccum.by_module },
      by_action: { ...this._statsAccum.by_action },
    };
  }

  clear() {
    this._violations = [];
    this._statsAccum = {
      total_violations: 0,
      by_module: {},
      by_action: {},
    };
  }
}

// Singleton global
if (!window.__MAXGRIFOS_RUNTIME_GUARD) {
  window.__MAXGRIFOS_RUNTIME_GUARD = new RuntimeGuard();
}

export const runtimeGuard = window.__MAXGRIFOS_RUNTIME_GUARD;
