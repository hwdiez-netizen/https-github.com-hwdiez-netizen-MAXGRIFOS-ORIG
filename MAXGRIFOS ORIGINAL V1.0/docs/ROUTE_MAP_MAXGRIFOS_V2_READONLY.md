# ROUTE MAP MAXGRIFOS V2 — READ ONLY REFERENCE

ESTADO: REFERENCIA_SOLO_LECTURA
NO_ES_TAREA_ACTIVA
NO_AUTORIZA_EJECUCION_AUTOMATICA
LA_EJECUCION_SE_CONTROLA_SOLO_DESDE_PROMPT_XML_EN_CHAT
NO_EXISTE_CURRENT_TASK_MD_OPERATIVO_DENTRO_DEL_PROYECTO

BLUNT MODE:
ESTE DOCUMENTO NO SE INTERPRETA.
ESTE DOCUMENTO NO AUTORIZA IMPLEMENTAR.
ESTE DOCUMENTO NO AUTORIZA AVANZAR DE FASE.
EL AGENTE SOLO EJECUTA EL PROMPT XML ENTREGADO EN LA VENTANA DE CHAT.
SI EL PROMPT XML ACTIVO NO ORDENA UNA FASE, ESA FASE NO EXISTE PARA EJECUCIÓN.
PROHIBIDO INVENTAR FASES.
PROHIBIDO CREAR F13, F14, F15 O F16.
PROHIBIDO REORDENAR FASES.
PROHIBIDO RESUMIR ESTE ROADMAP COMO PLAN ALTERNO.
PROHIBIDO USAR ERP SAMPLE V1.0 COMO RUTA DE ESCRITURA.
PROHIBIDO MODIFICAR ERP SAMPLE V1.0.
PROHIBIDO MOVER ERP SAMPLE V1.0.
PROHIBIDO BORRAR ERP SAMPLE V1.0.
PROHIBIDO ARCHIVAR ERP SAMPLE V1.0.
PROHIBIDO RENOMBRAR ERP SAMPLE V1.0.
PROHIBIDO RETIRAR ERP SAMPLE V1.0.

REGLA MAESTRA:
ERP SAMPLE V1.0 se conserva como referencia SOLO LECTURA durante todo el proyecto.
El agente tiene prohibido escribir, modificar, mover, borrar, archivar, renombrar o retirar ERP SAMPLE V1.0.
En F12B, si F7–F12 están PASS, el agente solo puede generar un REPORTE_DE_RETIRO_RECOMENDADO o REPORTE_DE_NO_RETIRO.
La acción física de retiro, archivo, movimiento, renombrado o eliminación queda reservada exclusivamente al usuario humano.

REGLA OPERATIVA REAL:
LA ÚNICA TAREA ACTIVA ES EL PROMPT XML PEGADO EN LA VENTANA DE CHAT.
EL ROUTE MAP ES SOLO REFERENCIA DE LECTURA.
NO SE USA CURRENT_TASK.md COMO MECANISMO OPERATIVO EN ESTE FLUJO.
EL AGENTE NO DEBE CREAR CURRENT_TASK.md NI EXIGIRLO.

RUTA ACTIVA ÚNICA:
MAXGRIFOS ORIGINAL V1.0

RUTA DE CONSULTA SOLO LECTURA:
ERP SAMPLE V1.0

---

# Route Map — MAXGRIFOS V2 / Migración controlada desde proyecto sample

## F0 — Workspace & Core Definition

Objetivo:
Preparar el espacio limpio de MAXGRIFOS V2 y congelar la referencia V1/sample.

Qué se hace:
- Crear workspace activo: /MAXGRIFOS ORIGINAL V1.0
- Preservar ERP SAMPLE V1.0 como referencia de solo lectura.
- Crear/validar Constitución V2 concisa.
- Crear blueprint core.
- Crear roadmap maestro.
- Crear design system spec.
- Crear NIS spec.
- Crear seed data spec.
- Crear module registry.

