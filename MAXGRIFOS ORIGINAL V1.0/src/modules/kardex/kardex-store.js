import {
  saveMovimiento,
  getAllMovimientos,
  getMovimientosByProduct,
  getMovimientoByIdempotencyKey,
  updateMovimientoSyncStatus,
  addToSyncQueue,
  getSyncQueue,
  claimSyncQueueItem,
  updateSyncQueueItem,
  removeSyncQueueItem,
  getProduct,
} from '../../db/local-db.js';
import { mockApi } from '../../mock/mock-api.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { BODEGA_CENTRAL_ID, BODEGA_PEDIDOS_ID, BODEGA_DESACTIVADOS_ID, BODEGA_GARANTIAS_ID } from './bodega-store.js';
import { runtimeGuard } from '../observability/runtime-guard.js';
import { enforcement } from '../observability/enforcement-progressive.js';

export const TIPOS_ENTRADA = ['ENTRADA_COMPRA', 'ENTRADA_DEVOLUCION_CLIENTE'];
export const TIPOS_SALIDA  = ['SALIDA_AVERIA', 'SALIDA_ROBO', 'SALIDA_DEVOLUCION_PROVEEDOR', 'SALIDA_AJUSTE_AUDITORIA'];
export const TIPOS_VENTA   = ['SALIDA_VENTA'];
export const TIPOS_AJUSTE  = ['AJUSTE'];
export const TIPOS_GARANTIA = ['GARANTIA_OUT', 'GARANTIA_IN', 'GARANTIA_NC_OUT'];
export const TIPOS_INTERNOS = [
  'RESERVA_OUT',
  'RESERVA_IN',
  'LIBERACION',
  'REVERSION_OUT',
  'REVERSION_IN',
  'DESACTIVACION_OUT',
  'DESACTIVACION_IN',
  'DESACTIVACION_COMP',
  'REACTIVACION_OUT',
  'REACTIVACION_IN',
];

const TIPO_LABEL = {
  ENTRADA_COMPRA:              'Entrada - Compra a proveedor',
  ENTRADA_DEVOLUCION_CLIENTE:  'Entrada - Devolucion de cliente',
  SALIDA_AVERIA:               'Salida - Averia',
  SALIDA_ROBO:                 'Salida - Robo / Merma',
  SALIDA_DEVOLUCION_PROVEEDOR: 'Salida - Devolucion a proveedor',
  SALIDA_AJUSTE_AUDITORIA:     'Salida - Ajuste de auditoria',
  AJUSTE:                      'Ajuste de inventario',
  RESERVA_OUT:                 'Reserva - Salida de Central Depot',
  RESERVA_IN:                  'Reserva - Entrada a Pedidos',
  LIBERACION:                  'Liberacion - Entrega definitiva',
  REVERSION_OUT:               'Reversion - Salida de Pedidos',
  REVERSION_IN:                'Reversion - Retorno a Central Depot',
  DESACTIVACION_OUT:           'Desactivacion - Salida de Central Depot',
  DESACTIVACION_IN:            'Desactivacion - Entrada a Desactivados',
  DESACTIVACION_COMP:          'Desactivacion - Compensacion Central Depot',
  REACTIVACION_OUT:            'Reactivacion - Salida de Desactivados',
  REACTIVACION_IN:             'Reactivacion - Entrada a Central Depot',
  SALIDA_VENTA:                'Salida - Venta (Factura / Remision)',
  GARANTIA_OUT:                'Garantia - Salida de Bodega Central',
  GARANTIA_IN:                 'Garantia - Entrada a Bodega Garantias',
  GARANTIA_NC_OUT:             'Garantia - Descarga por Nota Credito Proveedor',
};
export { TIPO_LABEL };

const REFERENCIA_DESACTIVACION_PRODUCTO = 'DESACTIVACION_PRODUCTO';
const REFERENCIA_DESACTIVACION_COMPENSACION = 'DESACTIVACION_COMPENSACION';
const REFERENCIA_REACTIVACION_PRODUCTO = 'REACTIVACION_PRODUCTO';
const _deactivationLocks = new Set();
const _reactivationLocks = new Set();
let _isProductDeactivationHandlerBound = false;
let _isProductDeletedHandlerBound = false;
let _isProductActivationHandlerBound = false;
let _isDocumentoEmitidoHandlerBound = false;
let _isAuditBridgeHandlerBound = false;
const _documentReleaseLocks = new Set();
const _documentReleaseDone = new Set();
const _documentReleaseRetryState = new Map();
const DOCUMENT_RELEASE_RETRY_LIMIT = 3;
const DOCUMENT_RELEASE_RETRY_BASE_MS = 2000;
const DOCUMENT_RELEASE_RETRY_ENTITY = 'kardex_doc_release_retry';
const DOCUMENT_RELEASE_RETRY_IDEMPOTENCY_PREFIX = 'KDX_DOCREL_RETRY';
const _auditAdjustLocks = new Set();
const _auditAdjustResults = new Map();

function _isDelta(tipo) {
  if (TIPOS_ENTRADA.includes(tipo) || tipo === 'GARANTIA_IN') return 1;
  if (TIPOS_SALIDA.includes(tipo) || TIPOS_VENTA.includes(tipo) || tipo === 'GARANTIA_OUT' || tipo === 'GARANTIA_NC_OUT') return -1;
  return 0; // AJUSTE and internal types handle delta explicitly
}

function _toPositiveCantidad(value, contexto = 'operacion') {
  const cantidad = Number(value);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error(`Cantidad invalida en ${contexto}`);
  }
  return cantidad;
}

export async function getSaldoByProduct(productId, bodegaId = null) {
  const movimientos = await getMovimientosByProduct(productId);
  return movimientos
    .filter((m) => !bodegaId || m.bodega_id === bodegaId)
    .reduce((acc, m) => acc + (m.delta ?? 0), 0);
}

export async function getSaldosResumen(bodegaId = null) {
  const all = await getAllMovimientos();
  const map = new Map();
  for (const m of all) {
    if (bodegaId && m.bodega_id !== bodegaId) continue;
    map.set(m.product_id, (map.get(m.product_id) ?? 0) + (m.delta ?? 0));
  }
  return map;
}

async function _buildMovimiento(data, delta) {
  const now = new Date().toISOString();
  if (!Number.isFinite(Number(data.saldo_anterior))) {
    throw new Error('KARDEX_SALDO_ANTERIOR_REQUERIDO');
  }
  return {
    id: data.id
      ?? data.idempotency_key
      ?? `KDX:${data.tipo}:${data.product_id}:${data.referencia ?? data.pedido_id ?? data.transfer_id ?? 'NA'}:${data.bodega_id ?? BODEGA_CENTRAL_ID}:${Math.abs(Number(data.cantidad ?? delta ?? 0))}`,
    product_id:   data.product_id,
    product_sku:  data.product_sku  ?? '',
    product_name: data.product_name ?? '',
    tipo:         data.tipo,
    bodega_id:    data.bodega_id ?? BODEGA_CENTRAL_ID,
    cantidad:     Math.abs(Number(data.cantidad ?? delta)),
    delta,
    saldo_resultante: data.saldo_anterior + delta,
    pedido_id:       data.pedido_id       ?? null,
    transfer_id:     data.transfer_id     ?? null,
    cliente_id:      data.cliente_id      ?? null,
    costo_unitario:  data.costo_unitario  ?? null,
    garantia_motivo: data.garantia_motivo ?? null,
    observacion:     data.observacion     ?? '',
    referencia:      data.referencia      ?? '',
    created_at:   now,
    updated_at:   now,
    created_by:   'local',
    updated_by:   'local',
    version:      1,
    status:       'active',
    sync_status:  'pending',
    idempotency_key: data.idempotency_key
      ?? `KDX:${data.tipo}:${data.product_id}:${data.referencia ?? 'NA'}`,
  };
}

