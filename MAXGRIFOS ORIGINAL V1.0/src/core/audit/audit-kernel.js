/**
 * Audit Kernel - Registro de trazabilidad inmutable V2
 */

export class AuditKernel {
  constructor() {
    this.ledger = [];
  }

  async log(entry) {
    const auditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: entry.type || 'UNKNOWN',
      action: entry.action || 'NOP',
      payload: entry.payload || {},
      user: entry.user || 'system'
    };
    
    this.ledger.push(auditEntry);
    console.debug(`[Audit] Entry added: ${auditEntry.id}`, auditEntry);
    
    // En V2 esto persistirá en un store dedicado de auditoría
  }
}

export const auditKernel = new AuditKernel();
export default auditKernel;
