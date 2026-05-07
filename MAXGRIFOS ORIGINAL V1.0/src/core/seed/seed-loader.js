/**
 * Seed Loader - Cargador determinístico de datos maestros
 */
import { SEED_CONFIG } from './seed-flags.js';
import { SEED_DATA } from '../../mock/maxgrifos-seed-data.js';
import { SeedValidator } from './seed-validator.js';

export class SeedLoader {
  async load() {
    if (!SEED_CONFIG.ENABLED) {
      console.debug('[SeedLoader] Disabled by config');
      return;
    }
    
    console.debug('[SeedLoader] Validating seed data...');
    const result = SeedValidator.validate(SEED_DATA);
    if (!result.valid) {
      console.error('[SeedLoader] Invalid seed data detected:', result.findings);
      return;
    }

    console.debug('[SeedLoader] Loading deterministic seed data into memory...');
    
    // REGLAS ESTRICTAS DE SEGURIDAD (SMARTPHONE LAN PREPARE):
    // 0. POLÍTICA DE VALIDACIÓN: Toda iteración de validación debe entregar data demo automática suficiente para validar el módulo afectado.
    // 1. NUNCA llamar a clearTestData().
    // 2. NUNCA limpiar IndexedDB.
    // 3. NUNCA borrar el outbox (sync_queue).
    // 4. Todo registro debe verificar idempotency_key o identity_key para NO DUPLICAR.
    
    // En el futuro esto persistirá en LocalStoreKernel usando un Handler con las reglas anteriores.
    return SEED_DATA;
  }
}

export const seedLoader = new SeedLoader();
export default seedLoader;
