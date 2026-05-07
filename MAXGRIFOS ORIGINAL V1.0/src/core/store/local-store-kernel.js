/**
 * Local Store Kernel - Fachada unificada para IndexedDB
 */
import { storeGuard } from './store-guard.js';

export class LocalStoreKernel {
  constructor(dbName = 'maxgrifos_v2_db') {
    this.dbName = dbName;
    this.db = null;
  }

  async init() {
    // Placeholder para inicialización de IndexedDB
    console.debug(`[LocalStore] Initialized: ${this.dbName}`);
  }

  /**
   * Obtener datos (Siempre permitido)
   */
  async get(store, key) {
    console.debug(`[LocalStore] GET from ${store}:${key}`);
    return null; // Stub
  }

  /**
   * Guardar datos (Protegido por Guard)
   */
  async put(store, data, metadata = {}) {
    if (!storeGuard.isAuthorized(metadata)) {
      throw new Error(`Write to ${store} rejected: Must use a Handler`);
    }
    console.debug(`[LocalStore] PUT to ${store}`, data);
    return true; // Stub
  }
}

export const localStoreKernel = new LocalStoreKernel();
export default localStoreKernel;
