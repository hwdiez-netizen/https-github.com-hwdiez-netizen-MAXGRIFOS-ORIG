# F11B_FACTURACION_UI_HANDLER_REFACTOR_REPORT

## Fase
F11B - UI Facturación / Remisiones Handler Refactor STATIC CLOUD

## Archivos Tocados
- `src/modules/facturacion/comprobantes-handlers.js` (añadido `handleGetDocumentos`)
- `src/modules/facturacion/facturacion-form.js` (refactor a `handleGetComprobantesConfig` y `handleSaveComprobanteConfig`)
- `src/modules/facturacion/factura-list.js` (eliminados imports a `factura-store.js` y `local-db.js`, usa `handleGetDocumentos`)
- `src/modules/facturacion/pdf-generator.js` (refactor a `handleRegistrarReimpresion`)
- `scripts/validate-facturacion-f11b.mjs` (nuevo validador creado)

## Resumen de Correcciones
- La UI ahora usa exclusivamente el archivo `comprobantes-handlers.js` como punto de entrada para lecturas y escrituras documentales.
- Eliminados los imports directos de los stores (`config-store.js` y `factura-store.js`) y base de datos locales (`local-db.js`) en la UI.
- `pdf-generator.js` ahora utiliza el manejador de reimpresión para no escribir directamente en la base de datos.
- Archivos excluidos y estrictamente mantenidos como estaban:
  - `src/modules/facturacion/factura-store.js` (no tocado).
  - `src/modules/facturacion/config-store.js` (no tocado).
  - Kardex, Pedidos y ERP SAMPLE no han sido modificados.
  - La raíz duplicada no operativa y los archivos ZIP de cuarentena permanecen intactos.

## Puntos Pendientes
- `node scripts/validate-facturacion-f11b.mjs`: PENDIENTE_LOCAL
- `node scripts/validate-facturacion-f11a.mjs`: PENDIENTE_LOCAL
- `npm run build`: PENDIENTE_LOCAL
- Servidor `localhost:5173` y LAN: PENDIENTE_LOCAL
- Evaluaciones funcionales vía UI en tiempo real: PENDIENTE_LOCAL 
- Deploy Vercel: NO EFECTUADO.

## F11B_FACTURA_LIST_LEGACY_ITEMS_RUNTIME_REPAIR
- Error corregido: `legacyItems` indefinido en `factura-list.js`.
- Causa: Se eliminó `getPedidoItems`/`local-db.js` directo pero quedó una referencia residual en la lógica de documentos legacy.
- Corrección: Documentos legacy sin `items_snapshot` ahora retornan `[]` con un `console.warn` controlado para evitar el acceso directo a `local-db.js`.
- Error corregido: Typo `getDocumentos()` corregido a `handleGetDocumentos()` en la lógica de recarga de eventos.
- No se reintrodujo `local-db.js`.
- No se reintrodujo `factura-store.js` directo.
- No se tocó el core de Facturación, Kardex o Pedidos.
- Validator F11B fortalecido para detectar `legacyItems`.
