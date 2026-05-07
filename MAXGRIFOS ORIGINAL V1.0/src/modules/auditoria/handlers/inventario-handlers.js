/**
 * HANDLERS — Capa centralizada de entrada de acciones de Inventario/Auditoría
 * Rol: validar contract, llamar store, NO contiene lógica nueva
 * Flujo obligatorio: UI → Handler → Contract → Store
 */

import { Contracts } from '../../../contracts/index.js';
import {
  startAuditSession as _startAuditSession,
  startInventarioGeneralSession as _startInventarioGeneralSession,
  snapshotInicialInventario as _snapshotInicialInventario,
  loadProductsForScope as _loadProductsForScope,
  addItemToAudit as _addItemToAudit,
  registerCount as _registerCount,
  registerCostoFisico as _registerCostoFisico,
  reconcileItem as _reconcileItem,
  completeSession as _completeSession,
  abandonSession as _abandonSession,
  getSessionItems as _getSessionItems,
  getInProgressSessions as _getInProgressSessions,
  bootstrapInventarioSessionV2Backfill as _bootstrapInventarioSessionV2Backfill,
  getRecoverySessionsSanitized as _getRecoverySessionsSanitized,
  setSessionIgnored as _setSessionIgnored,
  resumeIgnoredSession as _resumeIgnoredSession,
  addProductoNuevoAInventarioGeneral as _addProductoNuevoAInventarioGeneral,
  commitInventarioGeneralKardex as _commitInventarioGeneralKardex,
  retryPartialCloseCommit as _retryPartialCloseCommit,
  getHistorialSessions as _getHistorialSessions,
  acquireItemLock as _acquireItemLock,
  releaseItemLock as _releaseItemLock,
  registerCountMultiuser as _registerCountMultiuser,
  getSessionDashboard as _getSessionDashboard,
  getItemLedger as _getItemLedger,
} from '../auditoria-store.js';
import { createProduct as _createProduct } from '../../maestro-productos/product-store.js';
import { getCausalesActivas as _getCausalesActivas } from '../../inventario/causales-store.js';

export async function handleIniciarInventarioGeneral(scope, bodegaIds) {
  Contracts.validateIniciarInventarioGeneral(scope, bodegaIds);
  return _startInventarioGeneralSession(scope, bodegaIds);
}

export async function handleSnapshotInicialInventario(session, products) {
  if (!session || !session.es_inventario_general) {
    throw new Error('La sesión debe ser de tipo Inventario General');
  }
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Se requieren productos para el snapshot inicial');
  }
  return _snapshotInicialInventario(session, products);
}

export async function handleStartSesion(type, scope) {
  Contracts.validateInventarioGeneral(type, scope);
  return _startAuditSession(type, scope);
}

export async function handleCargarProductos(scope) {
  const SCOPES_VALIDOS = ['active', 'inactive', 'both'];
  if (!scope || !SCOPES_VALIDOS.includes(scope)) {
    throw new Error(`Alcance inválido: "${scope}"`);
  }
  const products = await _loadProductsForScope(scope);
  // F4: solo productos codificados (con SKU válido) para Inventario General
  return products.filter((p) => p.sku && String(p.sku).trim().length > 0);
}

export async function handleRegistrarCostoFisico(item, costoFisico) {
  Contracts.validateRegistrarCostoFisico(item, costoFisico);
  return _registerCostoFisico(item, costoFisico);
}

export async function handleAgregarItem(sessionId, product) {
  if (!sessionId) throw new Error('sessionId requerido');
  if (!product || !product.id) throw new Error('Producto requerido');
  return _addItemToAudit(sessionId, product);
}

export async function handleRegistrarConteo(item, qtyFisica) {
  if (!item || !item.id) throw new Error('Ítem requerido');
  const qty = Number(qtyFisica);
  if (!Number.isFinite(qty) || qty < 0) {
    throw new Error(`Cantidad física inválida: ${qtyFisica}`);
  }
  return _registerCount(item, qty);
}

