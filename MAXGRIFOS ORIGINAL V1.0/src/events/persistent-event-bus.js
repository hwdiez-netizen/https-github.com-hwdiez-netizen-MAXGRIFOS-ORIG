/**
 * OVERLAY — persistent-event-bus.js  (v3 — corrige AUDIT-FAILED-20260425T0139Z)
 * Constitución V1.3 §4: Event bus durable con IDB confirmado antes de dispatch.
 *
 * F1R1-BLOCKER-001 FIX:
 *   Usa eventBus.setPersistenceHook(asyncFn). El hook es awaited DENTRO de
 *   domain-events.js:emit() ANTES de cualquier dispatch (anyListeners + listeners).
 *   Garantía: tx.done de saveEventToStore() resuelve ANTES de que handlers ejecuten.
 *
 * F1R1-BLOCKER-002 FIX:
 *   El event_id que se persiste a IDB (traceEvent.event_id) es el MISMO UUID
 *   generado en domain-events.js:emit() y entregado a todos los handlers.
 *   No se genera un UUID propio en este módulo.
 *
 * EXCEPCIÓN §1.1: domain-events.js fue modificado para soportar el hook.
 * LEGACY DE PERSISTENCIA: domain-events.bak_f1r1_20260425.js es la versión anterior.
 */
import { eventBus } from './domain-events.js';
import { saveEventToStore } from '../db/local-db.js';

let _initialized = false;

export function initPersistentEventBus() {
  const flags = window.__MAXGRIFOS_FLAGS__ ?? {};
  if (!flags.event_store_enabled) return;
  if (_initialized) return;
  _initialized = true;

  // El hook recibe traceEvent con el event_id real. Es awaited dentro de emit()
  // antes de dispatch. saveEventToStore usa db.add() + idb library → await tx.done
  // garantiza que el registro está confirmado en IndexedDB antes de return.
  eventBus.setPersistenceHook(async (traceEvent) => {
    await saveEventToStore({
      event_id:       traceEvent.event_id,    // mismo UUID que handlers reciben
      type:           traceEvent.type,
      canonical_type: traceEvent.canonical_type,
      aggregate_id:   traceEvent.aggregate_id,
      payload:        traceEvent.payload,
      timestamp:      traceEvent.timestamp,
      replayed:       false,
    });
    // saveEventToStore usa db.add() que internamente espera tx.done de idb library.
    // Si lanza ConstraintError (evento duplicado), la excepción llega al try-catch
    // en domain-events.js:emit() y se loggea sin interrumpir el dispatch.
  });

  console.info('[PersistentEventBus] hook setPersistenceHook activo — IDB commit antes de handlers (v3).');
}
