import fs from 'node:fs';

const filePath = 'src/modules/inventario/inventario-controller.js';
const src = fs.readFileSync(filePath, 'utf8');

const replacements = [
  ['â† Volver', '← Volver'],
  ['ðŸ“¦ Inventario General', '📦 Inventario General'],
  ['ðŸŸ¢ Activos', '🟢 Activos'],
  ['ðŸ”´ Inactivos', '🔴 Inactivos'],
  ['âš¡ Ambos', '⚡ Ambos'],
  ['Seleccionar Bodegas â†’', 'Seleccionar Bodegas →'],
  ['Iniciar Inventario â†’', 'Iniciar Inventario →'],
  ['Conteo FÃ­sico', 'Conteo Físico'],
  ['Buscar por descripciÃ³n, SKU, cÃ³d. proveedor o Code128â€¦', 'Buscar por descripción, SKU, cód. proveedor o Code128…'],
  ['ðŸ“· Escanear Code128', '📷 Escanear Code128'],
  ['ðŸ’¡ Toca un producto o escanea Code128 para ver la ficha completa y registrar el conteo.', '💡 Toca un producto o escanea Code128 para ver la ficha completa y registrar el conteo.'],
  ['ðŸ” Sin resultados para la bÃºsqueda.', '🔍 Sin resultados para la búsqueda.'],
  ['âš ï¸ Sin productos en el inventario.', '⚠️ Sin productos en el inventario.'],
  ['Ir a ConciliaciÃ³n â†’', 'Ir a Conciliación →'],
  ['âž• Crear producto nuevo', '➕ Crear producto nuevo'],
  ['ðŸ—‘ï¸ Abandonar y cerrar esta sesiÃ³n', '🗑️ Abandonar y cerrar esta sesión'],
  ['Selecciona las bodegas que incluirÃ¡ este inventario. <strong>Bodega Central</strong> estÃ¡ seleccionada por defecto.', 'Selecciona las bodegas que incluirá este inventario. <strong>Bodega Central</strong> está seleccionada por defecto.'],
  ['ðŸ­ Principal', '🏭 Principal'],
  ['ðŸ“¦ SatÃ©lite', '📦 Satélite'],
  [' Â· ', ' · '],
];

let out = src;
for (const [from, to] of replacements) {
  out = out.split(from).join(to);
}

if (out === src) {
  throw new Error('No se aplicaron cambios en batch1.');
}

fs.writeFileSync(filePath, out, 'utf8');
