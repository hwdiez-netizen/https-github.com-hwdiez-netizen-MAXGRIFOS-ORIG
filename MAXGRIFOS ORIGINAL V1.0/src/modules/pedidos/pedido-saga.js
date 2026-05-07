/**
 * Orquestador de la Saga de Pedidos.
 * Coordina kardex-store, pedido-store y factura-store mediante eventos de dominio.
 * NO hace llamadas directas a módulos de UI ni a módulo de Productos (solo consulta DB).
 */
import {
  crearPedido, actualizarEstado, actualizarItemsPicking,
  actualizarPedidoEditable, reemplazarItemsPedido,
  getPedidoCompleto, _logSaga, marcarPickingFisicoConfirmado,
} from './pedido-store.js';
import {
  reservarStock, revertirReserva,
  validarDisponibilidadStock, ajustarStockPostPicking,
} from '../kardex/kardex-store.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { Contracts } from './pedido-contracts.js';

function _requestFacturacion(requestEvent, responseEvent, payload, timeoutMs = 10000) {
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

// ── Fase 1: Crear Pedido ─────────────────────────────────────────────────────
export async function sagaCrearPedido(data) {
  Contracts.crearPedido(data);
  _validarPreciosItems(data.items ?? []);
  const { pedido, items } = await crearPedido(data);

  // PED_F4: Reserva lógica comercial — solo valida disponibilidad, sin movimiento físico de Kardex.
  // El traslado físico Central → Pedidos ocurre únicamente al confirmar Picking.
  const insuficientes = await validarDisponibilidadStock(
    items.map((i) => ({ product_id: i.product_id, product_sku: i.product_sku, cantidad: i.cantidad_pedida })),
  );
  if (insuficientes.length > 0) {
    await actualizarEstado(pedido.id, 'anulado');
    const detalle = insuficientes.map((i) => `${i.product_sku}: disponible ${i.saldo_disponible}, solicitado ${i.cantidad_requerida}`).join('\n');
    throw new Error(`Stock insuficiente:\n${detalle}`);
  }

  await _logSaga(pedido.id, 'CONFIRMADO', { items: items.length });
  eventBus.emit(Events.PEDIDO_CONFIRMADO, { pedido, items });
  return { pedido, items };
}

// ── Confirmar Pedido existente (idempotente) ──────────────────────────────────
// Clave: PED:${pedido_id} — segunda llamada con pedido ya en 'creado' → retorna sin re-reservar.
export async function sagaConfirmarPedido(pedidoId) {
  Contracts.confirmarPedido(pedidoId);
  const data = await getPedidoCompleto(pedidoId);
  if (!data) throw new Error('Pedido no encontrado');
  const { pedido, items } = data;

  // Idempotencia: si ya está confirmado (creado o más avanzado), no re-validar.
  if (!['creacion', 'edicion', 'standby'].includes(pedido.estado)) {
    eventBus.emit(Events.PEDIDO_CONFIRMADO, { pedido, items });
    return { pedido, items };
  }

  // PED_F4: Reserva lógica comercial — solo valida disponibilidad, sin movimiento físico de Kardex.
  const insuficientes = await validarDisponibilidadStock(
    items.map((i) => ({ product_id: i.product_id, product_sku: i.product_sku, cantidad: i.cantidad_pedida })),
  );
  if (insuficientes.length > 0) {
    const detalle = insuficientes.map((i) => `${i.product_sku}: disponible ${i.saldo_disponible}, solicitado ${i.cantidad_requerida}`).join('\n');
    throw new Error(`Stock insuficiente:\n${detalle}`);
  }

  const updated = await actualizarEstado(pedidoId, 'creado');
  await _logSaga(pedidoId, 'CONFIRMADO', { items: items.length });
  eventBus.emit(Events.PEDIDO_CONFIRMADO, { pedido: updated, items });
  return { pedido: updated, items };
}

// ── Edición de pedido creado (sin cambio de fase) ──────────────────────────
export async function sagaEditarPedidoCreado(pedidoId, data) {
  Contracts.actualizarPedido(pedidoId, data);
  const { pedido, items: actuales } = await _validar(pedidoId, ['creacion', 'edicion', 'creado', 'standby', 'picking', 'packing']);

  const nuevos = (data.items ?? []).map((it) => ({
    product_id: it.product_id,
    product_sku: it.product_sku,
    product_name: it.product_name,
    cantidad: Number(it.cantidad ?? 0),
    precio_unitario: Number(it.precio_unitario ?? 0),
    precio_origen: it.precio_origen ?? null,
  })).filter((it) => it.product_id && it.cantidad > 0);

  if (nuevos.length === 0) {
    throw new Error('El pedido debe tener al menos un ítem.');
  }

  _validarPreciosItems(nuevos);

  const mapActual = new Map();
  for (const it of actuales) {
    mapActual.set(it.product_id, (mapActual.get(it.product_id) ?? 0) + Number(it.cantidad_pedida ?? 0));
  }
  const mapNuevo = new Map();
  for (const it of nuevos) {
    mapNuevo.set(it.product_id, (mapNuevo.get(it.product_id) ?? 0) + Number(it.cantidad ?? 0));
  }

  const keys = new Set([...mapActual.keys(), ...mapNuevo.keys()]);

  // PED_F4: Kardex solo si el picking físico ya fue confirmado (estado 'packing' o flag explícito)
  const estaPostPickingFisico = pedido.picking_fisico_confirmado === true || pedido.estado === 'packing';

  if (estaPostPickingFisico) {
    // Ajuste incremental post-picking: Central ↔ Pedidos
    const aplicadas = [];
    try {
      for (const productId of keys) {
        const oldQty = mapActual.get(productId) ?? 0;
        const newQty = mapNuevo.get(productId) ?? 0;
        const diff = newQty - oldQty;
        if (diff > 0) {
          await ajustarStockPostPicking({
            product_id: productId, cantidad: diff, pedido_id: pedidoId,
            direccion: 'IN', idempotency_suffix: `v${pedido.version}`,
          });
          aplicadas.push({ type: 'IN', product_id: productId, cantidad: diff });
        } else if (diff < 0) {
          await ajustarStockPostPicking({
            product_id: productId, cantidad: Math.abs(diff), pedido_id: pedidoId,
            direccion: 'OUT', idempotency_suffix: `v${pedido.version}`,
          });
          aplicadas.push({ type: 'OUT', product_id: productId, cantidad: Math.abs(diff) });
        }
      }
    } catch (err) {
      for (let i = aplicadas.length - 1; i >= 0; i--) {
        const op = aplicadas[i];
        try {
          await ajustarStockPostPicking({
            product_id: op.product_id, cantidad: op.cantidad, pedido_id: pedidoId,
            direccion: op.type === 'IN' ? 'OUT' : 'IN',
            idempotency_suffix: `v${pedido.version}:ROLLBACK`,
          });
        } catch { /* best effort */ }
      }
      throw err;
    }
  }
  // Pre-picking: sin movimiento Kardex — el traslado físico ocurre al confirmar Picking

  const updated = await actualizarPedidoEditable(pedidoId, {
    cliente_id: data.cliente_id ?? pedido.cliente_id,
    cliente_nombre: data.cliente_nombre ?? pedido.cliente_nombre,
    cliente_nit: data.cliente_nit ?? pedido.cliente_nit,
    observacion: data.observacion ?? pedido.observacion,
  });

  const nuevosItems = await reemplazarItemsPedido(pedidoId, nuevos);
  await _logSaga(pedidoId, 'EDITADO', { items: nuevosItems.length });
  eventBus.emit(Events.PEDIDO_CREATED, { pedido: updated, items: nuevosItems });
  return { pedido: updated, items: nuevosItems };
}

// ── Fase 2: Iniciar Picking ──────────────────────────────────────────────────
export async function sagaIniciarPicking(pedidoId) {
  const { pedido } = await _validar(pedidoId, ['creacion', 'edicion', 'creado', 'standby']);
  const updated = await actualizarEstado(pedidoId, 'picking');
  await _logSaga(pedidoId, 'PICKING_INICIADO');
  eventBus.emit(Events.PEDIDO_PICKING, { pedido: updated });
  return updated;
}

// ── Fase 3: Completar Picking (primer punto de movimiento físico real) ─────────
export async function sagaCompletarPicking(pedidoId, ajustes = []) {
  const { pedido, items } = await _validar(pedidoId, ['picking']);

  // Idempotencia: si ya fue confirmado físicamente, no re-generar Kardex
  if (pedido.picking_fisico_confirmado) {
    await _logSaga(pedidoId, 'PICKING_COMPLETADO_IDEM');
    return { pedido };
  }

  if (ajustes.length > 0) {
    // Aplicar ajustes de picking sobre los items (actualiza cantidad_picking)
    await actualizarItemsPicking(pedidoId, ajustes);
    for (const aj of ajustes) {
      const item = items.find((i) => i.id === aj.item_id);
      if (!item) continue;
      eventBus.emit(Events.STOCK_ADJUSTED, {
        product_id:        item.product_id,
        product_sku:       item.product_sku,
        cantidad_original: item.cantidad_pedida,
        cantidad_ajustada: Number(aj.cantidad_picking),
        pedido_id:         pedidoId,
      });
    }
    await _logSaga(pedidoId, 'PICKING_AJUSTE', { ajustes });
  }

  // PED_F4: Consolidar snapshot final y generar traslado físico Central → Pedidos
  const { items: itemsFinales } = await getPedidoCompleto(pedidoId);
  const errores = [];
  for (const item of itemsFinales) {
    // cantidad_picking=0 significa "quitado del picking"; null/undefined cae a cantidad_pedida (legado)
    const cantidadFinal = (item.cantidad_picking != null)
      ? Number(item.cantidad_picking)
      : Number(item.cantidad_pedida);
    if (!(cantidadFinal > 0)) continue;
    try {
      await reservarStock({
        product_id: item.product_id,
        cantidad:   cantidadFinal,
        pedido_id:  pedidoId,
      });
      eventBus.emit(Events.STOCK_RESERVADO, {
        pedido_id:   pedidoId,
        product_id:  item.product_id,
        product_sku: item.product_sku,
        cantidad:    cantidadFinal,
      });
    } catch (err) {
      errores.push(`${item.product_sku}: ${err.message}`);
    }
  }

  if (errores.length > 0) {
    throw new Error(`Error en traslado físico de picking:\n${errores.join('\n')}`);
  }

  await marcarPickingFisicoConfirmado(pedidoId);
  await _logSaga(pedidoId, 'PICKING_COMPLETADO');
  return { pedido };
}

// ── Fase 4: Iniciar Packing ──────────────────────────────────────────────────
export async function sagaIniciarPacking(pedidoId) {
  const { pedido } = await _validar(pedidoId, ['picking']);
  const updated = await actualizarEstado(pedidoId, 'packing');
  await _logSaga(pedidoId, 'PACKING_INICIADO');
  eventBus.emit(Events.PEDIDO_PACKING, { pedido: updated });
  return updated;
}

// ── Fase 5: Emitir Documento (Factura o Remisión) ───────────────────────────
export async function sagaEmitirDocumento(pedidoId, tipo, optsDocumento = {}) {
  const { pedido } = await _validar(pedidoId, ['packing']);
  const nuevoEstado = tipo === 'FAC' ? 'facturado' : 'remisionado';

  const response = await _requestFacturacion(
    Events.PEDIDO_DOCUMENTO_EMISION_REQUESTED,
    Events.PEDIDO_DOCUMENTO_EMISION_RESOLVED,
    { pedido_id: pedidoId, tipo, ...optsDocumento },
  );
  const doc = response.documento;

  const updated = await actualizarEstado(pedidoId, nuevoEstado, { documento_id: doc.id });
  await _logSaga(pedidoId, `DOCUMENTO_EMITIDO`, { tipo, consecutivo: doc.consecutivo });

  const evType = tipo === 'FAC' ? Events.FACTURA_EMITIDA : Events.REMISION_EMITIDA;
  eventBus.emit(evType, { pedido: updated, documento: doc });

  // Descarga de stock asíncrona vía evento (consumida por listener en app.js)
  return { pedido: updated, documento: doc };
}

// ── Fase 6: Despachar ────────────────────────────────────────────────────────
export async function sagaDespachar(pedidoId) {
  const { pedido } = await _validar(pedidoId, ['facturado', 'remisionado']);
  const updated = await actualizarEstado(pedidoId, 'despacho');
  await _logSaga(pedidoId, 'DESPACHADO');
  eventBus.emit(Events.PEDIDO_DESPACHADO, { pedido: updated });
  return updated;
}

// ── Fase 7: POD (Prueba de Entrega) ─────────────────────────────────────────
// La descarga de inventario ocurre en sagaEmitirDocumento (FACTURA_EMITIDA / REMISION_EMITIDA).
// POD solo confirma la entrega física; no genera movimientos adicionales en kardex.
export async function sagaRegistrarPOD(pedidoId) {
  const { pedido } = await _validar(pedidoId, ['despacho']);

  const updated = await actualizarEstado(pedidoId, 'pod');
  await _logSaga(pedidoId, 'POD_REGISTRADO');
  eventBus.emit(Events.PEDIDO_POD, { pedido: updated });
  return updated;
}

// ── Anulación (reversible desde cualquier estado pre-POD) ───────────────────
// PED_F4: distingue pre-picking (solo lógica) vs post-picking (reversión física Pedidos→Central).
// Idempotencia estable por pedido+item evita duplicados en reintentos.
export async function sagaAnularPedido(pedidoId, motivo = '') {
  const { pedido, items } = await _validar(pedidoId, ['creacion', 'edicion', 'creado', 'picking', 'packing', 'facturado', 'remisionado', 'despacho']);

  // Post-picking físico: picking_fisico_confirmado o estado posterior a picking
  const estaPostPickingFisico = pedido.picking_fisico_confirmado === true ||
    ['packing', 'facturado', 'remisionado', 'despacho'].includes(pedido.estado);

  if (estaPostPickingFisico) {
    // Reversión física: Bodega Pedidos → Bodega Central
    const errores = [];
    for (const item of items) {
      const cantidadRevertir = Number(item.cantidad_picking) > 0
        ? Number(item.cantidad_picking)
        : Number(item.cantidad_pedida);
      if (!(cantidadRevertir > 0)) continue;
      try {
        await revertirReserva({
          product_id: item.product_id,
          cantidad: cantidadRevertir,
          pedido_id: pedidoId,
          idempotency_prefix: `ANULACION:${pedidoId}:${item.id ?? item.product_id}`,
        });
      } catch (err) {
        await _logSaga(pedidoId, 'REVERSION_PARCIAL', { product_id: item.product_id, error: err.message });
        errores.push(`${item.product_sku ?? item.product_id}: ${err.message}`);
      }
    }
    if (errores.length > 0) {
      throw new Error(`No se pudo anular el pedido. Reversión de stock falló:\n${errores.join('\n')}`);
    }
  } else {
    // Pre-picking: solo anulación lógica — nunca hubo movimiento físico en Kardex
    await _logSaga(pedidoId, 'ANULACION_LOGICA_PRE_PICKING', { motivo });
  }

  if (pedido.documento_id) {
    await _requestFacturacion(
      Events.PEDIDO_DOCUMENTO_ANULACION_REQUESTED,
      Events.PEDIDO_DOCUMENTO_ANULACION_RESOLVED,
      { documento_id: pedido.documento_id, motivo },
    );
  }

  const updated = await actualizarEstado(pedidoId, 'anulado', { motivo_anulacion: motivo });
  await _logSaga(pedidoId, 'ANULADO', { motivo });
  eventBus.emit(Events.PEDIDO_ANULADO, { pedido: updated, motivo });
  return updated;
}

// ── Helper: guardia de precios — ningún ítem puede persistir sin precio resuelto
function _validarPreciosItems(items) {
  const sinPrecio = items.filter((it) => !(Number(it.precio_unitario) > 0));
  if (sinPrecio.length > 0) {
    const skus = sinPrecio.map((it) => it.product_sku ?? it.product_id ?? '?').join(', ');
    throw new Error(`Precio comercial no resuelto para: ${skus}. Verifique Políticas Comerciales.`);
  }
}

// ── Helper: validar estado ───────────────────────────────────────────────────
async function _validar(pedidoId, estadosPermitidos) {
  const data = await getPedidoCompleto(pedidoId);
  if (!data) throw new Error('Pedido no encontrado');
  if (!estadosPermitidos.includes(data.pedido.estado)) {
    throw new Error(`Estado '${data.pedido.estado}' no permite esta operación. Se requiere: ${estadosPermitidos.join(' | ')}`);
  }
  return data;
}