Resultado esperado:
- Proyecto nuevo aislado.
- Proyecto sample intacto.
- Reglas base definidas.
- No se migra lógica todavía.

---

## F1 — Core Scaffold Implementation

Objetivo:
Construir el núcleo técnico base del nuevo sistema.

Qué se hace:
- App Shell base.
- Router base.
- Event Bus.
- Contracts Kernel.
- Handlers Kernel.
- End Joints Kernel.
- Store Guard.
- Local Store Kernel.
- Outbox Kernel.
- Sync Kernel stub.
- Audit Kernel.
- Module Registry.
- Backend Bridge stubs para Railway/PocketBase.

Resultado esperado:
- MAXGRIFOS V2 ya tiene columna vertebral.
- Todavía no se migran módulos reales.
- Railway/PocketBase quedan como stubs, no conectados.

---

## F2 — Testing & Seed Kernel

Objetivo:
Crear pruebas automáticas base y datos semilla deterministas.

Qué se hace:
- Crear test runner.
- Crear assert library.
- Crear tests core.
- Crear smoke tests.
- Crear seed data.
- Crear seed validator.
- Crear seed loader desactivado por defecto.
- Crear scripts npm:
  - test:core
  - test:seed
  - test:smoke

Datos semilla esperados:
- Productos.
- Clientes.
- Proveedores.
- Costos.
- Listas de precios.
- Stock inicial.
- Kardex inicial.
- Políticas comerciales.
- Pedidos demo.

Resultado esperado:
- Las validaciones humanas futuras no requieren cargar datos manualmente.
- La app puede mostrar productos/clientes/precios/stock/pedidos demo.
- Seed loader no debe activar datos productivos por defecto.

---

## F3 — Design System Neon Flex / Apple-like Minimal Premium

Objetivo:
Crear el lenguaje visual global, moderno, sobrio y mobile-first.

Qué se hace:
- Design tokens.
- Tipografía.
- Botones.
- Cards.
- Forms.
- Badges.
- Toasts.
- KPI components.
- Heatmaps.
- Empty/loading/sync states.
- Accessibility.
- Motion.
- UI primitives.

Reglas visuales:
- Fondo blanco dominante.
- Azul eléctrico controlado.
- Estética Apple-like minimal premium.
- No copiar literalmente el proyecto sample.
- No modo oscuro por defecto.
- Touch targets mínimo 44px.
- Sin textos técnicos visibles.

Resultado esperado:
- El sistema tiene identidad visual propia.
- Base estética lista para App Shell y módulos.

---

## F4 — App Shell + Home Menu + Preview 9:16

Objetivo:
Crear la primera interfaz visual revisable en formato smartphone.

Qué se hace:
- App Shell visual.
- Home dashboard.
- Header/status bar visual.
- Bottom navigation / dock.
- Cards de módulos.
- Preview 9:16.
- Hero/banner principal.
- Contadores demo desde seed data.
- Placeholder visual de módulos.

Reglas:
- Mobile-first real.
- Preview tipo smartphone 9:16.
- Home moderno, no igual al sample.
- Sin paneles técnicos.
- Sin texto “NIS fase”.
- Sin botones basura.

Resultado esperado:
- Ya existe algo visual para revisar.
- La app se siente como producto móvil moderno.

---

## F5 — NIS Global Hardening

Objetivo:
Endurecer la navegación global invisible y segura.

Qué se hace:
- Gesture Engine.
- touchstart / touchmove / touchend.
- Protección contra scroll vertical.
- Swipe derecha = volver visualmente.
- Swipe izquierda = avanzar visualmente si aplica.
- Double tap seguro no transaccional.
- Process Guard.
- Dirty state.
- Toast flotante de bloqueo.
- Eliminar window.history.back().
- Prohibir transacciones por swipe.
- Crear test:nis.

