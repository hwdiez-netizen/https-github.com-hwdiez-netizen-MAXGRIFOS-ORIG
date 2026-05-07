(function bootstrapKardexVNextOverlay() {
  'use strict';

  const OVERLAY_NAME = 'kardex-vnext-overlay-f5';
  const OVERLAY_PHASE = 'F5';

  const DB_NAME = 'maxgrifos-erp';
  const STORE_PRODUCTS = 'products';
  const STORE_BODEGAS = 'bodegas';
  const STORE_KARDEX = 'kardex_movimientos';
  const STORE_PEDIDO_ITEMS = 'pedido_items';
  const STORE_CLIENTES = 'clientes';
  const STORE_SYNC_QUEUE = 'sync_queue';

  const BODEGA_CENTRAL_ID = 'BODEGA_CENTRAL';
  const BODEGA_PEDIDOS_ID = 'PEDIDOS';
  const BODEGA_GARANTIAS_ID = 'BODEGA_GARANTIAS';
  const DETAIL_OVERLAY_ROOT_ID = 'kdxv3-detail-overlay-root';
  const DETAIL_OVERLAY_STYLE_ID = 'kdxv3-detail-overlay-style';
  const REPLAY_QUEUE_STORAGE_KEY = 'kdxv4_event_replay_queue';
  const REPLAY_MAX_RETRIES = 5;
  const REPLAY_BATCH_SIZE = 8;
  const REPLAY_STALE_PROCESSING_MS = 2 * 60 * 1000;
  const REPLAY_BASE_BACKOFF_MS = 3 * 1000;
  const REPLAY_MAX_BACKOFF_MS = 60 * 1000;
  const REPLAY_POLL_INTERVAL_MS = 15 * 1000;
  const CUTOVER_OVERRIDE_STORAGE_KEY = 'kdxv5_cutover_override';
  const CUTOVER_STAGES = Object.freeze({
    OFF: 'off',
    SHADOW: 'shadow',
    CANARY: 'canary',
    LIVE: 'live',
  });

  const EVENT_CANONICAL = Object.freeze({
    FACTURA_EMITIDA: 'FacturaEmitida',
    REMISION_EMITIDA: 'RemisionEmitida',
    GARANTIA_RECONOCIDA: 'GarantiaReconocida',
    COMPRA_RECEPCIONADA: 'CompraRecepcionada',
    DEVOLUCION_CLIENTE_RECIBIDA: 'DevolucionClienteRecibida',
    NOTA_CREDITO_PROVEEDOR_EMITIDA: 'NotaCreditoProveedorEmitida',
  });

  const EVENT_ALIASES = Object.freeze({
    PedidoFacturado: EVENT_CANONICAL.FACTURA_EMITIDA,
    PedidoRemisionado: EVENT_CANONICAL.REMISION_EMITIDA,
    SalidaGarantia: EVENT_CANONICAL.GARANTIA_RECONOCIDA,
    EntradaGarantiaProveedor: EVENT_CANONICAL.NOTA_CREDITO_PROVEEDOR_EMITIDA,
  });

  const COMPATIBILITY = Object.freeze({
    FacturaEmitida: ['PedidoFacturado'],
    RemisionEmitida: ['PedidoRemisionado'],
    GarantiaReconocida: ['SalidaGarantia'],
    CompraRecepcionada: [],
    DevolucionClienteRecibida: [],
    NotaCreditoProveedorEmitida: ['EntradaGarantiaProveedor'],
  });

  const INGEST_CHANNELS = Object.freeze([
    'MAXGRIFOS_DOMAIN_EVENT',
    'maxgrifos:domain-event',
  ]);

  const DIRECT_EVENT_TYPES = Object.freeze([
    EVENT_CANONICAL.FACTURA_EMITIDA,
    EVENT_CANONICAL.REMISION_EMITIDA,
    EVENT_CANONICAL.GARANTIA_RECONOCIDA,
    EVENT_CANONICAL.COMPRA_RECEPCIONADA,
    EVENT_CANONICAL.DEVOLUCION_CLIENTE_RECIBIDA,
    EVENT_CANONICAL.NOTA_CREDITO_PROVEEDOR_EMITIDA,
    ...Object.keys(EVENT_ALIASES),
  ]);

  const state = {
    overlay_name: OVERLAY_NAME,
    phase: OVERLAY_PHASE,
    started_at: new Date().toISOString(),
    enabled: false,
    shadow_mode: true,
    runtime_status: 'booting',
    seed_status: 'pending',
    seed_result: null,
    listeners_bound: false,
    retry_runtime_status: 'pending',
    retry_bound: false,
    retry_last_trigger: null,
    retry_last_drain_at: null,
    cutover_stage_config: CUTOVER_STAGES.OFF,
    cutover_stage_effective: CUTOVER_STAGES.OFF,
    cutover_canary_percent: 0,
    cutover_legacy_writer_active: true,
    cutover_live_event_types: [],
    cutover_override_active: false,
    cutover_last_decision: null,
    cutover_last_updated_at: null,
    cutover_rollbacks: 0,
    ux_runtime_status: 'pending',
    ux_bound: false,
    ux_last_action: null,
    queue_total: 0,
    queue_pending: 0,
    queue_processing: 0,
    queue_failed: 0,
    queue_replayed: 0,
    queue_retried: 0,
    queue_exhausted: 0,
    ui_runtime_status: 'pending',
    ui_bound: false,
    ui_cards_bound: 0,
    ui_open_bodega_id: null,
    events_received: 0,
    events_processed: 0,
    events_skipped: 0,
    movements_written: 0,
    last_event_type: null,
    last_result: null,
    error: null,
    _queue: Promise.resolve(),
  };

  const formatNumberCo = new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  });
  const formatCurrencyCo = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  const bodegaUi = {
    observer: null,
    refreshTimer: null,
    isBound: false,
  };
  const replayRuntime = {
    timerId: null,
    isBound: false,
    memoryQueue: [],
  };
  const uxRuntime = {
    observer: null,
    refreshTimer: null,
    isBound: false,
    kardexSaveCount: 0,
  };
  const cutoverRuntime = {
    liveEventTypes: new Set(Object.values(EVENT_CANONICAL)),
    canaryPercent: 0,
    stageConfig: CUTOVER_STAGES.OFF,
    stageEffective: CUTOVER_STAGES.OFF,
    legacyWriterActive: true,
    overrideActive: false,
  };

  function randomId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function asNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toUpper(value) {
    return String(value == null ? '' : value).toUpperCase();
  }

  function normalizeError(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (typeof error.message === 'string' && error.message.length > 0) return error.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  function escapeHtml(value) {
    const input = String(value == null ? '' : value);
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripAccents(value) {
    const text = String(value == null ? '' : value);
    if (typeof text.normalize !== 'function') return text;
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeBodegaName(value) {
    return stripAccents(value).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function formatDateTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Sin fecha';
    return date.toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  function formatQty(value) {
    return formatNumberCo.format(asNumber(value));
  }

  function formatMoney(value) {
    return formatCurrencyCo.format(asNumber(value));
  }

  function findNearestMainContainer(el) {
    if (!el || !(el instanceof Element)) return null;
    return el.closest('#main-content') || document.getElementById('main-content') || document.body;
  }

  function isTruthyText(text, candidates) {
    const value = String(text || '').toLowerCase();
    return candidates.some((token) => value.includes(String(token).toLowerCase()));
  }

  function ensureUxToastStyle() {
    if (document.getElementById('kdxv5-ux-toast-style')) return;
    const style = document.createElement('style');
    style.id = 'kdxv5-ux-toast-style';
    style.textContent = `
      .kdxv5-ux-toast-wrap {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: 82px;
        z-index: 9998;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }
      .kdxv5-ux-toast {
        pointer-events: auto;
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 12px;
        line-height: 1.35;
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
        color: #fff;
        animation: kdxv5ToastIn 120ms ease-out;
      }
      .kdxv5-ux-toast--ok { background: #0f766e; }
      .kdxv5-ux-toast--warn { background: #b45309; }
      .kdxv5-ux-toast--info { background: #1d4ed8; }
      @keyframes kdxv5ToastIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @media (min-width: 700px) {
        .kdxv5-ux-toast-wrap {
          right: auto;
          width: min(420px, calc(100vw - 24px));
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getUxToastWrap() {
    ensureUxToastStyle();
    let wrap = document.querySelector('.kdxv5-ux-toast-wrap');
    if (wrap) return wrap;
    wrap = document.createElement('div');
    wrap.className = 'kdxv5-ux-toast-wrap';
    document.body.appendChild(wrap);
    return wrap;
  }

  function showUxToast(message, type) {
    const wrap = getUxToastWrap();
    const toast = document.createElement('div');
    const tone = type || 'info';
    toast.className = 'kdxv5-ux-toast kdxv5-ux-toast--' + tone;
    toast.textContent = String(message || '');
    wrap.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3400);
    setState({
      ux_last_action: String(message || ''),
      ux_runtime_status: 'toast_shown',
    });
  }

  function parsePositiveFromInput(inputEl) {
    const raw = String(inputEl && inputEl.value ? inputEl.value : '');
    const digits = raw.replace(/\D+/g, '');
    if (!digits) return 0;
    const num = Number.parseInt(digits, 10);
    return Number.isFinite(num) ? num : 0;
  }

  function normalizeUpperText(value) {
    return String(value == null ? '' : value).toUpperCase().trim();
  }

  function normalizeAddressTokenForCliente(value) {
    return String(value == null ? '' : value)
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .slice(0, 8);
  }

  function normalizeAddressComplementForCliente(value) {
    return String(value == null ? '' : value)
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildClienteAddressFromForm(form) {
    const type = normalizeUpperText((form.querySelector('#addr-type') && form.querySelector('#addr-type').value) || 'CALLE') || 'CALLE';
    const main = normalizeAddressTokenForCliente((form.querySelector('#addr-main') && form.querySelector('#addr-main').value) || '');
    const cross = normalizeAddressTokenForCliente((form.querySelector('#addr-cross') && form.querySelector('#addr-cross').value) || '');
    const suffix = normalizeAddressTokenForCliente((form.querySelector('#addr-suffix') && form.querySelector('#addr-suffix').value) || '');
    const complement = normalizeAddressComplementForCliente((form.querySelector('#addr-comp') && form.querySelector('#addr-comp').value) || '');
    if (!main && !cross && !suffix && !complement) return '';
    if (!main || !cross || !suffix) return null;
    return type + ' ' + main + ' # ' + cross + '-' + suffix + (complement ? ' ' + complement : '');
  }

  function parseMaybeDate(value) {
    const ms = Date.parse(String(value || ''));
    return Number.isFinite(ms) ? ms : 0;
  }

  function safeJsonClone(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return '[' + value.map((item) => stableStringify(item)).join(',') + ']';
    }
    const keys = Object.keys(value).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }

  function simpleHash(value) {
    const input = String(value == null ? '' : value);
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function summarizeQueue(queue) {
    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      failed: 0,
    };
    for (const item of queue || []) {
      if (!item) continue;
      stats.total += 1;
      if (item.status === 'processing') {
        stats.processing += 1;
      } else if (item.status === 'failed') {
        stats.failed += 1;
      } else {
        stats.pending += 1;
      }
    }
    return stats;
  }

  function syncQueueStats(queue) {
    const stats = summarizeQueue(queue);
    setState({
      queue_total: stats.total,
      queue_pending: stats.pending,
      queue_processing: stats.processing,
      queue_failed: stats.failed,
    });
  }

  function readReplayQueueStorage() {
    try {
      const raw = localStorage.getItem(REPLAY_QUEUE_STORAGE_KEY);
      if (!raw) return replayRuntime.memoryQueue.slice();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        replayRuntime.memoryQueue = parsed;
        return parsed.slice();
      }
      return replayRuntime.memoryQueue.slice();
    } catch {
      return replayRuntime.memoryQueue.slice();
    }
  }

  function writeReplayQueueStorage(queue) {
    replayRuntime.memoryQueue = Array.isArray(queue) ? queue.slice() : [];
    try {
      localStorage.setItem(REPLAY_QUEUE_STORAGE_KEY, JSON.stringify(replayRuntime.memoryQueue));
      setState({
        retry_runtime_status: navigator.onLine ? 'online' : 'offline',
      });
    } catch {
      setState({
        retry_runtime_status: 'storage_fallback_memory',
      });
    }
    syncQueueStats(replayRuntime.memoryQueue);
  }

  function resolveEventAggregateForReplay(payload, canonicalType) {
    const directId =
      (payload && payload.id) ||
      (payload && payload.documento_id) ||
      (payload && payload.garantia_id) ||
      (payload && payload.compra_id) ||
      (payload && payload.devolucion_id) ||
      (payload && payload.nota_credito_id) ||
      ((payload && payload.documento && payload.documento.id) || null) ||
      ((payload && payload.pedido && payload.pedido.id) || null) ||
      ((payload && payload.compra && payload.compra.id) || null) ||
      ((payload && payload.devolucion && payload.devolucion.id) || null) ||
      ((payload && payload.nota_credito && payload.nota_credito.id) || null);
    if (directId) return String(directId);
    const clone = safeJsonClone(payload) || {};
    return 'AUTO-' + simpleHash(canonicalType + ':' + stableStringify(clone));
  }

  function buildReplayEventKey(canonicalType, payload) {
    const aggregate = resolveEventAggregateForReplay(payload, canonicalType);
    const items = normalizeItems(payload)
      .map((item, idx) => itemKey(item, idx))
      .filter(Boolean)
      .map((key) => String(key))
      .sort();
    const itemSignature = items.length ? items.join('|') : 'NO_ITEMS';
    return 'KDXV4:EVENT:' + canonicalType + ':' + aggregate + ':' + simpleHash(itemSignature);
  }

  function normalizeQueueEntry(entry) {
    const now = nowIso();
    return {
      id: entry.id || randomId(),
      type: entry.type || 'KARDEX_VNEXT_EVENT',
      entity: entry.entity || 'kardex_vnext_event',
      event_type: entry.event_type || null,
      event_key: entry.event_key || null,
      payload: safeJsonClone(entry.payload) || {},
      meta: safeJsonClone(entry.meta) || {},
      status: entry.status === 'processing' || entry.status === 'failed' ? entry.status : 'pending',
      retry_count: Math.max(0, asNumber(entry.retry_count)),
      max_retries: Math.max(1, asNumber(entry.max_retries) || REPLAY_MAX_RETRIES),
      next_attempt_at: entry.next_attempt_at || now,
      processing_started_at: entry.processing_started_at || null,
      processing_owner: entry.processing_owner || null,
      created_at: entry.created_at || now,
      updated_at: entry.updated_at || now,
      created_by: entry.created_by || OVERLAY_NAME,
      updated_by: entry.updated_by || OVERLAY_NAME,
      version: Math.max(1, asNumber(entry.version) || 1),
      status_entity: entry.status_entity || 'active',
      sync_status: entry.sync_status || 'pending',
      idempotency_key: entry.idempotency_key || entry.event_key || randomId(),
      last_error: entry.last_error || null,
      last_summary: entry.last_summary || null,
      last_trigger: entry.last_trigger || null,
    };
  }

  function readReplayQueue() {
    const nowMs = Date.now();
    const queue = readReplayQueueStorage().map((item) => normalizeQueueEntry(item));
    for (const item of queue) {
      const stuck = item.status === 'processing' && nowMs - parseMaybeDate(item.processing_started_at) > REPLAY_STALE_PROCESSING_MS;
      if (stuck) {
        item.status = 'pending';
        item.processing_started_at = null;
        item.processing_owner = null;
        item.updated_at = nowIso();
        item.updated_by = OVERLAY_NAME;
        item.next_attempt_at = nowIso();
      }
    }
    writeReplayQueueStorage(queue);
    return queue;
  }

  function backoffMs(retryCount) {
    const exp = Math.max(0, retryCount - 1);
    return Math.min(REPLAY_BASE_BACKOFF_MS * (2 ** exp), REPLAY_MAX_BACKOFF_MS);
  }

  function shouldReplayEntry(item, nowMs) {
    if (!item || !item.event_type || !item.event_key) return false;
    if (item.status === 'pending') return true;
    if (item.status === 'processing') {
      return nowMs - parseMaybeDate(item.processing_started_at) > REPLAY_STALE_PROCESSING_MS;
    }
    if (item.status === 'failed') {
      if (item.retry_count >= item.max_retries) return false;
      const nextAttemptMs = parseMaybeDate(item.next_attempt_at);
      return nextAttemptMs <= nowMs || nextAttemptMs === 0;
    }
    return false;
  }

  function selectReplayCandidate(queue) {
    const nowMs = Date.now();
    const candidates = queue
      .filter((item) => shouldReplayEntry(item, nowMs))
      .sort((a, b) => parseMaybeDate(a.created_at) - parseMaybeDate(b.created_at));
    return candidates[0] || null;
  }

  function getFlags() {
    return window.__MAXGRIFOS_FLAGS__ || {};
  }

  function readBooleanFlag(name, fallback) {
    const value = getFlags()[name];
    if (typeof value === 'boolean') return value;
    return fallback;
  }

  function normalizeCutoverStage(value) {
    const stage = String(value == null ? '' : value).trim().toLowerCase();
    if (stage === CUTOVER_STAGES.SHADOW) return CUTOVER_STAGES.SHADOW;
    if (stage === CUTOVER_STAGES.CANARY) return CUTOVER_STAGES.CANARY;
    if (stage === CUTOVER_STAGES.LIVE) return CUTOVER_STAGES.LIVE;
    return CUTOVER_STAGES.OFF;
  }

  function parsePercent(value, fallback) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return fallback;
    if (raw <= 0) return 0;
    if (raw >= 100) return 100;
    return Math.floor(raw);
  }

  function parseLiveEventTypes(value) {
    const all = Object.values(EVENT_CANONICAL);
    if (!Array.isArray(value) || value.length === 0) return all;
    const normalized = value
      .map((item) => canonicalEventType(item))
      .filter(Boolean);
    return normalized.length > 0 ? Array.from(new Set(normalized)) : all;
  }

  function readCutoverOverride() {
    try {
      const raw = localStorage.getItem(CUTOVER_OVERRIDE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeCutoverOverride(patch) {
    const current = readCutoverOverride() || {};
    const next = {
      ...current,
      ...patch,
      updated_at: nowIso(),
      updated_by: OVERLAY_NAME,
    };
    try {
      localStorage.setItem(CUTOVER_OVERRIDE_STORAGE_KEY, JSON.stringify(next));
      return next;
    } catch {
      return next;
    }
  }

  function clearCutoverOverride() {
    try {
      localStorage.removeItem(CUTOVER_OVERRIDE_STORAGE_KEY);
    } catch {}
  }

  function inferStageFromLegacyFlags(flags) {
    if (typeof flags.kardex_vnext_enabled === 'boolean' || typeof flags.kardex_vnext_shadow_mode === 'boolean') {
      const enabled = !!flags.kardex_vnext_enabled;
      const shadow = typeof flags.kardex_vnext_shadow_mode === 'boolean' ? flags.kardex_vnext_shadow_mode : true;
      if (!enabled) return CUTOVER_STAGES.OFF;
      return shadow ? CUTOVER_STAGES.SHADOW : CUTOVER_STAGES.LIVE;
    }
    return CUTOVER_STAGES.OFF;
  }

  function resolveCutoverConfig() {
    const flags = getFlags();
    const override = readCutoverOverride();
    const stageFromFlags = flags.kardex_vnext_cutover_stage != null
      ? normalizeCutoverStage(flags.kardex_vnext_cutover_stage)
      : inferStageFromLegacyFlags(flags);
    const stageConfig = normalizeCutoverStage((override && override.stage) || stageFromFlags);
    const canaryPercent = parsePercent(
      override && override.canary_percent != null ? override.canary_percent : flags.kardex_vnext_canary_percent,
      parsePercent(flags.kardex_vnext_canary_percent, 0),
    );
    const legacyWriterActive = override && typeof override.legacy_writer_active === 'boolean'
      ? override.legacy_writer_active
      : readBooleanFlag('kardex_vnext_legacy_writer_active', true);
    const liveEventTypes = parseLiveEventTypes(
      (override && override.live_event_types) || flags.kardex_vnext_live_event_types,
    );

    let stageEffective = stageConfig;
    if (stageConfig === CUTOVER_STAGES.CANARY && canaryPercent <= 0) {
      stageEffective = CUTOVER_STAGES.SHADOW;
    }
    if ((stageConfig === CUTOVER_STAGES.CANARY || stageConfig === CUTOVER_STAGES.LIVE) && legacyWriterActive) {
      stageEffective = CUTOVER_STAGES.SHADOW;
    }

    return {
      stage_config: stageConfig,
      stage_effective: stageEffective,
      canary_percent: canaryPercent,
      legacy_writer_active: legacyWriterActive,
      live_event_types: liveEventTypes,
      override_active: !!override,
      override,
    };
  }

  function applyCutoverConfig(config, reason) {
    const stageEffective = normalizeCutoverStage(config.stage_effective);
    const enabled = stageEffective !== CUTOVER_STAGES.OFF;
    const shadow = stageEffective === CUTOVER_STAGES.SHADOW;
    const liveEvents = Array.isArray(config.live_event_types) ? config.live_event_types.slice() : Object.values(EVENT_CANONICAL);
    cutoverRuntime.stageConfig = normalizeCutoverStage(config.stage_config);
    cutoverRuntime.stageEffective = stageEffective;
    cutoverRuntime.canaryPercent = parsePercent(config.canary_percent, 0);
    cutoverRuntime.legacyWriterActive = !!config.legacy_writer_active;
    cutoverRuntime.overrideActive = !!config.override_active;
    cutoverRuntime.liveEventTypes = new Set(liveEvents);

    let runtimeStatus = 'disabled_gate';
    if (stageEffective === CUTOVER_STAGES.SHADOW) runtimeStatus = 'shadow_active';
    if (stageEffective === CUTOVER_STAGES.CANARY) runtimeStatus = 'canary_active';
    if (stageEffective === CUTOVER_STAGES.LIVE) runtimeStatus = 'event_orchestrator_active';

    if ((cutoverRuntime.stageConfig === CUTOVER_STAGES.CANARY || cutoverRuntime.stageConfig === CUTOVER_STAGES.LIVE) && cutoverRuntime.legacyWriterActive) {
      runtimeStatus = 'cutover_blocked_legacy_active';
    }

    setState({
      enabled,
      shadow_mode: shadow,
      runtime_status: runtimeStatus,
      cutover_stage_config: cutoverRuntime.stageConfig,
      cutover_stage_effective: cutoverRuntime.stageEffective,
      cutover_canary_percent: cutoverRuntime.canaryPercent,
      cutover_legacy_writer_active: cutoverRuntime.legacyWriterActive,
      cutover_live_event_types: liveEvents,
      cutover_override_active: cutoverRuntime.overrideActive,
      cutover_last_decision: reason || null,
      cutover_last_updated_at: nowIso(),
    });
    return {
      ...config,
      enabled,
      shadow_mode: shadow,
      runtime_status: runtimeStatus,
    };
  }

  function refreshCutoverConfig(reason) {
    const config = resolveCutoverConfig();
    return applyCutoverConfig(config, reason || 'refresh');
  }

  function setCutoverStageOverride(stage, options) {
    const patch = {
      stage: normalizeCutoverStage(stage),
    };
    if (Object.prototype.hasOwnProperty.call(options, 'canary_percent')) {
      patch.canary_percent = parsePercent(options.canary_percent, 0);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'legacy_writer_active') && typeof options.legacy_writer_active === 'boolean') {
      patch.legacy_writer_active = options.legacy_writer_active;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'live_event_types') && Array.isArray(options.live_event_types)) {
      patch.live_event_types = parseLiveEventTypes(options.live_event_types);
    }
    writeCutoverOverride(patch);
    return refreshCutoverConfig('api_set_stage_override');
  }

  function activateCutoverRollback(reason) {
    writeCutoverOverride({
      stage: CUTOVER_STAGES.OFF,
      rollback_reason: String(reason || 'manual_rollback'),
    });
    const result = refreshCutoverConfig('rollback');
    setState({
      cutover_rollbacks: state.cutover_rollbacks + 1,
    });
    return result;
  }

  function decideCanaryAdmission(canonicalType, payload) {
    if (cutoverRuntime.stageEffective !== CUTOVER_STAGES.CANARY) {
      return {
        stage: cutoverRuntime.stageEffective,
        admitted: true,
        reason: 'not_canary',
      };
    }
    if (!cutoverRuntime.liveEventTypes.has(canonicalType)) {
      return {
        stage: cutoverRuntime.stageEffective,
        admitted: false,
        reason: 'event_not_allowlisted',
      };
    }
    const key = buildReplayEventKey(canonicalType, payload || {});
    const bucket = parseInt(simpleHash(key).slice(-2), 16) % 100;
    const admitted = bucket < cutoverRuntime.canaryPercent;
    return {
      stage: cutoverRuntime.stageEffective,
      admitted,
      reason: admitted ? 'canary_admitted' : 'canary_filtered',
      bucket,
      threshold: cutoverRuntime.canaryPercent,
    };
  }

  function canonicalEventType(type) {
    if (!type) return null;
    if (Object.values(EVENT_CANONICAL).includes(type)) return type;
    if (EVENT_ALIASES[type]) return EVENT_ALIASES[type];
    return null;
  }

  function setState(patch) {
    Object.assign(state, patch);
  }

  function exposeOverlayApi() {
    window.__KARDEX_VNEXT__ = {
      getStatus() {
        return {
          overlay_name: state.overlay_name,
          phase: state.phase,
          started_at: state.started_at,
          enabled: state.enabled,
          shadow_mode: state.shadow_mode,
          runtime_status: state.runtime_status,
          seed_status: state.seed_status,
          seed_result: state.seed_result,
          listeners_bound: state.listeners_bound,
          retry_runtime_status: state.retry_runtime_status,
          retry_bound: state.retry_bound,
          retry_last_trigger: state.retry_last_trigger,
          retry_last_drain_at: state.retry_last_drain_at,
          cutover_stage_config: state.cutover_stage_config,
          cutover_stage_effective: state.cutover_stage_effective,
          cutover_canary_percent: state.cutover_canary_percent,
          cutover_legacy_writer_active: state.cutover_legacy_writer_active,
          cutover_live_event_types: state.cutover_live_event_types,
          cutover_override_active: state.cutover_override_active,
          cutover_last_decision: state.cutover_last_decision,
          cutover_last_updated_at: state.cutover_last_updated_at,
          cutover_rollbacks: state.cutover_rollbacks,
          ux_runtime_status: state.ux_runtime_status,
          ux_bound: state.ux_bound,
          ux_last_action: state.ux_last_action,
          queue_total: state.queue_total,
          queue_pending: state.queue_pending,
          queue_processing: state.queue_processing,
          queue_failed: state.queue_failed,
          queue_replayed: state.queue_replayed,
          queue_retried: state.queue_retried,
          queue_exhausted: state.queue_exhausted,
          ui_runtime_status: state.ui_runtime_status,
          ui_bound: state.ui_bound,
          ui_cards_bound: state.ui_cards_bound,
          ui_open_bodega_id: state.ui_open_bodega_id,
          events_received: state.events_received,
          events_processed: state.events_processed,
          events_skipped: state.events_skipped,
          movements_written: state.movements_written,
          last_event_type: state.last_event_type,
          last_result: state.last_result,
          error: state.error,
        };
      },
      getCompatibilityMatrix() {
        return COMPATIBILITY;
      },
      ingest(type, payload, meta) {
        return enqueueIngest(type, payload || {}, meta || {});
      },
      refreshCutover() {
        const cfg = refreshCutoverConfig('api_refresh');
        return {
          cutover: cfg,
          status: this.getStatus(),
        };
      },
      rollbackCutover(reason) {
        const result = activateCutoverRollback(reason || 'manual_api_rollback');
        return {
          rollback: result,
          status: this.getStatus(),
        };
      },
      clearRollbackOverride() {
        clearCutoverOverride();
        const cfg = refreshCutoverConfig('api_clear_override');
        return {
          cutover: cfg,
          status: this.getStatus(),
        };
      },
      setCutoverStage(stage, options) {
        const result = setCutoverStageOverride(stage, options || {});
        return {
          cutover: result,
          status: this.getStatus(),
        };
      },
      emit(type, payload, meta) {
        window.dispatchEvent(new CustomEvent('MAXGRIFOS_DOMAIN_EVENT', {
          detail: {
            type,
            payload: payload || {},
            meta: meta || {},
          },
        }));
      },
      constants: Object.freeze({
        OVERLAY_NAME,
        OVERLAY_PHASE,
        DB_NAME,
        STORE_PRODUCTS,
        STORE_BODEGAS,
        STORE_KARDEX,
        STORE_PEDIDO_ITEMS,
        STORE_CLIENTES,
        STORE_SYNC_QUEUE,
        BODEGA_CENTRAL_ID,
        BODEGA_PEDIDOS_ID,
        BODEGA_GARANTIAS_ID,
        REPLAY_QUEUE_STORAGE_KEY,
        CUTOVER_OVERRIDE_STORAGE_KEY,
        CUTOVER_STAGES,
      }),
    };
  }

  function requestToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = function onSuccess() {
        resolve(req.result);
      };
      req.onerror = function onError() {
        reject(req.error || new Error('IndexedDB request failed'));
      };
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = function onComplete() {
        resolve();
      };
      tx.onerror = function onError() {
        reject(tx.error || new Error('IndexedDB transaction failed'));
      };
      tx.onabort = function onAbort() {
        reject(tx.error || new Error('IndexedDB transaction aborted'));
      };
    });
  }

  function openExistingDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onsuccess = function onSuccess() {
        resolve(req.result);
      };
      req.onerror = function onError() {
        reject(req.error || new Error('Unable to open IndexedDB'));
      };
      req.onblocked = function onBlocked() {
        reject(new Error('IndexedDB open blocked by another context'));
      };
    });
  }

  async function withDb(stores, mode, runner) {
    let db = null;
    try {
      db = await openExistingDb();
      for (const storeName of stores) {
        if (!db.objectStoreNames.contains(storeName)) {
          throw new Error('Missing store: ' + storeName);
        }
      }
      const tx = db.transaction(stores, mode);
      const result = await runner(tx, db);
      await txDone(tx);
      return result;
    } finally {
      if (db) db.close();
    }
  }

  async function ensureGarantiasBodega() {
    return withDb([STORE_BODEGAS], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_BODEGAS);
      const existing = await requestToPromise(store.get(BODEGA_GARANTIAS_ID));
      if (existing) {
        return {
          ok: true,
          reason: 'exists',
          inserted: false,
        };
      }
      const now = nowIso();
      const record = {
        id: BODEGA_GARANTIAS_ID,
        nombre: 'Garantias',
        descripcion: 'Bodega de sistema para trazabilidad de garantias',
        tipo: 'system',
        configurable: false,
        visible_manual: false,
        created_at: now,
        updated_at: now,
        created_by: OVERLAY_NAME,
        updated_by: OVERLAY_NAME,
        version: 1,
        status: 'active',
        sync_status: 'pending',
        idempotency_key: BODEGA_GARANTIAS_ID,
      };
      store.put(record);
      return {
        ok: true,
        reason: 'inserted',
        inserted: true,
      };
    });
  }

  async function seedGarantiasBodegaIdempotent() {
    try {
      const result = await ensureGarantiasBodega();
      setState({
        seed_status: 'ok',
        seed_result: result,
      });
      return result;
    } catch (error) {
      const message = normalizeError(error);
      const result = {
        ok: false,
        reason: 'seed_failed',
        inserted: false,
        error: message,
      };
      setState({
        seed_status: 'error',
        seed_result: result,
        error: message,
      });
      return result;
    }
  }

  async function getProductById(tx, productId) {
    return requestToPromise(tx.objectStore(STORE_PRODUCTS).get(productId));
  }

  async function getPedidoItemsByPedidoId(tx, pedidoId) {
    const store = tx.objectStore(STORE_PEDIDO_ITEMS);
    if (store.indexNames.contains('pedido_id')) {
      return requestToPromise(store.index('pedido_id').getAll(pedidoId));
    }
    const all = await requestToPromise(store.getAll());
    return all.filter((item) => item && item.pedido_id === pedidoId);
  }

  async function getMovimientosByProductId(tx, productId) {
    const store = tx.objectStore(STORE_KARDEX);
    if (store.indexNames.contains('product_id')) {
      return requestToPromise(store.index('product_id').getAll(productId));
    }
    const all = await requestToPromise(store.getAll());
    return all.filter((mov) => mov && mov.product_id === productId);
  }

  async function getAllFromStore(tx, storeName) {
    return requestToPromise(tx.objectStore(storeName).getAll());
  }

  async function existsMovementByIdempotency(tx, idempotencyKey) {
    const store = tx.objectStore(STORE_KARDEX);
    return new Promise((resolve, reject) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = function onSuccess() {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve(false);
          return;
        }
        const current = cursor.value || {};
        if (current.idempotency_key === idempotencyKey) {
          resolve(true);
          return;
        }
        cursor.continue();
      };
      cursorReq.onerror = function onError() {
        reject(cursorReq.error || new Error('Unable to check idempotency'));
      };
    });
  }

  async function getSaldoByProductBodega(tx, productId, bodegaId, cache) {
    const key = productId + '::' + bodegaId;
    if (cache.has(key)) return cache.get(key);
    const movimientos = await getMovimientosByProductId(tx, productId);
    const saldo = movimientos
      .filter((mov) => mov && mov.bodega_id === bodegaId)
      .reduce((acc, mov) => acc + asNumber(mov.delta), 0);
    cache.set(key, saldo);
    return saldo;
  }

  function applySaldo(cache, productId, bodegaId, delta) {
    const key = productId + '::' + bodegaId;
    const current = cache.has(key) ? cache.get(key) : 0;
    cache.set(key, current + delta);
  }

  function buildEnvelopeBase() {
    const now = nowIso();
    return {
      id: randomId(),
      created_at: now,
      updated_at: now,
      created_by: OVERLAY_NAME,
      updated_by: OVERLAY_NAME,
      version: 1,
      status: 'active',
      sync_status: 'pending',
    };
  }

  function buildMovimiento(data) {
    const base = buildEnvelopeBase();
    return {
      ...base,
      idempotency_key: data.idempotency_key,
      product_id: data.product_id,
      product_sku: data.product_sku || '',
      product_name: data.product_name || '',
      tipo: data.tipo,
      bodega_id: data.bodega_id,
      cantidad: Math.abs(asNumber(data.cantidad)),
      delta: asNumber(data.delta),
      saldo_resultante: asNumber(data.saldo_resultante),
      pedido_id: data.pedido_id || null,
      transferencia_id: data.transferencia_id || null,
      referencia: data.referencia || '',
      observacion: data.observacion || '',
      costo: asNumber(data.costo),
      cliente_id: data.cliente_id || null,
      cliente_nombre: data.cliente_nombre || null,
      proveedor_id: data.proveedor_id || null,
      proveedor_nombre: data.proveedor_nombre || null,
    };
  }

  function makeSummary(eventType, mode) {
    return {
      ok: true,
      event_type: eventType,
      mode,
      written: 0,
      skipped: 0,
      pending: 0,
      errors: [],
      details: [],
    };
  }

  function addDetail(summary, item) {
    summary.details.push(item);
  }

  async function writeMovement(tx, movement, summary) {
    const duplicate = await existsMovementByIdempotency(tx, movement.idempotency_key);
    if (duplicate) {
      summary.skipped += 1;
      addDetail(summary, {
        status: 'duplicate',
        idempotency_key: movement.idempotency_key,
        tipo: movement.tipo,
      });
      return false;
    }
    tx.objectStore(STORE_KARDEX).put(movement);
    summary.written += 1;
    state.movements_written += 1;
    addDetail(summary, {
      status: 'written',
      idempotency_key: movement.idempotency_key,
      tipo: movement.tipo,
    });
    return true;
  }

  function normalizeItems(payload) {
    const direct = Array.isArray(payload && payload.items) ? payload.items : null;
    if (direct && direct.length > 0) return direct;
    if (payload && payload.product_id) {
      return [payload];
    }
    return [];
  }

  function qtyFromItem(item) {
    return asNumber(item.cantidad_picking || item.cantidad || item.qty || 0);
  }

  function costFromItem(item, product) {
    return asNumber(item.costo_unitario || item.costo || item.cost || (product && product.costo) || 0);
  }

  function itemKey(item, index) {
    return item.id || item.item_id || item.detalle_id || (item.product_id + ':' + index);
  }

  function eventAggregateId(payload, fallbackPrefix) {
    return (
      (payload && payload.id) ||
      (payload && payload.documento_id) ||
      (payload && payload.garantia_id) ||
      (payload && payload.compra_id) ||
      (payload && payload.devolucion_id) ||
      (payload && payload.nota_credito_id) ||
      ((payload && payload.documento && payload.documento.id) || null) ||
      ((payload && payload.pedido && payload.pedido.id) || null) ||
      ((payload && payload.compra && payload.compra.id) || null) ||
      ((payload && payload.devolucion && payload.devolucion.id) || null) ||
      ((payload && payload.nota_credito && payload.nota_credito.id) || null) ||
      (fallbackPrefix + ':' + Date.now())
    );
  }

  async function processFacturaRemision(eventType, payload) {
    const docType = eventType === EVENT_CANONICAL.FACTURA_EMITIDA ? 'FAC' : 'REM';
    const pedidoId = (payload && payload.pedido && payload.pedido.id) || payload.pedido_id || null;
    const documentoId = (payload && payload.documento && payload.documento.id) || payload.documento_id || eventAggregateId(payload, docType);
    const summary = makeSummary(eventType, 'apply');

    await withDb([STORE_KARDEX, STORE_PRODUCTS, STORE_PEDIDO_ITEMS], 'readwrite', async (tx) => {
      const ledgerCache = new Map();
      let items = normalizeItems(payload);
      if (items.length === 0 && pedidoId) {
        items = await getPedidoItemsByPedidoId(tx, pedidoId);
      }

      for (let idx = 0; idx < items.length; idx += 1) {
        const item = items[idx] || {};
        const productId = item.product_id;
        const qty = qtyFromItem(item);
        if (!productId || qty <= 0) {
          summary.skipped += 1;
          addDetail(summary, {
            status: 'invalid_item',
            reason: 'missing_product_or_qty',
            item_index: idx,
          });
          continue;
        }

        const product = await getProductById(tx, productId);
        if (!product) {
          summary.pending += 1;
          addDetail(summary, {
            status: 'pending',
            reason: 'product_not_found',
            product_id: productId,
          });
          continue;
        }

        const saldoAnterior = await getSaldoByProductBodega(tx, productId, BODEGA_PEDIDOS_ID, ledgerCache);
        if (saldoAnterior < qty) {
          summary.pending += 1;
          addDetail(summary, {
            status: 'pending',
            reason: 'insufficient_stock_pedidos',
            product_id: productId,
            available: saldoAnterior,
            required: qty,
          });
          continue;
        }

        const key = itemKey(item, idx);
        const idempotency = 'KDXV2:' + eventType + ':' + documentoId + ':' + key;
        const delta = -qty;
        const movement = buildMovimiento({
          idempotency_key: idempotency,
          product_id: product.id,
          product_sku: product.sku,
          product_name: product.nombre,
          tipo: 'SALIDA_VENTA',
          bodega_id: BODEGA_PEDIDOS_ID,
          cantidad: qty,
          delta,
          saldo_resultante: saldoAnterior + delta,
          pedido_id: pedidoId,
          referencia: docType + ':' + documentoId,
          observacion: 'Kardex VNext F2 release by ' + eventType,
          costo: costFromItem(item, product),
        });

        const wrote = await writeMovement(tx, movement, summary);
        if (wrote) {
          applySaldo(ledgerCache, productId, BODEGA_PEDIDOS_ID, delta);
        }
      }
    });

    return summary;
  }

  async function processGarantiaReconocida(eventType, payload) {
    const garantiaId = payload.garantia_id || (payload.garantia && payload.garantia.id) || eventAggregateId(payload, 'GAR');
    const summary = makeSummary(eventType, 'apply');

    await ensureGarantiasBodega();

    await withDb([STORE_KARDEX, STORE_PRODUCTS], 'readwrite', async (tx) => {
      const ledgerCache = new Map();
      const items = normalizeItems(payload);

      for (let idx = 0; idx < items.length; idx += 1) {
        const item = items[idx] || {};
        const productId = item.product_id;
        const qty = qtyFromItem(item);
        if (!productId || qty <= 0) {
          summary.skipped += 1;
          addDetail(summary, {
            status: 'invalid_item',
            reason: 'missing_product_or_qty',
            item_index: idx,
          });
          continue;
        }

        const product = await getProductById(tx, productId);
        if (!product) {
          summary.pending += 1;
          addDetail(summary, {
            status: 'pending',
            reason: 'product_not_found',
            product_id: productId,
          });
          continue;
        }

        const saldoCentral = await getSaldoByProductBodega(tx, productId, BODEGA_CENTRAL_ID, ledgerCache);
        if (saldoCentral < qty) {
          summary.pending += 1;
          addDetail(summary, {
            status: 'pending',
            reason: 'insufficient_stock_central',
            product_id: productId,
            available: saldoCentral,
            required: qty,
          });
          continue;
        }

        const saldoGarantias = await getSaldoByProductBodega(tx, productId, BODEGA_GARANTIAS_ID, ledgerCache);
        const key = itemKey(item, idx);
        const ref = 'GAR:' + garantiaId;
        const clientId = payload.cliente_id || item.cliente_id || null;
        const clientName = payload.cliente_nombre || item.cliente_nombre || null;

        const outIdem = 'KDXV2:GAR:OUT:' + garantiaId + ':' + key;
        const outDelta = -qty;
        const outMov = buildMovimiento({
          idempotency_key: outIdem,
          product_id: product.id,
          product_sku: product.sku,
          product_name: product.nombre,
          tipo: 'SALIDA_GARANTIA',
          bodega_id: BODEGA_CENTRAL_ID,
          cantidad: qty,
          delta: outDelta,
          saldo_resultante: saldoCentral + outDelta,
          referencia: ref,
          observacion: 'Kardex VNext F2 garantia salida central',
          costo: costFromItem(item, product),
          cliente_id: clientId,
          cliente_nombre: clientName,
        });

        const inIdem = 'KDXV2:GAR:IN:' + garantiaId + ':' + key;
        const inDelta = qty;
        const inMov = buildMovimiento({
          idempotency_key: inIdem,
          product_id: product.id,
          product_sku: product.sku,
          product_name: product.nombre,
          tipo: 'ENTRADA_GARANTIA',
          bodega_id: BODEGA_GARANTIAS_ID,
          cantidad: qty,
          delta: inDelta,
          saldo_resultante: saldoGarantias + inDelta,
          referencia: ref,
          observacion: 'Kardex VNext F2 garantia entrada garantias',
          costo: costFromItem(item, product),
          cliente_id: clientId,
          cliente_nombre: clientName,
        });

        const outWrote = await writeMovement(tx, outMov, summary);
        if (outWrote) applySaldo(ledgerCache, productId, BODEGA_CENTRAL_ID, outDelta);

        const inWrote = await writeMovement(tx, inMov, summary);
        if (inWrote) applySaldo(ledgerCache, productId, BODEGA_GARANTIAS_ID, inDelta);
      }
    });

    return summary;
  }

  async function processCompraRecepcionada(eventType, payload) {
    const compraId = payload.compra_id || (payload.compra && payload.compra.id) || eventAggregateId(payload, 'COMPRA');
    const summary = makeSummary(eventType, 'apply');

    await withDb([STORE_KARDEX, STORE_PRODUCTS], 'readwrite', async (tx) => {
      const ledgerCache = new Map();
      const items = normalizeItems(payload);

      for (let idx = 0; idx < items.length; idx += 1) {
        const item = items[idx] || {};
        const productId = item.product_id;
        const qty = qtyFromItem(item);
        if (!productId || qty <= 0) {
          summary.skipped += 1;
          addDetail(summary, {
            status: 'invalid_item',
            reason: 'missing_product_or_qty',
            item_index: idx,
          });
          continue;
        }

        const product = await getProductById(tx, productId);
        if (!product) {
          summary.pending += 1;
          addDetail(summary, {
            status: 'pending',
            reason: 'product_not_found',
            product_id: productId,
          });
          continue;
        }

        const saldoAnterior = await getSaldoByProductBodega(tx, productId, BODEGA_CENTRAL_ID, ledgerCache);
        const key = itemKey(item, idx);
        const idem = 'KDXV2:COMPRA:' + compraId + ':' + key;
        const delta = qty;
        const mov = buildMovimiento({
          idempotency_key: idem,
          product_id: product.id,
          product_sku: product.sku,
          product_name: product.nombre,
          tipo: 'ENTRADA_COMPRA',
          bodega_id: BODEGA_CENTRAL_ID,
          cantidad: qty,
          delta,
          saldo_resultante: saldoAnterior + delta,
          referencia: 'COMPRA:' + compraId,
          observacion: 'Kardex VNext F2 compra recepcionada',
          costo: costFromItem(item, product),
          proveedor_id: payload.proveedor_id || item.proveedor_id || null,
          proveedor_nombre: payload.proveedor_nombre || item.proveedor_nombre || null,
        });

        const wrote = await writeMovement(tx, mov, summary);
        if (wrote) applySaldo(ledgerCache, productId, BODEGA_CENTRAL_ID, delta);
      }
    });

    return summary;
  }

  async function processDevolucionCliente(eventType, payload) {
    const devolId = payload.devolucion_id || (payload.devolucion && payload.devolucion.id) || eventAggregateId(payload, 'DEVCLI');
    const summary = makeSummary(eventType, 'apply');

    await withDb([STORE_KARDEX, STORE_PRODUCTS], 'readwrite', async (tx) => {
      const ledgerCache = new Map();
      const items = normalizeItems(payload);

      for (let idx = 0; idx < items.length; idx += 1) {
        const item = items[idx] || {};
        const productId = item.product_id;
        const qty = qtyFromItem(item);
        if (!productId || qty <= 0) {
          summary.skipped += 1;
          addDetail(summary, {
            status: 'invalid_item',
            reason: 'missing_product_or_qty',
            item_index: idx,
          });
          continue;
        }

        const product = await getProductById(tx, productId);
        if (!product) {
          summary.pending += 1;
          addDetail(summary, {
            status: 'pending',
            reason: 'product_not_found',
            product_id: productId,
          });
          continue;
        }

        const saldoAnterior = await getSaldoByProductBodega(tx, productId, BODEGA_CENTRAL_ID, ledgerCache);
        const key = itemKey(item, idx);
        const idem = 'KDXV2:DEVCLI:' + devolId + ':' + key;
        const delta = qty;
        const mov = buildMovimiento({
          idempotency_key: idem,
          product_id: product.id,
          product_sku: product.sku,
          product_name: product.nombre,
          tipo: 'ENTRADA_DEVOLUCION_CLIENTE',
          bodega_id: BODEGA_CENTRAL_ID,
          cantidad: qty,
          delta,
          saldo_resultante: saldoAnterior + delta,
          referencia: 'DEVCLI:' + devolId,
          observacion: 'Kardex VNext F2 devolucion cliente',
          costo: costFromItem(item, product),
          cliente_id: payload.cliente_id || item.cliente_id || null,
          cliente_nombre: payload.cliente_nombre || item.cliente_nombre || null,
        });

        const wrote = await writeMovement(tx, mov, summary);
        if (wrote) applySaldo(ledgerCache, productId, BODEGA_CENTRAL_ID, delta);
      }
    });

    return summary;
  }

  async function processNotaCreditoProveedor(eventType, payload) {
    const notaId = payload.nota_credito_id || (payload.nota_credito && payload.nota_credito.id) || eventAggregateId(payload, 'NCPROV');
    const summary = makeSummary(eventType, 'apply');

    await ensureGarantiasBodega();

    await withDb([STORE_KARDEX, STORE_PRODUCTS], 'readwrite', async (tx) => {
      const ledgerCache = new Map();
      const items = normalizeItems(payload);

      for (let idx = 0; idx < items.length; idx += 1) {
        const item = items[idx] || {};
        const productId = item.product_id;
        const qty = qtyFromItem(item);
        if (!productId || qty <= 0) {
          summary.skipped += 1;
          addDetail(summary, {
            status: 'invalid_item',
            reason: 'missing_product_or_qty',
            item_index: idx,
          });
          continue;
        }

        const product = await getProductById(tx, productId);
        if (!product) {
          summary.pending += 1;
          addDetail(summary, {
            status: 'pending',
            reason: 'product_not_found',
            product_id: productId,
          });
          continue;
        }

        const saldoGarantias = await getSaldoByProductBodega(tx, productId, BODEGA_GARANTIAS_ID, ledgerCache);
        if (saldoGarantias < qty) {
          summary.pending += 1;
          addDetail(summary, {
            status: 'pending',
            reason: 'insufficient_stock_garantias',
            product_id: productId,
            available: saldoGarantias,
            required: qty,
          });
          continue;
        }

        const key = itemKey(item, idx);
        const idem = 'KDXV2:NCPROV:' + notaId + ':' + key;
        const delta = -qty;
        const mov = buildMovimiento({
          idempotency_key: idem,
          product_id: product.id,
          product_sku: product.sku,
          product_name: product.nombre,
          tipo: 'SALIDA_GARANTIA_PROVEEDOR',
          bodega_id: BODEGA_GARANTIAS_ID,
          cantidad: qty,
          delta,
          saldo_resultante: saldoGarantias + delta,
          referencia: 'NCPROV:' + notaId,
          observacion: 'Kardex VNext F2 nota credito proveedor',
          costo: costFromItem(item, product),
          proveedor_id: payload.proveedor_id || item.proveedor_id || null,
          proveedor_nombre: payload.proveedor_nombre || item.proveedor_nombre || null,
        });

        const wrote = await writeMovement(tx, mov, summary);
        if (wrote) applySaldo(ledgerCache, productId, BODEGA_GARANTIAS_ID, delta);
      }
    });

    return summary;
  }

  function findBodegaListElement() {
    const list = document.querySelector('#bodega-list');
    const createButton = document.querySelector('#btn-crear-bodega');
    if (!list || !createButton) return null;
    return list;
  }

  function ensureDetailOverlayStyle() {
    if (document.getElementById(DETAIL_OVERLAY_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = DETAIL_OVERLAY_STYLE_ID;
    style.textContent = `
      #${DETAIL_OVERLAY_ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: none;
      }
      #${DETAIL_OVERLAY_ROOT_ID}[data-open="1"] {
        display: block;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(7, 10, 18, 0.5);
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-panel {
        position: absolute;
        top: 0;
        right: 0;
        width: min(100%, 560px);
        height: 100%;
        background: #f5f7fb;
        box-shadow: -8px 0 24px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-panel-body {
        padding: 14px;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-title {
        margin: 0;
        font-size: 18px;
        color: #0f172a;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-subtitle {
        margin: 2px 0 0;
        font-size: 12px;
        color: #5b6577;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-close {
        border: 1px solid #d1d5db;
        border-radius: 10px;
        background: #fff;
        color: #0f172a;
        font-size: 13px;
        line-height: 1;
        padding: 8px 10px;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 12px;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-kpi {
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 9px 10px;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-kpi-label {
        display: block;
        font-size: 11px;
        color: #6b7280;
        margin-bottom: 3px;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-kpi-value {
        font-size: 15px;
        font-weight: 700;
        color: #111827;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-section {
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 10px;
        margin-bottom: 10px;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-section h4 {
        margin: 0 0 8px;
        font-size: 13px;
        color: #111827;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-table-wrap {
        width: 100%;
        overflow-x: auto;
      }
      #${DETAIL_OVERLAY_ROOT_ID} table {
        width: 100%;
        border-collapse: collapse;
        min-width: 530px;
      }
      #${DETAIL_OVERLAY_ROOT_ID} th,
      #${DETAIL_OVERLAY_ROOT_ID} td {
        border-bottom: 1px solid #eef2f7;
        padding: 7px 6px;
        text-align: left;
        font-size: 12px;
        color: #334155;
        vertical-align: top;
      }
      #${DETAIL_OVERLAY_ROOT_ID} th {
        color: #475569;
        font-weight: 700;
      }
      #${DETAIL_OVERLAY_ROOT_ID} td.kdxv3-right,
      #${DETAIL_OVERLAY_ROOT_ID} th.kdxv3-right {
        text-align: right;
      }
      #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-empty {
        font-size: 12px;
        color: #64748b;
      }
      .kdxv3-open-detail {
        margin-top: 6px;
      }
      body.kdxv3-overlay-open {
        overflow: hidden;
      }
      @media (max-width: 768px) {
        #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-panel {
          width: 100%;
        }
        #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-panel-body {
          padding: 12px;
        }
        #${DETAIL_OVERLAY_ROOT_ID} .kdxv3-kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureDetailOverlayRoot() {
    let root = document.getElementById(DETAIL_OVERLAY_ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = DETAIL_OVERLAY_ROOT_ID;
    root.setAttribute('data-open', '0');
    root.innerHTML = `
      <div class="kdxv3-backdrop" data-kdxv3-close="1"></div>
      <aside class="kdxv3-panel" role="dialog" aria-modal="true" aria-label="Detalle de bodega">
        <div class="kdxv3-panel-body" id="kdxv3-panel-body"></div>
      </aside>
    `;
    root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.getAttribute('data-kdxv3-close') === '1' || target.closest('[data-kdxv3-action="close"]')) {
        closeDetailOverlay();
      }
    });
    document.body.appendChild(root);
    return root;
  }

  function renderEmptyRow(columns, text) {
    return '<tr><td colspan="' + columns + '" class="kdxv3-empty">' + escapeHtml(text) + '</td></tr>';
  }

  function renderSaldosRows(rows) {
    if (!rows.length) return renderEmptyRow(4, 'Sin saldos disponibles para esta bodega.');
    return rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.product_sku || '-')}</td>
        <td>${escapeHtml(row.product_name || '-')}</td>
        <td class="kdxv3-right">${formatQty(row.saldo)}</td>
        <td class="kdxv3-right">${formatMoney(row.last_cost)}</td>
      </tr>
    `).join('');
  }

  function renderMovimientosRows(rows) {
    if (!rows.length) return renderEmptyRow(9, 'Sin movimientos registrados.');
    return rows.map((row) => `
      <tr>
        <td>${escapeHtml(formatDateTime(row.created_at))}</td>
        <td>${escapeHtml(row.tipo || '-')}</td>
        <td>${escapeHtml(row._sku || '-')}</td>
        <td>${escapeHtml(row._name || '-')}</td>
        <td class="kdxv3-right">${formatQty(row.cantidad)}</td>
        <td class="kdxv3-right">${formatQty(row.delta)}</td>
        <td class="kdxv3-right">${formatQty(row.saldo_resultante)}</td>
        <td class="kdxv3-right">${formatMoney(row.costo)}</td>
        <td>${escapeHtml(row.referencia || '-')}</td>
      </tr>
    `).join('');
  }

  function renderGarantiasRows(rows) {
    if (!rows.length) return renderEmptyRow(6, 'Sin trazabilidad de garantias para esta bodega.');
    return rows.map((row) => `
      <tr>
        <td>${escapeHtml(formatDateTime(row.created_at))}</td>
        <td>${escapeHtml(row._sku || '-')}</td>
        <td>${escapeHtml(row._name || '-')}</td>
        <td class="kdxv3-right">${formatMoney(row.costo)}</td>
        <td class="kdxv3-right">${formatQty(row.cantidad)}</td>
        <td>${escapeHtml(row.cliente_nombre || row.cliente_id || '-')}</td>
      </tr>
    `).join('');
  }

  function renderBodegaDetail(detail) {
    const showGarantiaTrace = toUpper(detail.bodega.id) === BODEGA_GARANTIAS_ID;
    return `
      <div class="kdxv3-header">
        <div>
          <h3 class="kdxv3-title">Detalle de Bodega: ${escapeHtml(detail.bodega.nombre || detail.bodega.id)}</h3>
          <p class="kdxv3-subtitle">${escapeHtml(detail.bodega.descripcion || 'Sin descripcion')} | ${escapeHtml(detail.bodega.id || '')}</p>
        </div>
        <button type="button" class="kdxv3-close" data-kdxv3-action="close">Cerrar</button>
      </div>

      <div class="kdxv3-kpis">
        <div class="kdxv3-kpi">
          <span class="kdxv3-kpi-label">Movimientos</span>
          <span class="kdxv3-kpi-value">${formatQty(detail.movimientos.length)}</span>
        </div>
        <div class="kdxv3-kpi">
          <span class="kdxv3-kpi-label">Productos con saldo</span>
          <span class="kdxv3-kpi-value">${formatQty(detail.saldos.length)}</span>
        </div>
        <div class="kdxv3-kpi">
          <span class="kdxv3-kpi-label">Saldo total (uds)</span>
          <span class="kdxv3-kpi-value">${formatQty(detail.total_saldo)}</span>
        </div>
      </div>

      <section class="kdxv3-section">
        <h4>Saldos por producto</h4>
        <div class="kdxv3-table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th class="kdxv3-right">Saldo</th>
                <th class="kdxv3-right">Costo</th>
              </tr>
            </thead>
            <tbody>${renderSaldosRows(detail.saldos)}</tbody>
          </table>
        </div>
      </section>

      <section class="kdxv3-section">
        <h4>Movimientos de la bodega</h4>
        <div class="kdxv3-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>SKU</th>
                <th>Producto</th>
                <th class="kdxv3-right">Cantidad</th>
                <th class="kdxv3-right">Delta</th>
                <th class="kdxv3-right">Saldo</th>
                <th class="kdxv3-right">Costo</th>
                <th>Ref</th>
              </tr>
            </thead>
            <tbody>${renderMovimientosRows(detail.movimientos)}</tbody>
          </table>
        </div>
      </section>

      ${showGarantiaTrace ? `
      <section class="kdxv3-section">
        <h4>Trazabilidad Garantias (fecha, SKU, producto, costo, cantidad, cliente)</h4>
        <div class="kdxv3-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>SKU</th>
                <th>Nombre producto</th>
                <th class="kdxv3-right">Costo</th>
                <th class="kdxv3-right">Cantidad</th>
                <th>Cliente</th>
              </tr>
            </thead>
            <tbody>${renderGarantiasRows(detail.trazabilidad_garantias)}</tbody>
          </table>
        </div>
      </section>` : ''}
    `;
  }

  function closeDetailOverlay() {
    const root = document.getElementById(DETAIL_OVERLAY_ROOT_ID);
    if (!root) return;
    root.setAttribute('data-open', '0');
    document.body.classList.remove('kdxv3-overlay-open');
    setState({
      ui_open_bodega_id: null,
    });
  }

  async function loadBodegaDetail(bodegaId) {
    return withDb([STORE_BODEGAS, STORE_KARDEX, STORE_PRODUCTS], 'readonly', async (tx) => {
      const bodegas = await getAllFromStore(tx, STORE_BODEGAS);
      const movimientosRaw = await getAllFromStore(tx, STORE_KARDEX);
      const products = await getAllFromStore(tx, STORE_PRODUCTS);

      const normalizedId = toUpper(bodegaId);
      const bodega = (bodegas || []).find((item) => item && toUpper(item.id) === normalizedId);
      if (!bodega) {
        throw new Error('Bodega no encontrada: ' + bodegaId);
      }

      const productById = new Map();
      for (const product of products || []) {
        if (product && product.id) {
          productById.set(String(product.id), product);
        }
      }

      const movimientos = (movimientosRaw || [])
        .filter((mov) => mov && toUpper(mov.bodega_id) === normalizedId)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .map((mov) => {
          const fallback = productById.get(String(mov.product_id || '')) || {};
          return {
            ...mov,
            _sku: mov.product_sku || fallback.sku || '',
            _name: mov.product_name || fallback.nombre || '',
          };
        });

      const saldoByProduct = new Map();
      for (const mov of movimientos) {
        const key = String(mov.product_id || ('N/A:' + (mov._sku || mov._name || 'NA')));
        const current = saldoByProduct.get(key) || {
          product_id: mov.product_id || null,
          product_sku: mov._sku || '',
          product_name: mov._name || '',
          saldo: 0,
          last_cost: asNumber(mov.costo),
          last_created_at: mov.created_at || '',
        };
        current.saldo += asNumber(mov.delta);
        if (!current.product_sku && mov._sku) current.product_sku = mov._sku;
        if (!current.product_name && mov._name) current.product_name = mov._name;
        if (String(mov.created_at || '') >= String(current.last_created_at || '')) {
          current.last_created_at = mov.created_at || '';
          current.last_cost = asNumber(mov.costo);
        }
        saldoByProduct.set(key, current);
      }

      const saldos = Array.from(saldoByProduct.values())
        .sort((a, b) => String(a.product_name || '').localeCompare(String(b.product_name || ''), 'es'));

      const totalSaldo = saldos.reduce((acc, item) => acc + asNumber(item.saldo), 0);
      const trazabilidadGarantias = movimientos.map((mov) => ({
        ...mov,
        cliente_nombre: mov.cliente_nombre || null,
        cliente_id: mov.cliente_id || null,
      }));

      return {
        bodega,
        movimientos,
        saldos,
        total_saldo: totalSaldo,
        trazabilidad_garantias: trazabilidadGarantias,
      };
    });
  }

  async function openBodegaDetail(bodegaId) {
    const root = ensureDetailOverlayRoot();
    const panelBody = root.querySelector('#kdxv3-panel-body');
    if (!panelBody) return;

    root.setAttribute('data-open', '1');
    document.body.classList.add('kdxv3-overlay-open');
    panelBody.innerHTML = `
      <div class="kdxv3-header">
        <h3 class="kdxv3-title">Cargando detalle de bodega...</h3>
        <button type="button" class="kdxv3-close" data-kdxv3-action="close">Cerrar</button>
      </div>
    `;
    setState({
      ui_open_bodega_id: bodegaId,
    });

    try {
      const detail = await loadBodegaDetail(bodegaId);
      panelBody.innerHTML = renderBodegaDetail(detail);
      setState({
        ui_runtime_status: 'detail_ready',
      });
    } catch (error) {
      panelBody.innerHTML = `
        <div class="kdxv3-header">
          <h3 class="kdxv3-title">Detalle no disponible</h3>
          <button type="button" class="kdxv3-close" data-kdxv3-action="close">Cerrar</button>
        </div>
        <div class="kdxv3-section">
          <p class="kdxv3-empty">${escapeHtml(normalizeError(error))}</p>
        </div>
      `;
      setState({
        ui_runtime_status: 'detail_error',
      });
    }
  }

  async function getBodegasForUi() {
    return withDb([STORE_BODEGAS], 'readonly', async (tx) => {
      const rows = await getAllFromStore(tx, STORE_BODEGAS);
      return Array.isArray(rows) ? rows : [];
    });
  }

  function resolveCardBodegaId(card, bodegas, index) {
    const actionBtn = card.querySelector('.bod-btn-edit, .bod-btn-deact');
    if (actionBtn && actionBtn.dataset && actionBtn.dataset.id) {
      return actionBtn.dataset.id;
    }

    const nameNode = card.querySelector('.product-nombre');
    const rawName = nameNode ? String(nameNode.textContent || '').replace('📦', '').trim() : '';
    const normalizedName = normalizeBodegaName(rawName);
    if (normalizedName) {
      const byName = bodegas.find((item) => normalizeBodegaName(item && item.nombre) === normalizedName);
      if (byName && byName.id) return byName.id;
    }

    if (bodegas[index] && bodegas[index].id) {
      return bodegas[index].id;
    }

    return null;
  }

  async function enhanceBodegaCards() {
    const list = findBodegaListElement();
    if (!list) return;
    const cards = Array.from(list.querySelectorAll('.bodega-card'));
    if (!cards.length) {
      setState({
        ui_cards_bound: 0,
      });
      return;
    }

    const bodegas = await getBodegasForUi();
    let bound = 0;

    for (let idx = 0; idx < cards.length; idx += 1) {
      const card = cards[idx];
      const bodegaId = resolveCardBodegaId(card, bodegas, idx);
      if (!bodegaId) continue;

      let actionContainer = card.querySelector('.card-actions');
      if (!actionContainer) {
        actionContainer = document.createElement('div');
        actionContainer.className = 'card-actions';
        card.appendChild(actionContainer);
      }

      let button = actionContainer.querySelector('.kdxv3-open-detail');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-action btn-edit kdxv3-open-detail';
        button.textContent = 'Detalle';
        actionContainer.appendChild(button);
      }
      button.dataset.bodegaId = bodegaId;
      if (!button.dataset.kdxv3Bound) {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const target = event.currentTarget;
          if (!(target instanceof Element)) return;
          const id = target.getAttribute('data-bodega-id');
          if (!id) return;
          openBodegaDetail(id).catch((error) => {
            console.warn('[KardexVNext:F5] open detail error:', normalizeError(error));
          });
        });
        button.dataset.kdxv3Bound = '1';
      }

      card.dataset.kdxv3BodegaId = bodegaId;
      bound += 1;
    }

    setState({
      ui_cards_bound: bound,
      ui_runtime_status: 'cards_bound',
    });
  }

  function scheduleBodegaUiRefresh() {
    if (bodegaUi.refreshTimer) {
      clearTimeout(bodegaUi.refreshTimer);
    }
    bodegaUi.refreshTimer = setTimeout(() => {
      enhanceBodegaCards().catch((error) => {
        setState({
          ui_runtime_status: 'cards_error',
          error: normalizeError(error),
        });
        console.warn('[KardexVNext:F5] refresh bodega cards error:', normalizeError(error));
      });
    }, 50);
  }

  function bindBodegaDetailUi() {
    if (bodegaUi.isBound) return;
    ensureDetailOverlayStyle();
    ensureDetailOverlayRoot();

    const mountPoint = document.getElementById('main-content') || document.body;
    bodegaUi.observer = new MutationObserver(() => {
      scheduleBodegaUiRefresh();
    });
    bodegaUi.observer.observe(mountPoint, {
      childList: true,
      subtree: true,
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDetailOverlay();
    });

    bodegaUi.isBound = true;
    setState({
      ui_bound: true,
      ui_runtime_status: 'observer_bound',
    });
    scheduleBodegaUiRefresh();
  }

  function setFormFeedback(form, message, type) {
    if (!form) return;
    const box = form.querySelector('#form-feedback');
    if (!box) return;
    box.textContent = String(message || '');
    box.className = 'feedback ' + (type || 'info');
  }

  function findClienteByIdentity(clientes, nit, cedula) {
    const nitNorm = normalizeUpperText(nit);
    const cedNorm = normalizeUpperText(cedula);
    if (!nitNorm && !cedNorm) return null;
    return (clientes || []).find((item) => {
      if (!item) return false;
      const itemNit = normalizeUpperText(item.nit || '');
      const itemCed = normalizeUpperText(item.cedula || '');
      if (nitNorm && itemNit && nitNorm === itemNit) return true;
      if (cedNorm && itemCed && cedNorm === itemCed) return true;
      return false;
    }) || null;
  }

  async function resolveClienteEditTarget(form) {
    if (!form) return null;
    const cachedId = form.dataset.kdxv5ClienteId || '';
    if (cachedId) {
      return withDb([STORE_CLIENTES], 'readonly', async (tx) => {
        return requestToPromise(tx.objectStore(STORE_CLIENTES).get(cachedId));
      });
    }

    const initialNit = form.dataset.kdxv5InitialNit || '';
    const initialCedula = form.dataset.kdxv5InitialCedula || '';
    const currentNit = normalizeUpperText((form.querySelector('#nit') && form.querySelector('#nit').value) || '');
    const currentCed = normalizeUpperText((form.querySelector('#cedula') && form.querySelector('#cedula').value) || '');

    return withDb([STORE_CLIENTES], 'readonly', async (tx) => {
      const clientes = await getAllFromStore(tx, STORE_CLIENTES);
      const match = findClienteByIdentity(clientes, initialNit || currentNit, initialCedula || currentCed);
      if (match && match.id) {
        form.dataset.kdxv5ClienteId = String(match.id);
      }
      return match || null;
    });
  }

  function collectClienteFormData(form, existing) {
    const read = (selector) => {
      const el = form.querySelector(selector);
      return String((el && el.value) || '').trim();
    };
    const razonSocial = normalizeUpperText(read('#razon-social'));
    const nit = normalizeUpperText(read('#nit'));
    const cedula = normalizeUpperText(read('#cedula'));
    const formaPago = normalizeUpperText(read('#forma-pago'));
    const direccion = buildClienteAddressFromForm(form);
    const cupoCreditoInput = parsePositiveFromInput(form.querySelector('#cupo-credito'));
    const compraMinimaInput = parsePositiveFromInput(form.querySelector('#compra-minima'));
    const cupoCredito = cupoCreditoInput > 0 ? cupoCreditoInput : asNumber(existing && existing.cupo_credito);
    const compraMinima = compraMinimaInput > 0 ? compraMinimaInput : asNumber(existing && existing.compra_minima);
    const birthdayPicker = window.__KDXV5_BIRTHDAY_GETTER__;
    const birthdayValue = typeof birthdayPicker === 'function' ? String(birthdayPicker(form) || '') : '';

    return {
      razon_social: razonSocial,
      nit: nit || undefined,
      cedula: cedula || undefined,
      celular: read('#celular'),
      correo: read('#correo'),
      direccion,
      barrio: normalizeUpperText(read('#barrio')),
      ciudad: normalizeUpperText(read('#ciudad')),
      fecha_cumpleanos: read('[data-kdxv5-birthday-value]') || birthdayValue || (existing && existing.fecha_cumpleanos) || '',
      contacto: normalizeUpperText(read('#contacto')),
      forma_pago: formaPago,
      cupo_credito: Math.max(0, Math.trunc(cupoCredito || 0)),
      compra_minima: Math.max(0, Math.trunc(compraMinima || 0)),
      horarios_atencion: read('[data-kdxv5-horario-value]') || (existing && existing.horarios_atencion) || '',
    };
  }

  async function fallbackSaveClienteEdit(form) {
    const target = await resolveClienteEditTarget(form);
    if (!target || !target.id) {
      throw new Error('No se encontró el cliente objetivo para edición.');
    }

    const payload = collectClienteFormData(form, target);
    if (!payload.razon_social) {
      throw new Error('La Razón Social es obligatoria.');
    }
    if (!payload.nit && !payload.cedula) {
      throw new Error('Debe ingresar al menos NIT o Cédula.');
    }
    if (!payload.forma_pago) {
      throw new Error('Debe definir la Forma de Pago del cliente.');
    }
    if (payload.direccion === null) {
      throw new Error('Completa la dirección con formato estructurado.');
    }

    return withDb([STORE_CLIENTES], 'readwrite', async (tx) => {
      const clienteStore = tx.objectStore(STORE_CLIENTES);
      const allClientes = await requestToPromise(clienteStore.getAll());
      const duplicate = (allClientes || []).find((item) => {
        if (!item || item.id === target.id) return false;
        const sameNit = payload.nit && normalizeUpperText(item.nit || '') === payload.nit;
        const sameCed = payload.cedula && normalizeUpperText(item.cedula || '') === payload.cedula;
        return !!(sameNit || sameCed);
      });
      if (duplicate) {
        throw new Error('Existe duplicidad en NIT o Cédula. Verifica los datos.');
      }

      const now = nowIso();
      const updated = {
        ...target,
        ...payload,
        updated_at: now,
        updated_by: OVERLAY_NAME,
        version: asNumber(target.version) + 1,
        sync_status: 'pending',
        created_at: target.created_at || now,
      };
      clienteStore.put(updated);

      return updated;
    });
  }

  function bindClienteFormGuards(mainRoot) {
    const form = mainRoot.querySelector('#cliente-form');
    if (!form || form.dataset.kdxv5UxBound === '1') return;
    form.dataset.kdxv5UxBound = '1';

    const isEdit = !!mainRoot.querySelector('.form-mode-edit');
    if (isEdit) {
      form.dataset.kdxv5IsEdit = '1';
      form.dataset.kdxv5InitialNit = normalizeUpperText((form.querySelector('#nit') && form.querySelector('#nit').value) || '');
      form.dataset.kdxv5InitialCedula = normalizeUpperText((form.querySelector('#cedula') && form.querySelector('#cedula').value) || '');
      resolveClienteEditTarget(form).catch(() => {});
    }

    const cancelBtn = form.querySelector('#btn-cancel');
    if (cancelBtn && cancelBtn.dataset.kdxv5CancelBound !== '1') {
      cancelBtn.dataset.kdxv5CancelBound = '1';
      cancelBtn.addEventListener('click', () => {
        showUxToast('Cancelación de Cliente confirmada.', 'warn');
      }, true);
    }

    const backBtn = mainRoot.querySelector('#btn-back');
    if (backBtn && backBtn.dataset.kdxv5BackBound !== '1') {
      backBtn.dataset.kdxv5BackBound = '1';
      backBtn.addEventListener('click', () => {
        showUxToast('Salida de formulario de Cliente solicitada.', 'info');
      }, true);
    }

    const submitBtn = form.querySelector('#btn-submit');
    if (submitBtn && submitBtn.dataset.kdxv5SubmitHintBound !== '1') {
      submitBtn.dataset.kdxv5SubmitHintBound = '1';
      submitBtn.addEventListener('click', () => {
        setState({
          ux_last_action: 'Cliente: intento de guardar',
          ux_runtime_status: 'cliente_submit_clicked',
        });
      }, true);
    }

    form.addEventListener('submit', () => {
      const modeEdit = form.dataset.kdxv5IsEdit === '1';
      const afterMs = modeEdit ? 900 : 500;
      setTimeout(async () => {
        const feedback = form.querySelector('#form-feedback');
        const feedbackText = String((feedback && feedback.textContent) || '');
        const isError = feedback && feedback.className.includes('error');
        const isSuccess = feedback && feedback.className.includes('success');
        if (isSuccess && isTruthyText(feedbackText, ['actualizado', 'registrado', 'guardado'])) {
          showUxToast(feedbackText, 'ok');
          return;
        }

        if (!modeEdit || !isError) return;
        const shouldFallback = isTruthyText(feedbackText, ['cupo credito', 'compra minima']);
        if (!shouldFallback || form.dataset.kdxv5FallbackRunning === '1') return;

        const allow = confirm('Se detectó bloqueo al guardar edición de cliente. ¿Aplicar guardado asistido?');
        if (!allow) return;
        form.dataset.kdxv5FallbackRunning = '1';
        try {
          const updated = await fallbackSaveClienteEdit(form);
          setFormFeedback(form, 'Cliente actualizado correctamente (guardado asistido).', 'success');
          showUxToast('Cliente actualizado correctamente.', 'ok');
          setState({
            ux_last_action: 'cliente_edit_fallback_saved:' + updated.id,
            ux_runtime_status: 'cliente_edit_fallback_saved',
          });
          setTimeout(() => {
            if (window.__erp_navigate) window.__erp_navigate('clientes');
          }, 900);
        } catch (error) {
          setFormFeedback(form, 'Error: ' + normalizeError(error), 'error');
          showUxToast('Error al guardar cliente: ' + normalizeError(error), 'warn');
        } finally {
          form.dataset.kdxv5FallbackRunning = '0';
        }
      }, afterMs);
    }, true);
  }

  function bindClienteDetailGuards(mainRoot) {
    const editBtn = mainRoot.querySelector('#btn-edit');
    if (!editBtn || editBtn.dataset.kdxv5EditGuard === '1') return;
    editBtn.dataset.kdxv5EditGuard = '1';
    editBtn.addEventListener('click', (event) => {
      const allow = confirm('¿Confirmar edición de este cliente?');
      if (!allow) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showUxToast('Edición de cliente cancelada.', 'warn');
        return;
      }
      showUxToast('Edición de cliente confirmada.', 'info');
    }, true);
  }

  function bindKardexFormGuards(mainRoot) {
    const form = mainRoot.querySelector('#kx-form');
    if (!form || form.dataset.kdxv5UxBound === '1') return;
    form.dataset.kdxv5UxBound = '1';

    const backBtn = mainRoot.querySelector('#btn-back');
    if (backBtn && backBtn.dataset.kdxv5KxBackBound !== '1') {
      backBtn.dataset.kdxv5KxBackBound = '1';
      backBtn.addEventListener('click', (event) => {
        const hasData = ['#kx-producto', '#kx-cantidad', '#kx-referencia', '#kx-observacion'].some((sel) => {
          const el = form.querySelector(sel);
          return !!(el && String(el.value || '').trim());
        });
        if (!hasData) return;
        const allow = confirm('¿Cancelar captura de movimiento de Kardex? Se descartarán cambios no guardados.');
        if (!allow) {
          event.preventDefault();
          event.stopImmediatePropagation();
          showUxToast('Cancelación de Kardex abortada.', 'warn');
          return;
        }
        showUxToast('Cancelación de Kardex confirmada.', 'warn');
      }, true);
    }

    form.addEventListener('submit', (event) => {
      const allow = confirm('¿Confirmar guardar este movimiento de Kardex?');
      if (!allow) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showUxToast('Guardado de Kardex cancelado.', 'warn');
        return;
      }
      try {
        sessionStorage.setItem('kdxv5_kardex_save_pending', nowIso());
      } catch {}
      showUxToast('Guardado de Kardex confirmado.', 'info');
    }, true);
  }

  function bindBodegasGuards(mainRoot) {
    const crearBtn = mainRoot.querySelector('#btn-crear-bodega');
    if (crearBtn && crearBtn.dataset.kdxv5CreateGuard !== '1') {
      crearBtn.dataset.kdxv5CreateGuard = '1';
      crearBtn.addEventListener('click', (event) => {
        const allow = confirm('¿Guardar nueva bodega?');
        if (!allow) {
          event.preventDefault();
          event.stopImmediatePropagation();
          showUxToast('Guardado de bodega cancelado.', 'warn');
          return;
        }
        showUxToast('Guardado de bodega confirmado.', 'info');
      }, true);
    }

    mainRoot.querySelectorAll('.bod-btn-edit').forEach((btn) => {
      if (btn.dataset.kdxv5EditGuard === '1') return;
      btn.dataset.kdxv5EditGuard = '1';
      btn.addEventListener('click', (event) => {
        const allow = confirm('¿Confirmar edición de esta bodega?');
        if (!allow) {
          event.preventDefault();
          event.stopImmediatePropagation();
          showUxToast('Edición de bodega cancelada.', 'warn');
          return;
        }
        showUxToast('Edición de bodega confirmada.', 'info');
      }, true);
    });

    mainRoot.querySelectorAll('.bod-btn-deact').forEach((btn) => {
      if (btn.dataset.kdxv5DeactGuard === '1') return;
      btn.dataset.kdxv5DeactGuard = '1';
      btn.addEventListener('click', () => {
        showUxToast('Desactivación de bodega solicitada.', 'warn');
      }, true);
    });
  }

  function bindKardexListPostSaveToast(mainRoot) {
    const heading = mainRoot.querySelector('h2');
    if (!heading) return;
    const isKardexList = isTruthyText(heading.textContent, ['kardex']) && !!mainRoot.querySelector('#btn-nuevo-mov, #btn-bodegas');
    if (!isKardexList) return;
    let pending = null;
    try {
      pending = sessionStorage.getItem('kdxv5_kardex_save_pending');
    } catch {}
    if (!pending) return;
    try {
      sessionStorage.removeItem('kdxv5_kardex_save_pending');
    } catch {}
    showUxToast('Movimiento de Kardex guardado correctamente.', 'ok');
  }

  function refreshUxGuards() {
    const mainRoot = document.getElementById('main-content');
    if (!mainRoot) return;
    bindClienteFormGuards(mainRoot);
    bindClienteDetailGuards(mainRoot);
    bindKardexFormGuards(mainRoot);
    bindBodegasGuards(mainRoot);
    bindKardexListPostSaveToast(mainRoot);
  }

  function bindUxGuards() {
    if (uxRuntime.isBound) return;
    ensureUxToastStyle();
    const mountPoint = document.getElementById('main-content') || document.body;
    uxRuntime.observer = new MutationObserver(() => {
      if (uxRuntime.refreshTimer) clearTimeout(uxRuntime.refreshTimer);
      uxRuntime.refreshTimer = setTimeout(() => {
        refreshUxGuards();
      }, 40);
    });
    uxRuntime.observer.observe(mountPoint, {
      childList: true,
      subtree: true,
    });
    uxRuntime.isBound = true;
    setState({
      ux_bound: true,
      ux_runtime_status: 'observer_bound',
    });
    refreshUxGuards();
  }

  async function processCanonicalEvent(eventType, payload) {
    if (eventType === EVENT_CANONICAL.FACTURA_EMITIDA || eventType === EVENT_CANONICAL.REMISION_EMITIDA) {
      return processFacturaRemision(eventType, payload);
    }
    if (eventType === EVENT_CANONICAL.GARANTIA_RECONOCIDA) {
      return processGarantiaReconocida(eventType, payload);
    }
    if (eventType === EVENT_CANONICAL.COMPRA_RECEPCIONADA) {
      return processCompraRecepcionada(eventType, payload);
    }
    if (eventType === EVENT_CANONICAL.DEVOLUCION_CLIENTE_RECIBIDA) {
      return processDevolucionCliente(eventType, payload);
    }
    if (eventType === EVENT_CANONICAL.NOTA_CREDITO_PROVEEDOR_EMITIDA) {
      return processNotaCreditoProveedor(eventType, payload);
    }
    return {
      ok: false,
      event_type: eventType,
      mode: 'apply',
      written: 0,
      skipped: 1,
      pending: 0,
      errors: ['Unsupported event type'],
      details: [],
    };
  }

  function upsertReplayEntry(queue, entry) {
    const idx = queue.findIndex((item) => item && item.id === entry.id);
    if (idx >= 0) {
      queue[idx] = entry;
    } else {
      queue.push(entry);
    }
  }

  function removeReplayEntry(queue, replayId) {
    const idx = queue.findIndex((item) => item && item.id === replayId);
    if (idx >= 0) queue.splice(idx, 1);
  }

  async function enqueueReplayEvent(canonicalType, payload, meta) {
    const queue = readReplayQueue();
    const eventPayload = safeJsonClone(payload) || {};
    const eventMeta = safeJsonClone(meta) || {};
    const eventKey = buildReplayEventKey(canonicalType, eventPayload);
    const existing = queue.find((item) => item && item.event_key === eventKey);
    if (existing) {
      setState({
        retry_last_trigger: 'dedupe_event',
      });
      syncQueueStats(queue);
      return {
        enqueued: false,
        replay_id: existing.id,
        event_key: existing.event_key,
        status: existing.status,
      };
    }

    const now = nowIso();
    const entry = normalizeQueueEntry({
      id: randomId(),
      type: 'KARDEX_VNEXT_EVENT',
      entity: 'kardex_vnext_event',
      event_type: canonicalType,
      event_key: eventKey,
      payload: eventPayload,
      meta: eventMeta,
      status: 'pending',
      retry_count: 0,
      max_retries: REPLAY_MAX_RETRIES,
      next_attempt_at: now,
      created_at: now,
      updated_at: now,
      created_by: OVERLAY_NAME,
      updated_by: OVERLAY_NAME,
      version: 1,
      status_entity: 'active',
      sync_status: 'pending',
      idempotency_key: eventKey,
      last_trigger: meta && meta.source ? String(meta.source) : null,
    });
    queue.push(entry);
    writeReplayQueueStorage(queue);
    setState({
      retry_last_trigger: 'enqueue',
    });
    return {
      enqueued: true,
      replay_id: entry.id,
      event_key: entry.event_key,
      status: entry.status,
    };
  }

  async function replayOneEntry(entry, trigger) {
    const queueBefore = readReplayQueue();
    const current = queueBefore.find((item) => item && item.id === entry.id);
    if (!current) {
      return {
        ok: true,
        mode: 'replay_missing_entry',
        replay_id: entry.id,
      };
    }

    const processingEntry = normalizeQueueEntry({
      ...current,
      status: 'processing',
      processing_started_at: nowIso(),
      processing_owner: OVERLAY_NAME,
      updated_at: nowIso(),
      updated_by: OVERLAY_NAME,
      version: asNumber(current.version) + 1,
      last_trigger: trigger,
    });
    upsertReplayEntry(queueBefore, processingEntry);
    writeReplayQueueStorage(queueBefore);

    let summary = null;
    let replayError = null;
    try {
      summary = await processCanonicalEvent(processingEntry.event_type, processingEntry.payload || {});
    } catch (error) {
      replayError = error;
    }

    const queueAfter = readReplayQueue();
    const latest = queueAfter.find((item) => item && item.id === processingEntry.id);
    if (!latest) {
      return {
        ok: true,
        mode: 'replay_removed',
        replay_id: processingEntry.id,
      };
    }

    const hasHardError = !!replayError;
    const hasSummaryErrors = summary && Array.isArray(summary.errors) && summary.errors.length > 0;
    const hasPending = summary && asNumber(summary.pending) > 0;
    const success = !hasHardError && summary && summary.ok && !hasSummaryErrors && !hasPending;

    if (success) {
      removeReplayEntry(queueAfter, latest.id);
      writeReplayQueueStorage(queueAfter);
      setState({
        queue_replayed: state.queue_replayed + 1,
      });
      state.events_processed += 1;
      return {
        ok: true,
        mode: 'replay_success',
        replay_id: latest.id,
        summary,
      };
    }

    const nextRetryCount = asNumber(latest.retry_count) + 1;
    const exhausted = nextRetryCount >= asNumber(latest.max_retries || REPLAY_MAX_RETRIES);
    const nextAttemptMs = Date.now() + backoffMs(nextRetryCount);
    const failureMessage = hasHardError
      ? normalizeError(replayError)
      : (summary && summary.errors && summary.errors[0]) || (hasPending ? 'partial_event_processing' : 'unknown_replay_failure');

    const failedEntry = normalizeQueueEntry({
      ...latest,
      status: 'failed',
      retry_count: nextRetryCount,
      next_attempt_at: new Date(nextAttemptMs).toISOString(),
      processing_started_at: null,
      processing_owner: null,
      updated_at: nowIso(),
      updated_by: OVERLAY_NAME,
      version: asNumber(latest.version) + 1,
      last_error: failureMessage,
      last_summary: safeJsonClone(summary),
      sync_status: exhausted ? 'error' : 'pending',
      last_trigger: trigger,
    });
    upsertReplayEntry(queueAfter, failedEntry);
    writeReplayQueueStorage(queueAfter);

    if (!exhausted) {
      setState({
        queue_retried: state.queue_retried + 1,
      });
    } else {
      setState({
        queue_exhausted: state.queue_exhausted + 1,
      });
      state.events_skipped += 1;
    }

    return {
      ok: !exhausted,
      mode: exhausted ? 'replay_failed_exhausted' : 'replay_failed_retry',
      replay_id: failedEntry.id,
      summary,
      error: failureMessage,
      retry_count: failedEntry.retry_count,
      max_retries: failedEntry.max_retries,
      exhausted,
      next_attempt_at: failedEntry.next_attempt_at,
    };
  }

  async function drainReplayQueue(trigger) {
    const cutover = refreshCutoverConfig('drain_replay_queue');
    if (!state.enabled) {
      return {
        ok: true,
        mode: 'disabled_gate',
        processed: 0,
        retried: 0,
        cutover,
      };
    }
    if (state.shadow_mode) {
      return {
        ok: true,
        mode: 'shadow_mode',
        processed: 0,
        retried: 0,
        cutover,
      };
    }

    setState({
      retry_last_trigger: trigger || 'unspecified',
      retry_runtime_status: navigator.onLine ? 'draining_online' : 'draining_offline',
    });

    let processed = 0;
    let retried = 0;
    const failures = [];
    for (let i = 0; i < REPLAY_BATCH_SIZE; i += 1) {
      const queue = readReplayQueue();
      const candidate = selectReplayCandidate(queue);
      if (!candidate) break;
      const result = await replayOneEntry(candidate, trigger || 'drain');
      if (result.mode === 'replay_success') {
        processed += 1;
      } else if (result.mode === 'replay_failed_retry' || result.mode === 'replay_failed_exhausted') {
        retried += 1;
        failures.push(result);
      }
    }

    setState({
      retry_last_drain_at: nowIso(),
      retry_runtime_status: navigator.onLine ? 'online_idle' : 'offline_idle',
    });
    syncQueueStats(readReplayQueue());

    return {
      ok: failures.every((item) => !item.exhausted),
      mode: 'replay_drain',
      processed,
      retried,
      failures,
      queue: summarizeQueue(readReplayQueue()),
      cutover,
    };
  }

  async function ingestEvent(type, payload, meta) {
    const canonicalType = canonicalEventType(type);
    state.last_event_type = type;
    const cutover = refreshCutoverConfig('ingest_event');

    if (!canonicalType) {
      state.events_skipped += 1;
      return {
        ok: false,
        event_type: type,
        mode: 'skip',
        written: 0,
        skipped: 1,
        pending: 0,
        errors: ['Unknown event type'],
        details: [],
      };
    }

    if (!state.enabled) {
      state.events_skipped += 1;
      return {
        ok: true,
        event_type: canonicalType,
        mode: 'disabled_gate',
        written: 0,
        skipped: 1,
        pending: 0,
        errors: [],
        details: [
          {
            status: 'skipped',
            reason: 'feature_flag_disabled_or_stage_off',
          },
        ],
      };
    }

    if (state.shadow_mode) {
      state.events_processed += 1;
      const shadowReason = cutover.runtime_status === 'cutover_blocked_legacy_active'
        ? 'legacy_writer_active_forced_shadow'
        : 'shadow_only';
      return {
        ok: true,
        event_type: canonicalType,
        mode: 'shadow',
        written: 0,
        skipped: 0,
        pending: 0,
        errors: [],
        details: [
          {
            status: shadowReason,
            meta: meta || {},
          },
        ],
      };
    }

    if (!cutoverRuntime.liveEventTypes.has(canonicalType)) {
      state.events_processed += 1;
      return {
        ok: true,
        event_type: canonicalType,
        mode: 'event_not_in_live_allowlist',
        written: 0,
        skipped: 0,
        pending: 0,
        errors: [],
        details: [
          {
            status: 'shadow_only',
            reason: 'event_not_allowlisted_for_cutover',
          },
        ],
      };
    }

    const canaryDecision = decideCanaryAdmission(canonicalType, payload || {});
    if (!canaryDecision.admitted) {
      state.events_processed += 1;
      return {
        ok: true,
        event_type: canonicalType,
        mode: 'canary_filtered',
        written: 0,
        skipped: 0,
        pending: 0,
        errors: [],
        details: [
          {
            status: 'shadow_only',
            reason: canaryDecision.reason,
            bucket: canaryDecision.bucket,
            threshold: canaryDecision.threshold,
          },
        ],
      };
    }

    const queued = await enqueueReplayEvent(canonicalType, payload || {}, meta || {});
    const drain = await drainReplayQueue('ingest_event');
    const ok = queued.enqueued ? drain.ok : true;
    if (!ok) {
      state.events_skipped += 1;
    }
    return {
      ok,
      event_type: canonicalType,
      mode: 'queued_replay',
      written: 0,
      skipped: ok ? 0 : 1,
      pending: asNumber(drain.queue && drain.queue.pending),
      errors: ok ? [] : ['replay_queue_exhausted'],
      details: [
        {
          status: queued.enqueued ? 'queued' : 'duplicate_event_key',
          replay_id: queued.replay_id,
          event_key: queued.event_key,
          canary: canaryDecision,
        },
      ],
      queue: {
        enqueue: queued,
        drain,
      },
    };
  }

  function enqueueIngest(type, payload, meta) {
    state.events_received += 1;
    const run = async function runInQueue() {
      const result = await ingestEvent(type, payload, meta);
      state.last_result = result;
      return result;
    };
    state._queue = state._queue.then(run, run);
    return state._queue;
  }

  function handleDirectEvent(event) {
    const payload = (event && event.detail) || {};
    enqueueIngest(event.type, payload, {
      source: 'window_direct_event',
    }).catch((error) => {
      console.warn('[KardexVNext:F5] ingest direct event error:', normalizeError(error));
    });
  }

  function handleChannelEvent(event) {
    const detail = (event && event.detail) || {};
    const type = detail.type || detail.event || detail.name || null;
    const payload = detail.payload || detail.data || {};
    const meta = detail.meta || {};
    enqueueIngest(type, payload, {
      source: 'window_channel_event',
      channel: event.type,
      ...meta,
    }).catch((error) => {
      console.warn('[KardexVNext:F5] ingest channel event error:', normalizeError(error));
    });
  }

  function bindListeners() {
    for (const eventType of DIRECT_EVENT_TYPES) {
      window.addEventListener(eventType, handleDirectEvent);
    }
    for (const channel of INGEST_CHANNELS) {
      window.addEventListener(channel, handleChannelEvent);
    }
    setState({
      listeners_bound: true,
    });
  }

  function enqueueReplayDrain(trigger) {
    const run = async function runReplayDrain() {
      return drainReplayQueue(trigger || 'manual');
    };
    state._queue = state._queue.then(run, run);
    return state._queue;
  }

  function bindRetryLifecycle() {
    if (replayRuntime.isBound) return;

    const onOnline = () => {
      refreshCutoverConfig('network_online');
      setState({
        retry_runtime_status: 'online',
      });
      enqueueReplayDrain('network_online').catch((error) => {
        console.warn('[KardexVNext:F5] replay drain online error:', normalizeError(error));
      });
    };
    const onOffline = () => {
      refreshCutoverConfig('network_offline');
      setState({
        retry_runtime_status: 'offline',
      });
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    replayRuntime.timerId = setInterval(() => {
      enqueueReplayDrain('poll_timer').catch((error) => {
        console.warn('[KardexVNext:F5] replay poll error:', normalizeError(error));
      });
    }, REPLAY_POLL_INTERVAL_MS);

    replayRuntime.isBound = true;
    setState({
      retry_bound: true,
      retry_runtime_status: navigator.onLine ? 'online' : 'offline',
    });
    syncQueueStats(readReplayQueue());
  }

  async function start() {
    exposeOverlayApi();
    const cutoverBoot = refreshCutoverConfig('bootstrap');
    bindListeners();
    bindRetryLifecycle();
    bindBodegaDetailUi();
    bindUxGuards();

    const seedResult = await seedGarantiasBodegaIdempotent();
    if (!seedResult.ok) {
      console.warn('[KardexVNext:F5] Garantias seed warning:', seedResult);
    }

    if (!state.enabled) {
      setState({
        runtime_status: 'disabled_gate',
      });
      console.info('[KardexVNext:F5] Overlay installed. Gate OFF, listeners waiting.', cutoverBoot);
      return;
    }

    if (state.shadow_mode) {
      const blocked = cutoverBoot.runtime_status === 'cutover_blocked_legacy_active';
      console.info(
        blocked
          ? '[KardexVNext:F5] Overlay forced to SHADOW because legacy writer is active.'
          : '[KardexVNext:F5] Overlay active in shadow mode.',
        cutoverBoot,
      );
      return;
    }

    const replayBoot = await enqueueReplayDrain('startup_recovery');
    setState({
      runtime_status: cutoverBoot.stage_effective === CUTOVER_STAGES.CANARY ? 'canary_active' : 'event_orchestrator_active',
    });
    console.info('[KardexVNext:F5] Event orchestrator active with controlled cutover.', {
      cutover: cutoverBoot,
      replay: replayBoot,
    });
  }

  // F1R3-BLOCKER-004 FIX: envuelve start() en DOMContentLoaded.
  // start() llama bindBodegaDetailUi() y getUxToastWrap() que usan document.body.
  // Si el script está en <head>, document.body es null → appendChild null.
  function _safeStart() {
    start().catch(function onUnhandledError(error) {
      var message = normalizeError(error);
      setState({ runtime_status: 'error', error: message });
      console.error('[KardexVNext:F5] Bootstrap error:', error);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _safeStart);
  } else {
    _safeStart();
  }
})();

(function patchVersionDisplay() {
  const STORAGE_KEY = 'kdxv5_deploy_installed';

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return 'hace ' + days + 'd';
    if (hours > 0) return 'hace ' + hours + 'h';
    if (mins > 0) return 'hace ' + mins + 'm';
    return 'recién';
  }

  function getInstallInfo() {
    const flags = window.__MAXGRIFOS_FLAGS__ || {};
    const hash = flags.buildHash;
    if (!hash) return null;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch {}
    if (!stored || stored.hash !== hash) {
      stored = { hash: hash, installedAt: new Date().toISOString() };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch {}
    }
    return stored;
  }

  function patch() {
    try {
      const info = getInstallInfo();
      if (!info) return;
      const shortHash = info.hash.slice(0, 7);
      const ago = timeAgo(info.installedAt);

      const badge = document.querySelector('#oi-badge');
      if (!badge) return;

      badge.querySelectorAll('span').forEach(function(span) {
        if (/^v[0-9a-f]{6,}$/.test((span.textContent || '').trim())) {
          span.textContent = 'v' + shortHash;
        }
      });
      badge.title = 'v' + shortHash + ' · instalado ' + ago;

      const container = document.getElementById('offline-indicator');
      if (!container) return;
      const strong = container.querySelector('strong');
      if (strong && /^[0-9a-f]{6,}$/.test((strong.textContent || '').trim())) {
        const parent = strong.parentElement;
        if (parent) parent.innerHTML = 'Versión: <strong>' + shortHash + '</strong> &nbsp;·&nbsp; instalado <strong>' + ago + '</strong>';
      }
    } catch {}
  }

  function init() {
    patch();
    const badge = document.querySelector('#oi-badge');
    if (badge) {
      badge.addEventListener('click', function() { setTimeout(patch, 50); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 600); });
  } else {
    setTimeout(init, 600);
  }
})();
