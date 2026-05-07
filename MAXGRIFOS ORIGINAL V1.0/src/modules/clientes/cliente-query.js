import { getClientes, getClienteById } from './cliente-store.js';
import { seedLoader } from '../../core/seed/seed-loader.js';

export async function queryClientes() {
  const allFromDb = await getClientes() || [];
  let all = [...allFromDb];

  const seedData = await seedLoader.load();
  if (seedData && Array.isArray(seedData.clients)) {
    const dbNits = new Set(all.map(c => c.nit).filter(Boolean));
    const dbCedulas = new Set(all.map(c => c.cedula).filter(Boolean));
    const dbIdentityKeys = new Set(all.map(c => c.identity_key).filter(Boolean));
    
    for (const seedClient of seedData.clients) {
      const hasNit = seedClient.nit && dbNits.has(seedClient.nit);
      const hasCedula = seedClient.cedula && dbCedulas.has(seedClient.cedula);
      const hasKey = seedClient.identity_key && dbIdentityKeys.has(seedClient.identity_key);
      if (!hasNit && !hasCedula && !hasKey) {
        all.push({
          ...seedClient,
          razon_social: seedClient.razon_social || seedClient.name,
          nit: seedClient.nit || (seedClient.document_type === 'NIT' ? seedClient.document_number : ''),
          cedula: seedClient.cedula || (seedClient.document_type === 'CC' ? seedClient.document_number : ''),
          forma_pago: seedClient.forma_pago || seedClient.payment_terms,
          status: seedClient.status ? seedClient.status.toLowerCase() : 'active',
        });
      }
    }
  }

  return all;
}

export async function queryClienteById(id) {
  if (id === null || id === undefined || String(id).trim() === '') {
    throw new Error('[ClienteQuery] ID de cliente requerido');
  }
  const dbClient = await getClienteById(id);
  if (dbClient) return dbClient;

  const seedData = await seedLoader.load();
  if (seedData && Array.isArray(seedData.clients)) {
    const seedClient = seedData.clients.find(c => c.id === id);
    if (seedClient) {
      return {
        ...seedClient,
        razon_social: seedClient.razon_social || seedClient.name,
        nit: seedClient.nit || (seedClient.document_type === 'NIT' ? seedClient.document_number : ''),
        cedula: seedClient.cedula || (seedClient.document_type === 'CC' ? seedClient.document_number : ''),
        forma_pago: seedClient.forma_pago || seedClient.payment_terms,
        status: seedClient.status ? seedClient.status.toLowerCase() : 'active',
      };
    }
  }

  return null;
}
