import fs from 'node:fs';

const filePath = 'src/modules/inventario/inventario-controller.js';
const source = fs.readFileSync(filePath, 'utf8');

const sanitizeStart = source.indexOf('  _normalizeUiText(text) {');
const sanitizeEnd = source.indexOf('  _sanitizeNode(node) {');
if (sanitizeStart < 0 || sanitizeEnd < 0 || sanitizeEnd <= sanitizeStart) {
  throw new Error('No se encontró bloque de sanitizador para extraer mapa.');
}

const mapChunk = source.slice(sanitizeStart, sanitizeEnd);
const pairRegex = /\['([^']+)',\s*'([^']+)'\]/g;
const pairs = [...mapChunk.matchAll(pairRegex)].map((m) => [m[1], m[2]]);
if (!pairs.length) {
  throw new Error('No se encontraron pares de reemplazo.');
}

const from = '  _renderCounting() {';
const to = '  _refreshCountList() {';
const start = source.indexOf(from);
const end = source.indexOf(to, start + from.length);
if (start < 0 || end < 0 || end <= start) {
  throw new Error('No se encontró bloque _renderCounting para lote 2.');
}

const prefix = source.slice(0, start);
let chunk = source.slice(start, end);
const suffix = source.slice(end);

for (const [bad, good] of pairs) {
  chunk = chunk.split(bad).join(good);
}

fs.writeFileSync(filePath, prefix + chunk + suffix, 'utf8');
