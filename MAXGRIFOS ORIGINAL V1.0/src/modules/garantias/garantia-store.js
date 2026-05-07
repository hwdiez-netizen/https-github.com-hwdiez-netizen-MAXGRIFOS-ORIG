import { saveGarantia, getGarantia, getAllGarantias } from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';

export const ESTADOS_GARANTIA = [
  'RECIBIDA',
  'EN_REVISION',
  'ENVIADA_PROVEEDOR',
  'APROBADA',
  'RECHAZADA',
  'CERRADA',
];

export const ESTADO_LABEL = {
  RECIBIDA:          'Recibida',
  EN_REVISION:       'En revisión',
  ENVIADA_PROVEEDOR: 'Enviada a proveedor',
  APROBADA:          'Aprobada',
  RECHAZADA:         'Rechazada',
  CERRADA:           'Cerrada',
};

const TRANSICIONES = {
  RECIBIDA:          ['EN_REVISION', 'RECHAZADA'],
  EN_REVISION:       ['ENVIADA_PROVEEDOR', 'RECHAZADA'],
  ENVIADA_PROVEEDOR: ['APROBADA', 'RECHAZADA'],
  APROBADA:          ['CERRADA'],
  RECHAZADA:         ['CERRADA'],
  CERRADA:           [],
};

let _listenerBound = false;

export function initGarantiaStore() {
  if (_listenerBound) return;
  _listenerBound = true;

  eventBus.on(Events.GARANTIA_RECONOCIDA, ({ payload }) => {
    _handleGarantiaReconocida(payload).catch((err) => {
      console.warn('[Garantias] Error al crear entidad desde GARANTIA_RECONOCIDA', err);
    });
  });

  eventBus.on(Events.NOTA_CREDITO_PROVEEDOR_EMITIDA, ({ payload }) => {
    _handleNCProveedorEmitida(payload).catch((err) => {
      console.warn('[Garantias] Error al procesar NC en garantias', err);
    });
  });
}

async function _handleGarantiaReconocida(payload) {
  if (!payload?.product_id) return;
  const now = new Date().toISOString();
  const transferId = payload.transfer_id ?? null;

  // Idempotencia: si ya existe una garantia con este transfer_id, no duplicar
  if (transferId) {
    const all = await getAllGarantias();
    if (all.some((g) => g.kardex_transfer_id === transferId)) return;
  }

  const garantia = {
    id: crypto.randomUUID(),
    estado: 'RECIBIDA',
    product_id: payload.product_id,
    product_sku: payload.product_sku ?? '',
    product_name: payload.product_name ?? '',
    cliente_id: payload.cliente_id ?? null,
    proveedor_id: null,
    cantidad: payload.cantidad ?? 1,
    costo_unitario: payload.costo_unitario ?? null,
    causal: payload.garantia_motivo ?? null,
    referencia: payload.referencia ?? null,
    observacion: payload.observacion ?? null,
    kardex_transfer_id: transferId,
    nc_referencia: null,
    historial_estados: [{ estado: 'RECIBIDA', fecha: now, usuario: 'local', nota: null }],
    created_at: now,
    updated_at: now,
    created_by: 'local',
    updated_by: 'local',
    version: 1,
    sync_status: 'pending',
  };

  await saveGarantia(garantia);
  eventBus.emit(Events.GARANTIA_CREADA, garantia);
}

async function _handleNCProveedorEmitida(payload) {
  if (!payload?.product_id || !payload?.nc_referencia) return;
  const all = await getAllGarantias();
  const related = all.filter(
    (g) => g.product_id === payload.product_id &&
      ['ENVIADA_PROVEEDOR', 'APROBADA'].includes(g.estado),
  );
  for (const g of related) {
    if (g.estado === 'ENVIADA_PROVEEDOR') {
      await updateEstadoGarantia(g.id, 'APROBADA', {
        nota: `NC proveedor: ${payload.nc_referencia}`,
        nc_referencia: payload.nc_referencia,
      });
    }
  }
}

export async function createGarantia(data) {
  const now = new Date().toISOString();
  const garantia = {
    id: crypto.randomUUID(),
    estado: 'RECIBIDA',
    product_id: data.product_id,
    product_sku: data.product_sku ?? '',
    product_name: data.product_name ?? '',
    cliente_id: data.cliente_id ?? null,
    proveedor_id: data.proveedor_id ?? null,
    cantidad: data.cantidad ?? 1,
    costo_unitario: data.costo_unitario ?? null,
    causal: data.causal ?? null,
    referencia: data.referencia ?? null,
    observacion: data.observacion ?? null,
    kardex_transfer_id: data.kardex_transfer_id ?? null,
    nc_referencia: null,
    historial_estados: [{ estado: 'RECIBIDA', fecha: now, usuario: 'local', nota: null }],
    created_at: now,
    updated_at: now,
    created_by: 'local',
    updated_by: 'local',
    version: 1,
    sync_status: 'pending',
  };
  await saveGarantia(garantia);
  eventBus.emit(Events.GARANTIA_CREADA, garantia);
  return garantia;
}

export async function updateEstadoGarantia(id, nuevoEstado, meta = {}) {
  const garantia = await getGarantia(id);
  if (!garantia) throw new Error('Garantía no encontrada');

  const transiciones = TRANSICIONES[garantia.estado] ?? [];
  if (!transiciones.includes(nuevoEstado)) {
    throw new Error(`Transición inválida: ${garantia.estado} → ${nuevoEstado}`);
  }

  const now = new Date().toISOString();
  const historial = [...(garantia.historial_estados ?? []), {
    estado: nuevoEstado,
    fecha: now,
    usuario: 'local',
    nota: meta.nota ?? null,
  }];

  const updated = {
    ...garantia,
    estado: nuevoEstado,
    proveedor_id: meta.proveedor_id ?? garantia.proveedor_id,
    nc_referencia: meta.nc_referencia ?? garantia.nc_referencia,
    observacion: meta.observacion ?? garantia.observacion,
    historial_estados: historial,
    updated_at: now,
    updated_by: 'local',
    version: (garantia.version ?? 1) + 1,
    sync_status: 'pending',
  };

  await saveGarantia(updated);
  eventBus.emit(Events.GARANTIA_ESTADO_CAMBIADO, { garantia: updated, estado_anterior: garantia.estado, estado_nuevo: nuevoEstado });
  return updated;
}

export async function getGarantias() {
  return getAllGarantias();
}

export async function getGarantiaById(id) {
  return getGarantia(id);
}