Reglas NIS:
- Swipe NO guarda.
- Swipe NO factura.
- Swipe NO mueve inventario.
- Swipe NO crea ledger.
- Swipe NO escribe Store.
- Swipe solo navega visualmente.

Resultado esperado:
- NIS queda como capa invisible global.
- Si hay proceso incompleto, no deja salir y muestra toast.
- F5 no migra módulos reales todavía.

---

## F6 — Module Entry Contracts Pilot

Objetivo:
Definir el patrón oficial para que cualquier módulo entre al nuevo sistema V2.

Qué se hace:
- module-entry-contract.js
- module-entry-handler.js
- module-entry-end-joint.js
- module-entry-pilot.js
- module-entry test.
- route /module-entry-pilot.
- integración con module-placeholder.

Patrón que debe quedar validado:
UI Intent → End Joint → Contract → Handler → Event Bus

Prohibido en F6:
- No migrar Productos.
- No migrar Scanner.
- No migrar Kardex.
- No migrar Pedidos.
- No migrar Facturación.
- No tocar módulos reales.
- No Store directo.
- No backend.
- No transacciones reales.

Resultado esperado:
- F6 define el molde para F7–F12.
- No se retira todavía el proyecto sample.

---

## F7 — Productos Core Migration

Objetivo:
Migrar la lógica crítica de Productos desde el proyecto sample hacia V2.

Qué se migra:
- Motor de codificación de productos.
- SKU Engine.
- Diccionarios/categorías/subcategorías/atributos.
- identity_key SKU.
- idempotency_key determinista.
- Generación Code128.
- Generación QR de producto.
- Contratos de producto.
- Handlers de producto.
- End joints de producto.
- Validación de unicidad SKU.
- Integración con seed data.

Reglas:
- No UUID como identidad funcional.
- No Date.now como identity/idempotency.
- UI no valida duplicidad.
- Duplicidad se bloquea en Contract/Store.
- UI no consulta Store directo.

Resultado esperado:
- Productos queda migrado como módulo core V2.
- SKU/Code128/QR generación quedan preservados y mejorados.

---

## F8 — Scanner & Code Reading Migration

Objetivo:
Migrar lectura de códigos y scanner.

Qué se migra:
- Lectura Code128.
- Lectura QR.
- Scanner Engine.
- BarcodeDetector si existe.
- Fallback WASM/Worker si aplica.
- Interpretación de payload.
- Rutas scanner → producto.
- Rutas scanner → pedido.
- Rutas scanner → compra.
- Rutas scanner → cliente si aplica.

Reglas:
- Scanner no escribe Store directo.
- Scanner solo produce intención.
- Handler interpreta.
- Contract valida.
- Store persiste si corresponde.
- Error de lectura no debe romper app.

Resultado esperado:
- El sistema puede leer Code128/QR de forma segura.
- El scanner queda integrado al patrón V2.

---

## F9 — Kardex Core Migration

Objetivo:
Migrar la lógica fuerte de inventario y movimientos atómicos.

Qué se migra:
- Kardex core.
- Movimientos de entrada.
- Movimientos de salida.
- Ledger de stock.
- Reglas de atomicidad.
- Idempotencia de movimientos.
- Prevención de duplicados.
- Relación producto → inventario → kardex.
- Historial de movimientos.

Reglas:
- Ningún movimiento por UI directa.
- Ningún movimiento por swipe.
- Todo movimiento debe pasar por Handler/Contract.
- Todo movimiento debe tener idempotency_key determinista.
- Reintento no duplica Kardex.

Resultado esperado:
- Kardex queda como verdad operacional de inventario.
- Stock y movimientos quedan trazables.

---

## F10 — Pedidos Core Migration

Objetivo:
Migrar la lógica de pedidos y su workflow.

