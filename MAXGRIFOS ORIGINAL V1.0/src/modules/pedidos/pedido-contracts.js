/**
 * Contratos del módulo PEDIDOS.
 * Define y valida la forma de CrearPedido, ActualizarPedido y ConfirmarPedido.
 * Sin lógica de negocio — solo validación estructural de entrada.
 */

export function validarCrearPedido(data) {
  const errores = [];
  if (!data || typeof data !== 'object') { errores.push('data es requerido'); return errores; }
  if (!data.idempotency_key) errores.push('idempotency_key es requerido');
  if (!data.cliente_id && !data.cliente_nombre) errores.push('cliente_id o cliente_nombre es requerido');
  if (!Array.isArray(data.items) || data.items.length === 0) {
    errores.push('items debe contener al menos 1 elemento');
    return errores;
  }
  for (const [i, it] of data.items.entries()) {
    if (!it.product_id) errores.push(`items[${i}]: product_id requerido`);
    if (!it.product_sku) errores.push(`items[${i}]: product_sku requerido`);
    if (!(Number(it.cantidad) > 0)) errores.push(`items[${i}]: cantidad debe ser > 0`);
    if (!(Number(it.precio_unitario) > 0)) errores.push(`items[${i}]: precio_unitario debe ser > 0`);
  }
  return errores;
}

export function validarIniciarCreacion(data) {
  const errores = [];
  if (!data || typeof data !== 'object') {
    errores.push('data es requerido');
    return errores;
  }
  if (!data.idempotency_key) errores.push('idempotency_key es requerido');
  if (!data.cliente_id && !data.cliente_nit && !data.cliente_nombre) {
    errores.push('cliente_id, cliente_nit o cliente_nombre es requerido');
  }
  return errores;
}

export function validarActualizarPedido(pedidoId, data) {
  const errores = [];
  if (!pedidoId) errores.push('pedidoId es requerido');
  if (!data || typeof data !== 'object') { errores.push('data es requerido'); return errores; }
  if (data.items !== undefined) {
    if (!Array.isArray(data.items) || data.items.length === 0) {
      errores.push('items debe contener al menos 1 elemento');
    } else {
      for (const [i, it] of data.items.entries()) {
        if (!it.product_id) errores.push(`items[${i}]: product_id requerido`);
        if (!it.product_sku) errores.push(`items[${i}]: product_sku requerido`);
        if (!(Number(it.cantidad) > 0)) errores.push(`items[${i}]: cantidad debe ser > 0`);
        if (!(Number(it.precio_unitario) > 0)) errores.push(`items[${i}]: precio_unitario debe ser > 0`);
      }
    }
  }
  return errores;
}

export function validarConfirmarPedido(pedidoId) {
  const errores = [];
  if (!pedidoId) errores.push('pedidoId es requerido');
  return errores;
}

export function validarIniciarPicking(pedidoId) {
  const errores = [];
  if (!pedidoId) errores.push('pedidoId es requerido');
  return errores;
}

export function validarCompletarPicking(pedidoId, ajustes) {
  const errores = [];
  if (!pedidoId) errores.push('pedidoId es requerido');
  if (ajustes !== undefined && !Array.isArray(ajustes)) errores.push('ajustes debe ser un array');
  return errores;
}

export function validarIniciarPacking(pedidoId) {
  const errores = [];
  if (!pedidoId) errores.push('pedidoId es requerido');
  return errores;
}

export function validarEmitirDocumento(pedidoId, tipo) {
  const errores = [];
  if (!pedidoId) errores.push('pedidoId es requerido');
  if (!tipo) errores.push('tipo de documento es requerido');
  return errores;
}

export function validarDespachar(pedidoId) {
  const errores = [];
  if (!pedidoId) errores.push('pedidoId es requerido');
  return errores;
}

export function validarRegistrarPOD(pedidoId) {
  const errores = [];
  if (!pedidoId) errores.push('pedidoId es requerido');
  return errores;
}

export function validarAnularPedido(pedidoId, motivo) {
  const errores = [];
  if (!pedidoId) errores.push('pedidoId es requerido');
  if (motivo !== undefined && typeof motivo !== 'string') errores.push('motivo debe ser string');
  return errores;
}

function _lanzarSiErrores(errores, contexto) {
  if (errores.length > 0) throw new Error(`[${contexto}] ${errores.join('; ')}`);
}

export const Contracts = {
  crearPedido:      (data)                     => _lanzarSiErrores(validarCrearPedido(data), 'CrearPedido'),
  iniciarCreacion:  (data)                     => _lanzarSiErrores(validarIniciarCreacion(data), 'IniciarCreacion'),
  actualizarPedido: (pedidoId, data)           => _lanzarSiErrores(validarActualizarPedido(pedidoId, data), 'ActualizarPedido'),
  confirmarPedido:  (pedidoId)                 => _lanzarSiErrores(validarConfirmarPedido(pedidoId), 'ConfirmarPedido'),
  iniciarPicking:   (pedidoId)                 => _lanzarSiErrores(validarIniciarPicking(pedidoId), 'IniciarPicking'),
  completarPicking: (pedidoId, ajustes)        => _lanzarSiErrores(validarCompletarPicking(pedidoId, ajustes), 'CompletarPicking'),
  iniciarPacking:   (pedidoId)                 => _lanzarSiErrores(validarIniciarPacking(pedidoId), 'IniciarPacking'),
  emitirDocumento:  (pedidoId, tipo)           => _lanzarSiErrores(validarEmitirDocumento(pedidoId, tipo), 'EmitirDocumento'),
  despachar:        (pedidoId)                 => _lanzarSiErrores(validarDespachar(pedidoId), 'Despachar'),
  registrarPOD:     (pedidoId)                 => _lanzarSiErrores(validarRegistrarPOD(pedidoId), 'RegistrarPOD'),
  anularPedido:     (pedidoId, motivo)         => _lanzarSiErrores(validarAnularPedido(pedidoId, motivo), 'AnularPedido'),
  transicion:       (from, to)                 => validarTransicion(from, to),
};

// ── Máquina de estados ────────────────────────────────────────────────────────
export const TRANSICIONES_VALIDAS = {
  creacion:    ['creado', 'edicion', 'standby', 'cancelado', 'anulado'],
  edicion:     ['creado', 'standby', 'cancelado', 'anulado'],
  standby:     ['edicion', 'creado', 'picking', 'cancelado', 'anulado'],
  creado:      ['picking', 'edicion', 'standby', 'anulado', 'cancelado'],
  picking:     ['packing', 'anulado', 'cancelado'],
  packing:     ['facturado', 'remisionado', 'anulado', 'cancelado'],
  facturado:   ['despacho', 'anulado'],
  remisionado: ['despacho', 'anulado'],
  despacho:    ['pod', 'anulado'],
  pod:         [],
  anulado:     [],
  cancelado:   [],
};

export function validarTransicion(estadoActual, estadoNuevo) {
  const permitidos = TRANSICIONES_VALIDAS[estadoActual];
  if (permitidos === undefined) {
    throw new Error(`[StateMachine] Estado origen desconocido: '${estadoActual}'`);
  }
  if (!permitidos.includes(estadoNuevo)) {
    const destinos = permitidos.length ? permitidos.join(', ') : 'ninguno (estado terminal)';
    throw new Error(`[StateMachine] Transición '${estadoActual}' → '${estadoNuevo}' no permitida. Válidas desde '${estadoActual}': ${destinos}`);
  }
}
