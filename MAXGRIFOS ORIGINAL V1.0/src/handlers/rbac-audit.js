import { saveRbacAuditEntry } from '../db/local-db.js';

export function logRbacAction(entry) {
  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  console.log(
    `[RBAC] ${record.result} user=${record.user ?? '?'} role=${record.role ?? '?'} action=${record.action} ts=${record.timestamp}`,
  );

  saveRbacAuditEntry(record).catch((err) => {
    console.warn('[RBAC] error persistiendo entrada de auditoria:', err?.message ?? err);
  });

  return record;
}
