import { saveConfigComprobante, getConfigComprobante } from '../../db/local-db.js';

export const COMPROBANTES_DEFECTO = [
  {
    id: 'FAC',
    tipo: 'FAC',
    prefijo: 'FAC',
    numero_inicial: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'system',
    updated_by: 'system',
    version: 1,
    status: 'active',
    sync_status: 'synced',
    idempotency_key: crypto.randomUUID(),
  },
  {
    id: 'REM',
    tipo: 'REM',
    prefijo: 'REM',
    numero_inicial: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'system',
    updated_by: 'system',
    version: 1,
    status: 'active',
    sync_status: 'synced',
    idempotency_key: crypto.randomUUID(),
  },
];

export async function seedConfigComprobantes() {
  for (const def of COMPROBANTES_DEFECTO) {
    const existing = await getConfigComprobante(def.tipo);
    if (!existing) {
      await saveConfigComprobante(def);
    }
  }
}

export async function getComprobanteConfig(tipo) {
  return getConfigComprobante(tipo);
}

export async function listComprobanteConfigs() {
  const [fac, rem] = await Promise.all([
    getConfigComprobante('FAC'),
    getConfigComprobante('REM'),
  ]);
  return [fac, rem].filter(Boolean);
}

export async function upsertComprobanteConfigStore(input) {
  const now = new Date().toISOString();
  const existing = await getConfigComprobante(input.tipo);
  const next = {
    ...(existing ?? {
      id: input.tipo,
      tipo: input.tipo,
      created_at: now,
      created_by: 'local-user',
      version: 0,
      status: 'active',
      sync_status: 'pending',
    }),
    id: input.tipo,
    tipo: input.tipo,
    prefijo: input.prefijo,
    numero_inicial: Number(input.numero_inicial),
    updated_at: now,
    updated_by: 'local-user',
    version: Number(existing?.version ?? 0) + 1,
    sync_status: 'pending',
    idempotency_key: `CFG_COMP:${input.tipo}:${input.prefijo}:${Number(input.numero_inicial)}`,
  };
  await saveConfigComprobante(next);
  return next;
}
