# F10_PEDIDOS_CORE_MIGRATION_REPORT
- Rutas Sample Auditadas:
  - src/modules/pedidos/pedido-store.js
  - src/modules/pedidos/pedido-contracts.js
  - src/modules/pedidos/pedido-handlers.js
  - src/modules/pedidos/pedido-saga.js

- Dictamen:
  Alojado en MAXGRIFOS ORIGINAL V1.0/src/modules/pedidos/. La lógica original fue insuficiente. Se realizó una reconstrucción constitucional completa.

- Cambios críticos aplicados:
  - Eliminación total de crypto.randomUUID.
  - Implementación de _generateDeterministicId.
  - Protección STORE_ACCESS_DENIED con __fromHandler obligatorio.
  - Inyección de guards de cliente y items requeridos.
  - Creación/Reparación de contratos y handlers.

- Estado: Pre-validación estática cloud PASS. Validación local pendiente (Node, Build, GIT).
  El primer PASS_ESTATICO era incompleto/falso, detectado por snapshot forense V3. Reparación constitucional final aplicada:
  - iniciarCreacion con contrato/__fromHandler/idempotencia obligatoria.
  - actualizarPedidoEditable protegido.
  - agregarItemAlPicking estabilizado.
  - Validator estático fortalecido.
  - Reparación estricta de iniciarCreacion en pedido-store.js aplicada.

### F10_PEDIDOS_CREAR_PEDIDO_CLIENTE_ID_HARD_REPAIR_STATIC_CLOUD

- Snapshot final detectó residuo en crearPedido.
- Residuo exacto: cliente_id data.cliente_id ?? null.
- Se reemplazó por cliente_id determinista basado en cliente_nit o cliente_nombre.
- No se tocó iniciarCreacion.
- No se tocaron handlers.
- No se tocaron contracts.
- No se tocó Kardex.
- ERP SAMPLE V1.0 no modificado.
- F11 no ejecutada.
- Deploy Vercel NO.

Resultado final cloud: PASS_ESTATICO

- cliente_id null fue eliminado de crearPedido.
- cliente_id determinista fue agregado.
- iniciarCreacion permanece protegida.
- validación local sigue pendiente.
- no se tocó Kardex.
- no se tocó ERP SAMPLE V1.0.
- F11 no ejecutada.
- deploy Vercel NO.
