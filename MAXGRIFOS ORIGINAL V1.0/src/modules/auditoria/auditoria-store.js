import {
  saveAuditSession,
  getAuditSession,
  getAllAuditSessions,
  saveAuditItem,
  getAuditItemById,
  getAuditItemsBySession,
  getClosedAuditSessions,
  getAllProducts,
  saveItemLedgerEntry,
  getItemLedgerByItem,
} from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { BODEGA_CENTRAL_ID, createBodegaSateliteTemporal, closeBodegaSateliteInventario as _closeBodegaSatelite } from '../kardex/bodega-store.js';
import { updateProduct as _updateProductCosto } from '../maestro-productos/product-store.js';

const SESSION_STATUS_V2 = Object.freeze({
  ACTIVE: 'active',
  IGNORED: 'ignored',
  ABANDONED: 'abandoned',
  CLOSING: 'closing',
  PARTIAL_CLOSE: 'partial_close',
  COMMITTED: 'committed',
  FAILED: 'failed',
});

const V2_STATUS_SET = new Set(Object.values(SESSION_STATUS_V2));
const INVENTARIO_STALE_MS = 48 * 60 * 60 * 1000;
const SESSION_V2_MIGRATION_VERSION = 'inv_session_v2_2026_05';

function _nowIso() {
  return new Date().toISOString();
}

function _isInventarioGeneralSession(session) {
  return Boolean(session?.es_inventario_general) || session?.type === 'inventario';
}

function _isV2Status(status) {
  return V2_STATUS_SET.has(status);
}

function _isCommitIntegrityOk(session) {
  return Boolean(
    session?.kardex_committed === true
    && Array.isArray(session?.snapshot_pre)
    && Array.isArray(session?.snapshot_post),
  );
}

function _toV2Status(session) {
  if (!_isInventarioGeneralSession(session)) return session?.status;
  if (_isV2Status(session?.status)) return session.status;

  switch (session?.status) {
    case 'in_progress':
      return SESSION_STATUS_V2.ACTIVE;
    case 'completed':
      return SESSION_STATUS_V2.COMMITTED;
    case 'closed':
      return _isCommitIntegrityOk(session) ? SESSION_STATUS_V2.COMMITTED : SESSION_STATUS_V2.PARTIAL_CLOSE;
    case 'abandoned':
      return SESSION_STATUS_V2.ABANDONED;
    default:
      return SESSION_STATUS_V2.FAILED;
  }
}

function _getLastActivityAt(session) {
  return session?.last_activity_at
    ?? session?.committed_at
    ?? session?.completed_at
    ?? session?.started_at
    ?? _nowIso();
}

function _isStaleActiveSession(session, nowMs = Date.now()) {
  if (session?.status !== SESSION_STATUS_V2.ACTIVE) return false;
  const ts = Date.parse(_getLastActivityAt(session));
  if (!Number.isFinite(ts)) return false;
  return (nowMs - ts) > INVENTARIO_STALE_MS;
}

async function _touchInventarioSessionActivity(sessionId, reason = 'activity') {
  const session = await getAuditSession(sessionId);
  if (!session || !_isInventarioGeneralSession(session)) return session;

  const now = _nowIso();
  const patched = {
    ...session,
    last_activity_at: now,
    stale_flag: false,
    stale_at: null,
    stale_reason: null,
  };

  if (patched.status === SESSION_STATUS_V2.IGNORED) {
    patched.status = SESSION_STATUS_V2.ACTIVE;
    patched.status_changed_at = now;
    patched.status_reason = `resume_on_${reason}`;
    patched.ignore_reason = null;
    patched.ignored_at = null;
  }

  await saveAuditSession(patched);
  return patched;
}

function _buildEmptySubdomainResults() {
  return {
    kardex: { status: 'pending', started_at: null, finished_at: null, errors: [], idempotency_refs: [] },
    costos: { status: 'pending', started_at: null, finished_at: null, errors: [], idempotency_refs: [] },
    snapshot: { status: 'pending', started_at: null, finished_at: null, errors: [], idempotency_refs: [] },
    historial: { status: 'pending', started_at: null, finished_at: null, errors: [], idempotency_refs: [] },
  };
}

function _upsertCloseLedger(session, attempt) {
  const prev = session.close_ledger ?? {};
  const attempts = Array.isArray(prev.attempts) ? prev.attempts.slice() : [];
  attempts.push(attempt);
  return {
    ...prev,
    latest_attempt_id: attempt.attempt_id,
    last_attempt_at: attempt.finished_at ?? attempt.started_at,
    subdomain_results: attempt.subdomain_results,
    pending_actions: attempt.pending_actions ?? [],
    attempts,
  };
}

