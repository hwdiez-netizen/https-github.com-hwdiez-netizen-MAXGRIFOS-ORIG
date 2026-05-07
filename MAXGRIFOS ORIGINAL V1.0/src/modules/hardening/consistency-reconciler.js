import {
  getSyncQueue,
  getAllProducts,
  getAllClientes,
  getAllPedidos,
  getAllDocumentos,
  getAllMovimientos,
  getAllListas,
  getAllDinamicasDB,
} from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';

const KNOWN_ENTITIES = new Set([
  'product',
  'cliente',
  'pedido',
  'documento',
  'kardex',
  'lista_precios',
  'dinamica_comercial',
]);

const TRIGGER_EVENTS = [
  Events.SYNC_STATUS_CHANGED,
  Events.PEDIDO_CREATED,
  Events.PEDIDO_ANULADO,
  Events.FACTURA_EMITIDA,
  Events.REMISION_EMITIDA,
];

const ACTIVE_DOC_RELEASE_RETRY_ENTITY = 'kardex_doc_release_retry';
const DOCUMENT_RELEASE_GRACE_MS = 30 * 1000;

function _nowIso() {
  return new Date().toISOString();
}

function _toMs(value) {
  const ms = Date.parse(value ?? '');
  return Number.isFinite(ms) ? ms : null;
}

function _normalizeEntity(rawEntity) {
  if (!rawEntity) return 'product';
  return String(rawEntity);
}

function _isQueueActive(item) {
  const status = item?.status ?? 'pending';
  return status === 'pending' || status === 'processing' || status === 'failed';
}

function _isDocActive(doc) {
  return String(doc?.estado ?? '').toLowerCase() !== 'anulado';
}

function _isPedidoOperational(pedido) {
  return String(pedido?.status ?? 'active') === 'active';
}

function _addIssue(issues, maxIssues, payload) {
  if (issues.length >= maxIssues) return;
  issues.push({
    id: crypto.randomUUID(),
    detected_at: _nowIso(),
    ...payload,
  });
}

function _indexById(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.id) continue;
    map.set(row.id, row);
  }
  return map;
}

function _indexDocsByPedido(activeDocs) {
  const map = new Map();
  for (const doc of activeDocs) {
    const pedidoId = doc?.pedido_id;
    if (!pedidoId) continue;
    if (!map.has(pedidoId)) map.set(pedidoId, []);
    map.get(pedidoId).push(doc);
  }
  return map;
}

function _buildReport({ source, snapshot, issues, maxIssues }) {
  let criticalCount = 0;
  let warningCount = 0;

  for (const issue of issues) {
    if (issue.severity === 'critical') criticalCount += 1;
    else warningCount += 1;
  }

  const issueCount = issues.length;
  const status = criticalCount > 0 ? 'critical' : issueCount > 0 ? 'warning' : 'ok';

  return {
    checked_at: _nowIso(),
    source,
    status,
    issue_count: issueCount,
    critical_count: criticalCount,
    warning_count: warningCount,
    max_issues_reached: issueCount >= maxIssues,
    totals: {
      outbox: snapshot.syncQueue.length,
      products: snapshot.products.length,
      clientes: snapshot.clientes.length,
      pedidos: snapshot.pedidos.length,
      documentos: snapshot.documentos.length,
      kardex_movimientos: snapshot.movimientos.length,
      listas_precios: snapshot.listas.length,
      dinamicas: snapshot.dinamicas.length,
    },
    issues,
  };
}

