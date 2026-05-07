/**
 * Registro Central de Rutas V2
 */

export const MG_ROUTES = [
  { path: '/', view: 'home', label: 'Inicio', icon: 'home' },
  { path: '/productos', view: 'productos', label: 'Productos', icon: 'package', status: 'ACTIVE' },
  { path: '/clientes', view: 'clientes', label: 'Clientes', icon: 'users', status: 'ACTIVE' },
  { path: '/ventas', view: 'ventas', label: 'Ventas', icon: 'shopping-cart', status: 'ACTIVE' },
  { path: '/pedidos', view: 'pedidos', label: 'Pedidos', icon: 'file-text', status: 'ACTIVE' },
  { path: '/politicas', view: 'politicas', label: 'Políticas Comerciales', icon: 'shield-check', status: 'ACTIVE' },
  { path: '/compras', view: 'compras', label: 'Compras', icon: 'truck', status: 'ACTIVE' },
  { path: '/proveedores', view: 'proveedores', label: 'Proveedores', icon: 'building', status: 'ACTIVE' },
  { path: '/inventario', view: 'inventario', label: 'Inventario', icon: 'layers', status: 'ACTIVE' },
  { path: '/kardex', view: 'kardex', label: 'Kardex', icon: 'clipboard-list', status: 'ACTIVE' },
  { path: '/facturacion', view: 'facturacion', label: 'Facturación', icon: 'receipt', status: 'ACTIVE' },
  { path: '/garantias', view: 'garantias', label: 'Garantías', icon: 'award', status: 'PREPARING' },
  { path: '/auditoria', view: 'auditoria', label: 'Auditoría', icon: 'activity', status: 'ACTIVE' },
  { path: '/scanner', view: 'scanner', label: 'Scanner', icon: 'maximize', status: 'ACTIVE' },
  { path: '/cartera', view: 'cartera', label: 'Cartera', icon: 'wallet', status: 'PREPARING' },
  { path: '/recaudos', view: 'recaudos', label: 'Recaudos', icon: 'arrow-down-circle', status: 'FUTURE' },
  { path: '/egresos', view: 'egresos', label: 'Egresos', icon: 'arrow-up-circle', status: 'FUTURE' },
  { path: '/tesoreria', view: 'tesoreria', label: 'Tesorería', icon: 'landmark', status: 'FUTURE' },
  { path: '/kpis', view: 'kpis', label: 'KPIs Comerciales', icon: 'bar-chart-2', status: 'PREPARING' },
  { path: '/module-entry-pilot', view: 'module-entry-pilot', label: 'Piloto Módulo', icon: 'shield-check', status: 'PREPARING' }
];
