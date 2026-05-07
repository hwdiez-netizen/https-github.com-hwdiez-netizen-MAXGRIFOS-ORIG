import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pedidosStorePath = path.join(root, 'src/modules/pedidos/pedido-store.js');
const contractsPath = path.join(root, 'src/modules/pedidos/pedido-contracts.js');
const handlersPath = path.join(root, 'src/modules/pedidos/handlers/pedido-handlers.js');
const source = fs.readFileSync(pedidosStorePath, 'utf8');
const contractsSource = fs.readFileSync(contractsPath, 'utf8');
const handlersSource = fs.readFileSync(handlersPath, 'utf8');

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

// 1. Prohibiciones
assert(!source.includes('crypto.randomUUID'), 'FAIL: crypto.randomUUID detected');
assert(!source.includes('Math.random()'), 'FAIL: Math.random() detected in identity function');
assert(!source.includes('Date.now()'), 'FAIL: Date.now() detected in identity function');
assert(!source.includes("throw new Error('KARDEX_IDEMPOTENCY_KEY_REQUIRED')"), 'FAIL: leftover Kardex error detected');

// 2. Obligaciones
assert(source.includes('__fromHandler'), 'FAIL: missing __fromHandler check');
assert(source.includes('STORE_ACCESS_DENIED:pedidos:iniciarCreacion'), 'FAIL: missing STORE_ACCESS_DENIED guard in iniciarCreacion');
assert(source.includes('_generateDeterministicId'), 'FAIL: missing deterministic identity helper');
assert(source.includes('PEDIDOS_IDEMPOTENCY_KEY_REQUIRED'), 'FAIL: missing PEDIDOS_IDEMPOTENCY_KEY_REQUIRED');
assert(source.includes('PEDIDOS_CLIENTE_REQUIRED'), 'FAIL: missing PEDIDOS_CLIENTE_REQUIRED');
assert(source.includes('eventBus.emit'), 'FAIL: missing eventBus.emit');

// 3. Verificación de Lógica
assert(source.includes("id: _generateDeterministicId('PEDIDO', data.idempotency_key)"), 'FAIL: iniciarCreacion id fallback detected');
assert(source.includes('cliente_id: data.cliente_id ?? pedido.cliente_id'), 'FAIL: actualizarPedidoEditable degradación cliente');
assert(source.includes('idempotency_key: `PED:${pedidoId}:PICK_ADD:${item.product_id}`'), 'FAIL: agregarItemAlPicking idempotency_key inestable');
assert(source.includes('cliente_id:     data.cliente_id     ?? `CLIENTE:${data.cliente_nit ?? data.cliente_nombre}`,'), 'FAIL: crearPedido cliente_id no es determinista');
assert(!source.includes('cliente_id:     data.cliente_id     ?? null,'), 'FAIL: crearPedido residue cliente_id nulo detectado');

// 4. Handlers & Contracts
assert(handlersSource.includes('Contracts.iniciarCreacion(data)'), 'FAIL: handler missing contract');
assert(handlersSource.includes('PedidoStore.iniciarCreacion(data, { __fromHandler: true })'), 'FAIL: handler missing __fromHandler');
assert(contractsSource.includes('validarIniciarCreacion'), 'FAIL: Contracts missing iniciarCreacion');
assert(contractsSource.includes('idempotency_key es requerido'), 'FAIL: Contracts missing field check');
assert(contractsSource.includes('cliente_id, cliente_nit o cliente_nombre es requerido'), 'FAIL: Contracts missing client check');

if (failures.length) {
  console.error('[F10 VALIDATOR] FAIL', failures);
  process.exit(1);
}
console.log('[F10 VALIDATOR] PASS');
