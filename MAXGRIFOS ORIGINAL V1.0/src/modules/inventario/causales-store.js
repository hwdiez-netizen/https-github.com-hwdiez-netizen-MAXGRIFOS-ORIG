/**
 * CAUSALES STORE — Catálogo configurable de causales de ajuste de inventario
 * Preset inicial alineado con operación Colombia/DIAN, editable por administrador.
 * Almacenamiento: localStorage (configuración, no datos operativos).
 */

const STORAGE_KEY = 'erp_causales_catalogo_v1';

export const DIAN_PRESET = [
  {
    id: 'c_sin_diferencia',
    codigo: 'SIN_DIFERENCIA',
    nombre: 'SIN DIFERENCIA',
    descripcion: 'Conteo físico coincide con sistema. No requiere ajuste.',
    dian: false,
    activo: true,
    sistema: true,
  },
  {
    id: 'c_merma',
    codigo: 'MERMA_DETERIORO',
    nombre: 'MERMA / DETERIORO',
    descripcion: 'Pérdida por vencimiento, daño físico o deterioro del producto.',
    dian: true,
    activo: true,
    sistema: false,
  },
  {
    id: 'c_robo',
    codigo: 'ROBO_HURTO',
    nombre: 'ROBO / HURTO',
    descripcion: 'Faltante por sustracción o hurto. Puede requerir denuncia.',
    dian: true,
    activo: true,
    sistema: false,
  },
  {
    id: 'c_venta_no_reg',
    codigo: 'VENTA_NO_REGISTRADA',
    nombre: 'VENTA NO REGISTRADA',
    descripcion: 'Salida de mercancía sin registro previo en el sistema.',
    dian: false,
    activo: true,
    sistema: false,
  },
  {
    id: 'c_devolucion_no_reg',
    codigo: 'DEVOLUCION_NO_REGISTRADA',
    nombre: 'DEVOLUCION NO REGISTRADA',
    descripcion: 'Entrada de mercancía devuelta sin registro previo en el sistema.',
    dian: false,
    activo: true,
    sistema: false,
  },
  {
    id: 'c_error_conteo',
    codigo: 'ERROR_CONTEO_ANTERIOR',
    nombre: 'ERROR CONTEO ANTERIOR',
    descripcion: 'Error en inventario anterior que generó diferencia acumulada.',
    dian: false,
    activo: true,
    sistema: false,
  },
  {
    id: 'c_transferencia_no_reg',
    codigo: 'TRANSFERENCIA_NO_REGISTRADA',
    nombre: 'TRANSFERENCIA NO REGISTRADA',
    descripcion: 'Movimiento entre bodegas o sedes sin registro en sistema.',
    dian: false,
    activo: true,
    sistema: false,
  },
  {
    id: 'c_ajuste_inicial',
    codigo: 'AJUSTE_INICIAL',
    nombre: 'AJUSTE INICIAL',
    descripcion: 'Primer inventario o corrección de saldo de apertura.',
    dian: false,
    activo: true,
    sistema: false,
  },
  {
    id: 'c_otro',
    codigo: 'OTRO',
    nombre: 'OTRO',
    descripcion: 'Otra causa no clasificada. Debe documentarse en observaciones.',
    dian: false,
    activo: true,
    sistema: false,
  },
];

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function _save(catalog) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
}

export function initCausalesPreset() {
  if (!_load()) _save([...DIAN_PRESET]);
}

export function getCausalesActivas() {
  const catalog = _load() ?? DIAN_PRESET;
  return catalog.filter((c) => c.activo !== false);
}

export function getAllCausales() {
  return _load() ?? [...DIAN_PRESET];
}

export function addCausal(data) {
  const catalog = _load() ?? [...DIAN_PRESET];
  const nombre = String(data.nombre ?? '').toUpperCase().trim();
  if (catalog.some((c) => c.nombre === nombre)) {
    throw new Error(`Ya existe una causal con el nombre "${nombre}"`);
  }
  const nueva = {
    id: `c_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    codigo: nombre.replace(/[^A-Z0-9]/g, '_').replace(/__+/g, '_').slice(0, 40),
    nombre,
    descripcion: String(data.descripcion ?? '').trim(),
    dian: false,
    activo: true,
    sistema: false,
    created_at: new Date().toISOString(),
  };
  catalog.push(nueva);
  _save(catalog);
  return nueva;
}

export function updateCausal(id, data) {
  const catalog = _load() ?? [...DIAN_PRESET];
  const idx = catalog.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Causal "${id}" no encontrada`);
  if (catalog[idx].sistema) throw new Error('Las causales del sistema no se pueden editar');
  const nombre = String(data.nombre ?? catalog[idx].nombre).toUpperCase().trim();
  catalog[idx] = {
    ...catalog[idx],
    nombre,
    descripcion: String(data.descripcion ?? catalog[idx].descripcion ?? '').trim(),
    updated_at: new Date().toISOString(),
  };
  _save(catalog);
  return catalog[idx];
}

export function toggleCausal(id) {
  const catalog = _load() ?? [...DIAN_PRESET];
  const idx = catalog.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Causal "${id}" no encontrada`);
  if (catalog[idx].id === 'c_sin_diferencia') {
    throw new Error('"SIN DIFERENCIA" es obligatoria y no puede desactivarse');
  }
  catalog[idx] = { ...catalog[idx], activo: !catalog[idx].activo };
  _save(catalog);
  return catalog[idx];
}

export function resetToPreset() {
  _save([...DIAN_PRESET]);
  return [...DIAN_PRESET];
}
