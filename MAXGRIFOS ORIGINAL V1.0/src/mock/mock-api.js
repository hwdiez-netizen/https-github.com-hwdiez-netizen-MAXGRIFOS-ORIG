const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockApi = {
  async createProduct(product) {
    await delay(320);
    return { ...product, _persisted: true };
  },

  async updateProduct(id, data) {
    await delay(260);
    return { id, ...data, _persisted: true };
  },

  async discontinueProduct(id) {
    await delay(200);
    return { id, status: 'discontinued', _persisted: true };
  },

  async getProducts() {
    await delay(100);
    return [];
  },

  async createCliente(cliente) {
    await delay(320);
    return { ...cliente, _persisted: true };
  },

  async updateCliente(id, data) {
    await delay(260);
    return { id, ...data, _persisted: true };
  },

  async discontinueCliente(id) {
    await delay(200);
    return { id, status: 'inactive', _persisted: true };
  },

  async createMovimiento(movimiento) {
    await delay(280);
    return { ...movimiento, _persisted: true };
  },

  async getMovimientos() {
    await delay(100);
    return [];
  },

  async createBodega(bodega) {
    await delay(200);
    return { ...bodega, _persisted: true };
  },

  async updateBodega(id, data) {
    await delay(200);
    return { id, ...data, _persisted: true };
  },

  async createPedido(pedido) {
    await delay(350);
    return { ...pedido, _persisted: true };
  },

  async updatePedido(id, data) {
    await delay(250);
    return { id, ...data, _persisted: true };
  },

  async createDocumento(doc) {
    await delay(400);
    return { ...doc, _persisted: true };
  },

  async updateDocumento(id, data) {
    await delay(260);
    return { id, ...data, _persisted: true };
  },

  async createListaPrecios(lista) {
    await delay(280);
    return { ...lista, _persisted: true };
  },

  async updateListaPrecios(id, data) {
    await delay(240);
    return { id, ...data, _persisted: true };
  },

  async createDinamica(dinamica) {
    await delay(280);
    return { ...dinamica, _persisted: true };
  },

  async updateDinamica(id, data) {
    await delay(240);
    return { id, ...data, _persisted: true };
  },
};