function _requestKardex(requestEvent, responseEvent, payload, timeoutMs = 8000) {
  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    let off = null;
    const timer = setTimeout(() => {
      off?.();
      reject(new Error(`Timeout esperando respuesta de ${responseEvent}`));
    }, timeoutMs);

    off = eventBus.on(responseEvent, ({ payload: response }) => {
      if (!response || response.request_id !== requestId) return;
      clearTimeout(timer);
      off?.();
      if (response.ok === false) {
        reject(new Error(response.error ?? `Error en ${responseEvent}`));
        return;
      }
      resolve(response);
    });

    eventBus.emit(requestEvent, { request_id: requestId, ...payload });
  });
}

async function _getSaldoCentral(productId) {
  const result = await _requestKardex(
    Events.AUDIT_SALDO_REQUESTED,
    Events.AUDIT_SALDO_RESOLVED,
    { product_id: productId, bodega_id: BODEGA_CENTRAL_ID },
  );
  return Number(result.saldo ?? 0);
}

async function _getSaldoBodega(productId, bodegaId) {
  const result = await _requestKardex(
    Events.AUDIT_SALDO_REQUESTED,
    Events.AUDIT_SALDO_RESOLVED,
    { product_id: productId, bodega_id: bodegaId },
  );
  return Number(result.saldo ?? 0);
}

async function _crearAjusteAuditoria(item, qtyFisica, causal) {
  await _requestKardex(
    Events.AUDIT_STOCK_ADJUST_REQUESTED,
    Events.AUDIT_STOCK_ADJUST_RESOLVED,
    {
      product_id: item.product_id,
      cantidad: qtyFisica,
      bodega_id: BODEGA_CENTRAL_ID,
      causal,
      referencia: 'AUDITORIA_CONCILIACION',
    },
  );
}

// â”€â”€ F2: Inventario General con bodega satÃ©lite temporal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function startInventarioGeneralSession(scope, bodegaIds) {
  const sessionId = crypto.randomUUID();
  const now = _nowIso();

  const bodegaSatelite = await createBodegaSateliteTemporal(sessionId);

  const session = {
    id: sessionId,
    type: 'inventario',
    scope,
    status: SESSION_STATUS_V2.ACTIVE,
    started_at: now,
    completed_at: null,
    committed_at: null,
    bodega_ids: bodegaIds,
    bodega_satelite_id: bodegaSatelite.id,
    bodega_satelite_nombre: bodegaSatelite.nombre,
    es_inventario_general: true,
    legacy_status: 'in_progress',
    migration_version: SESSION_V2_MIGRATION_VERSION,
    migrated_at: now,
    status_changed_at: now,
    status_reason: 'session_started',
    last_activity_at: now,
    close_ledger: {
      attempts: [],
      latest_attempt_id: null,
      subdomain_results: _buildEmptySubdomainResults(),
      pending_actions: [],
    },
  };
  await saveAuditSession(session);
  eventBus.emit(Events.AUDIT_STARTED, session);
  return session;
}

export async function snapshotInicialInventario(session, products) {
  const bodegaIds = session.bodega_ids ?? [BODEGA_CENTRAL_ID];
  const items = [];
  for (const p of products) {
    let qtySistema = 0;
    for (const bid of bodegaIds) {
      qtySistema += await _getSaldoBodega(p.id, bid);
    }
    const item = {
      id: crypto.randomUUID(),
      session_id: session.id,
      product_id: p.id,
      sku: p.sku,
      nombre: p.nombre,
      uom: p.uom,
      code128: p.code128 ?? null,
      ref_proveedor: p.ref_proveedor ?? null,
      costo_sistema: Number(p.costo_vigente_real ?? p.costo ?? 0),
      costo_fisico: null,
      qty_sistema: qtySistema,
      qty_fisica: null,
      diferencia: null,
      causal: null,
      reconciled: false,
      bodega_id: session.bodega_satelite_id,
      bodega_ids_snap: bodegaIds,
      es_inventario_general: true,
      usuario: 'local',
    };
    await saveAuditItem(item);
    items.push(item);
  }
  return items;
}

export async function registerCostoFisico(item, costoFisico) {
  const updated = {
    ...item,
    costo_fisico: Number(costoFisico),
  };
  await saveAuditItem(updated);
  await _touchInventarioSessionActivity(item.session_id, 'cost_update');
  return updated;
}

