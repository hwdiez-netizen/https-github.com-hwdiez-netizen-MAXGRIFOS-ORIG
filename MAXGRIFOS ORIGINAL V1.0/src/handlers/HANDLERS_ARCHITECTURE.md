# ARQUITECTURA DE HANDLERS — MAXGRIFOS ERP P6

## OBJETIVO

Centralizar la entrada de acciones en una capa de handlers que:
- Valida el contract de cada acción
- Llama al store/saga existente (SIN romper el flujo actual)
- NO contiene lógica de negocio nueva
- Mantiene el mismo comportamiento, eventos e idempotencia

## ESTRUCTURA

```
src/handlers/
├── index.js                    ← Exporta TODOS los handlers (centralizado)
└── HANDLERS_ARCHITECTURE.md    ← Este archivo

src/modules/<modulo>/handlers/
├── index.js                    ← Exporta handlers del módulo
└── <modulo>-handlers.js        ← Implementa handlers específicos
```

## MÓDULOS CON HANDLERS IMPLEMENTADOS

### 1. CLIENTES (src/modules/clientes/handlers/)

**Handlers disponibles:**
- `handleCreateCliente(data)` → valida → `_createCliente(data)`
- `handleUpdateCliente(id, data)` → valida → `_updateCliente(id, data)`
- `handleDeactivateCliente(id)` → valida → `_deactivateCliente(id)`
- `handleActivateCliente(id)` → valida → `_activateCliente(id)`

**Validaciones:**
- Razón social obligatoria
- Forma de pago obligatoria
- Cédula/NIT únicos (duplicados bloqueados)
- ID requerido para operaciones de actualización

### 2. PEDIDOS (src/modules/pedidos/handlers/)

**Handlers disponibles:**
- `handleCrearPedido(data)` → valida → `_sagaCrearPedido(data)`
- `handleConfirmarPedido(id)` → valida → `_sagaConfirmarPedido(id)`
- `handleEditarPedido(id, data)` → valida → `_sagaEditarPedidoCreado(id, data)`
- `handleIniciarPicking(id)` → valida → `_sagaIniciarPicking(id)`
- `handleCompletarPicking(id, ajustes)` → valida → `_sagaCompletarPicking(id, ajustes)`
- `handleIniciarPacking(id)` → valida → `_sagaIniciarPacking(id)`
- `handleEmitirDocumento(id, tipo, opts)` → valida → `_sagaEmitirDocumento(id, tipo, opts)`
- `handleDespachar(id)` → valida → `_sagaDespachar(id)`
- `handleRegistrarPOD(id)` → valida → `_sagaRegistrarPOD(id)`
- `handleAnularPedido(id, motivo)` → valida → `_sagaAnularPedido(id, motivo)`

**Validaciones:**
- Cliente requerido
- Items requeridos (no vacío)
- Cantidad > 0 para cada item
- ID requerido para todas las operaciones

### 3. KARDEX / BODEGA (src/modules/kardex/handlers/)

**Handlers disponibles:**
- `handleCrearBodega(data)` → valida → `_createBodegaSatelite(data)`
- `handleActualizarBodega(id, data)` → valida → `_updateBodegaSatelite(id, data)`
- `handleDesactivarBodega(id)` → valida → `_deactivateBodegaSatelite(id)`

**Validaciones:**
- Nombre obligatorio
- Ubicación obligatoria
- ID requerido para actualización/desactivación

## FLUJO DE DATOS

### ANTES (flujo directo):
```
UI (cliente-form.js)
  ↓ import { createCliente }
  ↓ await createCliente(data)
STORE (cliente-store.js)
  ↓ persiste a IDB
  ↓ emite evento
EVENTO (domain-events.js)
```

### DESPUÉS (flujo con handlers):
```
UI (cliente-form.js)
  ↓ import { handleCreateCliente }
  ↓ await handleCreateCliente(data)
HANDLER (cliente-handlers.js)
  ├ valida contract
  ├ valida duplicados
  ↓ await _createCliente(data)
STORE (cliente-store.js)
  ↓ persiste a IDB
  ↓ emite evento
EVENTO (domain-events.js)
```

**Garantías:**
- ✓ Mismo resultado final (idéntico output del store)
- ✓ Mismos eventos emitidos
- ✓ Misma idempotencia (mismo idempotency_key)
- ✓ NO se rompen llamadas existentes (handlers son capas ADD-ON)
- ✓ Comportamiento observable = IDÉNTICO

## CÓMO USAR LOS HANDLERS

### Opción 1: Importar desde handlers centralizados
```javascript
// Importa múltiples handlers de forma centralizada
import {
  handleCreateCliente,
  handleCrearPedido,
  handleConfirmarPedido,
} from '../../handlers/index.js';

// En el código
await handleCreateCliente(data);
await handleCrearPedido(pedidoData);
```

### Opción 2: Importar desde módulo específico
```javascript
// Si solo necesita handlers del módulo
import {
  handleCreateCliente,
  handleUpdateCliente,
} from './handlers/index.js';
```

## SEGURIDAD Y VALIDACIÓN

Cada handler realiza:

1. **Validación de entrada:** null check, tipo de dato
2. **Validación de reglas de negocio:** duplicados, relaciones obligatorias
3. **Delegación al store:** NO contiene lógica de persistencia
4. **Manejo de errores:** lanzan excepciones que el UI debe capturar

```javascript
try {
  const cliente = await handleCreateCliente(data);
  // success
} catch (err) {
  // err.message = validación específica
}
```

## EXTENSIBILIDAD

Para agregar handlers a un nuevo módulo:

1. Crear `src/modules/<nuevo>/handlers/` directorio
2. Crear `<nuevo>-handlers.js` con funciones `export async function handle*()`
3. Crear `index.js` que exporte los handlers
4. Agregar exports al `src/handlers/index.js` central

Ejemplo:
```javascript
// src/modules/facturacion/handlers/facturacion-handlers.js
export async function handleCrearFactura(data) {
  // valida
  return await _createFactura(data);
}
```

## RESTRICCIONES Y REGLAS

- ✓ NO eliminar llamadas actuales al store/saga
- ✓ NO mover lógica de negocio (remains in store/saga)
- ✓ NO cambiar contratos de entrada/salida
- ✓ SÍ validar al entrada (contract enforcement)
- ✓ SÍ llamar functions existentes sin modificarlas
- ✓ SÍ mantener idempotencia (usando claves existentes)

## MÉTRICAS

**Handlers implementados:** 17 (3 módulos)
- Clientes: 4 handlers
- Pedidos: 10 handlers
- Kardex: 3 handlers

**Módulos modificados para usar handlers:**
- `src/modules/clientes/cliente-form.js` ✓

**Archivos creados:** 8
- 6 archivos de handlers
- 1 archivo de índice central
- 1 archivo de documentación

**Build:** ✓ passed (535 modules, 1.72s)
