import { generateSKU, decodeSkuV5 } from '../src/modules/productos/sku-engine.js';
import assert from 'assert';
import fs from 'fs';
import crypto from 'crypto';

console.log('Validando motor SKU...');

// Validate SHA256 of sku-engine.js
const enginePath = 'MAXGRIFOS ORIGINAL V1.0/src/modules/productos/sku-engine.js';
const engineData = fs.readFileSync(enginePath);
const hash = crypto.createHash('sha256').update(engineData).digest('hex');
const EXPECTED_SHA256 = 'e710c40d68b6f53f146d16549888b430f474ca18ed8baca7adcd0f913cc01e76';
console.log('SHA256:', hash);
assert(hash === EXPECTED_SHA256, `SHA256 mismatch! Expected ${EXPECTED_SHA256}, got ${hash}`);

// Test SKU Generation
const producto = { nombre: 'Mezclador lavaplatos cromo', ref: '12345' };
const res = generateSKU(producto.nombre, producto.ref);
console.log('SKU:', res.sku);

assert(res.sku.startsWith('CO-'), 'Categoria incorrecta');
assert(res.sku.endsWith('-2345'), 'Referencia incorrecta');

// Test SKU Decoding
const decoded = decodeSkuV5(res.sku);
console.log('Decoded:', decoded);
assert(decoded.id4 === '2345', 'ID4 incorrecto');

console.log('Validación exitosa.');