// â”€â”€ F5: Agregar producto nuevo a bodega satÃ©lite durante Inventario General â”€â”€
export async function addProductoNuevoAInventarioGeneral(session, product) {
  const item = {
    id: crypto.randomUUID(),
    session_id: session.id,
    product_id: product.id,
    sku: product.sku,
    nombre: product.nombre,
    uom: product.uom,
    code128: product.code128 ?? null,
    ref_proveedor: product.ref_proveedor ?? null,
    costo_sistema: 0,
    costo_fisico: null,
    qty_sistema: 0,
    qty_fisica: null,
    diferencia: null,
    causal: null,
    reconciled: false,
    bodega_id: session.bodega_satelite_id,
    bodega_ids_snap: session.bodega_ids ?? [],
    es_inventario_general: true,
    es_producto_nuevo: true,
    usuario: 'local',
  };
  await saveAuditItem(item);
  await _touchInventarioSessionActivity(session.id, 'new_product');
  return item;
}

export async function startAuditSession(type, scope) {
  const session = {
    id: crypto.randomUUID(),
    type,
    scope,
    status: 'in_progress',
    started_at: new Date().toISOString(),
    completed_at: null,
  };
  await saveAuditSession(session);
  eventBus.emit(Events.AUDIT_STARTED, session);
  return session;
}

export async function loadProductsForScope(scope) {
  const all = await getAllProducts();
  if (scope === 'active') return all.filter((p) => p.status === 'active');
  if (scope === 'inactive') return all.filter((p) => p.status === 'inactive');
  return all;
}

export async function addItemToAudit(sessionId, product) {
  const qtySistema = await _getSaldoCentral(product.id);
  const item = {
    id: crypto.randomUUID(),
    session_id: sessionId,
    product_id: product.id,
    sku: product.sku,
    nombre: product.nombre,
    uom: product.uom,
    qty_sistema: qtySistema,
    qty_fisica: null,
    diferencia: null,
    causal: null,
    reconciled: false,
    bodega_id: BODEGA_CENTRAL_ID,
    usuario: 'local',
  };
  await saveAuditItem(item);
  return item;
}

export async function registerCount(item, qtyFisica) {
  const updated = {
    ...item,
    qty_fisica: qtyFisica,
    diferencia: qtyFisica - item.qty_sistema,
  };
  await saveAuditItem(updated);
  await _touchInventarioSessionActivity(item.session_id, 'count');
  return updated;
}

export async function reconcileItem(item, causal, meta = {}) {
  const qtyFisica = Number(item.qty_fisica);
  if (!Number.isFinite(qtyFisica) || qtyFisica < 0) {
    throw new Error(`Cantidad fisica invalida para SKU ${item.sku}`);
  }

  const causalMeta = {
    causal_applied_by: meta.applied_mode ?? 'individual',
    causal_usuario: meta.usuario ?? item.usuario ?? 'local',
    causal_timestamp: new Date().toISOString(),
  };

  // F2: items de Inventario General se registran solo en bodega satÃ©lite, NO tocan Kardex oficial
  if (item.es_inventario_general) {
    const updated = {
      ...item,
      diferencia: qtyFisica - item.qty_sistema,
      causal,
      ...causalMeta,
      reconciled: true,
    };
    await saveAuditItem(updated);
    await _touchInventarioSessionActivity(item.session_id, 'reconcile');
    return updated;
  }

  // Legacy path (AuditorÃ­a): aplica ajuste inmediato a Kardex oficial
  const qtySistemaActual = await _getSaldoCentral(item.product_id);
  if (qtyFisica !== qtySistemaActual) {
    await _crearAjusteAuditoria(item, qtyFisica, causal);
  }

  const updated = {
    ...item,
    qty_sistema: qtySistemaActual,
    diferencia: qtyFisica - qtySistemaActual,
    causal,
    ...causalMeta,
    reconciled: true,
  };
  await saveAuditItem(updated);
  await _touchInventarioSessionActivity(item.session_id, 'reconcile');
  return updated;
}

export async function completeSession(session) {
  if (_isInventarioGeneralSession(session)) {
    return commitInventarioGeneralKardex(session, await getAuditItemsBySession(session.id));
  }
  const updated = {
    ...session,
    status: 'completed',
    completed_at: _nowIso(),
  };
  await saveAuditSession(updated);
  eventBus.emit(Events.AUDIT_COMPLETED, updated);
  return updated;
}

export async function getSessionItems(sessionId) {
  return getAuditItemsBySession(sessionId);
}

export async function getInProgressSessions() {
  const sessions = await getAllAuditSessions();
  return sessions.filter((s) => {
    if (_isInventarioGeneralSession(s)) {
      const status = _toV2Status(s);
      return [
        SESSION_STATUS_V2.ACTIVE,
        SESSION_STATUS_V2.CLOSING,
        SESSION_STATUS_V2.PARTIAL_CLOSE,
        SESSION_STATUS_V2.FAILED,
      ].includes(status);
    }
    return s.status === 'in_progress';
  });
}

// F8: Historial forense â€” sesiones cerradas/completadas/abandonadas, solo lectura
export async function getHistorialSessions() {
  await bootstrapInventarioSessionV2Backfill();
  return getClosedAuditSessions();
}

