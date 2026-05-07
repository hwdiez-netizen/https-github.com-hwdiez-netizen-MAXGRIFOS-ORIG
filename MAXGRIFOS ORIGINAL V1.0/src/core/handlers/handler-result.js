/**
 * Respuesta del Handler
 */

export class HandlerResult {
  constructor(ok, code, data = null, error = null) {
    this.ok = ok;
    this.code = code;
    this.data = data;
    this.error = error;
  }

  static Success(data = null, code = 'SUCCESS') {
    return new HandlerResult(true, code, data);
  }

  static Fail(error, code = 'HANDLER_ERROR') {
    return new HandlerResult(false, code, null, error);
  }
}
