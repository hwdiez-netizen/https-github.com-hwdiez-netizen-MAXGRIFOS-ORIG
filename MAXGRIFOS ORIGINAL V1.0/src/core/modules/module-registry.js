/**
 * Module Registry Runtime - Inventario de módulos funcionales
 */

export const MODULE_STATUS = {
  STUB: 'stub',
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  LEGACY: 'legacy'
};

export const MODULE_REGISTRY = [
  { id: 'core', name: 'Core System', status: MODULE_STATUS.PRODUCTION },
  { id: 'productos', name: 'Maestro Productos', status: MODULE_STATUS.LEGACY },
  { id: 'inventario', name: 'Kardex/Inventario', status: MODULE_STATUS.LEGACY },
  { id: 'auditoria', name: 'Auditoría', status: MODULE_STATUS.LEGACY },
  { id: 'compras', name: 'Compras', status: MODULE_STATUS.PRODUCTION },
  { id: 'proveedores', name: 'Proveedores', status: MODULE_STATUS.PRODUCTION },
  { id: 'module-entry-pilot', name: 'Module Entry Pilot', status: MODULE_STATUS.DEVELOPMENT },
];