export async function abandonSession(session) {
  const now = _nowIso();
  if (_isInventarioGeneralSession(session)) {
    const latest = await getAuditSession(session.id) ?? session;
    const updatedV2 = {
      ...latest,
      status: SESSION_STATUS_V2.ABANDONED,
      status_changed_at: now,
      status_reason: 'abandoned_by_user',
      completed_at: now,
      last_activity_at: now,
      ignore_reason: null,
      ignored_at: null,
    };
    await saveAuditSession(updatedV2);
    return updatedV2;
  }

  const updated = {
    ...session,
    status: 'abandoned',
    completed_at: now,
  };
  await saveAuditSession(updated);
  return updated;
}

export async function bootstrapInventarioSessionV2Backfill() {
  const sessions = await getAllAuditSessions();
  const now = _nowIso();
  let migrated = 0;

  for (const session of sessions) {
    if (!_isInventarioGeneralSession(session)) continue;

    const mappedStatus = _toV2Status(session);
    const next = {
      ...session,
      status: mappedStatus,
      migration_version: SESSION_V2_MIGRATION_VERSION,
      migrated_at: session.migrated_at ?? now,
      legacy_status: session.legacy_status ?? (_isV2Status(session.status) ? null : session.status),
      last_activity_at: session.last_activity_at ?? _getLastActivityAt(session),
      close_ledger: session.close_ledger ?? {
        attempts: [],
        latest_attempt_id: null,
        subdomain_results: _buildEmptySubdomainResults(),
        pending_actions: [],
      },
    };

    if (
      session.status !== next.status
      || session.migration_version !== next.migration_version
      || session.migrated_at !== next.migrated_at
      || session.legacy_status !== next.legacy_status
      || session.last_activity_at !== next.last_activity_at
      || !session.close_ledger
    ) {
      await saveAuditSession(next);
      migrated++;
    }
  }

  return { ok: true, migrated };
}

export async function setSessionIgnored(session, reason = 'ignored_by_user') {
  const latest = await getAuditSession(session.id) ?? session;
  if (!_isInventarioGeneralSession(latest)) return latest;

  const now = _nowIso();
  const updated = {
    ...latest,
    status: SESSION_STATUS_V2.IGNORED,
    status_changed_at: now,
    status_reason: reason,
    ignored_at: now,
    ignore_reason: reason,
    last_activity_at: latest.last_activity_at ?? now,
  };
  await saveAuditSession(updated);
  return updated;
}

export async function resumeIgnoredSession(session) {
  const latest = await getAuditSession(session.id) ?? session;
  if (!_isInventarioGeneralSession(latest)) return latest;

  const now = _nowIso();
  const updated = {
    ...latest,
    status: SESSION_STATUS_V2.ACTIVE,
    status_changed_at: now,
    status_reason: 'resume_manual',
    ignored_at: null,
    ignore_reason: null,
    last_activity_at: now,
    stale_flag: false,
    stale_at: null,
    stale_reason: null,
  };
  await saveAuditSession(updated);
  return updated;
}

export async function getRecoverySessionsSanitized() {
  await bootstrapInventarioSessionV2Backfill();
  const sessions = await getAllAuditSessions();
  const nowMs = Date.now();
  const candidates = [];

  for (const session of sessions) {
    if (_isInventarioGeneralSession(session)) {
      const status = _toV2Status(session);
      const latest = session.status === status ? session : { ...session, status };
      const isStale = _isStaleActiveSession(latest, nowMs);

      if (isStale) {
        if (!latest.stale_flag) {
          await saveAuditSession({
            ...latest,
            stale_flag: true,
            stale_at: _nowIso(),
            stale_reason: 'active_without_activity_48h',
          });
        }
        continue;
      }

      if (status === SESSION_STATUS_V2.IGNORED) continue;
      if (![SESSION_STATUS_V2.ACTIVE, SESSION_STATUS_V2.CLOSING, SESSION_STATUS_V2.PARTIAL_CLOSE, SESSION_STATUS_V2.FAILED].includes(status)) {
        continue;
      }

      candidates.push({
        ...latest,
        recovery_status: status,
        last_activity_at: _getLastActivityAt(latest),
      });
      continue;
    }

    if (session.status === 'in_progress') {
      candidates.push({
        ...session,
        recovery_status: 'in_progress',
        last_activity_at: _getLastActivityAt(session),
      });
    }
  }

  const rank = {
    partial_close: 0,
    failed: 1,
    closing: 2,
    active: 3,
    in_progress: 4,
  };

  return candidates.sort((a, b) => {
    const ra = rank[a.recovery_status] ?? 99;
    const rb = rank[b.recovery_status] ?? 99;
    if (ra !== rb) return ra - rb;
    return String(b.last_activity_at ?? '').localeCompare(String(a.last_activity_at ?? ''));
  });
}

