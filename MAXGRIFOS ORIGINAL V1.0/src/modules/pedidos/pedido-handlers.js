import {
  iniciarCreacion,
  iniciarEdicion,
  ponerEnStandby,
  cancelarProceso,
  getPedidoCompleto,
} from './pedido-store.js';

export async function handleIniciarCreacion(data = {}) {
  return iniciarCreacion(data);
}

export async function handleEditarPedido(pedidoId) {
  return iniciarEdicion(pedidoId);
}

export async function handlePonerEnStandby(pedidoId, motivo = '') {
  return ponerEnStandby(pedidoId, motivo);
}

export async function handleCancelarProceso(pedidoId, motivo = '') {
  return cancelarProceso(pedidoId, motivo);
}

export async function handleGetPedidoCompleto(pedidoId) {
  return getPedidoCompleto(pedidoId);
}
