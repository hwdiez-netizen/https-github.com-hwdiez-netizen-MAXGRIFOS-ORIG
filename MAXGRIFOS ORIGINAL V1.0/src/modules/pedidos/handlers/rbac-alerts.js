// Detección de patrones de violación RBAC — alerta inmediata por acción crítica
// y alerta por denegaciones repetidas dentro de una ventana de tiempo.

const CRITICAL_ACTIONS = ['anularPedido'];
const DENY_THRESHOLD = 3;
const WINDOW_MS = 60_000;

const _recentDenies = new Map();

function _fireAlert(alert) {
  console.warn(
    `[RBAC ALERT] type=${alert.type} user=${alert.user ?? '?'} role=${alert.role ?? '?'} action=${alert.action} count=${alert.count ?? 1}`,
  );
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rbac-alert', { detail: alert }));
  }
}

export const rbacAlerts = {
  onAuditEntry(record) {
    if (record.result !== 'DENY') return;

    // Alerta inmediata para acciones críticas — cualquier DENY es sospechoso
    if (CRITICAL_ACTIONS.includes(record.action)) {
      _fireAlert({
        type: 'CRITICAL_DENY',
        user: record.user,
        role: record.role,
        action: record.action,
        count: 1,
        timestamp: record.timestamp,
      });
    }

    // Detección de denegaciones repetidas para cualquier acción
    const key = `${record.user ?? 'anon'}|${record.role ?? 'none'}`;
    const now = Date.now();
    if (!_recentDenies.has(key)) _recentDenies.set(key, []);
    const entries = _recentDenies.get(key);
    entries.push(now);
    const cutoff = now - WINDOW_MS;
    while (entries.length && entries[0] < cutoff) entries.shift();

    if (entries.length >= DENY_THRESHOLD) {
      _fireAlert({
        type: 'REPEATED_DENY',
        user: record.user,
        role: record.role,
        action: record.action,
        count: entries.length,
        window_ms: WINDOW_MS,
        timestamp: record.timestamp,
      });
      // Reset para no generar tormenta de alertas por el mismo usuario
      _recentDenies.set(key, []);
    }
  },
};