// â”€â”€ F6: requestKardex con requestId determinista para idempotencia en reintento â”€â”€
function _requestKardexWithKey(requestId, requestEvent, responseEvent, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let off = null;
    const timer = setTimeout(() => {
      off?.();
      reject(new Error(`Timeout esperando respuesta de Kardex para ${requestId}`));
    }, timeoutMs);
    off = eventBus.on(responseEvent, ({ payload: response }) => {
      if (!response || response.request_id !== requestId) return;
      clearTimeout(timer);
      off?.();
      if (response.ok === false) {
        reject(new Error(response.error ?? `Error en ${responseEvent}`));
        return;
      }
      resolve(response);
    });
    eventBus.emit(requestEvent, { request_id: requestId, ...payload });
  });
}

// â”€â”€ F6: Cierre atÃ³mico e idempotente â€” actualiza Kardex oficial solo al cerrar â”€â”€
export async function commitInventarioGeneralKardex(session, items) {
  const baseSession = await getAuditSession(session.id) ?? session;
  if (!_isInventarioGeneralSession(baseSession)) {
    throw new Error('Cierre transaccional V2 solo aplica a Inventario General');
  }

  if ((baseSession.status === SESSION_STATUS_V2.COMMITTED || baseSession.status === 'committed') && baseSession.kardex_committed === true) {
    return {
      ok: true,
      skipped: true,
      final_status: SESSION_STATUS_V2.COMMITTED,
      pending_actions: [],
      subdomain_results: baseSession?.close_ledger?.subdomain_results ?? _buildEmptySubdomainResults(),
      session: baseSession,
      adjustments_count: Number(baseSession.adjustments_count ?? 0),
    };
  }

  const now = _nowIso();
  const currentStatus = _toV2Status(baseSession);
  const allowedStatuses = new Set([
    SESSION_STATUS_V2.ACTIVE,
    SESSION_STATUS_V2.CLOSING,
    SESSION_STATUS_V2.PARTIAL_CLOSE,
    SESSION_STATUS_V2.FAILED,
    SESSION_STATUS_V2.IGNORED,
  ]);
  if (!allowedStatuses.has(currentStatus)) {
    throw new Error(`La sesión no está disponible para cierre/reintento (estado: ${currentStatus})`);
  }

  const snapshotPre = items.map((i) => ({
    product_id: i.product_id,
    sku: i.sku,
    qty: i.qty_sistema,
    costo: i.costo_sistema,
  }));
  const snapshotPost = items.map((i) => ({
    product_id: i.product_id,
    sku: i.sku,
    qty: i.qty_fisica,
    costo: i.costo_fisico ?? i.costo_sistema,
  }));

  const attempt = {
    attempt_id: crypto.randomUUID(),
    started_at: now,
    finished_at: null,
    status: 'running',
    from_status: currentStatus,
    subdomain_results: _buildEmptySubdomainResults(),
    errors: [],
    idempotency_refs: [],
    pending_actions: [],
    retry_index: Number(baseSession.retry_count ?? 0) + 1,
  };

  const previousSubdomains = baseSession?.close_ledger?.subdomain_results ?? {};
  const kardexAlreadyPass = previousSubdomains?.kardex?.status === 'pass' || (
    baseSession.kardex_committed === true
    && [SESSION_STATUS_V2.PARTIAL_CLOSE, SESSION_STATUS_V2.FAILED, SESSION_STATUS_V2.CLOSING].includes(currentStatus)
  );

  let adjustments = [];
  let finalStatus = SESSION_STATUS_V2.COMMITTED;
  const isRetryAttempt = [
    SESSION_STATUS_V2.PARTIAL_CLOSE,
    SESSION_STATUS_V2.FAILED,
    SESSION_STATUS_V2.CLOSING,
  ].includes(currentStatus);

  const closingSession = {
    ...baseSession,
    status: SESSION_STATUS_V2.CLOSING,
    status_changed_at: now,
    status_reason: currentStatus === SESSION_STATUS_V2.PARTIAL_CLOSE ? 'retry_close_requested' : 'close_requested',
    close_attempt_id: attempt.attempt_id,
    retry_count: Number(baseSession.retry_count ?? 0) + (isRetryAttempt ? 1 : 0),
    last_activity_at: now,
  };
  await saveAuditSession(closingSession);

  try {
    attempt.subdomain_results.kardex.started_at = _nowIso();
    if (kardexAlreadyPass) {
      attempt.subdomain_results.kardex.status = 'skipped';
      attempt.subdomain_results.kardex.finished_at = _nowIso();
      attempt.subdomain_results.kardex.idempotency_refs = previousSubdomains?.kardex?.idempotency_refs ?? [];
      adjustments = previousSubdomains?.kardex?.adjusted_items ?? [];
    } else {
      const kardexErrors = [];
      for (const item of items) {
        const qtyFisica = Number(item.qty_fisica);
        const diff = Number(item.diferencia ?? (qtyFisica - Number(item.qty_sistema)));
        if (diff === 0 && !item.es_producto_nuevo) continue;
        // Producto nuevo con conteo 0: no requiere movimiento en Kardex.
        if (item.es_producto_nuevo && (!Number.isFinite(qtyFisica) || qtyFisica <= 0)) continue;

        const primaryBodegaId = (item.bodega_ids_snap ?? [])[0] ?? BODEGA_CENTRAL_ID;
        const requestId = `INVGEN_CLOSE:${baseSession.id}:${item.product_id}`;
        attempt.idempotency_refs.push(requestId);
        attempt.subdomain_results.kardex.idempotency_refs.push(requestId);
        try {
          await _requestKardexWithKey(
            requestId,
            Events.AUDIT_STOCK_ADJUST_REQUESTED,
            Events.AUDIT_STOCK_ADJUST_RESOLVED,
            {
              product_id: item.product_id,
              product_sku: item.sku ?? '',
              product_name: item.nombre ?? '',
              cantidad: qtyFisica,
              bodega_id: primaryBodegaId,
              causal: item.causal ?? 'AJUSTE INICIAL',
              referencia: `INVGEN_CIERRE:${baseSession.id}`,
            },
          );
          adjustments.push(item.product_id);
        } catch (err) {
          kardexErrors.push({ product_id: item.product_id, sku: item.sku, error: err.message });
        }
      }

      attempt.subdomain_results.kardex.adjusted_items = adjustments;
      attempt.subdomain_results.kardex.finished_at = _nowIso();
      if (kardexErrors.length > 0) {
        attempt.subdomain_results.kardex.status = 'fail';
        attempt.subdomain_results.kardex.errors = kardexErrors;
        attempt.errors.push(...kardexErrors);
        finalStatus = SESSION_STATUS_V2.FAILED;
        attempt.pending_actions.push('inspect_kardex_errors');
      } else {
        attempt.subdomain_results.kardex.status = 'pass';
      }
    }

    attempt.subdomain_results.costos.started_at = _nowIso();
    const costoErrors = [];
    const updatedCosts = [];

    if (finalStatus !== SESSION_STATUS_V2.FAILED) {
      for (const item of items) {
        if (
          item.costo_fisico == null
          || item.costo_fisico <= 0
          || item.costo_fisico === item.costo_sistema
        ) {
          continue;
        }

        const costKey = `INVGEN_COST:${baseSession.id}:${item.product_id}:${Number(item.costo_fisico)}`;
        attempt.idempotency_refs.push(costKey);
        attempt.subdomain_results.costos.idempotency_refs.push(costKey);
        try {
          const updatedProduct = await _updateProductCosto(
            item.product_id,
            { costo: item.costo_fisico },
            { emitCostoTrace: true, origen: 'INVENTARIO_GENERAL_CIERRE', referencia: baseSession.id },
          );
          if (!updatedProduct) {
            throw new Error(`Producto no encontrado para actualizar costo (${item.product_id})`);
          }
          updatedCosts.push(item.product_id);
        } catch (err) {
          costoErrors.push({ product_id: item.product_id, sku: item.sku, error: err?.message ?? 'Error actualizando costo' });
        }
      }
    }

    attempt.subdomain_results.costos.updated_items = updatedCosts;
    attempt.subdomain_results.costos.finished_at = _nowIso();
    if (finalStatus === SESSION_STATUS_V2.FAILED) {
      attempt.subdomain_results.costos.status = 'skipped';
    } else if (costoErrors.length > 0) {
      attempt.subdomain_results.costos.status = 'fail';
      attempt.subdomain_results.costos.errors = costoErrors;
      attempt.errors.push(...costoErrors);
      finalStatus = SESSION_STATUS_V2.PARTIAL_CLOSE;
      attempt.pending_actions.push('retry_cost_updates');
    } else {
      attempt.subdomain_results.costos.status = 'pass';
    }

    attempt.subdomain_results.snapshot.started_at = _nowIso();
    attempt.subdomain_results.snapshot.finished_at = _nowIso();
    attempt.subdomain_results.snapshot.status = 'pass';

    attempt.subdomain_results.historial.started_at = _nowIso();
    const endTs = _nowIso();
    let nextStatus = finalStatus;

    if (nextStatus === SESSION_STATUS_V2.COMMITTED && baseSession.bodega_satelite_id) {
      await _closeBodegaSatelite(baseSession.bodega_satelite_id);
    }

    const finalizedSession = {
      ...closingSession,
      status: nextStatus,
      status_changed_at: endTs,
      status_reason: nextStatus === SESSION_STATUS_V2.COMMITTED
        ? 'close_pipeline_committed'
        : nextStatus === SESSION_STATUS_V2.PARTIAL_CLOSE
          ? 'close_pipeline_partial_cost_fail'
          : 'close_pipeline_failed',
      kardex_committed: attempt.subdomain_results.kardex.status === 'pass' || attempt.subdomain_results.kardex.status === 'skipped',
      committed_at: nextStatus === SESSION_STATUS_V2.COMMITTED ? endTs : null,
      completed_at: nextStatus === SESSION_STATUS_V2.COMMITTED ? endTs : null,
      snapshot_pre: snapshotPre,
      snapshot_post: snapshotPost,
      adjustments_count: adjustments.length,
      last_activity_at: endTs,
      close_ledger: closingSession.close_ledger ?? baseSession.close_ledger ?? null,
      pending_actions: attempt.pending_actions,
    };

    attempt.subdomain_results.historial.finished_at = _nowIso();
    attempt.subdomain_results.historial.status = 'pass';
    attempt.finished_at = _nowIso();
    attempt.status = nextStatus === SESSION_STATUS_V2.COMMITTED ? 'pass' : (nextStatus === SESSION_STATUS_V2.PARTIAL_CLOSE ? 'partial' : 'fail');

    finalizedSession.close_ledger = _upsertCloseLedger(finalizedSession, attempt);
    await saveAuditSession(finalizedSession);

    if (nextStatus === SESSION_STATUS_V2.COMMITTED) {
      eventBus.emit(Events.AUDIT_COMPLETED, finalizedSession);
    }

    return {
      ok: nextStatus === SESSION_STATUS_V2.COMMITTED,
      final_status: nextStatus,
      session: finalizedSession,
      adjustments_count: adjustments.length,
      subdomain_results: attempt.subdomain_results,
      pending_actions: attempt.pending_actions,
      close_attempt_id: attempt.attempt_id,
    };
  } catch (err) {
    const failedAt = _nowIso();
    attempt.finished_at = failedAt;
    attempt.status = 'fail';
    attempt.errors.push({ stage: 'pipeline', error: err?.message ?? String(err) });
    attempt.subdomain_results.historial.started_at = attempt.subdomain_results.historial.started_at ?? failedAt;
    attempt.subdomain_results.historial.finished_at = failedAt;
    attempt.subdomain_results.historial.status = 'fail';
    attempt.subdomain_results.historial.errors = [{ error: err?.message ?? String(err) }];

    const failedSession = {
      ...closingSession,
      status: SESSION_STATUS_V2.FAILED,
      status_changed_at: failedAt,
      status_reason: 'close_pipeline_exception',
      last_activity_at: failedAt,
      pending_actions: ['inspect_close_pipeline_error'],
      close_ledger: closingSession.close_ledger ?? baseSession.close_ledger ?? null,
    };
    failedSession.close_ledger = _upsertCloseLedger(failedSession, attempt);
    await saveAuditSession(failedSession);

    return {
      ok: false,
      final_status: SESSION_STATUS_V2.FAILED,
      session: failedSession,
      adjustments_count: 0,
      subdomain_results: attempt.subdomain_results,
      pending_actions: ['inspect_close_pipeline_error'],
      close_attempt_id: attempt.attempt_id,
      error: err?.message ?? String(err),
    };
  }
}

