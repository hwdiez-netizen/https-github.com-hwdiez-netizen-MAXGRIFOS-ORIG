import { saveConfigComprobante, getConfigComprobante as getConfigComprobanteDB } from '../../db/local-db.js';

export async function seedConfigComprobantes() {
  const timestamp = new Date().toISOString();
  const defaultConfigs = [
    { id: 'FAC', prefijo: 'FAC', numero_inicial: 1, descripcion: 'Factura de Venta' },
    { id: 'REM', prefijo: 'REM', numero_inicial: 1, descripcion: 'Remisión' },
    { id: 'PED', prefijo: 'PED', numero_inicial: 1, descripcion: 'Pedido de Venta' }
  ];

  for (const conf of defaultConfigs) {
    const existente = await getConfigComprobanteDB(conf.id);
    if (!existente) {
      await saveConfigComprobante({
        ...conf,
        created_at: timestamp,
        updated_at: timestamp,
        created_by: 'system',
        updated_by: 'system',
        version: 1,
        status: 'active',
        sync_status: 'synced',
        idempotency_key: `CONFIG_COMPROBANTE:${conf.id}`
      });
    }
  }
}

export async function getComprobanteConfig(id) {
  return getConfigComprobanteDB(id);
}

export async function listComprobanteConfigs() {
  const configs = [];
  const defaultIds = ['FAC', 'REM', 'PED'];
  for (const id of defaultIds) {
    const conf = await getConfigComprobanteDB(id);
    if (conf) configs.push(conf);
  }
  return configs;
}

export async function upsertComprobanteConfigStore(config) {
  return saveConfigComprobante(config);
}

export async function getConfigComprobante(id) {
  return getConfigComprobanteDB(id);
}

export async function updateConfigComprobante(config) {
  config.updated_at = new Date().toISOString();
  config.version = (config.version || 0) + 1;
  return saveConfigComprobante(config);
}
