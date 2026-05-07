// Singleton de auditoría RBAC — buffer en memoria + persistencia IDB + observabilidad
import { saveRbacAuditEntry } from '../../../db/local-db.js';
import { rbacAlerts } from './rbac-alerts.js';

const _entries = [];
const MAX = 500;
let _obs = null;

export const rbacAuditLog = {
  connectTo(observabilityInstance) {
    _obs = observabilityInstance;
  },

  logAction(entry) {
    const record = { id: crypto.randomUUID(), ...entry };

    // Buffer en memoria (siempre disponible, incluye pre-initDB)
    _entries.push(record);
    if (_entries.length > MAX) _entries.shift();

    // Consola estructurada
    console.log(
      `[RBAC] ${record.result} user=${record.user ?? '?'} role=${record.role ?? '?'} action=${record.action} ts=${record.timestamp}`,
    );

    // Persistencia IDB — fire-and-forget (no bloquea el handler)
    saveRbacAuditEntry(record).catch((err) =>
      console.warn('[RBAC] error persistiendo entrada de auditoría:', err?.message ?? err),
    );

    // Observabilidad en memoria (si ya está conectada)
    _obs?.hookAction?.(record);

    // Detección de patrones de violación — fire-and-forget
    rbacAlerts.onAuditEntry(record);
  },

  getRecentActions(limit = 50) {
    return _entries.slice(-limit);
  },
};