export async function createMovimiento(data, options = {}) {
  if (!options.__fromHandler) {
    enforcement.enforce('createMovimiento', {
      module: 'kardex',
      entity_id: data?.product_id,
      fromHandler: false,
    });
    runtimeGuard.report({
      type: 'STORE_VIOLATION',
      module: 'kardex',
      action: 'createMovimiento',
      entity_id: data?.product_id,
      key: data?.idempotency_key,
    });
    throw new Error('STORE_ACCESS_DENIED:kardex:createMovimiento');
  }

  if (!data?.idempotency_key) {
    throw new Error('KARDEX_IDEMPOTENCY_KEY_REQUIRED');
  }

  const existingMovimiento = await getMovimientoByIdempotencyKey(data.idempotency_key);
  if (existingMovimiento) return existingMovimiento;

  if (!data?.product_id) {
    throw new Error('KARDEX_PRODUCT_ID_REQUIRED');
  }

  let product = await getProduct(data.product_id);
  if (!product) {
    throw new Error('Producto no encontrado');
  }

  if (!product.sku && !data.product_sku) {
    throw new Error('KARDEX_PRODUCT_SKU_REQUIRED');
  }

  const bodegaId    = data.bodega_id ?? BODEGA_CENTRAL_ID;
  const saldoActual = await getSaldoByProduct(data.product_id, bodegaId);
  const cantidad    = _toPositiveCantidad(data.cantidad, 'movimiento de kardex');

  let delta;
  if (data.tipo === 'AJUSTE') {
    delta = cantidad - saldoActual;
  } else {
    const sign = _isDelta(data.tipo);
    delta = sign * cantidad;
  }

  if (delta < 0 && saldoActual < Math.abs(delta)) {
    throw new Error(`Stock insuficiente en bodega para ${product.sku}`);
  }

  const movimiento = await _buildMovimiento(
    { ...data, cantidad, product_sku: product.sku, product_name: product.nombre, saldo_anterior: saldoActual },
    delta,
  );

  await saveMovimiento(movimiento);

  const eventType = data.tipo === 'AJUSTE' ? Events.STOCK_ADJUSTED : Events.STOCK_MOVED;
  eventBus.emit(eventType, { movimiento, saldo_resultante: movimiento.saldo_resultante });

  const stockMinimo = product.stock_minimo ?? 0;
  if (stockMinimo > 0 && movimiento.saldo_resultante < stockMinimo) {
    eventBus.emit(Events.STOCK_ALERT, {
      product_id: data.product_id,
      product_sku: product.sku,
      product_name: product.nombre,
      saldo_resultante: movimiento.saldo_resultante,
      stock_minimo: stockMinimo,
    });
  }

  await _trySyncNow(movimiento.id, movimiento);
  return movimiento;
}

// Reserva stock: Central Depot â†' Pedidos (crea par de movimientos vinculados)
export async function reservarStock({ product_id, cantidad, pedido_id }) {
  // Idempotency pre-check: claves estables por pedido+producto evitan doble reserva en retry
  const idemBase = `KDX:RESERVA:${pedido_id}:${product_id}`;
  const [existOut, existIn] = await Promise.all([
    getMovimientoByIdempotencyKey(`${idemBase}:OUT`),
    getMovimientoByIdempotencyKey(`${idemBase}:IN`),
  ]);
  if (existOut && existIn) return { out: existOut, inn: existIn };

  const product      = await getProduct(product_id);
  if (!product) throw new Error(`Producto ${product_id} no encontrado`);
  const cantidadNum  = _toPositiveCantidad(cantidad, 'reserva de stock');

  const saldoCentral = await getSaldoByProduct(product_id, BODEGA_CENTRAL_ID);
  if (saldoCentral < cantidadNum) throw new Error(`Stock insuficiente en Central Depot para ${product.sku}`);

  const transfer_id = `KDX:RESERVA:${pedido_id}:${product_id}:TRANSFER`;
  const base = {
    product_id,
    product_sku: product.sku,
    product_name: product.nombre,
    pedido_id,
    transfer_id,
    cantidad: cantidadNum,
  };

  const out = await _buildMovimiento({ ...base, tipo: 'RESERVA_OUT', bodega_id: BODEGA_CENTRAL_ID, saldo_anterior: saldoCentral, idempotency_key: `${idemBase}:OUT` }, -cantidadNum);
  const saldoPedidos = await getSaldoByProduct(product_id, BODEGA_PEDIDOS_ID);
  const inn = await _buildMovimiento({ ...base, tipo: 'RESERVA_IN',  bodega_id: BODEGA_PEDIDOS_ID,  saldo_anterior: saldoPedidos, idempotency_key: `${idemBase}:IN` }, +cantidadNum);

  await saveMovimiento(out);
  await saveMovimiento(inn);
  eventBus.emit(Events.STOCK_RESERVADO, { product_id, cantidad: cantidadNum, pedido_id });
  await _trySyncNow(out.id, out);
  await _trySyncNow(inn.id, inn);
  return { out, inn };
}

// Libera stock definitivamente desde Pedidos (entrega POD)
export async function liberarStockPedido({ product_id, cantidad, pedido_id }) {
  const idemKey = `KDX:LIBERACION:${pedido_id}:${product_id}`;
  const existing = await getMovimientoByIdempotencyKey(idemKey);
  if (existing) return existing;

  const product     = await getProduct(product_id);
  if (!product) throw new Error(`Producto ${product_id} no encontrado`);
  const cantidadNum = _toPositiveCantidad(cantidad, 'liberacion de stock');
  const saldoPed    = await getSaldoByProduct(product_id, BODEGA_PEDIDOS_ID);
  if (saldoPed < cantidadNum) {
    console.warn(`[Kardex] Liberacion bloqueada por saldo insuficiente en ${BODEGA_PEDIDOS_ID}`, {
      product_id,
      pedido_id,
      saldoPed,
      cantidad: cantidadNum,
    });
    throw new Error(`Stock insuficiente en ${BODEGA_PEDIDOS_ID} para ${product.sku}`);
  }
  const mov = await _buildMovimiento({
    product_id, product_sku: product.sku, product_name: product.nombre,
    tipo: 'LIBERACION', bodega_id: BODEGA_PEDIDOS_ID, pedido_id, cantidad: cantidadNum, saldo_anterior: saldoPed,
    idempotency_key: idemKey,
  }, -cantidadNum);
  await saveMovimiento(mov);
  eventBus.emit(Events.STOCK_LIBERADO, { product_id, cantidad: cantidadNum, pedido_id });
  await _trySyncNow(mov.id, mov);
  return mov;
}