Qué se migra:
- Pedido header.
- Pedido items.
- Estados del pedido.
- Validaciones de pedido.
- QR de pedido si aplica.
- Flujo pedido → picking.
- Flujo pedido → packing.
- Flujo pedido → facturación/remisión.
- Flujo pedido → despacho/POD si aplica.
- Eventos hacia inventario/kardex.

Reglas:
- Swipe no confirma pedido.
- Swipe no inicia picking.
- Swipe no completa packing.
- Swipe no factura.
- Swipe no despacha.
- UI no escribe Store.
- Saga de pedido debe ser idempotente.

Resultado esperado:
- Pedidos queda migrado con saga controlada.
- Se conserva la lógica heredada buena.
- Se elimina navegación técnica visible.

---

## F11 — Facturación Core Migration

Objetivo:
Migrar la lógica de facturación y su relación con pedidos/cartera/inventario.

Qué se migra:
- Creación de factura.
- Relación pedido → factura.
- Items facturados.
- Totales.
- Impuestos si aplica.
- Estados de factura.
- Comprobantes.
- QR/documento si aplica.
- Eventos contables o comerciales.

Reglas:
- No emitir factura por swipe.
- No afectar cartera por UI directa.
- No afectar inventario por UI directa.
- Facturación debe pasar por Handler/Contract.
- Idempotencia obligatoria.

Resultado esperado:
- Facturación queda conectada al core sin duplicar efectos.
- Pedido/factura/inventario mantienen consistencia.

---

## F12 — Auditoría + Inventario General Migration

Objetivo:
Migrar Auditoría e Inventario General, que son módulos críticos de control y trazabilidad.

Qué se migra:
- Auditoría.
- Inventario General.
- Conteo físico.
- Scanner dentro de inventario.
- Conciliación.
- Historial.
- Snapshot pre/post.
- Reportes internos.
- Trazabilidad.
- Validaciones cruzadas.
- Defect ledger.

Para Inventario General, debe quedar alineado con:
- Sesión en progreso.
- Retomar.
- Ignorar.
- Descartar.
- Conteo físico.
- Crear producto durante inventario.
- Conciliación.
- Cierre.
- Historial.

Reglas:
- No Clear Site Data.
- No reset DB.
- No borrar datos.
- No cierre falso.
- No Kardex duplicado.
- No conciliación por UI directa.
- No ajustes por swipe.

Resultado esperado:
- Auditoría queda como capa de trazabilidad.
- Inventario General queda como proceso enterprise.
- Módulos críticos de control quedan migrados.

---

## F12B — Reference Project Retirement Report Only

Objetivo:
Auditar si el proyecto sample ya puede ser retirado por decisión humana.

Condición obligatoria:
Solo evaluar si F7, F8, F9, F10, F11 y F12 están PASS.

Qué se hace:
- Auditar que el proyecto nuevo ya contiene:
  - Productos/SKU/Code128/QR generación.
  - Scanner/lectura Code128/QR.
  - Kardex.
  - Pedidos.
  - Facturación.
  - Auditoría.
  - Inventario General.
- Confirmar que no hay dependencias activas hacia ERP SAMPLE V1.0.
- Emitir REPORTE_DE_RETIRO_RECOMENDADO o REPORTE_DE_NO_RETIRO.

Prohibido:
- Prohibido mover ERP SAMPLE V1.0.
- Prohibido borrar ERP SAMPLE V1.0.
- Prohibido archivar ERP SAMPLE V1.0.
- Prohibido renombrar ERP SAMPLE V1.0.
- Prohibido modificar ERP SAMPLE V1.0.
- Prohibido retirar ERP SAMPLE V1.0.

Resultado esperado:
- El usuario humano recibe evidencia para decidir.
- El agente no ejecuta ninguna acción física sobre ERP SAMPLE V1.0.

---

# Resumen ejecutivo por fase

