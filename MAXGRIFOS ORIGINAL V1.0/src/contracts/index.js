/**
 * CONTRATOS — Validación de integridad antes de mutación
 * Rol: validar contract antes de que handler llame store
 * Patrón: Contracts.validateX(data) → throw si viola | void si OK
 */

class Contracts {
  static _INV_V2_STATUSES = ['active', 'ignored', 'abandoned', 'closing', 'partial_close', 'committed', 'failed'];

  static _isInventarioGeneralSession(session) {
    return Boolean(session?.es_inventario_general) || session?.type === 'inventario';
  }
  /**
   * validateCreateCliente
   * Valida datos obligatorios para creación de cliente
   * @param {Object} data - datos del cliente
   * @throws {Error} si datos inválidos
   */
  static validateCreateCliente(data) {
    if (!data) throw new Error('Datos de cliente requeridos');
    if (!data.razon_social || !String(data.razon_social).trim()) {
      throw new Error('Razón social es obligatoria');
    }
    if (!data.forma_pago || !String(data.forma_pago).trim()) {
      throw new Error('Forma de pago es obligatoria');
    }
    if (data.cupo_credito != null && Number(data.cupo_credito) < 0) {
      throw new Error('Cupo de crédito no puede ser negativo');
    }
    if (data.compra_minima != null && Number(data.compra_minima) < 0) {
      throw new Error('Compra mínima no puede ser negativa');
    }
  }

  /**
   * validateUpdateCliente
   * Valida datos para actualización de cliente
   * @param {string} clienteId - ID del cliente
   * @param {Object} data - datos a actualizar
   * @throws {Error} si datos inválidos
   */
  static validateUpdateCliente(clienteId, data) {
    if (!clienteId || !String(clienteId).trim()) {
      throw new Error('ID de cliente requerido');
    }
    if (!data) throw new Error('Datos de actualización requeridos');
    if (data.razon_social != null && !String(data.razon_social).trim()) {
      throw new Error('Razón social no puede estar vacía');
    }
    if (data.forma_pago != null && !String(data.forma_pago).trim()) {
      throw new Error('Forma de pago no puede estar vacía');
    }
    if (data.cupo_credito != null && Number(data.cupo_credito) < 0) {
      throw new Error('Cupo de crédito no puede ser negativo');
    }
  }

  /**
   * validateCrearPedido
   * Valida datos para creación de pedido
   * @param {Object} data - datos del pedido
   * @throws {Error} si datos inválidos
   */
  static validateCrearPedido(data) {
    if (!data) throw new Error('Datos de pedido requeridos');
    if (!data.cliente_id || !String(data.cliente_id).trim()) {
      throw new Error('Cliente es obligatorio');
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('Pedido debe contener al menos un item');
    }
    data.items.forEach((item, idx) => {
      if (!item.product_id) {
        throw new Error(`Item ${idx + 1}: producto es obligatorio`);
      }
      if (Number(item.cantidad) <= 0) {
        throw new Error(`Item ${idx + 1}: cantidad debe ser mayor a 0`);
      }
    });
  }

  /**
   * validateEditarPedido
   * Valida datos para edición de pedido
   * @param {string} pedidoId - ID del pedido
   * @param {Object} data - datos a actualizar
   * @throws {Error} si datos inválidos
   */
  static validateEditarPedido(pedidoId, data) {
    if (!pedidoId) throw new Error('ID de pedido requerido');
    if (!data) throw new Error('Datos de edición requeridos');
    if (data.items && Array.isArray(data.items) && data.items.length === 0) {
      throw new Error('Pedido debe contener al menos un item');
    }
  }

  /**
   * validateCrearMovimientoKardex
   * Valida datos para movimiento de inventario
   * @param {Object} data - datos del movimiento
   * @throws {Error} si datos inválidos
   */
  static validateCrearMovimientoKardex(data) {
    if (!data) throw new Error('Datos de movimiento requeridos');
    if (!data.tipo || !['ENTRADA', 'SALIDA', 'AJUSTE'].includes(data.tipo)) {
      throw new Error('Tipo de movimiento inválido');
    }
    if (!data.product_id) throw new Error('Producto es obligatorio');
    if (Number(data.cantidad) <= 0) {
      throw new Error('Cantidad debe ser mayor a 0');
    }
  }

