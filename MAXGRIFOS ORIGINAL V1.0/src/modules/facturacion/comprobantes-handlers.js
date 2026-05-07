import { eventBus } from '../../events/domain-events.js';
import { validateComprobanteConfigInput } from './comprobantes-contracts.js';
import {
  getComprobanteConfig,
  listComprobanteConfigs,
  upsertComprobanteConfigStore,
} from './config-store.js';
import { crearDocumento, anularDocumento, registrarReimpresion, getDocumentos } from './factura-store.js';

export async function handleGetDocumentos() {
  return getDocumentos();
}

export async function handleGetComprobantesConfig() {
  return listComprobanteConfigs();
}

export async function handleSaveComprobanteConfig(payload = {}) {
  const input = validateComprobanteConfigInput(payload);
  const current = await getComprobanteConfig(input.tipo);
  const all = await listComprobanteConfigs();
  const other = all.find((cfg) => cfg.tipo !== input.tipo && cfg.prefijo === input.prefijo);
  if (other) {
    throw new Error(`Prefijo duplicado: ${input.prefijo} ya está asignado a ${other.tipo}`);
  }

  if (current && current.prefijo === input.prefijo && Number(current.numero_inicial) === Number(input.numero_inicial)) {
    return { ...current, _idempotent_noop: true };
  }

  const updated = await upsertComprobanteConfigStore(input);
  await eventBus.emit('ComprobanteConfigUpdated', {
    tipo: updated.tipo,
    prefijo: updated.prefijo,
    numero_inicial: updated.numero_inicial,
    idempotency_key: updated.idempotency_key,
  });
  return updated;
}

export async function handleCrearDocumento(payload = {}) {
  if (!payload?.pedido_id) {
    throw new Error('FACTURACION_PEDIDO_ID_REQUIRED');
  }

  if (!['FAC', 'REM'].includes(String(payload?.tipo ?? '').toUpperCase())) {
    throw new Error('FACTURACION_TIPO_DOCUMENTO_INVALIDO');
  }

  return crearDocumento(
    {
      pedido_id: payload.pedido_id,
      tipo: String(payload.tipo).toUpperCase(),
    },
    { __fromHandler: true },
  );
}

export async function handleAnularDocumento(payload = {}) {
  if (!payload?.documento_id) {
    throw new Error('FACTURACION_DOCUMENTO_ID_REQUIRED');
  }

  if (!payload?.motivo) {
    throw new Error('FACTURACION_MOTIVO_ANULACION_REQUIRED');
  }

  return anularDocumento(payload.documento_id, payload.motivo, { __fromHandler: true });
}

export async function handleRegistrarReimpresion(payload = {}) {
  if (!payload?.documento_id) {
    throw new Error('FACTURACION_DOCUMENTO_ID_REQUIRED');
  }

  return registrarReimpresion(payload.documento_id, { __fromHandler: true });
}