export async function retryPartialCloseCommit(session, items) {
  const latest = await getAuditSession(session.id) ?? session;
  const status = _toV2Status(latest);
  if (![SESSION_STATUS_V2.PARTIAL_CLOSE, SESSION_STATUS_V2.FAILED, SESSION_STATUS_V2.CLOSING].includes(status)) {
    throw new Error(`Solo se puede reintentar cierre desde partial_close/failed/closing (actual: ${status})`);
  }
  return commitInventarioGeneralKardex(latest, items);
}

// -- MULTIUSUARIO: Lock lógico por ítem (TTL 5 min) ---------------------------

const ITEM_LOCK_TTL_MS = 5 * 60 * 1000;

export async function acquireItemLock(item, deviceId, deviceLabel) {
  const current = await getAuditItemById(item.id);
  if (!current) throw new Error(`Ãtem no encontrado: ${item.id}`);
  const now = new Date();

  if (current.item_locked_by && current.item_locked_by !== deviceId) {
    const expiresAt = new Date(current.lock_expires_at ?? 0);
    if (now < expiresAt) {
      return {
        ok: false,
        locked_by: current.last_edit_label ?? current.item_locked_by,
        locked_at: current.item_locked_at,
        lock_expires_at: current.lock_expires_at,
      };
    }
  }

  const updated = {
    ...current,
    item_locked_by: deviceId,
    item_locked_at: now.toISOString(),
    lock_expires_at: new Date(now.getTime() + ITEM_LOCK_TTL_MS).toISOString(),
    last_edit_label: deviceLabel,
  };
  await saveAuditItem(updated);
  return { ok: true, item: updated };
}

