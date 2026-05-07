import fs from 'fs';
import path from 'path';

const root = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const configStore = read('MAXGRIFOS ORIGINAL V1.0/src/modules/facturacion/config-store.js');
const facturaStore = read('MAXGRIFOS ORIGINAL V1.0/src/modules/facturacion/factura-store.js');
const comprobantesHandlers = read('MAXGRIFOS ORIGINAL V1.0/src/modules/facturacion/comprobantes-handlers.js');

function fail(message) {
  console.error(`[F11A VALIDATOR] FAIL: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

assert(!configStore.includes('crypto.randomUUID'), 'config-store.js contains crypto.randomUUID');
assert(configStore.includes('idempotency_key: `CONFIG_COMPROBANTE:${conf.id}`'), 'config-store.js missing deterministic CONFIG_COMPROBANTE idempotency key');

assert(!facturaStore.includes('crypto.randomUUID'), 'factura-store.js contains crypto.randomUUID');
assert(!facturaStore.includes('Math.random'), 'factura-store.js contains Math.random');
assert(!facturaStore.includes('Date.now()'), 'factura-store.js contains Date.now()');
assert(facturaStore.includes('function _generateDeterministicId(prefix, key)'), 'factura-store.js missing _generateDeterministicId helper');

assert(facturaStore.includes("throw new Error('STORE_ACCESS_DENIED:facturacion:crearDocumento')"), 'crearDocumento missing STORE_ACCESS_DENIED guard');
assert(facturaStore.includes("throw new Error('STORE_ACCESS_DENIED:facturacion:anularDocumento')"), 'anularDocumento missing STORE_ACCESS_DENIED guard');
assert(facturaStore.includes("throw new Error('STORE_ACCESS_DENIED:facturacion:registrarReimpresion')"), 'registrarReimpresion missing STORE_ACCESS_DENIED guard');

assert(facturaStore.includes("throw new Error('FACTURACION_PEDIDO_ID_REQUIRED')"), 'missing FACTURACION_PEDIDO_ID_REQUIRED');
assert(facturaStore.includes("throw new Error('FACTURACION_TIPO_DOCUMENTO_INVALIDO')"), 'missing FACTURACION_TIPO_DOCUMENTO_INVALIDO');
assert(facturaStore.includes("throw new Error('FACTURACION_DOCUMENTO_ID_REQUIRED')"), 'missing FACTURACION_DOCUMENTO_ID_REQUIRED');
assert(facturaStore.includes("throw new Error('FACTURACION_MOTIVO_ANULACION_REQUIRED')"), 'missing FACTURACION_MOTIVO_ANULACION_REQUIRED');

assert(facturaStore.includes('id: _generateDeterministicId(`DOC:${tipo}`, pedido_id)'), 'document id is not deterministic DOC tipo/pedido');
assert(facturaStore.includes('idempotency_key: `DOC:${tipo}:${pedido_id}`'), 'document idempotency key missing or not deterministic');
assert(facturaStore.includes('idempotency_key: `OUTBOX:documentos:${tipo}:${pedido_id}:CREATE`'), 'outbox create idempotency key missing or not deterministic');

assert(facturaStore.includes('export async function crearDocumento({ pedido_id, tipo }, options = {})'), 'crearDocumento signature missing options');
assert(facturaStore.includes('export async function anularDocumento(docId, motivo, options = {})'), 'anularDocumento signature missing options');
assert(facturaStore.includes('export async function registrarReimpresion(docId, options = {})'), 'registrarReimpresion signature missing options');

assert(facturaStore.includes('crearDocumento({ pedido_id: pedidoId, tipo }, { __fromHandler: true })'), 'bridge does not call crearDocumento with __fromHandler');
assert(facturaStore.includes('anularDocumento(documentoId, motivo, { __fromHandler: true })'), 'bridge does not call anularDocumento with __fromHandler');

assert(!comprobantesHandlers.includes("../kardex/config-store.js"), 'comprobantes-handlers still imports from kardex config-store');
assert(comprobantesHandlers.includes("from './config-store.js'"), 'comprobantes-handlers missing local config-store import');
assert(comprobantesHandlers.includes("import { crearDocumento, anularDocumento, registrarReimpresion } from './factura-store.js';"), 'comprobantes-handlers missing complete factura-store import');

assert(comprobantesHandlers.includes('export async function handleCrearDocumento'), 'handleCrearDocumento missing');
assert(comprobantesHandlers.includes('export async function handleAnularDocumento'), 'handleAnularDocumento missing');
assert(comprobantesHandlers.includes('export async function handleRegistrarReimpresion'), 'handleRegistrarReimpresion missing');

assert(comprobantesHandlers.includes('crearDocumento(') && comprobantesHandlers.includes('{ __fromHandler: true }'), 'handleCrearDocumento missing __fromHandler');
assert(comprobantesHandlers.includes('anularDocumento(payload.documento_id, payload.motivo, { __fromHandler: true })'), 'handleAnularDocumento missing __fromHandler');
assert(comprobantesHandlers.includes('registrarReimpresion(payload.documento_id, { __fromHandler: true })'), 'handleRegistrarReimpresion missing __fromHandler');

console.log('[F11A VALIDATOR] PASS');
