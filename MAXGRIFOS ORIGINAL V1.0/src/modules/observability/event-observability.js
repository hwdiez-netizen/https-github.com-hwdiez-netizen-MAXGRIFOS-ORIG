// Observabilidad de eventos e idempotencia — NO modifica contratos ni lógica
// Solo agrega logs estructurados al event bus, stores y sync queue

import { eventBus } from '../../events/domain-events.js';

class EventObservabilityRuntime {
  constructor(options = {}) {
    this._events = [];
    this._storeOps = [];
    this._syncOps = [];
    this._actions = [];
    this._maxHistory = options.maxRecentEvents || 500;
    this._throttleMs = options.publishThrottleMs || 250;
    this._lastPublish = 0;
    this._started = false;
  }

  start() {
    if (this._started) return;
    this._started = true;
    this.hookEventBus(eventBus);
    console.log('[OBSERVABILITY] Inicializado — trazabilidad evento→efecto activa');
  }

  hookEventBus(eventBus) {
    const originalEmit = eventBus.emit.bind(eventBus);
    eventBus.emit = async (type, payload) => {
      const eventId = payload?._idempotency_key ?? crypto.randomUUID();
      const timestamp = new Date().toISOString();

      const eventLog = {
        id: eventId,
        type,
        timestamp,
        aggregate_id: payload?.id ?? payload?.pedido?.id ?? payload?.lista?.id ?? null,
        idempotency_key: eventId,
      };

      this._logEvent('[EVENT]', eventLog);
      this._events.push(eventLog);
      if (this._events.length > this._maxHistory) this._events.shift();

      return originalEmit(type, payload);
    };
  }

  hookStoreOperation(storeName, operation, entityId, idempotencyKey, result = {}) {
    const storeLog = {
      store: storeName,
      operation,
      entity_id: entityId,
      idempotency_key: idempotencyKey,
      timestamp: new Date().toISOString(),
      result: result?.status ?? 'OK',
      error: result?.error ?? null,
    };

    this._logStore('[STORE]', storeLog);
    this._storeOps.push(storeLog);
    if (this._storeOps.length > this._maxHistory) this._storeOps.shift();
  }

  hookSyncQueueOperation(operation, entityId, idempotencyKey, result = {}) {
    const syncLog = {
      operation,
      entity_id: entityId,
      idempotency_key: idempotencyKey,
      timestamp: new Date().toISOString(),
      result: result?.status ?? 'OK',
      duplicateDetected: result?.duplicateDetected ?? false,
    };

    this._logSync('[SYNC]', syncLog);
    this._syncOps.push(syncLog);
    if (this._syncOps.length > this._maxHistory) this._syncOps.shift();
  }

  _logEvent(prefix, log) {
    console.log(
      `${prefix} [${log.type}] id=${log.id} agg=${log.aggregate_id} key=${log.idempotency_key}`,
    );
  }

  _logStore(prefix, log) {
    const status = log.result === 'OK' ? '✓' : '✗';
    console.log(
      `${prefix} [${log.store}] ${log.operation} ${status} entity=${log.entity_id} key=${log.idempotency_key}`,
    );
  }

  _logSync(prefix, log) {
    const status = log.duplicateDetected ? 'SKIP' : 'INSERT';
    console.log(
      `${prefix} [sync] ${log.operation} ${status} entity=${log.entity_id} key=${log.idempotency_key}`,
    );
  }

  // Verificar flujo completo: UI → HANDLER → STORE → EVENT → SYNC
  traceFlow(eventId) {
    const event = this._events.find((e) => e.id === eventId);
    const storeOps = this._storeOps.filter((s) => s.idempotency_key === eventId);
    const syncOps = this._syncOps.filter((s) => s.idempotency_key === eventId);

    const flowComplete = !!(event && storeOps.length > 0 && syncOps.length > 0);
    console.log(`[TRACE] Flujo ${eventId}:`, { event: !!event, storeOps: storeOps.length, syncOps: syncOps.length, flowComplete });

    return { event, storeOps, syncOps, flowComplete };
  }

  hookAction(entry) {
    this._actions.push(entry);
    if (this._actions.length > this._maxHistory) this._actions.shift();
  }

  getRecentActions(limit = 50) {
    return this._actions.slice(-limit);
  }

  getRecentEvents(limit = 20) {
    return this._events.slice(-limit);
  }

  getRecentStoreOps(limit = 20) {
    return this._storeOps.slice(-limit);
  }

  getRecentSyncOps(limit = 20) {
    return this._syncOps.slice(-limit);
  }

  // Mostrar resumen de trazabilidad
  showStatus() {
    console.log('[OBSERVABILITY STATUS]', {
      events: this._events.length,
      storeOps: this._storeOps.length,
      syncOps: this._syncOps.length,
      maxHistory: this._maxHistory,
    });
  }

  clear() {
    this._events = [];
    this._storeOps = [];
    this._syncOps = [];
  }
}

export { EventObservabilityRuntime };

if (typeof window !== 'undefined') {
  window.__MAXGRIFOS_OBSERVABILITY__ = EventObservabilityRuntime;
}
