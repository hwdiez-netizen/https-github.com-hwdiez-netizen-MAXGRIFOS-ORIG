import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const kardexPath = path.join(root, 'MAXGRIFOS ORIGINAL V1.0/src/modules/kardex/kardex-store.js');
const source = fs.readFileSync(kardexPath, 'utf8');

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(!source.includes('crypto.randomUUID'), 'FAIL: crypto.randomUUID remains in kardex-store.js');
assert(!source.includes('allow_missing_product_fallback'), 'FAIL: allow_missing_product_fallback remains');
assert(!source.includes('id: crypto.randomUUID()'), 'FAIL: movimiento id still uses crypto.randomUUID');
assert(!source.includes('transfer_id = crypto.randomUUID()'), 'FAIL: transfer_id still uses crypto.randomUUID');
assert(!source.includes(': crypto.randomUUID()'), 'FAIL: conditional crypto.randomUUID remains');

assert(source.includes("throw new Error('STORE_ACCESS_DENIED:kardex:createMovimiento')"), 'FAIL: missing explicit STORE_ACCESS_DENIED throw');
assert(source.includes("throw new Error('KARDEX_IDEMPOTENCY_KEY_REQUIRED')"), 'FAIL: missing idempotency_key required guard');
assert(source.includes('const existingMovimiento = await getMovimientoByIdempotencyKey(data.idempotency_key);'), 'FAIL: missing idempotency precheck const');
assert(source.includes('if (existingMovimiento) return existingMovimiento;'), 'FAIL: missing idempotent return');

assert(source.includes("throw new Error('KARDEX_PRODUCT_ID_REQUIRED')"), 'FAIL: missing product_id required guard');
assert(source.includes("throw new Error('Producto no encontrado')"), 'FAIL: missing missing-product rejection');
assert(source.includes("throw new Error('KARDEX_PRODUCT_SKU_REQUIRED')"), 'FAIL: missing product SKU guard');

assert(source.includes('id: data.id'), 'FAIL: missing deterministic movimiento id expression');
assert(source.includes('?? data.idempotency_key'), 'FAIL: movimiento id must prefer idempotency_key');
assert(source.includes('KDX:RESERVA:${pedido_id}:${product_id}:TRANSFER'), 'FAIL: missing deterministic reserva transfer_id');
assert(source.includes('KDX:REVERSION:${pedido_id}:${product_id}:TRANSFER'), 'FAIL: missing deterministic reversion transfer_id');
assert(source.includes('KDX:GARANTIA:${product_id}:${safeRef}:TRANSFER'), 'FAIL: missing deterministic garantia transfer_id');

const createMovimientoIndex = source.indexOf('export async function createMovimiento(data, options = {})');
const saveMovimientoIndex = source.indexOf('await saveMovimiento(movimiento)', createMovimientoIndex);
const deniedIndex = source.indexOf("throw new Error('STORE_ACCESS_DENIED:kardex:createMovimiento')", createMovimientoIndex);
const idempotencyRequiredIndex = source.indexOf("throw new Error('KARDEX_IDEMPOTENCY_KEY_REQUIRED')", createMovimientoIndex);
const idempotencyPrecheckIndex = source.indexOf('const existingMovimiento = await getMovimientoByIdempotencyKey(data.idempotency_key);', createMovimientoIndex);
const productRequiredIndex = source.indexOf("throw new Error('KARDEX_PRODUCT_ID_REQUIRED')", createMovimientoIndex);

assert(createMovimientoIndex >= 0, 'FAIL: createMovimiento not found');
assert(deniedIndex > createMovimientoIndex, 'FAIL: STORE_ACCESS_DENIED not inside createMovimiento');
assert(idempotencyRequiredIndex > deniedIndex, 'FAIL: idempotency required must be after store guard');
assert(idempotencyPrecheckIndex > idempotencyRequiredIndex, 'FAIL: idempotency precheck must be after idempotency required');
assert(productRequiredIndex > idempotencyPrecheckIndex, 'FAIL: product guard must be after idempotency precheck');
assert(saveMovimientoIndex > idempotencyPrecheckIndex, 'FAIL: idempotency precheck must happen before saveMovimiento');

assert(source.includes("throw new Error('KARDEX_SALDO_ANTERIOR_REQUERIDO')"), 'FAIL: missing KARDEX_SALDO_ANTERIOR_REQUERIDO guard');
assert(source.includes('TIPOS_VENTA.includes(tipo)'), 'FAIL: _isDelta missing TIPOS_VENTA');

const descargarStart = source.indexOf('export async function descargarGarantiasPorNC({');
const descargarEnd = source.indexOf('async function _trySyncNow', descargarStart);
assert(descargarStart >= 0, 'FAIL: descargarGarantiasPorNC not found');
assert(descargarEnd > descargarStart, 'FAIL: descargarGarantiasPorNC end marker not found');

const descargarBlock = source.slice(descargarStart, descargarEnd);
assert(!descargarBlock.includes('getAllMovimientos()'), 'FAIL: descargarGarantiasPorNC still uses getAllMovimientos');
assert(descargarBlock.includes('getMovimientoByIdempotencyKey(idemKey)'), 'FAIL: descargarGarantiasPorNC must use getMovimientoByIdempotencyKey(idemKey)');

if (failures.length) {
  console.error('[F9 VALIDATOR] FAIL');
  for (const failure of failures) console.error('-', failure);
  process.exit(1);
}

console.log('[F9 VALIDATOR] PASS');
console.log('Kardex deterministic identity and idempotency gate verified.');
