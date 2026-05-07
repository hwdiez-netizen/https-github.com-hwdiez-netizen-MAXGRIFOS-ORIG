# MAXGRIFOS V2 SEED DATA SPEC

## Ubicación Propuesta
`src/mock/maxgrifos-seed-data.js`

## Requerimientos Técnicos
- **Determinismo**: Los IDs e identidades deben ser fijos. No usar `Math.random()`.
- **Identity Key**: Cada objeto debe tener una clave única natural.
- **Idempotencia**: Al recargar los datos, no deben crearse duplicados.
- **Flag de Activación**: Solo cargable si `process.env.VITE_LOAD_SEED_DATA === 'true'`.

## Entidades Cubiertas
- Productos (con SKU, EAN13, Precios).
- Clientes (Segmentados).
- Proveedores.
- Stock Inicial.
- Kardex Histórico Base.
- Transacciones de muestra (Ventas, Compras).