function _analyzeSnapshot(snapshot, source, maxIssues) {
  const issues = [];
  const activeQueue = snapshot.syncQueue.filter(_isQueueActive);
  const activeDocs = snapshot.documentos.filter(_isDocActive);
  const docsByPedido = _indexDocsByPedido(activeDocs);

  const recordMaps = {
    product: _indexById(snapshot.products),
    cliente: _indexById(snapshot.clientes),
    pedido: _indexById(snapshot.pedidos),
    documento: _indexById(snapshot.documentos),
    kardex: _indexById(snapshot.movimientos),
    lista_precios: _indexById(snapshot.listas),
    dinamica_comercial: _indexById(snapshot.dinamicas),
  };

  const duplicateQueueOps = new Map();
  for (const item of activeQueue) {
    const entity = _normalizeEntity(item.entity);
    const idem = String(item.idempotency_key ?? '').trim();
    if (!idem) continue;
    const key = `${entity}|${item.type ?? 'NA'}|${item.entity_id ?? 'NA'}|${idem}`;
    duplicateQueueOps.set(key, (duplicateQueueOps.get(key) ?? 0) + 1);
  }
  for (const [key, count] of duplicateQueueOps.entries()) {
    if (count <= 1) continue;
    const [entity, type, entityId] = key.split('|');
    _addIssue(issues, maxIssues, {
      code: 'OUTBOX_DUPLICATE_OPERATION',
      severity: 'critical',
      entity,
      reference: entityId,
      message: `Outbox contiene ${count} operaciones duplicadas para ${entity}/${type}/${entityId}.`,
    });
  }

  for (const item of activeQueue) {
    const entity = _normalizeEntity(item.entity);
    if (!KNOWN_ENTITIES.has(entity)) continue;
    const entityId = item.entity_id;

    if (!entityId) {
      _addIssue(issues, maxIssues, {
        code: 'OUTBOX_ENTITY_ID_MISSING',
        severity: 'warning',
        entity,
        reference: String(item.id ?? 'unknown'),
        message: `Operacion de outbox sin entity_id en ${entity}.`,
      });
      continue;
    }

    const record = recordMaps[entity]?.get(entityId);
    if (!record) {
      _addIssue(issues, maxIssues, {
        code: 'OUTBOX_ORPHAN_REFERENCE',
        severity: 'warning',
        entity,
        reference: entityId,
        message: `Outbox referencia ${entity}/${entityId} inexistente en almacenamiento local.`,
      });
      continue;
    }

    const syncStatus = String(record.sync_status ?? 'pending');
    if (syncStatus === 'synced') {
      _addIssue(issues, maxIssues, {
        code: 'SYNC_STATUS_OUTBOX_MISMATCH',
        severity: 'warning',
        entity,
        reference: entityId,
        message: `${entity}/${entityId} figura synced pero tiene outbox activo (${item.status ?? 'pending'}).`,
      });
    }
  }

  const pedidosMap = recordMaps.pedido;
  for (const doc of activeDocs) {
    const pedidoId = doc?.pedido_id;
    if (!pedidoId || pedidosMap.has(pedidoId)) continue;
    _addIssue(issues, maxIssues, {
      code: 'DOCUMENT_WITHOUT_PEDIDO',
      severity: 'critical',
      entity: 'documento',
      reference: String(doc.id),
      message: `Documento ${doc.id} apunta a pedido inexistente (${pedidoId}).`,
    });
  }

  for (const pedido of snapshot.pedidos) {
    if (!_isPedidoOperational(pedido)) continue;
    const estado = String(pedido.estado ?? '').toLowerCase();
    const docs = docsByPedido.get(pedido.id) ?? [];

    if (['facturado', 'remisionado', 'despacho', 'pod'].includes(estado) && docs.length === 0) {
      _addIssue(issues, maxIssues, {
        code: 'PEDIDO_WITHOUT_DOCUMENT',
        severity: 'critical',
        entity: 'pedido',
        reference: pedido.id,
        message: `Pedido ${pedido.id} en estado ${estado} sin documento comercial activo.`,
      });
      continue;
    }

    if (estado === 'facturado' && !docs.some((d) => String(d.tipo).toUpperCase() === 'FAC')) {
      _addIssue(issues, maxIssues, {
        code: 'PEDIDO_FACTURADO_DOC_MISMATCH',
        severity: 'warning',
        entity: 'pedido',
        reference: pedido.id,
        message: `Pedido ${pedido.id} esta facturado pero no tiene documento tipo FAC activo.`,
      });
    }

    if (estado === 'remisionado' && !docs.some((d) => String(d.tipo).toUpperCase() === 'REM')) {
      _addIssue(issues, maxIssues, {
        code: 'PEDIDO_REMISIONADO_DOC_MISMATCH',
        severity: 'warning',
        entity: 'pedido',
        reference: pedido.id,
        message: `Pedido ${pedido.id} esta remisionado pero no tiene documento tipo REM activo.`,
      });
    }

    if (estado === 'anulado' && docs.length > 0) {
      _addIssue(issues, maxIssues, {
        code: 'PEDIDO_ANULADO_WITH_ACTIVE_DOCUMENT',
        severity: 'warning',
        entity: 'pedido',
        reference: pedido.id,
        message: `Pedido ${pedido.id} anulado mantiene ${docs.length} documento(s) activo(s).`,
      });
    }
  }

  const releaseKeys = new Set();
  for (const mov of snapshot.movimientos) {
    if (String(mov.tipo) !== 'SALIDA_VENTA') continue;
    if (!mov.pedido_id) continue;
    const ref = String(mov.referencia ?? '').toUpperCase();
    if (!ref) continue;
    releaseKeys.add(`${mov.pedido_id}:${ref}`);
  }

  const retryByKey = new Set();
  for (const item of activeQueue) {
    if (item.entity !== ACTIVE_DOC_RELEASE_RETRY_ENTITY) continue;
    if (!item.entity_id) continue;
    retryByKey.add(String(item.entity_id));
  }

  const nowMs = Date.now();
  for (const doc of activeDocs) {
    const tipo = String(doc.tipo ?? '').toUpperCase();
    if (tipo !== 'FAC' && tipo !== 'REM') continue;

    const emitidoAtMs = _toMs(doc.emitido_at ?? doc.created_at);
    if (emitidoAtMs !== null && (nowMs - emitidoAtMs) < DOCUMENT_RELEASE_GRACE_MS) {
      continue;
    }

    const hasStockRelease = releaseKeys.has(`${doc.pedido_id}:${tipo}`);
    if (hasStockRelease) continue;

    const retryDocKey = `DOC:${doc.id}`;
    const retryPedidoKey = `PED:${doc.pedido_id}:${tipo}`;
    const hasRetry = retryByKey.has(retryDocKey) || retryByKey.has(retryPedidoKey);

    _addIssue(issues, maxIssues, {
      code: hasRetry ? 'KARDEX_RELEASE_PENDING_RETRY' : 'KARDEX_RELEASE_MISSING',
      severity: hasRetry ? 'warning' : 'critical',
      entity: 'documento',
      reference: String(doc.id),
      message: hasRetry
        ? `Documento ${doc.id} sin descarga completa en kardex; existe retry pendiente.`
        : `Documento ${doc.id} sin evidencia de descarga en kardex (SALIDA_VENTA).`,
    });
  }

  return _buildReport({ source, snapshot, issues, maxIssues });
}