  /**
   * validateGuardarListaPrecio
   * Valida datos para crear/actualizar lista de precios
   * @param {Object} data - datos de la lista
   * @throws {Error} si datos inválidos
   */
  static validateGuardarListaPrecio(data) {
    if (!data) throw new Error('Datos de lista requeridos');
    if (!data.nombre || !String(data.nombre).trim()) {
      throw new Error('Nombre de lista es obligatorio');
    }
    if (!data.tipo_cliente || !['CONTADO', 'CREDITO', 'B2B'].includes(data.tipo_cliente)) {
      throw new Error('Tipo de cliente inválido');
    }
  }

  /**
   * validateCrearProveedor
   * Valida datos para creación de proveedor
   * @param {Object} data - datos del proveedor
   * @throws {Error} si datos inválidos
   */
  static validateCrearProveedor(data) {
    if (!data) throw new Error('Datos de proveedor requeridos');
    if (!data.razon_social || !String(data.razon_social).trim()) {
      throw new Error('Razón social es obligatoria');
    }
    if (!data.nit || !String(data.nit).trim()) {
      throw new Error('NIT es obligatorio');
    }
  }

  static validateActualizarProveedor(proveedorId, data) {
    if (!proveedorId || !String(proveedorId).trim()) {
      throw new Error('ID de proveedor requerido');
    }
    if (!data) throw new Error('Datos de actualización requeridos');
    if (data.razon_social != null && !String(data.razon_social).trim()) {
      throw new Error('Razón social no puede estar vacía');
    }
  }

  static validateDesactivarProveedor(proveedorId) {
    if (!proveedorId || !String(proveedorId).trim()) {
      throw new Error('ID de proveedor requerido para desactivar');
    }
  }

  static validateActivarProveedor(proveedorId) {
    if (!proveedorId || !String(proveedorId).trim()) {
      throw new Error('ID de proveedor requerido para activar');
    }
  }

  /**
   * validateInventarioGeneral
   * Valida parámetros para iniciar sesión de inventario o auditoría
   */
  static validateInventarioGeneral(type, scope) {
    const TIPOS_VALIDOS = ['auditoria', 'inventario'];
    const SCOPES_VALIDOS = ['active', 'inactive', 'both'];
    if (!type || !TIPOS_VALIDOS.includes(type)) {
      throw new Error(`Tipo de sesión inválido: "${type}". Debe ser: ${TIPOS_VALIDOS.join(', ')}`);
    }
    if (!scope || !SCOPES_VALIDOS.includes(scope)) {
      throw new Error(`Alcance inválido: "${scope}". Debe ser: ${SCOPES_VALIDOS.join(', ')}`);
    }
  }

  /**
   * validateConciliacionInventario
   * Valida ítem y causal antes de aplicar ajuste de inventario.
   * @param {Object} item - ítem de auditoría
   * @param {string} causal - causal seleccionada
   * @param {string[]} [validCausales] - lista de nombres válidos del catálogo configurable;
   *   si se omite, valida contra el preset DIAN legacy para compatibilidad.
   */
  static validateConciliacionInventario(item, causal, validCausales) {
    const CAUSALES_LEGACY = [
      'SIN DIFERENCIA', 'MERMA / DETERIORO', 'ROBO / HURTO',
      'VENTA NO REGISTRADA', 'DEVOLUCION NO REGISTRADA',
      'ERROR CONTEO ANTERIOR', 'TRANSFERENCIA NO REGISTRADA',
      'AJUSTE INICIAL', 'OTRO',
    ];
    const lista = Array.isArray(validCausales) && validCausales.length > 0
      ? validCausales
      : CAUSALES_LEGACY;

    if (!item || !item.id) throw new Error('Ítem de auditoría requerido');
    if (!item.product_id) throw new Error('product_id requerido en ítem');
    if (!item.session_id) throw new Error('session_id requerido en ítem');
    if (item.qty_fisica === null || item.qty_fisica === undefined) {
      throw new Error(`Ítem ${item.sku}: cantidad física no registrada`);
    }
    const qty = Number(item.qty_fisica);
    if (!Number.isFinite(qty) || qty < 0) {
      throw new Error(`Ítem ${item.sku}: cantidad física inválida (${item.qty_fisica})`);
    }
    if (!causal || !lista.includes(causal)) {
      throw new Error(`Causal inválida: "${causal}". Causales válidas: ${lista.join(', ')}`);
    }
  }

