import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modPath = path.resolve(__dirname, '../src/modules/facturacion');

function run() {
  const formStr = fs.readFileSync(path.join(modPath, 'facturacion-form.js'), 'utf8');
  const listStr = fs.readFileSync(path.join(modPath, 'factura-list.js'), 'utf8');
  const pdfStr = fs.readFileSync(path.join(modPath, 'pdf-generator.js'), 'utf8');
  const handStr = fs.readFileSync(path.join(modPath, 'comprobantes-handlers.js'), 'utf8');

  // Check facturacion-form.js
  if (formStr.includes('getConfigComprobante(')) throw new Error('form uses getConfigComprobante');
  if (formStr.includes('updateConfigComprobante(')) throw new Error('form uses updateConfigComprobante');
  if (formStr.includes("from './config-store.js'")) throw new Error('form imports config-store.js');
  if (formStr.includes("from '../../db/local-db.js'")) throw new Error('form imports local-db.js');
  if (formStr.includes('__fromHandler')) throw new Error('form has __fromHandler');

  // Check factura-list.js
  if (listStr.includes('legacyItems')) throw new Error('factura-list.js contains legacyItems');
  if (listStr.includes("from './factura-store.js'")) throw new Error('list imports factura-store.js');
  if (listStr.includes("from '../../db/local-db.js'")) throw new Error('list imports local-db.js');
  if (listStr.includes('getPedidoItems(')) throw new Error('list uses getPedidoItems');
  if (listStr.includes('registrarReimpresion(')) throw new Error('list uses registrarReimpresion');
  if (listStr.includes('anularDocumento(')) throw new Error('list uses anularDocumento');
  if (listStr.includes('crearDocumento(')) throw new Error('list uses crearDocumento');
  if (listStr.includes('__fromHandler')) throw new Error('list has __fromHandler');

  // Check pdf-generator.js
  if (pdfStr.includes("from './factura-store.js'")) throw new Error('pdf imports factura-store.js');
  if (pdfStr.includes("from '../../db/local-db.js'")) throw new Error('pdf imports local-db.js');
  if (pdfStr.includes('getPedidoItems(')) throw new Error('pdf uses getPedidoItems');
  if (pdfStr.includes('registrarReimpresion(')) throw new Error('pdf uses registrarReimpresion directly');
  if (pdfStr.includes('anularDocumento(')) throw new Error('pdf uses anularDocumento directly');
  if (pdfStr.includes('crearDocumento(')) throw new Error('pdf uses crearDocumento directly');
  if (pdfStr.includes('__fromHandler')) throw new Error('pdf has __fromHandler');

  // Check comprobantes-handlers.js
  if (!handStr.includes('handleGetDocumentos')) throw new Error('handlers missing handleGetDocumentos');
  if (!handStr.includes('handleCrearDocumento')) throw new Error('handlers missing handleCrearDocumento');
  if (!handStr.includes('handleAnularDocumento')) throw new Error('handlers missing handleAnularDocumento');
  if (!handStr.includes('handleRegistrarReimpresion')) throw new Error('handlers missing handleRegistrarReimpresion');
  if (!handStr.includes('handleSaveComprobanteConfig')) throw new Error('handlers missing handleSaveComprobanteConfig');
  if (!handStr.includes('{ __fromHandler: true }')) throw new Error('handlers missing { __fromHandler: true }');

  console.log('[F11B VALIDATOR] PASS');
}

try {
  run();
} catch (err) {
  console.log('[F11B VALIDATOR] FAIL:', err.message);
  process.exit(1);
}
