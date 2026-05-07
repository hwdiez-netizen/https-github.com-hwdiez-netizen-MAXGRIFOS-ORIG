import {
  saveDocumento, getDocumento, getAllDocumentos,
  getPedido, getPedidoItems,
  getNextConsecutivo,
  addToSyncQueue, getSyncQueue, claimSyncQueueItem, updateSyncQueueItem, removeSyncQueueItem,
  saveWithOutbox,
} from '../../db/local-db.js';
import { mockApi } from '../../mock/mock-api.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { runtimeGuard } from '../observability/runtime-guard.js';

let _isPedidoDocumentoBridgeBound = false;
const _pedidoDocumentoLocks = new Set();
const _pedidoDocumentoResults = new Map();

function _mdm(extra = {}) {
  const now = new Date().toISOString();
  return {
    created_at: now,
    updated_at: now,
    created_by: 'local',
    updated_by: 'local',
    version: 1,
    status: 'active',
    sync_status: 'pending',
    ...extra,
  };
}

function _generateDeterministicId(prefix, key) {
  return `${prefix}:${key}`;
}

function _isItemActivo(item) {
  return (item?.status ?? 'active') === 'active';
}

function _cantidadFinalItem(item) {
  const cantidad = Number(item?.cantidad_picking ?? item?.cantidad ?? item?.cantidad_pedida ?? 0);
  return Number.isFinite(cantidad) ? cantidad : 0;
}

function _buildSnapshotItems(items = []) {
  return items
    .filter(_isItemActivo)
    .map((item) => {
      const cantidad = _cantidadFinalItem(item);
      const precioUnitario = Number(item?.precio_unitario ?? 0);
      return {
        item_id: item.id ?? null,
        product_id: item.product_id,
        product_sku: item.product_sku,
        product_name: item.product_name,
        cantidad,
        precio_unitario: precioUnitario,
        subtotal: cantidad * precioUnitario,
      };
    })
    .filter((item) => item.product_id && item.cantidad > 0);
}

export async function crearDocumento({ pedido_id, tipo }, options = {}) {
  if (!options.__fromHandler) {
    runtimeGuard.report({
      type: 'STORE_VIOLATION',
      module: 'facturacion',
      action: 'crearDocumento',
      entity_id: pedido_id,
      key: `${tipo}:${pedido_id}`,
    });
    throw new Error('STORE_ACCESS_DENIED:facturacion:crearDocumento');
  }
  if (!pedido_id) {
    throw new Error('FACTURACION_PEDIDO_ID_REQUIRED');
  }
  if (!['FAC', 'REM'].includes(String(tipo ?? '').toUpperCase())) {
    throw new Error('FACTURACION_TIPO_DOCUMENTO_INVALIDO');
  }
  tipo = String(tipo).toUpperCase();

  const pedido = await getPedido(pedido_id);
  if (!pedido) throw new Error('Pedido no encontrado');

  const allItems = await getPedidoItems(pedido_id);
  const snapshotItems = _buildSnapshotItems(allItems);
  if (snapshotItems.length === 0) {
    throw new Error('No hay items finales validos para emitir documento');
  }
  const consecutivo = await getNextConsecutivo(tipo);
  const now         = new Date().toISOString();
  const total       = snapshotItems.reduce((s, i) => s + Number(i.subtotal ?? 0), 0);

  const doc = {
    id: _generateDeterministicId(`DOC:${tipo}`, pedido_id),
    tipo,
    consecutivo,
    pedido_id,
    cliente_id:     pedido.cliente_id,
    cliente_nombre: pedido.cliente_nombre,
    cliente_nit:    pedido.cliente_nit,
    qr_data:        pedido.qr_code,
    items_snapshot: snapshotItems,
    total,
    emitido_at:     now,
    estado:         'emitido',
    reimpresiones:  0,
    motivo_anulacion: null,
    idempotency_key: `DOC:${tipo}:${pedido_id}`,
    ..._mdm({ created_at: now, updated_at: now }),
  };

  await saveWithOutbox('documentos', doc, {
    type: 'CREATE', entity: 'documento', entity_id: doc.id, payload: doc,
    idempotency_key: `OUTBOX:documentos:${tipo}:${pedido_id}:CREATE`,
  });
  if (navigator.onLine) processSyncQueueDocumentos().catch(() => {});
  return doc;
}

