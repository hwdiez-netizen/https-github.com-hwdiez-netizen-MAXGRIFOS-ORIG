/**
 * HANDLERS CENTRALIZADOS — Punto de entrada único para todas las acciones
 *
 * Estructura:
 * - Módulo → handlers/index.js → handlers/modulo-handlers.js
 * - Central (este archivo) → exporta TODOS los handlers
 *
 * Uso:
 * import { handleCrearPedido, handleCrearCliente } from '../../handlers/index.js'
 */

// ============ CLIENTES ============
export {
  handleCreateCliente,
  handleUpdateCliente,
  handleDeactivateCliente,
  handleActivateCliente,
} from '../modules/clientes/handlers/index.js';

// ============ PEDIDOS ============
export {
  handleCrearPedido,
  handleConfirmarPedido,
  handleEditarPedido,
  handleIniciarPicking,
  handleCompletarPicking,
  handleIniciarPacking,
  handleEmitirDocumento,
  handleDespachar,
  handleRegistrarPOD,
  handleAnularPedido,
} from '../modules/pedidos/handlers/index.js';

// ============ KARDEX / BODEGA ============
export {
  handleCrearBodega,
  handleActualizarBodega,
  handleDesactivarBodega,
} from '../modules/kardex/handlers/index.js';
