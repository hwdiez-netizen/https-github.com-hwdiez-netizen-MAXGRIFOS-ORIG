import { getClientes, getClienteById, buildClienteIdentity } from './cliente-store.js';
import { seedLoader } from '../../core/seed/seed-loader.js';

export async function queryClientes() {
  const allFromDb = await getClientes() || [];
  let all = [...allFromDb];

  const seedData = await seedLoader.load();
  if (seedData && Array.isArray(seedData.clients)) {
    const dbNits = new Set(all.map(c => c.nit).filter(Boolean));
    const dbCedulas = new Set(all.map(c => c.cedula).filter(Boolean));
    const dbIdentityKeys = new Set(all.map(c => c.identity_key).filter(Boolean));
    const dbIds = new Set(all.map(c => c.id).filter(Boolean));
    
    seedData.clients.forEach((seedClient, index) => {
      const nit = seedClient.nit || (seedClient.document_type === 'NIT' ? seedClient.document_number : '');
      const cedula = seedClient.cedula || (seedClient.document_type === 'CC' ? seedClient.document_number : '');
      
      // Motor oficial para identidad determinista
      let identity;
      try {
        identity = buildClienteIdentity({ nit, cedula });
      } catch (err) {
        // Fallback determinístico si falta nit/cedula
        const fallbackId = `CLI:FALLBACK:${index}`;
        identity = { id: fallbackId, identity_key: fallbackId, idempotency_key: `SEED:${fallbackId}` };
      }

      const hasNit = nit && dbNits.has(nit);
      const hasCedula = cedula && dbCedulas.has(cedula);
      const hasId = dbIds.has(identity.id) || dbIdentityKeys.has(identity.identity_key);

      if (!hasNit && !hasCedula && !hasId) {
        const qrRef = nit || cedula || identity.id;
        all.push({
          ...seedClient,
          id: identity.id,
          identity_key: identity.identity_key,
          idempotency_key: identity.idempotency_key || `SEED:${identity.id}`,
          razon_social: seedClient.razon_social || seedClient.name,
          nit,
          cedula,
          forma_pago: seedClient.forma_pago || seedClient.payment_terms,
          status: seedClient.status ? seedClient.status.toLowerCase() : 'active',
          qr_code: `MGC:${identity.id}:${qrRef}`,
        });
      }
    });
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
    // Primero buscar por ID exacto
    let seedClient = seedData.clients.find(c => c.id === id);
    
    // Si no encuentra, intentar regenerar ID oficial por si el seed original tenía uno legacy
    if (!seedClient) {
      for (const candidate of seedData.clients) {
        const nit = candidate.nit || (candidate.document_type === 'NIT' ? candidate.document_number : '');
        const cedula = candidate.cedula || (candidate.document_type === 'CC' ? candidate.document_number : '');
        try {
          const identity = buildClienteIdentity({ nit, cedula });
          if (identity.id === id) {
            seedClient = candidate;
            break;
          }
        } catch { /* skip */ }
      }
    }

    if (seedClient) {
      const nit = seedClient.nit || (seedClient.document_type === 'NIT' ? seedClient.document_number : '');
      const cedula = seedClient.cedula || (seedClient.document_type === 'CC' ? seedClient.document_number : '');
      let identity;
      try { identity = buildClienteIdentity({ nit, cedula }); } catch { identity = { id: seedClient.id }; }
      
      const qrRef = nit || cedula || identity.id;

      return {
        ...seedClient,
        id: identity.id,
        razon_social: seedClient.razon_social || seedClient.name,
        nit,
        cedula,
        forma_pago: seedClient.forma_pago || seedClient.payment_terms,
        status: seedClient.status ? seedClient.status.toLowerCase() : 'active',
        qr_code: `MGC:${identity.id}:${qrRef}`,
      };
    }
  }

  return null;
}
