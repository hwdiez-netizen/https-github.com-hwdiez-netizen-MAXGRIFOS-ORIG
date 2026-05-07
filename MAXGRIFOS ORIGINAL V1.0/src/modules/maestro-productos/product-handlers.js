import { validateProductListQuery, validateProductSave, validateProductId } from './product-contracts.js';
import { queryProductosList } from './product-query.js';
import {
  skuExists,
  createProduct,
  updateProduct,
  deactivateProduct,
  activateProduct,
  deleteProduct
} from './product-store.js';

export async function handleQueryProductosList(params = {}) {
  validateProductListQuery(params);
  return queryProductosList(params);
}

export async function handleCheckSkuAvailability(sku, excludeId = null) {
  if (!sku) return false;
  return skuExists(sku, excludeId);
}

export async function handleCreateProduct(data) {
  validateProductSave(data);
  return createProduct(data);
}

export async function handleUpdateProduct(id, data, options = {}) {
  validateProductId(id);
  validateProductSave(data);
  return updateProduct(id, data, options);
}

export async function handleDeactivateProduct(id) {
  validateProductId(id);
  return deactivateProduct(id);
}

export async function handleActivateProduct(id) {
  validateProductId(id);
  return activateProduct(id);
}

export async function handleDeleteProduct(id) {
  validateProductId(id);
  return deleteProduct(id);
}

