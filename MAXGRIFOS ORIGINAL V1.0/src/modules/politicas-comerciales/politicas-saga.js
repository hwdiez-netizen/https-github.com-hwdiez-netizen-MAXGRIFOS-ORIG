import { eventBus, Events } from '../../events/domain-events.js';
import { getPedido, getPedidoItems, getCliente, saveDinamicaAudit } from '../../db/local-db.js';
import { getListaActivaPorTipoCliente } from './lista-precios-store.js';
import { mapFormaPagoToTipoCliente } from './precio-assignment.js';

async function _resolverPedidoEItems(pedidoId, payload = {}) {
  // Contrato de evento PEDIDO_POD (v1):
  // payload.pedido.id requerido, payload.pedido.* opcional como snapshot.
  const pedidoFromEvent = payload?.pedido ?? null;
  const pedido = pedidoFromEvent ?? await getPedido(pedidoId);
  if (!pedido) return null;

  const allItems = await getPedidoItems(pedidoId);
  const items = allItems.filter((i) => i.status === 'active');
  return { pedido, items };
}

async function _auditarPreciosPOD(pedidoId, payload = {}) {
  const contexto = await _resolverPedidoEItems(pedidoId, payload);
  if (!contexto) return;

  const { pedido, items } = contexto;
  const tipoCliente = pedido.cliente_id
    ? await _resolverTipoCliente(pedido.cliente_id, pedido.forma_pago)
    : 'B2C';

  const lista = await getListaActivaPorTipoCliente(tipoCliente);

  const snapshot = {
    pedido_id: pedidoId,
    consecutivo: pedido.consecutivo,
    cliente_id: pedido.cliente_id ?? null,
    cliente_nombre: pedido.cliente_nombre ?? 'MOSTRADOR',
    tipo_cliente: tipoCliente,
    lista_precios_id: lista?.id ?? null,
    lista_precios_nombre: lista?.nombre ?? null,
    items_count: items.length,
    cerrado_at: new Date().toISOString(),
  };

  if (lista) {
    const entry = {
      id: crypto.randomUUID(),
      dinamica_id: `pedido_pod_${pedidoId}`,
      tipo: 'PEDIDO_CERRADO',
      snapshot,
      created_at: new Date().toISOString(),
    };
    await saveDinamicaAudit(entry);
  }

  eventBus.emit(Events.PRECIO_ASIGNADO, { snapshot });
}

async function _resolverTipoCliente(clienteId, formaPago) {
  try {
    const cliente = await getCliente(clienteId);
    const fp = cliente?.forma_pago ?? formaPago ?? '';
    return mapFormaPagoToTipoCliente(fp);
  } catch {
    return mapFormaPagoToTipoCliente(formaPago ?? '');
  }
}

export function iniciarPoliticasSaga() {
  eventBus.on(Events.PEDIDO_POD, async ({ payload }) => {
    const pedidoId = payload?.pedido?.id ?? payload?.pedidoId ?? null;
    if (!pedidoId) return;
    try {
      await _auditarPreciosPOD(pedidoId, payload);
    } catch {
      // saga no puede bloquear el flujo principal
    }
  });
}
