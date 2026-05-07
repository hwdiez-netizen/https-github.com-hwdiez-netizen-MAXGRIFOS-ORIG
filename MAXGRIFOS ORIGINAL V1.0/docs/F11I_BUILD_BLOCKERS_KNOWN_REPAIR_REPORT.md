# F11I_BUILD_BLOCKERS_KNOWN_REPAIR_REPORT

Fase: F11I_BUILD_BLOCKERS_KNOWN_REPAIR

## Bloqueos Corregidos
- **factura-store.js**: Import incorrecto del `runtimeGuard` localizado en `../../observability/runtime-guard.js`, ajustado a la ruta correcta `../observability/runtime-guard.js`.
- **config-store.js**: Eliminada la dependencia inexistente `getDB` de `local-db.js`. El archivo fue reescrito para utilizar funciones puras exportadas de `local-db.js` (`saveConfigComprobante`, `getConfigComprobanteDB`) y usar claves de idempotencia deterministas (`CONFIG_COMPROBANTE:${id}`) eliminando así llamadas impuras e incorrectas.
- **pedido-handlers.js**: Imports incorrectos y dependencias cruzadas reparadas. Eliminados imports de `getProductos` (no existe) y `getDocumentos`, reemplazados por los imports correctos `getProducts` y directos desde la base de datos `getDocumentoByPedido`.

## Archivos Tocados
- `MAXGRIFOS ORIGINAL V1.0/src/modules/facturacion/factura-store.js`
- `MAXGRIFOS ORIGINAL V1.0/src/modules/facturacion/config-store.js`
- `MAXGRIFOS ORIGINAL V1.0/src/modules/pedidos/handlers/pedido-handlers.js`
- `MAXGRIFOS ORIGINAL V1.0/docs/F11I_BUILD_BLOCKERS_KNOWN_REPAIR_REPORT.md`
- `MAXGRIFOS ORIGINAL V1.0/AUDIT_LEDGER.md`

## Archivos No Tocados
- `index.html`
- `src/main.js`
- `src/core/**`
- `src/modules/facturacion/factura-list.js`
- `src/modules/facturacion/facturacion-form.js`
- `src/modules/facturacion/comprobantes-handlers.js`
- `src/modules/pedidos/pedido-form.js`
- `src/modules/pedidos/pedido-detail.js`
- `src/modules/pedidos/pedido-store.js`
- `src/modules/pedidos/pedido-contracts.js`
- `src/modules/kardex/**`
- `src/db/local-db.js`
- `src/events/**`
- `scripts/**`
- `public/**`
- `dist/**`

- Build pendiente local: SÍ
- Deploy Vercel: NO

[RESULTADO]: PASS_ESTATICO