// Revierte reserva: Pedidos → Central Depot (anulación de pedido)
// idempotency_prefix: si se pasa, construye claves estables; sin él, genera UUIDs aleatorios (comportamiento legacy).
export async function revertirReserva({ product_id, cantidad, pedido_id, idempotency_prefix }) {
  // Idempotencia real: claves siempre deterministas (prefix explícito o compuesto por pedido+producto)
  const idemKeyOut = idempotency_prefix
    ? `${idempotency_prefix}:OUT`
    : `KDX:REVERSION:${pedido_id}:${product_id}:OUT`;
  const idemKeyIn  = idempotency_prefix
    ? `${idempotency_prefix}:IN`
    : `KDX:REVERSION:${pedido_id}:${product_id}:IN`;

  const [existOut, existIn] = await Promise.all([
    getMovimientoByIdempotencyKey(idemKeyOut),
    getMovimientoByIdempotencyKey(idemKeyIn),
  ]);
  if (existOut && existIn) {
    return { out: existOut, inn: existIn };
  }

  const product     = await getProduct(product_id);
  if (!product) throw new Error(`Producto ${product_id} no encontrado`);
  const cantidadNum = _toPositiveCantidad(cantidad, 'reversion de reserva');
  const transfer_id = idempotency_prefix
        ? `${idempotency_prefix}:TRANSFER`
        : `KDX:REVERSION:${pedido_id}:${product_id}:TRANSFER`;
  const base = {
    product_id,
    product_sku: product.sku,
    product_name: product.nombre,
    pedido_id,
    transfer_id,
    cantidad: cantidadNum,
  };

  const saldoPed     = await getSaldoByProduct(product_id, BODEGA_PEDIDOS_ID);
  const saldoCentral = await getSaldoByProduct(product_id, BODEGA_CENTRAL_ID);
  if (saldoPed < cantidadNum) {
    console.warn(`[Kardex] Reversion bloqueada por saldo insuficiente en ${BODEGA_PEDIDOS_ID}`, {
      product_id,
      pedido_id,
      saldoPed,
      cantidad: cantidadNum,
    });
    throw new Error(`Stock insuficiente en ${BODEGA_PEDIDOS_ID} para ${product.sku}`);
  }

  const out = await _buildMovimiento({ ...base, tipo: 'REVERSION_OUT', bodega_id: BODEGA_PEDIDOS_ID,  saldo_anterior: saldoPed,     idempotency_key: idemKeyOut ?? undefined }, -cantidadNum);
  const inn = await _buildMovimiento({ ...base, tipo: 'REVERSION_IN',  bodega_id: BODEGA_CENTRAL_ID, saldo_anterior: saldoCentral, idempotency_key: idemKeyIn  ?? undefined }, +cantidadNum);

  await saveMovimiento(out);
  await saveMovimiento(inn);
  eventBus.emit(Events.STOCK_REVERTIDO, { product_id, cantidad: cantidadNum, pedido_id });
  await _trySyncNow(out.id, out);
  await _trySyncNow(inn.id, inn);
  return { out, inn };
}

export async function getMovimientos(bodegaId = null) {
  const all = await getAllMovimientos();
  if (!bodegaId) return all;
  return all.filter((m) => m.bodega_id === bodegaId);
}

export async function getMovimientosDeProducto(productId, bodegaId = null) {
  const all = await getMovimientosByProduct(productId);
  if (!bodegaId) return all;
  return all.filter((m) => m.bodega_id === bodegaId);
}

function _buildDesactivacionTransferId(productId) {
  return `${REFERENCIA_DESACTIVACION_PRODUCTO}:${productId}`;
}

function _buildDesactivacionIdempotencyKey(transferId, leg) {
  return `${transferId}:${leg}`;
}

function _pickLast(items, predicate) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (predicate(items[i])) return items[i];
  }
  return null;
}

async function _getDesactivacionState(productId, transferId) {
  const movimientos = await getMovimientosByProduct(productId);
  const related = movimientos.filter((m) => m.transfer_id === transferId);

  const out = _pickLast(related, (m) =>
    m.idempotency_key === _buildDesactivacionIdempotencyKey(transferId, 'OUT') || m.tipo === 'DESACTIVACION_OUT',
  );
  const inn = _pickLast(related, (m) =>
    m.idempotency_key === _buildDesactivacionIdempotencyKey(transferId, 'IN') || m.tipo === 'DESACTIVACION_IN',
  );
  const comp = _pickLast(related, (m) =>
    m.idempotency_key === _buildDesactivacionIdempotencyKey(transferId, 'COMP') ||
    m.tipo === 'DESACTIVACION_COMP' ||
    m.referencia === REFERENCIA_DESACTIVACION_COMPENSACION,
  );

  return { out, inn, comp };
}

async function _createCompensacionDesactivacion({ product, transferId, outMovimiento, causa }) {
  if (!outMovimiento) return null;

  const state = await _getDesactivacionState(product.id, transferId);
  if (state.comp) return state.comp;

  const cantidad = _toPositiveCantidad(Math.abs(outMovimiento.delta ?? outMovimiento.cantidad), 'compensacion desactivacion');
  const saldoCentral = await getSaldoByProduct(product.id, BODEGA_CENTRAL_ID);
  const compensacion = await _buildMovimiento({
    product_id: product.id,
    product_sku: product.sku,
    product_name: product.nombre,
    tipo: 'DESACTIVACION_COMP',
    bodega_id: BODEGA_CENTRAL_ID,
    cantidad,
    saldo_anterior: saldoCentral,
    transfer_id: transferId,
    referencia: REFERENCIA_DESACTIVACION_COMPENSACION,
    observacion: `Compensacion por fallo al completar traslado de desactivacion (${causa})`,
    idempotency_key: _buildDesactivacionIdempotencyKey(transferId, 'COMP'),
  }, +cantidad);

  await saveMovimiento(compensacion);
  await _trySyncNow(compensacion.id, compensacion);
  return compensacion;
}

async function _runDeactivationTransfer(product) {
  const productId = product?.id;
  if (!productId) return;
  if (product.status !== 'inactive') return;

  const transferId = _buildDesactivacionTransferId(productId);
  if (_deactivationLocks.has(transferId)) return;
  _deactivationLocks.add(transferId);

  try {
    const latestProduct = await getProduct(productId);
    if (!latestProduct || latestProduct.status !== 'inactive') return;

    let state = await _getDesactivacionState(productId, transferId);
    if (state.comp) return;
    if (state.out && state.inn) return; // TC-03 fix: era state.in (siempre undefined)
    if (!state.out && state.inn) {
      console.warn('[Kardex] Estado inconsistente detectado (solo IN) en traslado de desactivacion', { productId, transferId });
      return;
    }

    if (!state.out) {
      const saldoCentral = await getSaldoByProduct(productId, BODEGA_CENTRAL_ID);
      if (saldoCentral <= 0) return;

      const cantidadOut = _toPositiveCantidad(saldoCentral, 'traslado por desactivacion');
      const out = await _buildMovimiento({
        product_id: productId,
        product_sku: latestProduct.sku,
        product_name: latestProduct.nombre,
        tipo: 'DESACTIVACION_OUT',
        bodega_id: BODEGA_CENTRAL_ID,
        cantidad: cantidadOut,
        saldo_anterior: saldoCentral,
        transfer_id: transferId,
        referencia: REFERENCIA_DESACTIVACION_PRODUCTO,
        observacion: 'Traslado automatico por desactivacion de producto',
        idempotency_key: _buildDesactivacionIdempotencyKey(transferId, 'OUT'),
      }, -cantidadOut);

      await saveMovimiento(out);
      await _trySyncNow(out.id, out);
      state = await _getDesactivacionState(productId, transferId);
    }

    if (state.comp) return;
    if (state.out && state.inn) return;
    if (!state.out) return;

    const cantidadIn = _toPositiveCantidad(Math.abs(state.out.delta ?? state.out.cantidad), 'recuperacion traslado desactivacion');
    const saldoDesactivados = await getSaldoByProduct(productId, BODEGA_DESACTIVADOS_ID);

    try {
      const inn = await _buildMovimiento({
        product_id: productId,
        product_sku: latestProduct.sku,
        product_name: latestProduct.nombre,
        tipo: 'DESACTIVACION_IN',
        bodega_id: BODEGA_DESACTIVADOS_ID,
        cantidad: cantidadIn,
        saldo_anterior: saldoDesactivados,
        transfer_id: transferId,
        referencia: REFERENCIA_DESACTIVACION_PRODUCTO,
        observacion: 'Traslado automatico por desactivacion de producto',
        idempotency_key: _buildDesactivacionIdempotencyKey(transferId, 'IN'),
      }, +cantidadIn);

      await saveMovimiento(inn);
      await _trySyncNow(inn.id, inn);
    } catch (errorIn) {
      await _createCompensacionDesactivacion({
        product: latestProduct,
        transferId,
        outMovimiento: state.out,
        causa: errorIn?.message ?? 'fallo_en_in',
      });
      console.warn('[Kardex] Traslado por desactivacion abortado y compensado', {
        productId,
        transferId,
        error: errorIn?.message ?? String(errorIn),
      });
      return;
    }

    const committed = await _getDesactivacionState(productId, transferId);
    if (!committed.comp && committed.out && committed.inn) {
      eventBus.emit(Events.STOCK_MOVED, {
        product_id: productId,
        transfer_id: transferId,
        tipo: REFERENCIA_DESACTIVACION_PRODUCTO,
      });
    }
  } finally {
    _deactivationLocks.delete(transferId);
  }
}

