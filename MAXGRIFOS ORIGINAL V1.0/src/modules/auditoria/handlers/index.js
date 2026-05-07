/**
 * Index de handlers — Inventario / Auditoría
 * Exporta todos los handlers para centralizar entrada de acciones
 */

export {
  handleIniciarInventarioGeneral,
  handleSnapshotInicialInventario,
  handleStartSesion,
  handleCargarProductos,
  handleAgregarItem,
  handleRegistrarConteo,
  handleRegistrarCostoFisico,
  handleConciliarItem,
  handleCerrarSesion,
  handleAbandonarSesion,
  handleGetSessionItems,
  handleGetInProgressSessions,
  handleBootstrapInventarioSessionV2,
  handleGetRecoverySessionsSanitized,
  handleSetSessionIgnored,
  handleResumeIgnoredSession,
  handleAgregarProductoNuevoAInventario,
  handleCierreAtomicoInventario,
  handleRetryPartialClose,
  handleGetHistorialInventarios,
  handleGetHistorialItemsReadOnly,
  handleAcquireItemLock,
  handleReleaseItemLock,
  handleRegistrarConteoMultiuser,
  handleGetSessionDashboard,
  handleGetItemLedger,
} from './inventario-handlers.js';
