const PERIODOS_VALIDOS = ['semana', 'mes', 'trimestre', 'semestre', 'rango'];

export function validateVentasResumenQuery(params = {}) {
  const { periodo, fecha_inicio, fecha_fin } = params;
  if (!PERIODOS_VALIDOS.includes(periodo)) {
    throw new Error(`[VentasContracts] periodo inválido: '${periodo}'. Valores válidos: ${PERIODOS_VALIDOS.join(', ')}`);
  }
  if (periodo === 'rango') {
    if (!fecha_inicio || !fecha_fin) {
      throw new Error('[VentasContracts] fecha_inicio y fecha_fin son requeridas para periodo rango');
    }
    if (fecha_inicio > fecha_fin) {
      throw new Error('[VentasContracts] fecha_inicio debe ser anterior o igual a fecha_fin');
    }
  }
}
