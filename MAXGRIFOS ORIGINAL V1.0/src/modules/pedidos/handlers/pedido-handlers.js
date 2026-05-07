import { Contracts } from '../pedido-contracts.js';
import * as PedidoStore from '../pedido-store.js';
import { getProducts } from '../../maestro-productos/product-store.js';
import { getClientes } from '../../clientes/cliente-store.js';
import { getDocumentoByPedido } from '../../../db/local-db.js';

export async function handleGetPedidoFormCatalogs() {
  const [products, clientes] = await Promise.all([
    getProducts(),
    getClientes()
  ]);
  return { products, clientes };
}

export async function handleGetPedidoCompleto(pedidoId) {
  return PedidoStore.getPedidoCompleto(pedidoId);
}

export async function handleIniciarEdicionPedido(pedidoId) {
  return PedidoStore.iniciarEdicion(pedidoId);
}

export async function handleCancelarProcesoPedido(pedidoId, motivo) {
  return PedidoStore.cancelarProceso(pedidoId, motivo);
}

export async function handleEditarPedido(pedidoId, data) {
  Contracts.actualizarPedido(pedidoId, data);
  const updatedPedido = await PedidoStore.actualizarPedidoEditable(pedidoId, data, { __fromHandler: true });
  if (data.items) {
    await PedidoStore.reemplazarItemsPedido(pedidoId, data.items);
  }
  return updatedPedido;
}

export async function handleAnularPedido(pedidoId, motivo) {
  Contracts.anularPedido(pedidoId, motivo);
  return PedidoStore.actualizarEstado(pedidoId, 'anulado', {}, { __fromHandler: true });
}

export async function handleGetDocumentoByPedido(pedidoId) {
  return getDocumentoByPedido(pedidoId);
}

export async function handleDespachar(pedidoId) {
  Contracts.despachar(pedidoId);
  return PedidoStore.actualizarEstado(pedidoId, 'despacho', {}, { __fromHandler: true });
}

export async function handleCrearPedido(data) {
  Contracts.crearPedido(data);
  return PedidoStore.crearPedido(data, { __fromHandler: true });
}

export async function handleActualizarPedido(pedidoId, data) {
  Contracts.actualizarPedido(pedidoId, data);
  return PedidoStore.actualizarPedidoEditable(pedidoId, data, { __fromHandler: true });
}

export async function handleIniciarCreacion(data) {
  Contracts.iniciarCreacion(data);
  return PedidoStore.iniciarCreacion(data, { __fromHandler: true });
}

export async function handleIniciarPicking(pedidoId) {
  Contracts.iniciarPicking(pedidoId);
  return PedidoStore.actualizarEstado(pedidoId, 'picking', { __fromHandler: true });
}

export async function handleCompletarPicking(pedidoId, ajustes) {
  Contracts.completarPicking(pedidoId, ajustes);
  return PedidoStore.actualizarItemsPicking(pedidoId, ajustes);
}

export async function handleIniciarPacking(pedidoId) {
  Contracts.iniciarPacking(pedidoId);
  return PedidoStore.actualizarEstado(pedidoId, 'packing', { __fromHandler: true });
}

export async function handleCancelarPedido(pedidoId, motivo) {
  Contracts.anularPedido(pedidoId, motivo);
  return PedidoStore.cancelarProceso(pedidoId, motivo);
}

export async function handleRegistrarPOD(pedidoId) {
  Contracts.registrarPOD(pedidoId);
  return PedidoStore.actualizarEstado(pedidoId, 'pod', {}, { __fromHandler: true });
}