export async function releaseItemLock(item, deviceId) {
  const current = await getAuditItemById(item.id);
  if (!current) return null;
  if (current.item_locked_by !== deviceId) return current;
  const updated = {
    ...current,
    item_locked_by: null,
    item_locked_at: null,
    lock_expires_at: null,
  };
  await saveAuditItem(updated);
  return updated;
}

// â”€â”€ MULTIUSUARIO: Conteo con detecciÃ³n de conflicto + ledger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function registerCountMultiuser(item, qtyFisica, deviceId, deviceLabel) {
  const current = await getAuditItemById(item.id);
  if (!current) throw new Error(`Ãtem no encontrado: ${item.id}`);

  const clientVersion = Number(item.edit_version ?? 0);
  const serverVersion = Number(current.edit_version ?? 0);
  const now = new Date().toISOString();

  if (serverVersion > clientVersion && current.last_edit_by !== deviceId) {
    const conflict = {
      ...current,
      conflict_detected: true,
      conflict_detail: `Conflicto: versiÃ³n esperada ${clientVersion}, actual ${serverVersion}. Editado por "${current.last_edit_label ?? current.last_edit_by ?? 'otro dispositivo'}".`,
    };
    await saveAuditItem(conflict);
    await saveItemLedgerEntry({
      id: crypto.randomUUID(),
      item_id: item.id,
      session_id: item.session_id,
      device_id: deviceId,
      device_label: deviceLabel,
      action: 'conflict',
      qty_before: current.qty_fisica,
      qty_after: qtyFisica,
      timestamp: now,
      idempotency_key: `CONFLICT:${item.id}:${deviceId}:${serverVersion}`,
    });
    throw new Error(conflict.conflict_detail);
  }

  const updated = {
    ...current,
    qty_fisica: qtyFisica,
    diferencia: qtyFisica - Number(current.qty_sistema),
    last_edit_by: deviceId,
    last_edit_at: now,
    last_edit_label: deviceLabel,
    contado_por: deviceId,
    contado_at: now,
    edit_version: serverVersion + 1,
    item_locked_by: null,
    item_locked_at: null,
    lock_expires_at: null,
    conflict_detected: false,
    conflict_detail: null,
  };
  await saveAuditItem(updated);

  await saveItemLedgerEntry({
    id: crypto.randomUUID(),
    item_id: item.id,
    session_id: item.session_id,
    device_id: deviceId,
    device_label: deviceLabel,
    action: 'count',
    qty_before: item.qty_fisica,
    qty_after: qtyFisica,
    timestamp: now,
    idempotency_key: `COUNT:${item.id}:${deviceId}:${serverVersion}`,
  });

  await _touchInventarioSessionActivity(item.session_id, 'count_multiuser');

  return updated;
}

