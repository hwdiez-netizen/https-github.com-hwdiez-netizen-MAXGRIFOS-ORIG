const LEGACY_TO_CANONICAL = Object.freeze({
  PedidoFacturado: 'FacturaEmitida',
  PedidoRemisionado: 'RemisionEmitida',
  ProcesosInconclusos: null,
});

const CANONICAL_TO_LEGACY = Object.freeze(
  Object.entries(LEGACY_TO_CANONICAL).reduce((acc, [legacy, canonical]) => {
    if (!canonical) return acc;
    if (!acc[canonical]) acc[canonical] = [];
    acc[canonical].push(legacy);
    return acc;
  }, {}),
);

const NON_DURABLE_EVENTS = new Set([
  'BarcodeScanned',
  'InventarioScanRequested',
  'InventarioScanReturned',
  'InventarioScanMatched',
  'InventarioScanUnmatched',
  'FlowOpened',
  'SlideViewed',
  'SlideSwipedNext',
  'SlideSwipedPrev',
  'FlowSaved',
  'FlowStandby',
  'FlowCancelled',
  'FlowResumed',
]);

function warnDeprecated(type, action) {
  const canonical = LEGACY_TO_CANONICAL[type];
  if (canonical) {
    console.warn(`[DEPRECATED] ${action} de ${type}. Use ${canonical}.`);
    return;
  }
  console.warn(`[DEPRECATED] ${action} de ${type} sin reemplazo canonico.`);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function createDeterministicEventId(type, aggregateId, payload) {
  const explicitKey = payload?._idempotency_key
    ?? payload?.idempotency_key
    ?? payload?.event_id
    ?? payload?.eventId
    ?? null;

  if (explicitKey) return String(explicitKey);

  const payloadSignature = stableStringify(payload ?? {});
  return `EVENT:${type}:${aggregateId ?? 'NO_AGGREGATE'}:${payloadSignature}`;
}

function resolveDeterministicTimestamp(payload) {
  return payload?.timestamp
    ?? payload?.occurred_at
    ?? payload?.updated_at
    ?? payload?.created_at
    ?? payload?.event_timestamp
    ?? null;
}

class DomainEventBus {
  constructor() {
    this._listeners = new Map();
    this._anyListeners = new Set();
    // EXCEPCIÓN §1.1 — AUDIT-FAILED-20260425T0139Z F1R1-BLOCKER-001/002
    // Hook async llamado con await ANTES de dispatch. Permite persistir a IDB
    // con commit confirmado antes de que cualquier handler regular ejecute.
    // Registrado por persistent-event-bus.js vía setPersistenceHook().
    this._persistenceHook = null;
  }

  // Registra un hook async de persistencia. Se llama con await antes del dispatch.
  setPersistenceHook(hook) {
    this._persistenceHook = hook;
  }

  on(type, handler) {
    if (LEGACY_TO_CANONICAL[type] !== undefined) {
      warnDeprecated(type, 'Suscripcion');
    }

    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this._listeners.get(type)?.delete(handler);
  }

  onAny(handler) {
    this._anyListeners.add(handler);
    return () => this.offAny(handler);
  }

  offAny(handler) {
    this._anyListeners.delete(handler);
  }

  _getDispatchTypes(type) {
    const canonical = LEGACY_TO_CANONICAL[type];
    if (canonical !== undefined) {
      // Legacy emit: dispatch canonical + legacy to keep total backward compatibility.
      return canonical ? [canonical, type] : [type];
    }

    // Canonical emit: dispatch canonical + temporary legacy aliases.
    const legacyAliases = CANONICAL_TO_LEGACY[type] ?? [];
    return [type, ...legacyAliases];
  }

  // EXCEPCIÓN §1.1 — emit() es ahora async para permitir await del persistence hook.
  // Callers que no awaiten reciben Promise<void> ignorada (fire-and-forget).
  // GARANTÍA: dentro de la Promise, IDB commit confirmado ANTES de handlers.
  async emit(type, payload) {
    if (LEGACY_TO_CANONICAL[type] !== undefined) {
      warnDeprecated(type, 'Emision');
    }

    const aggregateId = payload?.id ?? payload?.pedido?.id ?? payload?.lista?.id
      ?? payload?.dinamica?.id ?? payload?.documento?.id ?? null;

    const dispatchTypes = this._getDispatchTypes(type);
    const canonicalTraceType = LEGACY_TO_CANONICAL[type] ?? type;
    const eventId = createDeterministicEventId(canonicalTraceType, aggregateId, payload);
    const timestamp = resolveDeterministicTimestamp(payload);
    const seenHandlers = new Set();

    const traceEvent = {
      event_id: eventId,
      aggregate_id: aggregateId,
      type: canonicalTraceType,
      canonical_type: canonicalTraceType,
      aliases: dispatchTypes.filter((dt) => dt !== canonicalTraceType),
      payload,
      timestamp,
    };

    // F1R2-BLOCKER-001 FIX: sin try-catch. Si el hook lanza, emit() lanza.
    // El dispatch (anyListeners + listeners) NUNCA ejecuta si IDB falla.
    // Garantía durable-before-dispatch: o IDB confirma, o nada despacha.
    if (this._persistenceHook && !NON_DURABLE_EVENTS.has(canonicalTraceType)) {
      await this._persistenceHook(traceEvent); // lanza -> emit() lanza -> dispatch abortado
    }

    if (this._anyListeners.size > 0) {
      for (const anyHandler of this._anyListeners) {
        anyHandler(traceEvent);
      }
    }

    for (const dispatchType of dispatchTypes) {
      const listeners = this._listeners.get(dispatchType);
      if (!listeners || listeners.size === 0) continue;

      const event = {
        event_id: eventId,
        aggregate_id: aggregateId,
        type: dispatchType,
        canonical_type: LEGACY_TO_CANONICAL[dispatchType] ?? dispatchType,
        payload,
        timestamp,
      };

      for (const handler of listeners) {
        if (seenHandlers.has(handler)) continue;
        seenHandlers.add(handler);
        handler(event);
      }
    }
  }
}

const __GLOBAL_SCOPE__ = typeof window !== 'undefined' ? window : globalThis;
const __EVENT_BUS_GLOBAL_KEY__ = '__MAXGRIFOS_DOMAIN_EVENT_BUS__';
const __existingEventBus__ = __GLOBAL_SCOPE__?.[__EVENT_BUS_GLOBAL_KEY__];

export const eventBus = (
  __existingEventBus__
  && typeof __existingEventBus__.emit === 'function'
  && typeof __existingEventBus__.on === 'function'
) ? __existingEventBus__ : new DomainEventBus();

if (!__existingEventBus__) {
  __GLOBAL_SCOPE__[__EVENT_BUS_GLOBAL_KEY__] = eventBus;
}

export const DeprecatedEvents = Object.freeze({
  PEDIDO_FACTURADO: 'PedidoFacturado',
  PEDIDO_REMISIONADO: 'PedidoRemisionado',
  PROCESOS_INCONCLUSOS: 'ProcesosInconclusos',
});

export const EventCompatibility = Object.freeze({
  legacy_to_canonical: LEGACY_TO_CANONICAL,
  canonical_to_legacy: CANONICAL_TO_LEGACY,
});

export const Events = {
  // Legacy events kept temporarily for backward compatibility.
  PEDIDO_FACTURADO: 'PedidoFacturado',
  PEDIDO_REMISIONADO: 'PedidoRemisionado',
  PROCESOS_INCONCLUSOS: 'ProcesosInconclusos',

  // Current events
  PRODUCT_CREATED: 'ProductCreated',
  PRODUCT_UPDATED: 'ProductUpdated',
  PRODUCT_DEACTIVATED: 'ProductDeactivated',
  PRODUCT_ACTIVATED: 'ProductActivated',
  PRODUCT_DELETED: 'ProductDeleted',
  BARCODE_SCANNED: 'BarcodeScanned',
  INVENTARIO_SCAN_REQUESTED: 'InventarioScanRequested',
  INVENTARIO_SCAN_RETURNED: 'InventarioScanReturned',
  INVENTARIO_SCAN_MATCHED: 'InventarioScanMatched',
  INVENTARIO_SCAN_UNMATCHED: 'InventarioScanUnmatched',
  SYNC_STATUS_CHANGED: 'SyncStatusChanged',
  CONSISTENCY_STATUS_CHANGED: 'ConsistencyStatusChanged',
  CONSISTENCY_ISSUES_DETECTED: 'ConsistencyIssuesDetected',
  OBSERVABILITY_STATUS_CHANGED: 'ObservabilityStatusChanged',
  OBSERVABILITY_TRACE_RECORDED: 'ObservabilityTraceRecorded',
  EDIT_PRODUCT: 'EditProduct',
  AUDIT_STARTED: 'AuditStarted',
  AUDIT_COMPLETED: 'AuditCompleted',
  AUDIT_SINGLE_PRODUCT: 'AuditSingleProduct',
  AUDIT_SALDO_REQUESTED: 'AuditSaldoRequested',
  AUDIT_SALDO_RESOLVED: 'AuditSaldoResolved',
  AUDIT_STOCK_ADJUST_REQUESTED: 'AuditStockAdjustRequested',
  AUDIT_STOCK_ADJUST_RESOLVED: 'AuditStockAdjustResolved',
  CLIENTE_CREATED: 'ClienteCreated',
  CLIENTE_UPDATED: 'ClienteUpdated',
  CLIENTE_DISCONTINUED: 'ClienteDiscontinued',
  CLIENTE_ACTIVATED: 'ClienteActivated',
  EDIT_CLIENTE: 'EditCliente',
  STOCK_MOVED: 'StockMoved',
  STOCK_ADJUSTED: 'StockAdjusted',
  STOCK_ALERT: 'StockAlert',
  STOCK_RESERVADO: 'StockReservado',
  STOCK_LIBERADO: 'StockLiberado',
  STOCK_REVERTIDO: 'StockRevertido',
  BODEGA_CREATED: 'BodegaCreated',
  BODEGA_UPDATED: 'BodegaUpdated',
  PEDIDO_CREATED: 'PedidoCreated',
  PEDIDO_CONFIRMADO: 'PedidoConfirmado',
  PEDIDO_PICKING: 'PedidoPicking',
  PEDIDO_PACKING: 'PedidoPacking',
  PEDIDO_DESPACHADO: 'PedidoDespachado',
  PEDIDO_POD: 'PedidoPOD',
  PEDIDO_ANULADO: 'PedidoAnulado',
  PEDIDO_DOCUMENTO_EMISION_REQUESTED: 'PedidoDocumentoEmisionRequested',
  PEDIDO_DOCUMENTO_EMISION_RESOLVED: 'PedidoDocumentoEmisionResolved',
  PEDIDO_DOCUMENTO_ANULACION_REQUESTED: 'PedidoDocumentoAnulacionRequested',
  PEDIDO_DOCUMENTO_ANULACION_RESOLVED: 'PedidoDocumentoAnulacionResolved',
  FACTURA_EMITIDA: 'FacturaEmitida',
  REMISION_EMITIDA: 'RemisionEmitida',
  LISTA_PRECIOS_CREADA: 'ListaPreciosCreada',
  LISTA_PRECIOS_ACTUALIZADA: 'ListaPreciosActualizada',
  LISTA_PRECIOS_ACTIVADA: 'ListaPreciosActivada',
  LISTA_PRECIOS_SUSPENDIDA: 'ListaPreciosSuspendida',
  LISTA_PRECIOS_EN_STANDBY: 'ListaPreciosEnStandby',
  LISTA_PRECIOS_CANCELADA: 'ListaPreciosCancelada',
  DINAMICA_CREADA: 'DinamicaCreada',
  DINAMICA_ACTUALIZADA: 'DinamicaActualizada',
  DINAMICA_ACTIVADA: 'DinamicaActivada',
  DINAMICA_DESACTIVADA: 'DinamicaDesactivada',
  DINAMICA_EN_STANDBY: 'DinamicaEnStandby',
  DINAMICA_CANCELADA: 'DinamicaCancelada',
  PRECIO_ASIGNADO: 'PrecioAsignado',
  PRECIO_ITEM_CHANGED: 'PrecioItemChanged',
  GARANTIA_RECONOCIDA: 'GarantiaReconocida',
  GARANTIA_CREADA: 'GarantiaCreada',
  GARANTIA_ESTADO_CAMBIADO: 'GarantiaEstadoCambiado',
  NOTA_CREDITO_PROVEEDOR_EMITIDA: 'NotaCreditoProveedorEmitida',
  PROVEEDOR_CREADO: 'ProveedorCreado',
  PROVEEDOR_ACTUALIZADO: 'ProveedorActualizado',
  PROVEEDOR_DESACTIVADO: 'ProveedorDesactivado',
  PROVEEDOR_ACTIVADO: 'ProveedorActivado',
  COMPRA_CREADA: 'CompraCreada',
  COMPRA_RECEPCIONADA: 'CompraRecepcionada',
  COSTO_PRODUCTO_CAMBIADO: 'CostoProductoCambiado',

  // Políticas Comerciales / Listas de Precios
  LISTA_PRECIOS_CREATE_REQUESTED: 'ListaPreciosCreateRequested',
  LISTA_PRECIOS_CREATED: 'ListaPreciosCreated',
  LISTA_PRECIOS_UPDATE_REQUESTED: 'ListaPreciosUpdateRequested',
  LISTA_PRECIOS_UPDATED: 'ListaPreciosUpdated',
  LISTA_PRECIOS_ACTIVATE_REQUESTED: 'ListaPreciosActivateRequested',
  LISTA_PRECIOS_ACTIVATED: 'ListaPreciosActivated',
  LISTA_PRECIOS_SUSPEND_REQUESTED: 'ListaPreciosSuspendRequested',
  LISTA_PRECIOS_SUSPENDED: 'ListaPreciosSuspended',
  LISTA_PRECIOS_CANCEL_REQUESTED: 'ListaPreciosCancelRequested',
  LISTA_PRECIOS_CANCELLED: 'ListaPreciosCancelled',

  PRECIO_ITEM_ASSIGN_REQUESTED: 'PrecioItemAssignRequested',
  PRECIO_ITEM_ASSIGNED: 'PrecioItemAssigned',
  PRECIO_ITEM_UPDATE_REQUESTED: 'PrecioItemUpdateRequested',
  PRECIO_ITEM_UPDATED: 'PrecioItemUpdated',
  PRECIO_ITEMS_SAVE_REQUESTED: 'PrecioItemsSaveRequested',
  PRECIO_ITEMS_SAVED: 'PrecioItemsSaved',

  DINAMICA_COMERCIAL_CREATE_REQUESTED: 'DinamicaComercialCreateRequested',
  DINAMICA_COMERCIAL_CREATED: 'DinamicaComercialCreated',
  DINAMICA_COMERCIAL_UPDATE_REQUESTED: 'DinamicaComercialUpdateRequested',
  DINAMICA_COMERCIAL_UPDATED: 'DinamicaComercialUpdated',
  DINAMICA_COMERCIAL_ACTIVATE_REQUESTED: 'DinamicaComercialActivateRequested',
  DINAMICA_COMERCIAL_ACTIVATED: 'DinamicaComercialActivated',
  DINAMICA_COMERCIAL_SUSPEND_REQUESTED: 'DinamicaComercialSuspendRequested',
  DINAMICA_COMERCIAL_SUSPENDED: 'DinamicaComercialSuspended',

  PRICE_RESOLUTION_REQUESTED: 'PriceResolutionRequested',
  PRICE_RESOLUTION_RESOLVED: 'PriceResolutionResolved',
  PRICE_RESOLUTION_FAILED: 'PriceResolutionFailed',

  // NIS — Navigation & Interaction System (§NIS ERP-CONSTITUTION V1.3)
  FLOW_OPENED: 'FlowOpened',
  SLIDE_VIEWED: 'SlideViewed',
  SLIDE_SWIPED_NEXT: 'SlideSwipedNext',
  SLIDE_SWIPED_PREV: 'SlideSwipedPrev',
  FLOW_SAVED: 'FlowSaved',
  FLOW_STANDBY: 'FlowStandby',
  FLOW_CANCELLED: 'FlowCancelled',
  FLOW_RESUMED: 'FlowResumed',
};