export async function anularDocumento(docId, motivo, options = {}) {
  if (!options.__fromHandler) {
    runtimeGuard.report({
      type: 'STORE_VIOLATION',
      module: 'facturacion',
      action: 'anularDocumento',
      entity_id: docId,
      key: `ANULAR:${docId}`,
    });
    throw new Error('STORE_ACCESS_DENIED:facturacion:anularDocumento');
  }

  if (!docId) {
    throw new Error('FACTURACION_DOCUMENTO_ID_REQUIRED');
  }

  if (!motivo) {
    throw new Error('FACTURACION_MOTIVO_ANULACION_REQUIRED');
  }

  const doc = await getDocumento(docId);
  if (!doc) throw new Error('Documento no encontrado');
  if (doc.estado === 'anulado') return doc;
  const updated = {
    ...doc,
    estado:           'anulado',
    motivo_anulacion: motivo,
    updated_at:       new Date().toISOString(),
    updated_by:       'local',
    version:          doc.version + 1,
    sync_status:      'pending',
  };
  await saveWithOutbox('documentos', updated, {
    type: 'UPDATE', entity: 'documento', entity_id: docId, payload: updated,
    idempotency_key: `OUTBOX:documentos:${docId}:ANULAR:${updated.version}`,
  });
  if (navigator.onLine) processSyncQueueDocumentos().catch(() => {});
  return updated;
}

export async function registrarReimpresion(docId, options = {}) {
  if (!options.__fromHandler) {
    runtimeGuard.report({
      type: 'STORE_VIOLATION',
      module: 'facturacion',
      action: 'registrarReimpresion',
      entity_id: docId,
      key: `REIMPRESION:${docId}`,
    });
    throw new Error('STORE_ACCESS_DENIED:facturacion:registrarReimpresion');
  }

  if (!docId) {
    throw new Error('FACTURACION_DOCUMENTO_ID_REQUIRED');
  }

  const doc = await getDocumento(docId);
  if (!doc) return;

  const updated = {
    ...doc,
    reimpresiones: (doc.reimpresiones ?? 0) + 1,
    updated_at: new Date().toISOString(),
    version: doc.version + 1,
    sync_status: 'pending',
  };

  await saveDocumento(updated);
  return updated;
}

export async function getDocumentos() { return getAllDocumentos(); }
export { getDocumento };

export function getTipoSugerido(clienteNit) {
  if (clienteNit === '222222222222') return 'FAC';
  return 'REM';
}

async function _trySyncDoc(doc) {
  try {
    await mockApi.createDocumento(doc);
    const updated = { ...doc, sync_status: 'synced', updated_at: new Date().toISOString() };
    await saveDocumento(updated);
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id: doc.id,
      entity: 'documento',
      status: 'synced',
      source: 'try_sync',
    });
  } catch (error) {
    const errorMsg = error?.message ?? String(error);
    console.warn('[Sync][Documento] Error en sincronizacion inmediata', {
      entity_id: doc.id,
      error: errorMsg,
    });
    await addToSyncQueue({ type: 'CREATE', entity: 'documento', entity_id: doc.id, payload: doc, created_at: new Date().toISOString() });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id: doc.id,
      entity: 'documento',
      status: 'pending',
      source: 'try_sync',
      error: errorMsg,
    });
  }
}

export async function processSyncQueueDocumentos() {
  const queue = await getSyncQueue();
  const items = queue.filter((i) => i.entity === 'documento' && (!i.status || i.status === 'pending' || i.status === 'processing' || i.status === 'failed'));
  for (const item of items) {
    const claimed = await claimSyncQueueItem(item.id, 'documento_sync');
    if (!claimed) continue;

    try {
      if (claimed.type === 'CREATE') {
        await mockApi.createDocumento(claimed.payload);
      } else if (claimed.type === 'UPDATE') {
        await mockApi.updateDocumento(claimed.entity_id, claimed.payload);
      } else {
        throw new Error(`Operacion de cola no soportada para documentos: ${claimed.type}`);
      }
      const doc = await getDocumento(claimed.entity_id);
      if (doc) await saveDocumento({ ...doc, sync_status: 'synced' });
      await removeSyncQueueItem(claimed.id);
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'documento',
        status: 'synced',
        source: 'sync_queue',
        recovered: (claimed.retry_count ?? 0) > 0 || item.status === 'processing',
        retry_count: claimed.retry_count ?? 0,
      });
    } catch (err) {
      const errorMsg = err?.message ?? String(err);
      const retries = (claimed.retry_count ?? 0) + 1;
      const exhausted = retries >= (claimed.max_retries ?? 3);
      await updateSyncQueueItem(claimed.id, {
        retry_count: retries,
        status: exhausted ? 'failed' : 'pending',
        error: errorMsg,
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const nextStatus = exhausted ? 'error' : 'pending';
      if (exhausted) {
        const doc = await getDocumento(claimed.entity_id);
        if (doc) await saveDocumento({ ...doc, sync_status: 'error' });
      }
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'documento',
        status: nextStatus,
        source: 'sync_queue',
        error: errorMsg,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
      });
      console.warn('[Sync][Documento] Error en cola de sincronizacion', {
        entity_id: claimed.entity_id,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
        exhausted,
        error: errorMsg,
      });
    }
  }
}