// â”€â”€ MULTIUSUARIO: Dashboard de progreso por sesiÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getSessionDashboard(sessionId) {
  const items = await getAuditItemsBySession(sessionId);
  const total = items.length;
  const now = new Date();

  let contados = 0;
  let pendientes = 0;
  let en_conteo = 0;
  let diferencias = 0;
  let conciliados = 0;
  let conflictos = 0;
  let nuevos = 0;

  for (const i of items) {
    if (i.conflict_detected) { conflictos++; continue; }
    if (i.reconciled)        { conciliados++; continue; }
    if (i.qty_fisica !== null) {
      if (i.qty_sistema === 0 && Number(i.qty_fisica) > 0) { nuevos++; continue; }
      if (Number(i.qty_fisica) !== Number(i.qty_sistema)) { diferencias++; continue; }
      contados++;
      continue;
    }
    const locked = i.item_locked_by && new Date(i.lock_expires_at ?? 0) > now;
    if (locked) { en_conteo++; } else { pendientes++; }
  }

  const avance_pct = total ? Math.round(((contados + diferencias + conciliados + nuevos) / total) * 100) : 0;

  return {
    total,
    contados,
    pendientes,
    en_conteo,
    diferencias,
    conciliados,
    conflictos,
    nuevos,
    avance_pct,
  };
}

// â”€â”€ MULTIUSUARIO: Ledger de Ã­tem â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getItemLedger(itemId) {
  return getItemLedgerByItem(itemId);
}


