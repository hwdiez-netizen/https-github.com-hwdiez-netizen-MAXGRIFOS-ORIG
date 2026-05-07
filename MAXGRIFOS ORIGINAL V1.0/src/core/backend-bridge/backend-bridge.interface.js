/**
 * Backend Bridge Interface - Especificación de contrato con el backend
 */

export class BackendBridgeInterface {
  async connect() { throw new Error('Not implemented'); }
  async get(collection, id) { throw new Error('Not implemented'); }
  async put(collection, data) { throw new Error('Not implemented'); }
  async list(collection, query) { throw new Error('Not implemented'); }
}
