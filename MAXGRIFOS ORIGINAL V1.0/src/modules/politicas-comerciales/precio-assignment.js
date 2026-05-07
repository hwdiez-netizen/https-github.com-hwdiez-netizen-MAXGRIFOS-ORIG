import { getPrecioItemsByProduct } from '../../db/local-db.js';
import {
  getListaActivaPorFormaPago, normalizeFormaPago, getAllListasPrecios,
} from './lista-precios-store.js';

export { normalizeFormaPago };

export function mapFormaPagoToTipoCliente(formaPago) {
  return normalizeFormaPago(formaPago) || null;
}

async function resolveListaActiva(formaPago) {
  if (!formaPago) return null;
  return getListaActivaPorFormaPago(formaPago);
}

export async function getPrecioParaProducto(productId, formaPago) {
  const lista = await resolveListaActiva(formaPago);
  if (!lista) return null;
  const allItems = await getPrecioItemsByProduct(productId);
  const item = allItems.find((i) => i.lista_id === lista.id && i.status === 'active');
  return item ? item.precio_venta : null;
}

export async function getPrecioConOrigen(productId, formaPago) {
  const lista = await resolveListaActiva(formaPago);
  if (!lista) return null;
  const allItems = await getPrecioItemsByProduct(productId);
  const item = allItems.find((i) => i.lista_id === lista.id && i.status === 'active');
  if (!item) return null;
  return {
    precio: item.precio_venta,
    lista_id: lista.id,
    lista_nombre: lista.nombre ?? null,
    tipo_cliente: normalizeFormaPago(formaPago),
  };
}

export async function getPreciosPorProducto(productId) {
  const result = {};
  const allItems = await getPrecioItemsByProduct(productId);
  for (const item of allItems.filter((i) => i.status === 'active')) {
    result[item.lista_id] = item.precio_venta;
  }
  return result;
}

export async function enrichItemsConPrecios(items, formaPago) {
  const lista = await resolveListaActiva(formaPago);
  if (!lista) return items;
  return Promise.all(
    items.map(async (item) => {
      const precio = await getPrecioParaProducto(item.product_id, formaPago);
      return { ...item, precio_lista: precio ?? item.precio_unitario ?? 0 };
    })
  );
}

// Devuelve 'activa' | 'inactiva' | 'no_existe'
export async function getListaStatusParaFormaPago(formaPago) {
  if (!formaPago) return 'no_existe';
  const normalized = normalizeFormaPago(formaPago);
  const all = await getAllListasPrecios();
  const matching = all.filter(
    (l) => normalizeFormaPago(l.forma_pago ?? l.tipo_cliente) === normalized
      && l.estado_proceso !== 'cancelada'
  );
  if (matching.length === 0) return 'no_existe';
  if (matching.some((l) => l.estado_proceso === 'activa')) return 'activa';
  return 'inactiva';
}
