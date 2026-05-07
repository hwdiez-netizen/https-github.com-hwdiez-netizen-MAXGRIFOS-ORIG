import { getClientes, getClienteById } from './cliente-store.js';

export async function queryClientes() {
  return await getClientes();
}

export async function queryClienteById(id) {
  if (id === null || id === undefined || String(id).trim() === '') {
    throw new Error('[ClienteQuery] ID de cliente requerido');
  }
  return await getClienteById(id);
}
