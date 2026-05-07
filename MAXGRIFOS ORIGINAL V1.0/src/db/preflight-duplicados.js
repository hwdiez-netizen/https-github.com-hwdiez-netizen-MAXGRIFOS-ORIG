import { getAllProducts, getAllClientes } from './local-db.js';

export async function reporteDuplicados() {
  const [products, clientes] = await Promise.all([getAllProducts(), getAllClientes()]);

  const skuMap = {};
  for (const p of products) {
    if (!p.sku) continue;
    if (!skuMap[p.sku]) skuMap[p.sku] = [];
    skuMap[p.sku].push({ id: p.id, nombre: p.nombre ?? p.sku });
  }
  const dupSKU = Object.entries(skuMap)
    .filter(([, ids]) => ids.length > 1)
    .map(([sku, registros]) => ({ sku, registros, count: registros.length }));

  const cedulaMap = {};
  const nitMap = {};
  for (const c of clientes) {
    if (c.cedula) {
      if (!cedulaMap[c.cedula]) cedulaMap[c.cedula] = [];
      cedulaMap[c.cedula].push({ id: c.id, razon_social: c.razon_social });
    }
    if (c.nit) {
      if (!nitMap[c.nit]) nitMap[c.nit] = [];
      nitMap[c.nit].push({ id: c.id, razon_social: c.razon_social });
    }
  }
  const dupCedula = Object.entries(cedulaMap)
    .filter(([, rs]) => rs.length > 1)
    .map(([cedula, registros]) => ({ cedula, registros, count: registros.length }));
  const dupNit = Object.entries(nitMap)
    .filter(([, rs]) => rs.length > 1)
    .map(([nit, registros]) => ({ nit, registros, count: registros.length }));

  const tieneDuplicados = dupSKU.length > 0 || dupCedula.length > 0 || dupNit.length > 0;

  if (tieneDuplicados) {
    console.error('[PREFLIGHT MDM] ⚠️ Duplicados detectados:', { dupSKU, dupCedula, dupNit });
  }

  return {
    timestamp: new Date().toISOString(),
    duplicados_sku: dupSKU,
    duplicados_cedula: dupCedula,
    duplicados_nit: dupNit,
    tiene_duplicados: tieneDuplicados,
  };
}