function _bindProductDeactivationHandler() {
  if (_isProductDeactivationHandlerBound) return;
  _isProductDeactivationHandlerBound = true;
  eventBus.on(Events.PRODUCT_DEACTIVATED, ({ payload }) => {
    _runDeactivationTransfer(payload).catch((error) => {
      console.warn('[Kardex] Error en orquestacion de desactivacion', error);
    });
  });
}

function _bindProductDeletedHandler() {
  if (_isProductDeletedHandlerBound) return;
  _isProductDeletedHandlerBound = true;
  eventBus.on(Events.PRODUCT_DELETED, ({ payload }) => {
    _runDeactivationTransfer(payload).catch((error) => {
      console.warn('[Kardex] Error en orquestacion de desactivacion por PRODUCT_DELETED', error);
    });
  });
}

function _buildReactivacionTransferId(productId, version) {
  return `${REFERENCIA_REACTIVACION_PRODUCTO}:${productId}:v${version}`;
}

function _buildReactivacionIdempotencyKey(transferId, leg) {
  return `${transferId}:${leg}`;
}

async function _getReactivacionState(productId, transferId) {
  const movimientos = await getMovimientosByProduct(productId);
  const related = movimientos.filter((m) => m.transfer_id === transferId);

  const out = _pickLast(related, (m) =>
    m.idempotency_key === _buildReactivacionIdempotencyKey(transferId, 'OUT') || m.tipo === 'REACTIVACION_OUT',
  );
  const inn = _pickLast(related, (m) =>
    m.idempotency_key === _buildReactivacionIdempotencyKey(transferId, 'IN') || m.tipo === 'REACTIVACION_IN',
  );

  return { out, inn };
}

async function _runActivationRetransfer(product) {
  const productId = product?.id;
  if (!productId) return;
  if (product.status !== 'active') return;

  const transferId = _buildReactivacionTransferId(productId, product.version);
  if (_reactivationLocks.has(transferId)) return;
  _reactivationLocks.add(transferId);

  try {
    const latestProduct = await getProduct(productId);
    if (!latestProduct || latestProduct.status !== 'active') return;

    const state = await _getReactivacionState(productId, transferId);
    if (state.out && state.inn) return;

    const saldoDesactivados = await getSaldoByProduct(productId, BODEGA_DESACTIVADOS_ID);
    if (saldoDesactivados <= 0) return;

    if (!state.out) {
      const cantidadOut = _toPositiveCantidad(saldoDesactivados, 'reactivacion salida desactivados');
      const out = await _buildMovimiento({
        product_id: productId,
        product_sku: latestProduct.sku,
        product_name: latestProduct.nombre,
        tipo: 'REACTIVACION_OUT',
        bodega_id: BODEGA_DESACTIVADOS_ID,
        cantidad: cantidadOut,
        saldo_anterior: saldoDesactivados,
        transfer_id: transferId,
        referencia: REFERENCIA_REACTIVACION_PRODUCTO,
        observacion: 'Retorno automatico de stock por reactivacion de producto',
        idempotency_key: _buildReactivacionIdempotencyKey(transferId, 'OUT'),
      }, -cantidadOut);

      await saveMovimiento(out);
      await _trySyncNow(out.id, out);
    }

    const freshState = await _getReactivacionState(productId, transferId);
    if (freshState.out && freshState.inn) return;
    if (!freshState.out) return;

    const cantidadIn = _toPositiveCantidad(
      Math.abs(freshState.out.delta ?? freshState.out.cantidad),
      'reactivacion entrada central',
    );
    const saldoCentral = await getSaldoByProduct(productId, BODEGA_CENTRAL_ID);

    const inn = await _buildMovimiento({
      product_id: productId,
      product_sku: latestProduct.sku,
      product_name: latestProduct.nombre,
      tipo: 'REACTIVACION_IN',
      bodega_id: BODEGA_CENTRAL_ID,
      cantidad: cantidadIn,
      saldo_anterior: saldoCentral,
      transfer_id: transferId,
      referencia: REFERENCIA_REACTIVACION_PRODUCTO,
      observacion: 'Retorno automatico de stock por reactivacion de producto',
      idempotency_key: _buildReactivacionIdempotencyKey(transferId, 'IN'),
    }, +cantidadIn);

    await saveMovimiento(inn);
    await _trySyncNow(inn.id, inn);

    const committed = await _getReactivacionState(productId, transferId);
    if (committed.out && committed.inn) {
      eventBus.emit(Events.STOCK_MOVED, {
        product_id: productId,
        transfer_id: transferId,
        tipo: REFERENCIA_REACTIVACION_PRODUCTO,
      });
    }
  } finally {
    _reactivationLocks.delete(transferId);
  }
}

function _bindProductActivationHandler() {
  if (_isProductActivationHandlerBound) return;
  _isProductActivationHandlerBound = true;
  eventBus.on(Events.PRODUCT_ACTIVATED, ({ payload }) => {
    _runActivationRetransfer(payload).catch((error) => {
      console.warn('[Kardex] Error en orquestacion de reactivacion', error);
    });
  });
}

function _buildDocumentoReleaseKey(pedidoId, documentoId, documentoTipo) {
  if (documentoId) return `DOC:${documentoId}`;
  return `PED:${pedidoId}:${documentoTipo}`;
}

function _buildDocumentoReleaseRetryQueueIdempotencyKey(releaseKey) {
  return `${DOCUMENT_RELEASE_RETRY_IDEMPOTENCY_PREFIX}:${releaseKey}`;
}

function _buildDocumentoReleaseItemKey({ pedidoId, documentoTipo, itemId, productId }) {
  const safeItemId = itemId ?? `${productId ?? 'NA'}`;
  return `DOCREL:${pedidoId}:${documentoTipo}:${safeItemId}`;
}

async function _findDocumentoReleaseMovimiento(productId, idempotencyKey) {
  const movimientos = await getMovimientosByProduct(productId);
  for (let i = movimientos.length - 1; i >= 0; i -= 1) {
    const m = movimientos[i];
    if (m.tipo !== 'SALIDA_VENTA') continue;
    if (m.idempotency_key === idempotencyKey) return m;
  }
  return null;
}

async function _findDocumentoReleaseRetryQueueItem(releaseKey) {
  const queue = await getSyncQueue();
  const queueKey = _buildDocumentoReleaseRetryQueueIdempotencyKey(releaseKey);
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    const item = queue[i];
    if (item.entity !== DOCUMENT_RELEASE_RETRY_ENTITY) continue;
    if (item.idempotency_key !== queueKey) continue;
    return item;
  }
  return null;
}

