import { getAllProducts, getMovimientosByProduct } from '../../db/local-db.js';
import { getSaldoByProduct } from '../kardex/kardex-store.js';
import { BODEGA_CENTRAL_ID } from '../kardex/bodega-store.js';

function _getCostoVigente(movimientos, product) {
  const entradaCompra = [...movimientos]
    .filter((m) => m.tipo === 'ENTRADA_COMPRA' && Number(m.costo_unitario) > 0)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
  return Number(entradaCompra?.costo_unitario ?? product.costo ?? 0);
}

export async function queryProductosList(params = {}) {
  const tab = params.tab ?? 'active';
  const query = String(params.query ?? '').trim().toLowerCase();

  const all = await getAllProducts();
  const enriched = await Promise.all(all.map(async (p) => {
    const movimientos = await getMovimientosByProduct(p.id);
    const stockDisponibleReal = await getSaldoByProduct(p.id, BODEGA_CENTRAL_ID);
    const costoVigenteReal = _getCostoVigente(movimientos, p);
    return {
      ...p,
      stock_disponible_real: Number(stockDisponibleReal ?? 0),
      costo_vigente_real: Number(costoVigenteReal ?? 0),
    };
  }));

  const byTab = enriched.filter((p) => p.status === tab);
  const filtered = query
    ? byTab.filter((p) =>
      (p.nombre ?? '').toLowerCase().includes(query)
      || (p.sku ?? '').toLowerCase().includes(query)
      || (p.ref_proveedor ?? '').toLowerCase().includes(query))
    : byTab;

  const activeCount = enriched.filter((p) => p.status === 'active').length;
  const inactiveCount = enriched.filter((p) => p.status === 'inactive').length;

  return {
    items: filtered,
    active_count: activeCount,
    inactive_count: inactiveCount,
  };
}