F0  Definir workspace y reglas.
F1  Crear Core Scaffold.
F2  Crear Testing + Seed Kernel.
F3  Crear Design System.
F4  Crear App Shell/Home/Preview 9:16.
F5  Endurecer NIS global.
F6  Crear patrón piloto de entrada a módulos.
F7  Migrar Productos + SKU + Code128 + QR generación.
F8  Migrar Scanner + lectura Code128/QR.
F9  Migrar Kardex.
F10 Migrar Pedidos.
F11 Migrar Facturación.
F12 Migrar Auditoría + Inventario General.
F12B Auditar y emitir reporte de retiro recomendado/no recomendado. El usuario humano decide y ejecuta cualquier acción física sobre ERP SAMPLE V1.0.

---

# Regla final corregida

ERP SAMPLE V1.0 se conserva como referencia SOLO LECTURA durante todo el proyecto.
El agente nunca puede mover, borrar, archivar, renombrar, modificar ni retirar ERP SAMPLE V1.0.
En F12B el agente solo puede reportar si recomienda o no recomienda el retiro.
La acción física queda reservada exclusivamente al usuario humano.

---

# HALLUCINATION TRAP — HARD MODE

SI_EL_AGENTE_AGREGA_F13_F14_F15_F16 -> FAIL
SI_EL_AGENTE_REORDENA_FASES -> FAIL
SI_EL_AGENTE_CAMBIA_F6_A_STORE_LOCAL_OUTBOX_SYNC -> FAIL
SI_EL_AGENTE_CAMBIA_F7_A_SEED_DATA -> FAIL
SI_EL_AGENTE_CAMBIA_F8_A_PORT_GENERAL_DE_MOTORES -> FAIL
SI_EL_AGENTE_CONVIERTE_F9_F15_EN_BLOQUE_GENERICO -> FAIL
SI_EL_AGENTE_EJECUTA_F7_SIN_PROMPT_XML_EXPLICITO_EN_CHAT -> FAIL
SI_EL_AGENTE_TRATA_ESTE_DOCUMENTO_COMO_ORDEN_DE_EJECUCION -> FAIL
SI_EL_AGENTE_EXIGE_CURRENT_TASK_MD_DENTRO_DEL_PROYECTO -> FAIL
SI_EL_AGENTE_CREA_CURRENT_TASK_MD_SIN_ORDEN_EXPLICITA -> FAIL
SI_EL_AGENTE_MODIFICA_ERP_SAMPLE_V1_0 -> FAIL_CRITICO
SI_EL_AGENTE_ESCRIBE_EN_ERP_SAMPLE_V1_0 -> FAIL_CRITICO
SI_EL_AGENTE_MUEVE_ERP_SAMPLE_V1_0 -> FAIL_CRITICO
SI_EL_AGENTE_BORRA_ERP_SAMPLE_V1_0 -> FAIL_CRITICO
SI_EL_AGENTE_ARCHIVA_ERP_SAMPLE_V1_0 -> FAIL_CRITICO
SI_EL_AGENTE_RENOMBRA_ERP_SAMPLE_V1_0 -> FAIL_CRITICO
SI_EL_AGENTE_RETIRA_ERP_SAMPLE_V1_0 -> FAIL_CRITICO
SI_EL_AGENTE_EJECUTA_F12B_SIN_PROMPT_XML_EXPLICITO_EN_CHAT -> FAIL_CRITICO
SI_EL_AGENTE_EN_F12B_HACE_ALGO_DISTINTO_A_REPORTAR -> FAIL_CRITICO
SI_EL_AGENTE_INVENTA_RUTAS -> FAIL
SI_EL_AGENTE_RESPONDE_CON_PLAN_ALTERNO -> FAIL
SI_EL_AGENTE_RESPONDE_CON_EXPLICACIONES_LARGAS_NO_PEDIDAS -> FAIL

RESPUESTA_PERMITIDA_DEL_AGENTE_CUANDO_SE_LE_PREGUNTE:
- SI
- NO
- PASS
- FAIL
- NO_APLICA
- BLOQUEADO
- EVIDENCIA: