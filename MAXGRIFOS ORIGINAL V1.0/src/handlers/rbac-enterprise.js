export const ENTERPRISE_ROLES = ['admin', 'ventas', 'bodega', 'auditor'];

export const ENTERPRISE_PERMISOS = {
  // Pedidos
  crearPedido: ['ventas', 'admin'],
  confirmarPedido: ['ventas', 'admin'],
  editarPedido: ['ventas', 'admin'],
  iniciarPicking: ['bodega', 'admin'],
  completarPicking: ['bodega', 'admin'],
  iniciarPacking: ['bodega', 'admin'],
  emitirDocumento: ['bodega', 'admin'],
  despachar: ['bodega', 'admin'],
  registrarPOD: ['bodega', 'admin'],
  anularPedido: ['admin'],
  // Clientes
  crearCliente: ['ventas', 'admin'],
  editarCliente: ['ventas', 'admin'],
  desactivarCliente: ['admin'],
  activarCliente: ['admin'],
  // Garantias
  transicionarGarantia: ['admin', 'bodega'],
  registrarGarantia: ['admin', 'bodega'],
  registrarNcGarantia: ['admin', 'bodega'],
  // Proveedores
  crearProveedor: ['admin', 'bodega'],
  editarProveedor: ['admin', 'bodega'],
  desactivarProveedor: ['admin'],
  activarProveedor: ['admin'],
  // Compras
  recibirCompra: ['admin', 'bodega'],
  // Kardex
  crearMovimientoKardex: ['admin', 'bodega'],
  registrarGarantiaKardex: ['admin', 'bodega'],
  registrarNcGarantiaKardex: ['admin', 'bodega'],
  // Listas / dinamicas comerciales
  activarDinamicaComercial: ['admin', 'ventas'],
  desactivarDinamicaComercial: ['admin', 'ventas'],
};

export function checkEnterprisePermiso(accion, ctx) {
  if (!ctx || !ctx.role) throw new Error('RBAC_DENY');
  const permitidos = ENTERPRISE_PERMISOS[accion];
  if (!permitidos || !permitidos.includes(ctx.role)) throw new Error('RBAC_DENY');
}

export function resolveEnterpriseCtx(ctx) {
  if (ctx?.role) return ctx;
  return { user: 'local-ui', role: 'admin' };
}
