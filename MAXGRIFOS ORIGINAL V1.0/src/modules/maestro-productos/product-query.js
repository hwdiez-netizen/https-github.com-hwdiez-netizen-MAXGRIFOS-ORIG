import { getAllProducts, getMovimientosByProduct } from '../../db/local-db.js';
import { getSaldoByProduct } from '../kardex/kardex-store.js';
import { BODEGA_CENTRAL_ID } from '../kardex/bodega-store.js';
import { seedLoader } from '../../core/seed/seed-loader.js';
import { generateSKU } from './sku-engine.js';

function _getCostoVigente(movimientos, product) {
  const entradaCompra = [...movimientos]
    .filter((m) => m.tipo === 'ENTRADA_COMPRA' && Number(m.costo_unitario) > 0)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
  return Number(entradaCompra?.costo_unitario ?? product.costo ?? 0);
}

export async function queryProductosList(params = {}) {
  const tab = params.tab ?? 'active';
  const query = String(params.query ?? '').trim().toLowerCase();

  const allFromDb = await getAllProducts();
  const all = [...allFromDb];

  // HYDRATE FROM SEED IF ENABLED
  const seedData = await seedLoader.load();
  if (seedData && Array.isArray(seedData.products)) {
    const dbSkus = new Set(all.map(p => p.sku).filter(Boolean));
    const dbIdentityKeys = new Set(all.map(p => p.identity_key).filter(Boolean));
    
    for (const seedProduct of seedData.products) {
      const nombre = seedProduct.nombre || seedProduct.name;
      const ref_proveedor = seedProduct.ref_proveedor || '';
      
      // Motor oficial para campos derivados (V5 SKU Compliance)
      const official = generateSKU(nombre, ref_proveedor);
      const generatedId = `PROD:${official.sku}`;

      if (!dbSkus.has(official.sku) && !dbIdentityKeys.has(generatedId)) {
        all.push({
          ...seedProduct,
          id: generatedId,
          identity_key: generatedId,
          idempotency_key: `SEED:PROD:${official.sku}`,
          nombre,
          ref_proveedor,
          uom: seedProduct.uom || seedProduct.unit,
          status: seedProduct.status ? seedProduct.status.toLowerCase() : 'active',
          sku: official.sku,
          code128: official.sku,
          categoria: official.cat,
          subcategoria: official.sub,
          atributo: official.atr,
          costo: seedProduct.costo || seedProduct.cost
        });
      }
    }
  }

  const enriched = await Promise.all(all.map(async (p) => {
    // RUNTIME NORMALIZATION: Ensure legacy or incomplete products have SKU/Metadata
    if ((!p.sku || p.sku === '—') && p.nombre) {
      const engine = generateSKU(p.nombre, p.ref_proveedor || '');
      p.sku = engine.sku;
      p.categoria = engine.cat;
      p.subcategoria = engine.sub;
      p.atributo = engine.atr;
    }

    const movimientos = await getMovimientosByProduct(p.id);
    const stockDisponibleReal = await getSaldoByProduct(p.id, BODEGA_CENTRAL_ID);
    const costoVigenteReal = _getCostoVigente(movimientos, p);
    return {
      ...p,
      stock_disponible_real: Number(p.stock_disponible_real ?? stockDisponibleReal ?? 0),
      costo_vigente_real: Number(p.costo_vigente_real ?? costoVigenteReal ?? 0),
    };
  }));

  const byTab = enriched.filter((p) => (p.status || 'active') === tab);
  const filtered = query
    ? byTab.filter((p) =>
      (p.nombre ?? '').toLowerCase().includes(query)
      || (p.sku ?? '').toLowerCase().includes(query)
      || (p.ref_proveedor ?? '').toLowerCase().includes(query))
    : byTab;

  const activeCount = enriched.filter((p) => (p.status || 'active') === 'active').length;
  const inactiveCount = enriched.filter((p) => p.status === 'inactive').length;

  return {
    items: filtered,
    active_count: activeCount,
    inactive_count: inactiveCount,
  };
}

