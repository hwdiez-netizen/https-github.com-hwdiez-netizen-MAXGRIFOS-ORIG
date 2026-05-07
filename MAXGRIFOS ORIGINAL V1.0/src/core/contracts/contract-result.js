/**
 * Estructura de respuesta de contratos
 */

export class ContractResult {
  constructor(ok, code, message = '', issues = []) {
    this.ok = ok;
    this.code = code;
    this.message = message;
    this.issues = issues; // Lista de validaciones fallidas
  }

  static Success(code = 'OK', message = '') {
    return new ContractResult(true, code, message);
  }

  static Fail(code = 'VALIDATION_ERROR', message = '', issues = []) {
    return new ContractResult(false, code, message, issues);
  }
}
