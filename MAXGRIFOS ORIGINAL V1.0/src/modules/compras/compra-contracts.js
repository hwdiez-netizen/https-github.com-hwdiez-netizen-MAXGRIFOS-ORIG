import { getAllCompras, getAllProveedores } from '../../db/local-db.js';

// ── Idempotency keys ─────────────────────────────────────────────────────────
export function buildProveedorKey(nit) {
  if (!nit) throw new Error('NIT requerido para idempotency_key.');
  return `PROV:${nit}`;
}

export function buildCompraKey(consecutivo) {
  if (!consecutivo) throw new Error('Número de orden requerido para idempotency_key.');
  return `COMPRA:${consecutivo}`;
}

export function buildCompraItemKey(compraId, productId) {
  if (!compraId || !productId) throw new Error('compra_id y product_id requeridos.');
  return `OCI:${compraId}:${productId}`;
}

// ── End Joints ────────────────────────────────────────────────────────────────
export async function ensureNITUnico(nit, excludeId = null) {
  const todos = await getAllProveedores();
  const dup = todos.find((p) => p.nit === nit && p.id !== excludeId);
  if (dup) throw new Error(`🔴 NIT ${nit} ya registrado. No se permiten duplicados.`);
}

export async function ensureOrdenUnica(consecutivo, excludeId = null) {
  const todas = await getAllCompras();
  const dup = todas.find((c) => c.consecutivo === consecutivo && c.id !== excludeId);
  if (dup) throw new Error(`🔴 Orden ${consecutivo} ya existe. No se permiten duplicados.`);
}

// ── Command validators ────────────────────────────────────────────────────────
export function validateCrearProveedor({ razon_social, nit }) {
  if (!razon_social?.trim()) throw new Error('Razón Social es obligatoria.');
  if (!nit?.trim())          throw new Error('NIT es obligatorio.');
}

export function validateActualizarProveedor({ razon_social }) {
  if (!razon_social?.trim()) throw new Error('Razón Social es obligatoria.');
}

export function validateCrearCompra(proveedorId, items) {
  if (!proveedorId) throw new Error('Selecciona un proveedor.');
  if (!Array.isArray(items) || items.length === 0)
    throw new Error('Agrega al menos un ítem.');
  for (const it of items) {
    if (!it.product_id)                      throw new Error('Cada ítem debe tener product_id.');
    if ((Number(it.cantidad) || 0) <= 0)     throw new Error('Cantidad debe ser mayor a cero.');
    if ((Number(it.costo_unitario) || 0) <= 0)
      throw new Error(`Ítem "${it.descripcion ?? it.product_id}" necesita costo unitario.`);
  }
}

export function validateRecepcionarCompra(compra, factura = '') {
  if (!compra)                       throw new Error('Compra no encontrada.');
  if (compra.estado === 'recibida')  throw new Error('La orden ya fue recepcionada.');
  if (!factura?.trim())              throw new Error('El número de factura del proveedor es obligatorio.');
}
