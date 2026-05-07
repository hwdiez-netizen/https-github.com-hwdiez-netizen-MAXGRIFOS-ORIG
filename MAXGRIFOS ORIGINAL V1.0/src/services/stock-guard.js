// Cross-domain stock validation service.
// Kardex module registers its implementation at startup; Product module calls the interface.
// This decouples Producto from Kardex without requiring event round-trips for read queries.
let _impl = null;

export function registerStockGuardImpl(fn) {
  _impl = fn;
}

// Returns the number of units reserved in transit (BODEGA_PEDIDOS) for the given product.
// Returns 0 if no implementation is registered (safe default — no false blocks).
export async function getReservedStock(productId) {
  if (!_impl) {
    console.warn('[StockGuard] No implementation registered. Call registerStockGuardImpl first.');
    return 0;
  }
  return _impl(productId);
}