export async function handleConciliarItem(item, causal, meta = {}) {
  const validCausales = _getCausalesActivas().map((c) => c.nombre);
  Contracts.validateConciliacionInventario(item, causal, validCausales);
  return _reconcileItem(item, causal, meta);
}

export async function handleCerrarSesion(session) {
  Contracts.validateCierreInventario(session);
  return _completeSession(session);
}

export async function handleAbandonarSesion(session) {
  if (!session || !session.id) throw new Error('Sesión requerida para abandonar');
  return _abandonSession(session);
}

export async function handleGetSessionItems(sessionId) {
  if (!sessionId) throw new Error('sessionId requerido');
  return _getSessionItems(sessionId);
}

export async function handleGetInProgressSessions() {
  return _getInProgressSessions();
}

export async function handleBootstrapInventarioSessionV2() {
  return _bootstrapInventarioSessionV2Backfill();
}

export async function handleGetRecoverySessionsSanitized() {
  return _getRecoverySessionsSanitized();
}

export async function handleSetSessionIgnored(session, reason = 'ignored_by_user') {
  Contracts.validateSetSessionIgnored(session);
  return _setSessionIgnored(session, reason);
}

export async function handleResumeIgnoredSession(session) {
  Contracts.validateResumeIgnoredSession(session);
  return _resumeIgnoredSession(session);
}

// ── F5: Crear producto nuevo durante Inventario General y agregarlo a bodega satélite ──
export async function handleAgregarProductoNuevoAInventario(session, productData) {
  Contracts.validateAgregarProductoNuevoAInventario(session, productData);
  const product = await _createProduct(productData);
  return _addProductoNuevoAInventarioGeneral(session, product);
}

// ── F6: Cierre atómico e idempotente — actualiza Kardex oficial, costos, bodega satélite ──
export async function handleCierreAtomicoInventario(session, items) {
  Contracts.validateCierreAtomicoInventario(session, items);
  return _commitInventarioGeneralKardex(session, items);
}

export async function handleRetryPartialClose(session, items) {
  Contracts.validateRetryPartialCloseSession(session, items);
  return _retryPartialCloseCommit(session, items);
}

// ── F8: Historial forense — consulta sesiones cerradas (solo lectura) ──────────
export async function handleGetHistorialInventarios() {
  return _getHistorialSessions();
}

// F8: Ítems de una sesión histórica — solo lectura, sin mutación posible
export async function handleGetHistorialItemsReadOnly(sessionId) {
  Contracts.validateConsultaHistorial({ sessionId });
  return _getSessionItems(sessionId);
}

// ── MULTIUSUARIO: Lock lógico por ítem ───────────────────────────────────────

export async function handleAcquireItemLock(item, deviceId, deviceLabel) {
  Contracts.validateAcquireItemLock(item, deviceId);
  return _acquireItemLock(item, deviceId, deviceLabel ?? 'Dispositivo');
}

export async function handleReleaseItemLock(item, deviceId) {
  if (!item || !item.id) throw new Error('Ítem requerido para liberar lock');
  if (!deviceId) throw new Error('deviceId requerido para liberar lock');
  return _releaseItemLock(item, deviceId);
}

// ── MULTIUSUARIO: Conteo con trazabilidad completa ────────────────────────────

export async function handleRegistrarConteoMultiuser(item, qtyFisica, deviceId, deviceLabel) {
  Contracts.validateRegistrarConteoMultiuser(item, qtyFisica, deviceId);
  return _registerCountMultiuser(item, qtyFisica, deviceId, deviceLabel ?? 'Dispositivo');
}

// ── MULTIUSUARIO: Dashboard de progreso ──────────────────────────────────────

export async function handleGetSessionDashboard(sessionId) {
  if (!sessionId) throw new Error('sessionId requerido para dashboard');
  return _getSessionDashboard(sessionId);
}

// ── MULTIUSUARIO: Ledger de cambios por ítem ─────────────────────────────────

export async function handleGetItemLedger(itemId) {
  if (!itemId) throw new Error('itemId requerido para ledger');
  return _getItemLedger(itemId);
}
