import { validateVentasResumenQuery } from './ventas-contracts.js';
import { queryVentasResumen } from './ventas-query.js';

export async function handleQueryVentasResumen(params = {}) {
  validateVentasResumenQuery(params);
  return queryVentasResumen(params);
}
