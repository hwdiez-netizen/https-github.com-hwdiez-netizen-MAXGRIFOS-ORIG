
import { generateSKU } from './src/modules/maestro-productos/sku-engine.js';
import { SEED_DATA } from './src/mock/maxgrifos-seed-data.js';

const mapping = {};
SEED_DATA.products.forEach((p, i) => {
  const official = generateSKU(p.nombre, p.ref_proveedor);
  console.log(`Product ${i}: "${p.nombre}" -> SKU: ${official.sku}`);
});
