/**
 * Store Guard - Protección constitucional contra escrituras directas
 */

class StoreGuard {
  /**
   * Valida si el origen de la escritura es un Handler autorizado
   */
  isAuthorized(metadata = {}) {
    // En V2, toda escritura DEBE venir con la bandera __fromHandler
    if (metadata.__fromHandler) return true;
    
    console.warn('[StoreGuard] Unauthorized write attempt. Must use a Handler.');
    return false; // Cambiar a false una vez migrados los módulos
  }
}

export const storeGuard = new StoreGuard();
export default storeGuard;
