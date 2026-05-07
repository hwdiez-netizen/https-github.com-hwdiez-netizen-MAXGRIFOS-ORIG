const TAB_VALIDOS = ['active', 'inactive'];

export function validateProductListQuery(params = {}) {
  const tab = params.tab ?? 'active';
  const query = params.query ?? '';

  if (!TAB_VALIDOS.includes(tab)) {
    throw new Error(`[ProductContracts] tab inválido: '${tab}'. Valores válidos: ${TAB_VALIDOS.join(', ')}`);
  }
  if (typeof query !== 'string') {
    throw new Error('[ProductContracts] query debe ser string');
  }
}

export function validateProductSave(data) {
  if (!data) throw new Error('[ProductContracts] data es requerido para guardar producto');
  if (data.sku && typeof data.sku !== 'string') throw new Error('[ProductContracts] sku inválido');
  if (data.nombre && typeof data.nombre !== 'string') throw new Error('[ProductContracts] nombre inválido');
}

export function validateProductId(id) {
  if (id === null || id === undefined || String(id).trim() === '') {
    throw new Error('[ProductContracts] product id requerido');
  }
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new Error('[ProductContracts] product id inválido');
  }
}