async function _clearDocumentoReleaseRetryQueue(releaseKey) {
  const queueItem = await _findDocumentoReleaseRetryQueueItem(releaseKey);
  if (!queueItem) return;
  await removeSyncQueueItem(queueItem.id);
}

async function _upsertDocumentoReleaseRetryQueue({
  releaseKey,
  payload,
  fallbackTipo,
  attempt,
  delayMs,
  motivo,
  pendientes = 0,
}) {
  const now = new Date();
  const retryAfter = new Date(now.getTime() + delayMs).toISOString();
  const queuePayload = {
    release_key: releaseKey,
    payload,
    fallback_tipo: fallbackTipo,
    motivo,
    pendientes,
    attempt,
    retry_after: retryAfter,
  };

  const existing = await _findDocumentoReleaseRetryQueueItem(releaseKey);
  if (existing) {
    await updateSyncQueueItem(existing.id, {
      status: 'pending',
      retry_count: Math.max(existing.retry_count ?? 0, attempt - 1),
      max_retries: DOCUMENT_RELEASE_RETRY_LIMIT,
      payload: queuePayload,
      error: null,
      updated_at: now.toISOString(),
    });
    return;
  }

  await addToSyncQueue({
    type: 'RETRY',
    entity: DOCUMENT_RELEASE_RETRY_ENTITY,
    entity_id: releaseKey,
    idempotency_key: _buildDocumentoReleaseRetryQueueIdempotencyKey(releaseKey),
    payload: queuePayload,
    retry_count: Math.max(0, attempt - 1),
    max_retries: DOCUMENT_RELEASE_RETRY_LIMIT,
    status: 'pending',
    created_at: now.toISOString(),
  });
}