  /**
   * validateNuevaCausal
   * Valida datos para crear o editar una causal del catálogo configurable
   */
  static validateNuevaCausal(data) {
    if (!data) throw new Error('Datos de causal requeridos');
    const nombre = String(data.nombre ?? '').trim();
    if (!nombre) throw new Error('Nombre de causal es obligatorio');
    if (nombre.length > 60) throw new Error('Nombre de causal no puede superar 60 caracteres');
  }

  /**
   * validateCierreInventario
   * Valida que la sesión exista y esté en progreso antes de cerrar
   */
  static validateCierreInventario(session) {
    if (!session || !session.id) throw new Error('Sesión de inventario requerida');
    if (Contracts._isInventarioGeneralSession(session)) {
      if (!['active', 'partial_close', 'failed', 'closing'].includes(session.status)) {
        throw new Error(`No se puede cerrar sesión de Inventario General en estado "${session.status}"`);
      }
      return;
    }
    if (session.status !== 'in_progress') {
      throw new Error(`No se puede cerrar sesión en estado "${session.status}"`);
    }
  }

  /**
   * validateIniciarInventarioGeneral
   * Valida parámetros para iniciar sesión de Inventario General con bodega satélite temporal
   */
  static validateIniciarInventarioGeneral(scope, bodegaIds) {
    const SCOPES_VALIDOS = ['active', 'inactive', 'both'];
    if (!scope || !SCOPES_VALIDOS.includes(scope)) {
      throw new Error(`Alcance inválido: "${scope}". Debe ser: ${SCOPES_VALIDOS.join(', ')}`);
    }
    if (!Array.isArray(bodegaIds) || bodegaIds.length === 0) {
      throw new Error('Se requiere seleccionar al menos una bodega para Inventario General');
    }
  }

  /**
   * validateRegistrarCostoFisico
   * Valida costo físico editable en sesión de Inventario General (NO toca Kardex oficial)
   */
  static validateRegistrarCostoFisico(item, costoFisico) {
    if (!item || !item.id) throw new Error('Ítem requerido para registrar costo físico');
    if (!item.es_inventario_general) throw new Error('Costo físico editable solo aplica a Inventario General');
    const c = Number(costoFisico);
    if (!Number.isFinite(c) || c < 0) {
      throw new Error(`Costo físico inválido: ${costoFisico}. Debe ser número ≥ 0`);
    }
  }

  /**
   * validateAgregarProductoNuevoAInventario
   * Valida datos para crear producto nuevo durante Inventario General y agregarlo a bodega satélite
   */
  static validateAgregarProductoNuevoAInventario(session, productData) {
    if (!session || !session.id) throw new Error('Sesión requerida');
    if (!session.es_inventario_general) throw new Error('Solo aplica a sesión de Inventario General');
    if (!['active', 'closing', 'partial_close', 'failed'].includes(session.status)) {
      throw new Error(`La sesión debe estar activa para operar (actual: ${session.status})`);
    }
    if (!productData || !String(productData.nombre ?? '').trim()) {
      throw new Error('Nombre del producto requerido');
    }
    if (!String(productData.ref_proveedor ?? '').trim()) {
      throw new Error('Código de proveedor requerido');
    }
    if (!productData.uom) throw new Error('Unidad de medida requerida');
  }

  /**
   * validateCrearOrdenCompra
   * Valida datos para orden de compra
   * @param {Object} data - datos de la OC
   * @throws {Error} si datos inválidos
   */
  static validateCierreAtomicoInventario(session, items) {
    if (!session || !session.id) throw new Error('Sesión requerida para cierre atómico');
    if (!session.es_inventario_general) throw new Error('Solo aplica a sesión de Inventario General');
    if (!['active', 'partial_close', 'failed', 'closing', 'ignored'].includes(session.status)) {
      throw new Error(`Sesión no disponible para cierre/reintento (estado: ${session.status})`);
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Se requieren ítems para el cierre');
    }
    const sinContar = items.filter((i) => i.qty_fisica === null || i.qty_fisica === undefined);
    if (sinContar.length > 0) {
      throw new Error(`${sinContar.length} ítem(s) sin contar. Todos deben tener cantidad física antes del cierre.`);
    }
    const sinCausal = items.filter(
      (i) => Number(i.diferencia) !== 0 && !i.reconciled
    );
    if (sinCausal.length > 0) {
      const nombres = sinCausal.slice(0, 3).map((i) => i.nombre ?? i.sku).join(', ');
      throw new Error(`${sinCausal.length} ítem(s) con diferencia sin causal: ${nombres}${sinCausal.length > 3 ? '…' : ''}`);
    }
  }

