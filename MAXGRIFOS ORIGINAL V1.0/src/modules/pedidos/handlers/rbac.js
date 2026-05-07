export const ROLES = ['admin', 'ventas', 'bodega'];

export const PERMISOS = {
  crearPedido:      ['ventas', 'admin'],
  confirmarPedido:  ['ventas', 'admin'],
  editarPedido:     ['ventas', 'admin'],
  iniciarPicking:   ['bodega', 'admin'],
  completarPicking: ['bodega', 'admin'],
  iniciarPacking:   ['bodega', 'admin'],
  emitirDocumento:  ['bodega', 'admin'],
  despachar:        ['bodega', 'admin'],
  registrarPOD:     ['bodega', 'admin'],
  anularPedido:     ['admin'],
};

export function checkPermiso(accion, ctx) {
  if (!ctx || !ctx.role) throw new Error('RBAC_DENY');
  const permitidos = PERMISOS[accion];
  if (!permitidos || !permitidos.includes(ctx.role)) throw new Error('RBAC_DENY');
}