async function _markDocumentoReleaseRetryQueueFailed({
  releaseKey,
  attempts,
  motivo,
  pendientes = 0,
}) {
  const queueItem = await _findDocumentoReleaseRetryQueueItem(releaseKey);
  if (!queueItem) return;
  await updateSyncQueueItem(queueItem.id, {
    status: 'failed',
    retry_count: attempts,
    error: motivo ?? 'retry_exhausted',
    payload: {
      ...(queueItem.payload ?? {}),
      pendientes,
      exhausted_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  });
}

function _armDocumentoReleaseRetryTimer({
  releaseKey,
  payload,
  fallbackTipo,
  attempt,
  delayMs,
  pendientes = 0,
  motivo = 'descarga_parcial',
}) {
  const current = _documentReleaseRetryState.get(releaseKey) ?? { attempts: Math.max(0, attempt - 1), timer: null };
  if (current.timer) return;

  const safeDelayMs = Math.max(0, Number(delayMs) || 0);
  const timer = setTimeout(() => {
    const state = _documentReleaseRetryState.get(releaseKey);
    if (!state) return;
    state.timer = null;
    state.attempts = Math.max(state.attempts ?? 0, attempt);
    _documentReleaseRetryState.set(releaseKey, state);

    _handleDocumentoEmitido(payload, fallbackTipo).catch((error) => {
      console.warn('[Kardex] Error en reintento de descarga documental', {
        releaseKey,
        error: error?.message ?? String(error),
      });
    });
  }, safeDelayMs);

  _documentReleaseRetryState.set(releaseKey, {
    attempts: Math.max(current.attempts ?? 0, attempt - 1),
    timer,
  });

  console.warn('[Kardex] Descarga documental parcial: reintento programado', {
    releaseKey,
    nextAttempt: attempt,
    delayMs: safeDelayMs,
    pendientes,
    motivo,
  });
}

async function _clearDocumentoReleaseRetry(releaseKey) {
  const state = _documentReleaseRetryState.get(releaseKey);
  if (state?.timer) clearTimeout(state.timer);
  _documentReleaseRetryState.delete(releaseKey);
  try {
    await _clearDocumentoReleaseRetryQueue(releaseKey);
  } catch (error) {
    console.warn('[Kardex] Error limpiando retry persistido de descarga documental', {
      releaseKey,
      error: error?.message ?? String(error),
    });
  }
}

async function _scheduleDocumentoReleaseRetry({ releaseKey, payload, fallbackTipo, motivo, pendientes = 0 }) {
  const current = _documentReleaseRetryState.get(releaseKey) ?? { attempts: 0, timer: null };
  if (current.timer) return;

  if (current.attempts >= DOCUMENT_RELEASE_RETRY_LIMIT) {
    console.warn('[Kardex] Reintentos agotados para descarga documental parcial', {
      releaseKey,
      attempts: current.attempts,
      pendientes,
      motivo,
    });
    await _markDocumentoReleaseRetryQueueFailed({
      releaseKey,
      attempts: current.attempts,
      motivo,
      pendientes,
    });
    return;
  }

  const nextAttempt = current.attempts + 1;
  const delayMs = DOCUMENT_RELEASE_RETRY_BASE_MS * nextAttempt;
  await _upsertDocumentoReleaseRetryQueue({
    releaseKey,
    payload,
    fallbackTipo,
    attempt: nextAttempt,
    delayMs,
    motivo,
    pendientes,
  });

  _armDocumentoReleaseRetryTimer({
    releaseKey,
    payload,
    fallbackTipo,
    attempt: nextAttempt,
    delayMs,
    pendientes,
    motivo,
  });
}

async function _processDocumentoReleaseRetryQueueItem(item) {
  const releaseKey = item?.entity_id ?? item?.payload?.release_key;
  if (!releaseKey) {
    await updateSyncQueueItem(item.id, {
      status: 'failed',
      error: 'release_key_missing',
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const retryCount = Number(item.retry_count ?? 0);
  const payload = item?.payload?.payload ?? {};
  const fallbackTipo = item?.payload?.fallback_tipo ?? payload?.documento?.tipo ?? 'FAC';
  const attempt = Number(item?.payload?.attempt ?? (retryCount + 1));
  const retryAfterRaw = item?.payload?.retry_after ?? item?.created_at ?? null;
  const retryAfterMs = Date.parse(retryAfterRaw ?? '');

  if (!_documentReleaseRetryState.has(releaseKey)) {
    _documentReleaseRetryState.set(releaseKey, { attempts: retryCount, timer: null });
  }

  if (Number.isFinite(retryAfterMs) && retryAfterMs > Date.now()) {
    _armDocumentoReleaseRetryTimer({
      releaseKey,
      payload,
      fallbackTipo,
      attempt: Math.max(1, attempt),
      delayMs: retryAfterMs - Date.now(),
      pendientes: Number(item?.payload?.pendientes ?? 0),
      motivo: item?.payload?.motivo ?? 'rehydrated_pending_retry',
    });
    await updateSyncQueueItem(item.id, {
      status: 'pending',
      updated_at: new Date().toISOString(),
    });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id: releaseKey,
      entity: DOCUMENT_RELEASE_RETRY_ENTITY,
      status: 'pending',
      source: 'retry_rehydrate',
      retry_count: retryCount,
      max_retries: item.max_retries ?? DOCUMENT_RELEASE_RETRY_LIMIT,
    });
    return;
  }

  await _handleDocumentoEmitido(payload, fallbackTipo);
}

async function _handleDocumentoEmitido(payload = {}, fallbackTipo = 'FAC') {
  const pedidoId = payload?.pedido?.id ?? payload?.pedido_id ?? null;
  if (!pedidoId) return;

  const documentoId = payload?.documento?.id ?? payload?.documento_id ?? null;
  const documentoTipo = payload?.documento?.tipo ?? fallbackTipo;
  const releaseKey = _buildDocumentoReleaseKey(pedidoId, documentoId, documentoTipo);

  if (_documentReleaseDone.has(releaseKey) || _documentReleaseLocks.has(releaseKey)) return;
  _documentReleaseLocks.add(releaseKey);

  try {
    const snapshotItems = Array.isArray(payload?.documento?.items_snapshot) ? payload.documento.items_snapshot : [];
    const items = snapshotItems
      .map((i) => ({
        id: i.item_id ?? null,
        product_id: i.product_id,
        product_sku: i.product_sku,
        product_name: i.product_name,
        cantidad_picking: Number(i.cantidad ?? 0),
        precio_unitario: Number(i.precio_unitario ?? 0),
        status: 'active',
      }))
      .filter((i) => i.product_id && Number(i.cantidad_picking ?? 0) > 0);
    if (items.length === 0) {
      throw new Error('SNAPSHOT_DOCUMENTAL_VACIO_O_INVALIDO');
    }
    const release = await liberarStockPorDocumento({
      pedido_id: pedidoId,
      items,
      documento_tipo: documentoTipo,
    });

    if (release.complete) {
      _documentReleaseDone.add(releaseKey);
      await _clearDocumentoReleaseRetry(releaseKey);
      return;
    }

    await _scheduleDocumentoReleaseRetry({
      releaseKey,
      payload,
      fallbackTipo: documentoTipo,
      pendientes: release.pendientes.length,
      motivo: 'descarga_parcial',
    });
  } catch (error) {
    console.warn('[Kardex] Error en descarga por documento emitido', {
      pedidoId,
      documentoId,
      documentoTipo,
      error: error?.message ?? String(error),
    });
    await _scheduleDocumentoReleaseRetry({
      releaseKey,
      payload,
      fallbackTipo: documentoTipo,
      motivo: error?.message ?? String(error),
    });
  } finally {
    _documentReleaseLocks.delete(releaseKey);
  }
}

function _bindDocumentoEmitidoHandler() {
  if (_isDocumentoEmitidoHandlerBound) return;
  _isDocumentoEmitidoHandlerBound = true;

  eventBus.on(Events.FACTURA_EMITIDA, ({ payload }) => {
    _handleDocumentoEmitido(payload, 'FAC');
  });

  eventBus.on(Events.REMISION_EMITIDA, ({ payload }) => {
    _handleDocumentoEmitido(payload, 'REM');
  });
}

function _emitAuditResult(type, result) {
  eventBus.emit(type, result);
}

function _bindAuditBridgeHandler() {
  if (_isAuditBridgeHandlerBound) return;
  _isAuditBridgeHandlerBound = true;

  eventBus.on(Events.AUDIT_SALDO_REQUESTED, async ({ payload }) => {
    const requestId = payload?.request_id;
    const productId = payload?.product_id;
    const bodegaId = payload?.bodega_id ?? BODEGA_CENTRAL_ID;
    if (!requestId || !productId) return;

    try {
      const saldo = await getSaldoByProduct(productId, bodegaId);
      _emitAuditResult(Events.AUDIT_SALDO_RESOLVED, {
        request_id: requestId,
        ok: true,
        product_id: productId,
        bodega_id: bodegaId,
        saldo,
      });
    } catch (error) {
      _emitAuditResult(Events.AUDIT_SALDO_RESOLVED, {
        request_id: requestId,
        ok: false,
        product_id: productId,
        bodega_id: bodegaId,
        error: error?.message ?? String(error),
      });
    }
  });

  eventBus.on(Events.AUDIT_STOCK_ADJUST_REQUESTED, async ({ payload }) => {
    const requestId = payload?.request_id;
    const productId = payload?.product_id;
    const cantidad = payload?.cantidad;
    const bodegaId = payload?.bodega_id ?? BODEGA_CENTRAL_ID;
    const referencia = payload?.referencia ?? 'AUDITORIA_CONCILIACION';
    const causal = payload?.causal ?? 'SIN_CAUSAL';
    if (!requestId || !productId) return;

    const cached = _auditAdjustResults.get(requestId);
    if (cached) {
      // Legacy-safe hardening: errores no deben quedar pegados entre reintentos UI.
      // Solo congelamos resultados OK para mantener idempotencia sin bloquear retry.
      if (cached.ok === true) {
        _emitAuditResult(Events.AUDIT_STOCK_ADJUST_RESOLVED, cached);
        return;
      }
      _auditAdjustResults.delete(requestId);
    }
    if (_auditAdjustLocks.has(requestId)) return;
    _auditAdjustLocks.add(requestId);

    try {
      // Map causal → tipo Kardex: SALIDA_AVERIA, SALIDA_ROBO, SALIDA_AJUSTE_AUDITORIA o AJUSTE
      const saldoPrev = await getSaldoByProduct(productId, bodegaId);
      const cantidadObjetivo = Number(cantidad);
      const diferenciaAudit = cantidadObjetivo - saldoPrev;
      const causalUpper = (causal ?? '').toUpperCase();
      let tipoAudit, cantidadAudit;
      if (diferenciaAudit >= 0) {
        tipoAudit = 'AJUSTE';
        cantidadAudit = cantidadObjetivo;
      } else {
        const cantidadSalida = Math.abs(diferenciaAudit);
        if (causalUpper.includes('MERMA') || causalUpper.includes('DETERIORO') || causalUpper.includes('AVERIA')) {
          tipoAudit = 'SALIDA_AVERIA';
        } else if (causalUpper.includes('ROBO') || causalUpper.includes('HURTO')) {
          tipoAudit = 'SALIDA_ROBO';
        } else {
          tipoAudit = 'SALIDA_AJUSTE_AUDITORIA';
        }
        cantidadAudit = cantidadSalida;
      }
      const movimiento = await createMovimiento({
        product_id: productId,
        product_sku: payload?.product_sku ?? '',
        product_name: payload?.product_name ?? '',
        tipo: tipoAudit,
        cantidad: cantidadAudit,
        bodega_id: bodegaId,
        referencia,
        observacion: `Conciliacion de auditoria - causal: ${causal}`,
        idempotency_key: `KDX:AJUSTE:${productId}:AUDIT:${requestId}`,
      }, { __fromHandler: true });
      const result = {
        request_id: requestId,
        ok: true,
        product_id: productId,
        movimiento_id: movimiento.id,
      };
      _auditAdjustResults.set(requestId, result);
      _emitAuditResult(Events.AUDIT_STOCK_ADJUST_RESOLVED, result);
    } catch (error) {
      const result = {
        request_id: requestId,
        ok: false,
        product_id: productId,
        error: error?.message ?? String(error),
      };
      // No cachear errores: permite retry real cuando cambia el entorno/datos.
      _auditAdjustResults.delete(requestId);
      _emitAuditResult(Events.AUDIT_STOCK_ADJUST_RESOLVED, result);
    } finally {
      _auditAdjustLocks.delete(requestId);
    }
  });
}

// Descarga definitiva de stock por emisión de documento comercial (Factura / Remisión)
// Disparada por FACTURA_EMITIDA / REMISION_EMITIDA — nunca manualmente.
export async function liberarStockPorDocumento({ pedido_id, items, documento_tipo }) {
  const nuevosMovimientos = [];
  const yaAplicados = [];
  const pendientes = [];

  for (const item of items) {
    const itemId = item.id ?? `${item.product_id}:${item.product_sku ?? 'NA'}`;
    const idempotencyKey = _buildDocumentoReleaseItemKey({
      pedidoId: pedido_id,
      documentoTipo: documento_tipo,
      itemId,
      productId: item.product_id,
    });

    const existing = await _findDocumentoReleaseMovimiento(item.product_id, idempotencyKey);
    if (existing) {
      yaAplicados.push(existing);
      continue;
    }

    // Item con cantidad 0 fue quitado del picking — no hay movimiento que descargar.
    if (!(Number(item.cantidad_picking ?? item.cantidad ?? 0) > 0)) continue;

    const product = await getProduct(item.product_id);
    if (!product) {
      pendientes.push({
        item_id: itemId,
        product_id: item.product_id,
        motivo: 'PRODUCTO_NO_ENCONTRADO',
      });
      continue;
    }

    try {
      const cantidadNum = _toPositiveCantidad(
        item.cantidad_picking ?? item.cantidad ?? 0,
        'descarga por documento',
      );
      const saldoPed = await getSaldoByProduct(item.product_id, BODEGA_PEDIDOS_ID);
      if (saldoPed < cantidadNum) {
        pendientes.push({
          item_id: itemId,
          product_id: item.product_id,
          saldo_disponible: saldoPed,
          cantidad_requerida: cantidadNum,
          motivo: 'SALDO_INSUFICIENTE_PEDIDOS',
        });
        console.warn('[Kardex] Stock insuficiente en Pedidos para descarga por documento', {
          product_id: item.product_id,
          saldoPed,
          cantidadNum,
          pedido_id,
          item_id: itemId,
        });
        continue;
      }

      const mov = await _buildMovimiento({
        product_id: item.product_id,
        product_sku: product.sku,
        product_name: product.nombre,
        tipo: 'SALIDA_VENTA',
        bodega_id: BODEGA_PEDIDOS_ID,
        pedido_id,
        cantidad: cantidadNum,
        saldo_anterior: saldoPed,
        referencia: documento_tipo,
        observacion: `Descarga por emision de ${documento_tipo}`,
        idempotency_key: idempotencyKey,
      }, -cantidadNum);
      await saveMovimiento(mov);
      await _trySyncNow(mov.id, mov);
      nuevosMovimientos.push(mov);
    } catch (error) {
      // IDB ConstraintError = movimiento ya creado por listener concurrente — re-verificar idempotencia
      const isConstraint = error?.name === 'ConstraintError'
        || String(error?.message ?? '').toLowerCase().includes('constraint');
      if (isConstraint) {
        const recheck = await _findDocumentoReleaseMovimiento(item.product_id, idempotencyKey).catch(() => null);
        if (recheck) {
          yaAplicados.push(recheck);
          continue;
        }
      }
      pendientes.push({
        item_id: itemId,
        product_id: item.product_id,
        motivo: error?.message ?? String(error),
      });
    }
  }

  const movimientos = [...yaAplicados, ...nuevosMovimientos];
  const complete = pendientes.length === 0;
  eventBus.emit(Events.STOCK_LIBERADO, {
    pedido_id,
    documento_tipo,
    movimientos,
    pendientes,
    complete,
  });
  return {
    pedido_id,
    documento_tipo,
    movimientos,
    nuevos_movimientos: nuevosMovimientos,
    ya_aplicados: yaAplicados,
    pendientes,
    complete,
    total_items: items.length,
  };
}

const _garantiaLocks = new Set();

export async function registrarGarantia({
  product_id, cantidad, cliente_id, costo_unitario, garantia_motivo, referencia, observacion,
}) {
  const product = await getProduct(product_id);
  if (!product) throw new Error('Producto no encontrado');
  const cantidadNum = _toPositiveCantidad(cantidad, 'registro de garantia');

  const saldoCentral = await getSaldoByProduct(product_id, BODEGA_CENTRAL_ID);
  if (saldoCentral < cantidadNum) {
    throw new Error(`Stock insuficiente en Bodega Central para ${product.sku}`);
  }

  const safeRef = (referencia ?? 'NA').replace(/\s+/g, '_').slice(0, 64);
  const lockKey = `KDX:GARANTIA:${product_id}:${safeRef}`;
  const [existOut, existIn] = await Promise.all([
    getMovimientoByIdempotencyKey(`${lockKey}:OUT`),
    getMovimientoByIdempotencyKey(`${lockKey}:IN`),
  ]);
  if (existOut && existIn) return { out: existOut, inn: existIn };
  if (_garantiaLocks.has(lockKey)) return null;
  _garantiaLocks.add(lockKey);
  const transfer_id = `KDX:GARANTIA:${product_id}:${safeRef}:TRANSFER`;

  try {
    const base = {
      product_id,
      product_sku: product.sku,
      product_name: product.nombre,
      transfer_id,
      cantidad: cantidadNum,
      cliente_id: cliente_id ?? null,
      costo_unitario: costo_unitario ?? null,
      garantia_motivo: garantia_motivo ?? null,
      referencia: referencia ?? '',
      observacion: observacion ?? '',
    };

    const out = await _buildMovimiento({
      ...base,
      tipo: 'GARANTIA_OUT',
      bodega_id: BODEGA_CENTRAL_ID,
      saldo_anterior: saldoCentral,
      idempotency_key: `${lockKey}:OUT`,
    }, -cantidadNum);

    const saldoGarantias = await getSaldoByProduct(product_id, BODEGA_GARANTIAS_ID);
    const inn = await _buildMovimiento({
      ...base,
      tipo: 'GARANTIA_IN',
      bodega_id: BODEGA_GARANTIAS_ID,
      saldo_anterior: saldoGarantias,
      idempotency_key: `${lockKey}:IN`,
    }, +cantidadNum);

    await saveMovimiento(out);
    await saveMovimiento(inn);

    eventBus.emit(Events.GARANTIA_RECONOCIDA, {
      product_id,
      product_sku: product.sku,
      product_name: product.nombre,
      cantidad: cantidadNum,
      cliente_id,
      costo_unitario,
      garantia_motivo,
      referencia: referencia ?? '',
      observacion: observacion ?? '',
      transfer_id,
    });
    eventBus.emit(Events.STOCK_MOVED, { movimiento: out, saldo_resultante: out.saldo_resultante });

    await _trySyncNow(out.id, out);
    await _trySyncNow(inn.id, inn);
    return { out, inn };
  } finally {
    _garantiaLocks.delete(lockKey);
  }
}

export async function descargarGarantiasPorNC({
  product_id, cantidad, nc_referencia, observacion,
}) {
  const product = await getProduct(product_id);
  if (!product) throw new Error('Producto no encontrado');
  if (!nc_referencia || !String(nc_referencia).trim()) {
    throw new Error('La referencia de la Nota Credito es obligatoria');
  }
  const ncRef = String(nc_referencia).trim().toUpperCase();
  const cantidadNum = _toPositiveCantidad(cantidad, 'descarga NC proveedor');

  const saldoGarantias = await getSaldoByProduct(product_id, BODEGA_GARANTIAS_ID);
  if (saldoGarantias < cantidadNum) {
    throw new Error(`Stock insuficiente en Bodega Garantias para ${product.sku}`);
  }

  const idemKey = `GARANTIA_NC:${product_id}:${ncRef}`;
  const existing = await getMovimientoByIdempotencyKey(idemKey);
  if (existing) return null;

  const mov = await _buildMovimiento({
    product_id,
    product_sku: product.sku,
    product_name: product.nombre,
    tipo: 'GARANTIA_NC_OUT',
    bodega_id: BODEGA_GARANTIAS_ID,
    cantidad: cantidadNum,
    saldo_anterior: saldoGarantias,
    referencia: ncRef,
    observacion: observacion ?? '',
    idempotency_key: idemKey,
  }, -cantidadNum);

  await saveMovimiento(mov);

  eventBus.emit(Events.NOTA_CREDITO_PROVEEDOR_EMITIDA, {
    product_id,
    product_sku: product.sku,
    product_name: product.nombre,
    cantidad: cantidadNum,
    nc_referencia: ncRef,
  });
  eventBus.emit(Events.STOCK_MOVED, { movimiento: mov, saldo_resultante: mov.saldo_resultante });

  await _trySyncNow(mov.id, mov);
  return mov;
}

async function _trySyncNow(id, movimiento) {
  try {
    await mockApi.createMovimiento(movimiento);
    await updateMovimientoSyncStatus(id, 'synced');
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id,
      entity: 'kardex',
      status: 'synced',
      source: 'try_sync',
    });
  } catch (error) {
    const errorMsg = error?.message ?? String(error);
    console.warn('[Sync][Kardex] Error en sincronizacion inmediata', {
      entity_id: id,
      error: errorMsg,
    });
    await addToSyncQueue({ type: 'CREATE', entity: 'kardex', entity_id: id, payload: movimiento, idempotency_key: `SYNC:kdx:${movimiento.idempotency_key ?? id}`, created_at: new Date().toISOString() });
    eventBus.emit(Events.SYNC_STATUS_CHANGED, {
      id,
      entity: 'kardex',
      status: 'pending',
      source: 'try_sync',
      error: errorMsg,
    });
  }
}