async function _loadSnapshot() {
  const [
    syncQueue,
    products,
    clientes,
    pedidos,
    documentos,
    movimientos,
    listas,
    dinamicas,
  ] = await Promise.all([
    getSyncQueue(),
    getAllProducts(),
    getAllClientes(),
    getAllPedidos(),
    getAllDocumentos(),
    getAllMovimientos(),
    getAllListas(),
    getAllDinamicasDB(),
  ]);

  return {
    syncQueue,
    products,
    clientes,
    pedidos,
    documentos,
    movimientos,
    listas,
    dinamicas,
  };
}

export class GlobalConsistencyReconciler {
  constructor(options = {}) {
    this.debounceMs = Number(options.debounceMs ?? 1200);
    this.maxIssues = Number(options.maxIssues ?? 30);
    this._timer = null;
    this._running = false;
    this._started = false;
    this._unsubs = [];
    this._onOnline = () => this.schedule('browser:online');
  }

  start() {
    if (this._started) return;
    this._started = true;

    for (const type of TRIGGER_EVENTS) {
      const off = eventBus.on(type, () => this.schedule(`event:${type}`));
      this._unsubs.push(off);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._onOnline);
    }

    this.schedule('startup');
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    for (const off of this._unsubs) off?.();
    this._unsubs = [];
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this._onOnline);
    }
  }

  schedule(source = 'manual') {
    if (!this._started) return;
    if (this._timer) clearTimeout(this._timer);
    const delay = Number.isFinite(this.debounceMs) && this.debounceMs >= 0 ? this.debounceMs : 1200;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.run(source).catch((error) => {
        console.warn('[Consistency] Error en reconciliacion programada', {
          source,
          error: error?.message ?? String(error),
        });
      });
    }, delay);
  }

  async run(source = 'manual') {
    if (this._running) {
      this.schedule(`${source}:requeue`);
      return null;
    }
    this._running = true;

    try {
      const snapshot = await _loadSnapshot();
      const report = _analyzeSnapshot(snapshot, source, this.maxIssues);
      eventBus.emit(Events.CONSISTENCY_STATUS_CHANGED, report);
      if (report.issue_count > 0) {
        eventBus.emit(Events.CONSISTENCY_ISSUES_DETECTED, report);
      }
      return report;
    } catch (error) {
      const report = {
        checked_at: _nowIso(),
        source,
        status: 'critical',
        issue_count: 1,
        critical_count: 1,
        warning_count: 0,
        max_issues_reached: false,
        totals: null,
        issues: [
          {
            id: crypto.randomUUID(),
            detected_at: _nowIso(),
            code: 'CONSISTENCY_CHECK_ERROR',
            severity: 'critical',
            entity: 'system',
            reference: 'reconciler',
            message: error?.message ?? String(error),
          },
        ],
      };
      eventBus.emit(Events.CONSISTENCY_STATUS_CHANGED, report);
      eventBus.emit(Events.CONSISTENCY_ISSUES_DETECTED, report);
      return report;
    } finally {
      this._running = false;
    }
  }
}
