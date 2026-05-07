/**
 * Process Guard — NIS 2.0
 * Bloquea navegación visual cuando existe proceso incompleto.
 * No ejecuta transacciones.
 */

const DEFAULT_BLOCK_MESSAGE = 'Finaliza, guarda o cancela el proceso antes de salir.';

class ProcessGuard {
  constructor() {
    this.dirtyScopes = new Map();
  }

  markDirty(scope = 'global', reason = DEFAULT_BLOCK_MESSAGE) {
    this.dirtyScopes.set(scope, {
      scope,
      reason: reason || DEFAULT_BLOCK_MESSAGE,
      markedAt: new Date().toISOString()
    });

    console.debug(`[ProcessGuard] Dirty scope: ${scope}`);
  }

  clearDirty(scope = 'global') {
    this.dirtyScopes.delete(scope);
    console.debug(`[ProcessGuard] Cleared scope: ${scope}`);
  }

  clearAll() {
    this.dirtyScopes.clear();
    console.debug('[ProcessGuard] Cleared all dirty scopes');
  }

  isDirty() {
    return this.dirtyScopes.size > 0;
  }

  getDirtyReason() {
    const firstDirty = this.dirtyScopes.values().next().value;
    return firstDirty?.reason || DEFAULT_BLOCK_MESSAGE;
  }

  canNavigate() {
    return !this.isDirty();
  }

  blockNavigationMessage() {
    return this.getDirtyReason();
  }

  getErrorMessage() {
    return this.blockNavigationMessage();
  }

  set(processName = 'global') {
    this.markDirty(processName, DEFAULT_BLOCK_MESSAGE);
  }

  clear(processName = 'global') {
    this.clearDirty(processName);
  }

  snapshot() {
    return {
      dirty: this.isDirty(),
      scopes: Array.from(this.dirtyScopes.values())
    };
  }
}

export const processGuard = new ProcessGuard();
export default processGuard;