  /**
   * validateConsultaHistorial
   * Valida parámetros opcionales para consulta del historial forense F8
   */
  static validateConsultaHistorial(filtros = {}) {
    if (filtros.sessionId != null && !String(filtros.sessionId).trim()) {
      throw new Error('sessionId inválido');
    }
    if (filtros.desde != null && isNaN(Date.parse(filtros.desde))) {
      throw new Error('Fecha "desde" inválida');
    }
    if (filtros.hasta != null && isNaN(Date.parse(filtros.hasta))) {
      throw new Error('Fecha "hasta" inválida');
    }
  }

  static validateCrearOrdenCompra(data) {
    if (!data) throw new Error('Datos de orden requeridos');
    if (!data.proveedor_id) throw new Error('Proveedor es obligatorio');
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('Orden debe contener al menos un item');
    }
    data.items.forEach((item, idx) => {
      if (!item.product_id) {
        throw new Error(`Item ${idx + 1}: producto es obligatorio`);
      }
      if (Number(item.cantidad) <= 0) {
        throw new Error(`Item ${idx + 1}: cantidad debe ser mayor a 0`);
      }
    });
  }

  static validateAcquireItemLock(item, deviceId) {
    if (!item || !item.id) throw new Error('Ítem requerido para lock');
    if (!deviceId || !String(deviceId).trim()) throw new Error('deviceId requerido para lock');
  }

  static validateRegistrarConteoMultiuser(item, qtyFisica, deviceId) {
    if (!item || !item.id) throw new Error('Ítem requerido');
    const qty = Number(qtyFisica);
    if (!Number.isFinite(qty) || qty < 0) throw new Error(`Cantidad física inválida: ${qtyFisica}`);
    if (!deviceId || !String(deviceId).trim()) throw new Error('deviceId requerido para conteo multiusuario');
  }

  static validateSetSessionIgnored(session) {
    if (!session || !session.id) throw new Error('Sesión requerida para ignorar');
    if (!Contracts._isInventarioGeneralSession(session)) {
      throw new Error('Ignorar persistente solo aplica a Inventario General');
    }
    if (!['active', 'closing', 'partial_close', 'failed', 'ignored'].includes(session.status)) {
      throw new Error(`No se puede ignorar sesión en estado "${session.status}"`);
    }
  }

  static validateResumeIgnoredSession(session) {
    if (!session || !session.id) throw new Error('Sesión requerida para reanudar');
    if (!Contracts._isInventarioGeneralSession(session)) {
      throw new Error('Reanudación persistente solo aplica a Inventario General');
    }
    if (!['ignored', 'active', 'partial_close', 'failed', 'closing'].includes(session.status)) {
      throw new Error(`No se puede reanudar sesión en estado "${session.status}"`);
    }
  }

  static validateSessionTransition(fromStatus, toStatus) {
    if (!Contracts._INV_V2_STATUSES.includes(fromStatus)) {
      throw new Error(`Estado origen inválido: ${fromStatus}`);
    }
    if (!Contracts._INV_V2_STATUSES.includes(toStatus)) {
      throw new Error(`Estado destino inválido: ${toStatus}`);
    }
  }

  static validateRecoverySessionCandidate(session, nowIso = new Date().toISOString()) {
    if (!session || !session.id) throw new Error('Sesión inválida para recovery');
    if (!Contracts._isInventarioGeneralSession(session)) return;
    if (!Contracts._INV_V2_STATUSES.includes(session.status)) {
      throw new Error(`Estado V2 inválido en recovery: ${session.status}`);
    }
    if (!session.started_at) throw new Error('Sesión sin started_at para recovery');
    if (isNaN(Date.parse(nowIso))) throw new Error('nowIso inválido');
  }

  static validateRetryPartialCloseSession(session, items) {
    if (!session || !session.id) throw new Error('Sesión requerida para retry');
    if (!Contracts._isInventarioGeneralSession(session)) {
      throw new Error('Retry de cierre solo aplica a Inventario General');
    }
    if (!['partial_close', 'failed', 'closing'].includes(session.status)) {
      throw new Error(`Retry no permitido en estado "${session.status}"`);
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Se requieren ítems para reintento de cierre');
    }
  }
}

export { Contracts };
