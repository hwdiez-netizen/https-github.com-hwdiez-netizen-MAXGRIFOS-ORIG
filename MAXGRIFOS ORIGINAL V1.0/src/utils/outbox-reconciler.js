/**
 * OVERLAY — outbox-reconciler.js
 * Constitución V1.3 §4 Outbox + Principios Fundacionales Offline-first.
 *
 * Healer: detecta registros IDB con sync_status='pending' que NO están en
 * sync_queue (resultado de crash entre save y addToSyncQueue en stores legacy)
 * y los re-encola de forma idempotente.
 *
 * Activado por: window.__MAXGRIFOS_FLAGS__.outbox_reconciler_enabled = true
 * Se ejecuta: al iniciar, al reconectar, cada 5 min en segundo plano.
 * LEGACY INTACTO: no modifica cliente-store, pedido-store ni factura-store.
 */
import {
  getAllClientes,
  getAllPedidos,
  getAllDocumentos,
  getSyncQueue,
  addToSyncQueue,
} from '../db/local-db.js';

const ENTITY_CONFIG = [
  { store: 'clientes',   entity: 'cliente',   getFn: getAllClientes,   type: 'UPDATE' },
  { store: 'pedidos',    entity: 'pedido',    getFn: getAllPedidos,    type: 'UPDATE' },
  { store: 'documentos', entity: 'documento', getFn: getAllDocumentos, type: 'UPDATE' },
];

let _reconcileTimer = null;

export async function reconcileOutbox() {
  const flags = window.__MAXGRIFOS_FLAGS__ ?? {};
  if (!flags.outbox_reconciler_enabled) return;

  try {
    const queue = await getSyncQueue();
    const queuedIds = new Set(queue.map((q) => q.entity_id).filter(Boolean));
    let healed = 0;

    for (const { entity, getFn, type } of ENTITY_CONFIG) {
      const records = await getFn();
      for (const record of records) {
        if (record.sync_status !== 'pending') continue;
        if (queuedIds.has(record.id)) continue;

        // Registro huérfano: en IDB con pending pero NO en sync_queue.
        const idemKey = `RECONCILE:${entity}:${record.id}`;
        const alreadyQueued = queue.some((q) => q.idempotency_key === idemKey);
        if (alreadyQueued) continue;

        await addToSyncQueue({
          type,
          entity,
          entity_id: record.id,
          payload: record,
          created_at: new Date().toISOString(),
          idempotency_key: idemKey,
          reconciled: true,
        });
        healed++;
      }
    }

    if (healed > 0) {
      console.info(`[OutboxReconciler] ${healed} registros huérfanos re-encolados.`);
    }
  } catch (err) {
    console.warn('[OutboxReconciler] Error durante reconciliación:', err?.message ?? err);
  }
}

export function startOutboxReconcilerLoop(intervalMs = 5 * 60 * 1000) {
  const flags = window.__MAXGRIFOS_FLAGS__ ?? {};
  if (!flags.outbox_reconciler_enabled) return;

  if (_reconcileTimer) clearInterval(_reconcileTimer);
  _reconcileTimer = setInterval(() => reconcileOutbox(), intervalMs);

  window.addEventListener('online', () => reconcileOutbox(), { passive: true });
  console.info('[OutboxReconciler] Loop activo — reconcilia cada 5 min y al reconectar (overlay v13).');
}