function _emitPedidoDocumentoResult(type, result) {
  eventBus.emit(type, result);
}

function _bindPedidoDocumentoBridge() {
  if (_isPedidoDocumentoBridgeBound) return;
  _isPedidoDocumentoBridgeBound = true;

  eventBus.on(Events.PEDIDO_DOCUMENTO_EMISION_REQUESTED, async ({ payload }) => {
    const requestId = payload?.request_id;
    const pedidoId = payload?.pedido_id;
    const tipo = payload?.tipo;
    if (!requestId || !pedidoId || !tipo) return;

    const cacheKey = `EMISION:${requestId}`;
    const cached = _pedidoDocumentoResults.get(cacheKey);
    if (cached) {
      _emitPedidoDocumentoResult(Events.PEDIDO_DOCUMENTO_EMISION_RESOLVED, cached);
      return;
    }
    if (_pedidoDocumentoLocks.has(cacheKey)) return;
    _pedidoDocumentoLocks.add(cacheKey);

    try {
      const documento = await crearDocumento({ pedido_id: pedidoId, tipo }, { __fromHandler: true });
      const result = {
        request_id: requestId,
        ok: true,
        pedido_id: pedidoId,
        tipo,
        documento,
      };
      _pedidoDocumentoResults.set(cacheKey, result);
      _emitPedidoDocumentoResult(Events.PEDIDO_DOCUMENTO_EMISION_RESOLVED, result);
    } catch (error) {
      const result = {
        request_id: requestId,
        ok: false,
        pedido_id: pedidoId,
        tipo,
        error: error?.message ?? String(error),
      };
      _pedidoDocumentoResults.set(cacheKey, result);
      _emitPedidoDocumentoResult(Events.PEDIDO_DOCUMENTO_EMISION_RESOLVED, result);
    } finally {
      _pedidoDocumentoLocks.delete(cacheKey);
    }
  });

  eventBus.on(Events.PEDIDO_DOCUMENTO_ANULACION_REQUESTED, async ({ payload }) => {
    const requestId = payload?.request_id;
    const documentoId = payload?.documento_id;
    const motivo = payload?.motivo ?? '';
    if (!requestId || !documentoId) return;

    const cacheKey = `ANULACION:${requestId}`;
    const cached = _pedidoDocumentoResults.get(cacheKey);
    if (cached) {
      _emitPedidoDocumentoResult(Events.PEDIDO_DOCUMENTO_ANULACION_RESOLVED, cached);
      return;
    }
    if (_pedidoDocumentoLocks.has(cacheKey)) return;
    _pedidoDocumentoLocks.add(cacheKey);

    try {
      const documento = await anularDocumento(documentoId, motivo, { __fromHandler: true });
      const result = {
        request_id: requestId,
        ok: true,
        documento_id: documentoId,
        documento,
      };
      _pedidoDocumentoResults.set(cacheKey, result);
      _emitPedidoDocumentoResult(Events.PEDIDO_DOCUMENTO_ANULACION_RESOLVED, result);
    } catch (error) {
      const result = {
        request_id: requestId,
        ok: false,
        documento_id: documentoId,
        error: error?.message ?? String(error),
      };
      _pedidoDocumentoResults.set(cacheKey, result);
      _emitPedidoDocumentoResult(Events.PEDIDO_DOCUMENTO_ANULACION_RESOLVED, result);
    } finally {
      _pedidoDocumentoLocks.delete(cacheKey);
    }
  });
}

_bindPedidoDocumentoBridge();