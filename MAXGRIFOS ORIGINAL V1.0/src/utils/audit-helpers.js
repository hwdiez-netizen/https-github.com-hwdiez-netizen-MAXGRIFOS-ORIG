/**
 * AUDIT HELPERS — window.__MAXGRIFOS_AUDIT__
 * Constitución V1.3 — Auditoría Fase 1 R2 (F1R2-BLOCKER-003/004)
 *
 * Expone métodos de prueba ejecutables desde DevTools console en producción.
 * ESM imports directos no funcionan en Vercel SPA — estos helpers usan el bundle.
 *
 * Activado por: window.__MAXGRIFOS_FLAGS__.audit_helpers_enabled = true
 *
 * USO EN CONSOLA (https://maxgrifos-prototypes.vercel.app/):
 *   await window.__MAXGRIFOS_AUDIT__.testDurableBeforeDispatch()
 *   await window.__MAXGRIFOS_AUDIT__.testDispatchAbortOnPersistFail()
 *   await window.__MAXGRIFOS_AUDIT__.testOutboxIdempotency()
 */
import { eventBus } from '../events/domain-events.js';
import { saveWithOutbox, getSyncQueue, getRecentEvents } from '../db/local-db.js';

export function initAuditHelpers() {
  const flags = window.__MAXGRIFOS_FLAGS__ ?? {};
  if (!flags.audit_helpers_enabled) return;

  window.__MAXGRIFOS_AUDIT__ = {

    /**
     * TEST 1 — Durable-before-dispatch
     * Demuestra que event_store contiene el evento ANTES de que el handler ejecute.
     * El handler verifica IDB en tiempo real y retorna si encontró el evento.
     *
     * RESULTADO ESPERADO:
     *   { eventId: "uuid", foundInStoreWhenHandlerRan: true, passed: true }
     */
    testDurableBeforeDispatch: async () => {
      let capturedEventId = null;
      let foundInStore = false;

      const result = await new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout: handler never fired')), 5000);

        const off = eventBus.on('__AuditDurability__', async ({ event_id }) => {
          capturedEventId = event_id;
          try {
            const events = await getRecentEvents(50);
            foundInStore = events.some((e) => e.event_id === event_id);
          } finally {
            off();
            clearTimeout(timer);
            resolve({ eventId: capturedEventId, foundInStoreWhenHandlerRan: foundInStore });
          }
        });

        try {
          await eventBus.emit('__AuditDurability__', { id: `audit-${Date.now()}`, _audit: true });
        } catch (err) {
          off();
          clearTimeout(timer);
          reject(err);
        }
      });

      result.passed = !!result.eventId && result.foundInStoreWhenHandlerRan;
      console.table(result);
      return result;
    },

    /**
     * TEST 2 — Dispatch abortado si event_store falla
     * Instala un hook que siempre falla, verifica que emit() lanza y handler NO ejecuta.
     *
     * RESULTADO ESPERADO:
     *   { emitThrew: true, handlerFired: false, passed: true }
     */
    testDispatchAbortOnPersistFail: async () => {
      let handlerFired = false;
      let emitThrew = false;
      const originalHook = eventBus._persistenceHook;

      eventBus.setPersistenceHook(async () => {
        throw new Error('AUDIT: IDB forced failure');
      });

      const off = eventBus.on('__AuditAbort__', () => { handlerFired = true; });

      try {
        await eventBus.emit('__AuditAbort__', { id: `abort-${Date.now()}`, _audit: true });
      } catch (_err) {
        emitThrew = true;
      } finally {
        off();
        eventBus.setPersistenceHook(originalHook);
      }

      const result = { emitThrew, handlerFired, passed: emitThrew && !handlerFired };
      console.table(result);
      return result;
    },

    /**
     * TEST 3 — Outbox idempotente: dos llamadas con mismo key → 1 entrada en sync_queue
     *
     * RESULTADO ESPERADO:
     *   { idempotencyKey: "...", queueEntriesWithKey: 1, passed: true }
     */
    testOutboxIdempotency: async () => {
      const idemKey = `AUDIT:IDEM:${Date.now()}`;
      const entity = {
        id: `audit-entity-${Date.now()}`,
        sync_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1, status: 'active',
        idempotency_key: idemKey,
        razon_social: '__AUDIT_TEST__',
      };
      const meta = { type: 'CREATE', entity: 'clientes', entity_id: entity.id, payload: entity, idempotency_key: idemKey };

      await saveWithOutbox('clientes', entity, meta);
      await saveWithOutbox('clientes', entity, meta); // segunda llamada — debe ser no-op en queue

      const queue = await getSyncQueue();
      const count = queue.filter((q) => q.idempotency_key === idemKey).length;

      const result = { idempotencyKey: idemKey, queueEntriesWithKey: count, passed: count === 1 };
      console.table(result);
      return result;
    },

    /**
     * TEST 4 — Evento con handler que falla: event_store conserva el registro
     * Demuestra que el evento persiste aunque el handler lance error.
     *
     * RESULTADO ESPERADO:
     *   { eventId: "uuid", eventInStore: true, handlerThrew: true, passed: true }
     */
    testEventPersistedBeforeHandlerFail: async () => {
      let capturedEventId = null;
      let handlerThrew = false;

      const result = await new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 5000);

        const off = eventBus.on('__AuditHandlerFail__', async ({ event_id }) => {
          capturedEventId = event_id;
          off();
          clearTimeout(timer);
          resolve(event_id);
          throw new Error('AUDIT: handler forced failure'); // simula handler roto
        });

        try {
          await eventBus.emit('__AuditHandlerFail__', { id: `hfail-${Date.now()}`, _audit: true });
        } catch (_err) {
          // handler throw no propaga al caller de emit (handlers son fire-and-forget)
        }
      });

      await new Promise((r) => setTimeout(r, 200));
      const events = await getRecentEvents(50);
      const found = events.some((e) => e.event_id === result);

      const out = {
        eventId: result,
        eventInStore: found,
        handlerThrew: true,
        passed: !!result && found,
      };
      console.table(out);
      return out;
    },

    help: () => {
      console.log(`window.__MAXGRIFOS_AUDIT__ disponible:
  testDurableBeforeDispatch()       → event en IDB antes de handler
  testDispatchAbortOnPersistFail()  → handler NO ejecuta si IDB falla
  testOutboxIdempotency()           → 2 saveWithOutbox → 1 entrada en queue
  testEventPersistedBeforeHandlerFail() → evento persiste aunque handler lance`);
    },
  };

  console.info('[AuditHelpers] window.__MAXGRIFOS_AUDIT__ disponible — ejecutar .help() para ver métodos.');
}