export async function processSyncQueueKardex() {
  const queue = await getSyncQueue();
  const kardexItems = queue.filter((i) => i.entity === 'kardex' && (!i.status || i.status === 'pending' || i.status === 'processing'));
  for (const item of kardexItems) {
    const claimed = await claimSyncQueueItem(item.id, 'kardex_sync');
    if (!claimed) continue;

    try {
      if (claimed.type !== 'CREATE') {
        throw new Error(`Operacion de cola no soportada para kardex: ${claimed.type}`);
      }
      await mockApi.createMovimiento(claimed.payload);
      await updateMovimientoSyncStatus(claimed.entity_id, 'synced');
      await removeSyncQueueItem(claimed.id);
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'kardex',
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
      await updateMovimientoSyncStatus(claimed.entity_id, nextStatus);
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: 'kardex',
        status: nextStatus,
        source: 'sync_queue',
        error: errorMsg,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
      });
      console.warn('[Sync][Kardex] Error en cola de sincronizacion', {
        entity_id: claimed.entity_id,
        retry_count: retries,
        max_retries: claimed.max_retries ?? 3,
        exhausted,
        error: errorMsg,
      });
    }
  }

  const retryItems = queue.filter((i) => i.entity === DOCUMENT_RELEASE_RETRY_ENTITY && (!i.status || i.status === 'pending' || i.status === 'processing' || i.status === 'failed'));
  for (const item of retryItems) {
    const claimed = await claimSyncQueueItem(item.id, 'kardex_doc_release_retry_sync');
    if (!claimed) continue;

    try {
      await _processDocumentoReleaseRetryQueueItem(claimed);
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: DOCUMENT_RELEASE_RETRY_ENTITY,
        status: 'synced',
        source: 'sync_queue',
        recovered: (claimed.retry_count ?? 0) > 0 || item.status === 'processing',
        retry_count: claimed.retry_count ?? 0,
      });
    } catch (error) {
      const errorMsg = error?.message ?? String(error);
      const retries = (claimed.retry_count ?? 0) + 1;
      const exhausted = retries >= (claimed.max_retries ?? DOCUMENT_RELEASE_RETRY_LIMIT);
      const delayMs = DOCUMENT_RELEASE_RETRY_BASE_MS * Math.max(1, retries);
      const retryAfter = new Date(Date.now() + delayMs).toISOString();
      await updateSyncQueueItem(claimed.id, {
        retry_count: retries,
        status: exhausted ? 'failed' : 'pending',
        error: errorMsg,
        payload: {
          ...(claimed.payload ?? {}),
          attempt: retries + 1,
          retry_after: retryAfter,
          motivo: errorMsg,
        },
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      eventBus.emit(Events.SYNC_STATUS_CHANGED, {
        id: claimed.entity_id,
        entity: DOCUMENT_RELEASE_RETRY_ENTITY,
        status: exhausted ? 'error' : 'pending',
        source: 'sync_queue',
        error: errorMsg,
        retry_count: retries,
        max_retries: claimed.max_retries ?? DOCUMENT_RELEASE_RETRY_LIMIT,
      });
      console.warn('[Sync][KardexDocRetry] Error en cola de reintento documental', {
        release_key: claimed.entity_id,
        retry_count: retries,
        max_retries: claimed.max_retries ?? DOCUMENT_RELEASE_RETRY_LIMIT,
        exhausted,
        error: errorMsg,
      });
    }
  }
}

