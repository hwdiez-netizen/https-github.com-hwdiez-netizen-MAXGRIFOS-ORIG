const TIPOS_VALIDOS = ['FAC', 'REM'];

function _normalizePrefijo(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function validateComprobanteConfigInput(input = {}) {
  const tipo = String(input.tipo ?? '').trim().toUpperCase();
  const prefijo = _normalizePrefijo(input.prefijo);
  const numeroInicial = Number(input.numero_inicial);

  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new Error(`[ComprobantesContracts] tipo inválido: '${tipo}'`);
  }
  if (!/^[A-Z0-9]{2,8}$/.test(prefijo)) {
    throw new Error('[ComprobantesContracts] prefijo inválido (2-8, A-Z0-9)');
  }
  if (!Number.isInteger(numeroInicial) || numeroInicial < 1) {
    throw new Error('[ComprobantesContracts] numero_inicial debe ser entero >= 1');
  }

  return { tipo, prefijo, numero_inicial: numeroInicial };
}