// PED_F4 — Validación lógica de disponibilidad sin movimiento físico de Kardex
export async function validarDisponibilidadStock(items) {
  const insuficientes = [];
  for (const it of items) {
    const saldo = await getSaldoByProduct(it.product_id, BODEGA_CENTRAL_ID);
    if (saldo < Number(it.cantidad ?? it.cantidad_pedida ?? 0)) {
      insuficientes.push({
        product_id: it.product_id,
        product_sku: it.product_sku ?? it.product_id,
        saldo_disponible: saldo,
        cantidad_requerida: Number(it.cantidad ?? it.cantidad_pedida ?? 0),
      });
    }
  }
  return insuficientes;
}

// PED_F4 — Traslado incremental post-picking (ajustes en estado packing)
// direccion 'IN': Central → Pedidos (incremento); 'OUT': Pedidos → Central (reducción)
export async function ajustarStockPostPicking({ product_id, cantidad, pedido_id, direccion, idempotency_suffix }) {
  if (direccion === 'IN') {
    const idemBase = `KDX:POSTPICK:IN:${pedido_id}:${product_id}:${idempotency_suffix}`;
    const [existOut, existIn] = await Promise.all([
      getMovimientoByIdempotencyKey(`${idemBase}:OUT`),
      getMovimientoByIdempotencyKey(`${idemBase}:IN`),
    ]);
    if (existOut && existIn) return { out: existOut, inn: existIn };

    const product = await getProduct(product_id);
    if (!product) throw new Error(`Producto ${product_id} no encontrado`);
    const cantidadNum = _toPositiveCantidad(cantidad, 'ajuste post-picking IN');
    const saldoCentral = await getSaldoByProduct(product_id, BODEGA_CENTRAL_ID);
    if (saldoCentral < cantidadNum) throw new Error(`Stock insuficiente en Central Depot para ${product.sku}`);

    const transfer_id = `${idemBase}:TRANSFER`;
    const base = { product_id, product_sku: product.sku, product_name: product.nombre, pedido_id, transfer_id, cantidad: cantidadNum };
    const out = await _buildMovimiento({ ...base, tipo: 'RESERVA_OUT', bodega_id: BODEGA_CENTRAL_ID, saldo_anterior: saldoCentral, idempotency_key: `${idemBase}:OUT` }, -cantidadNum);
    const saldoPedidos = await getSaldoByProduct(product_id, BODEGA_PEDIDOS_ID);
    const inn = await _buildMovimiento({ ...base, tipo: 'RESERVA_IN', bodega_id: BODEGA_PEDIDOS_ID, saldo_anterior: saldoPedidos, idempotency_key: `${idemBase}:IN` }, +cantidadNum);
    await saveMovimiento(out);
    await saveMovimiento(inn);
    await _trySyncNow(out.id, out);
    await _trySyncNow(inn.id, inn);
    return { out, inn };
  }
  // OUT: Pedidos → Central (reducción post-picking)
  return revertirReserva({
    product_id,
    cantidad,
    pedido_id,
    idempotency_prefix: `KDX:POSTPICK:OUT:${pedido_id}:${product_id}:${idempotency_suffix}`,
  });
}

_bindProductDeactivationHandler();
_bindProductDeletedHandler();
_bindProductActivationHandler();
_bindDocumentoEmitidoHandler();
_bindAuditBridgeHandler();