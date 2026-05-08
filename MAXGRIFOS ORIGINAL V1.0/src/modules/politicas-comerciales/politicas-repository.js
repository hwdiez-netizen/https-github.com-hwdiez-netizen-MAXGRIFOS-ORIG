import {
  saveLista,
  getLista,
  getAllListas,
  savePrecioItem,
  getPrecioItem,
  getPrecioItemsByLista,
  getPrecioItemsByProduct,
  saveDinamica,
  getDinamica,
  getAllDinamicasDB,
  saveWithOutbox,
} from '../../db/local-db.js';

/**
 * createPoliticasRepository
 * Provee persistencia para el módulo de Políticas Comerciales siguiendo el patrón V2.
 * @param {Object} initialState - Estado inicial opcional
 */
export function createPoliticasRepository(initialState = {}) {
  return {
    /**
     * createListaPrecios
     * Crea una nueva lista de precios de forma idempotente.
     */
    async createListaPrecios(data) {
      // Idempotencia: Verificar por _idempotency_key si existe
      const ik = data._idempotency_key || data.idempotency_key;
      if (ik) {
        const all = await getAllListas();
        const existing = all.find(l => l.idempotency_key === ik || l._idempotency_key === ik);
        if (existing) return existing;
      }

      // Id determinístico
      const id = data.id ?? data.identity_key;
      if (!id) throw new Error('ID o Identity Key requerida para crear lista de precios');

      const entity = {
        ...data,
        id,
        estado: data.estado ?? 'borrador',
        items: data.items ?? [],
        identity_key: data.identity_key ?? id,
        idempotency_key: ik ?? `LP:CREATE:${id}`,
      };

      await saveWithOutbox('listas_precios', entity, {
        type: 'CREATE',
        entity: 'lista_precios',
        entity_id: id,
        payload: entity,
        idempotency_key: data._idempotency_key ?? data.idempotency_key ?? `OUTBOX:LP:${id}:CREATE`,
      });
      
      return entity;
    },

    /**
     * updateListaPrecios
     */
    async updateListaPrecios(listaId, data) {
      const existing = await getLista(listaId);
      if (!existing) throw new Error(`Lista de precios ${listaId} no encontrada`);

      // Filtrar campos para evitar borrar id/identity_key
      const { id, identity_key, ...updateData } = data;
      
      const updated = {
        ...existing,
        ...updateData,
        id: existing.id,
        identity_key: existing.identity_key,
      };

      await saveWithOutbox('listas_precios', updated, {
        type: 'UPDATE',
        entity: 'lista_precios',
        entity_id: listaId,
        payload: updated,
        idempotency_key: data._idempotency_key ?? data.idempotency_key ?? `OUTBOX:LP:${listaId}:UPDATE`,
      });
      
      return updated;
    },

    async activateListaPrecios(listaId, data = {}) {
      return this.updateListaPrecios(listaId, { ...data, estado: 'activa' });
    },

    async suspendListaPrecios(listaId, data = {}) {
      return this.updateListaPrecios(listaId, { ...data, estado: 'suspendida' });
    },

    async cancelListaPrecios(listaId, data = {}) {
      return this.updateListaPrecios(listaId, { ...data, estado: 'cancelada' });
    },

    /**
     * assignPrecioItem
     * Crea o reemplaza un item de precio por su identidad.
     */
    async assignPrecioItem(data) {
      const id = data.id ?? data.identity_key;
      const entity = {
        ...data,
        id,
        estado: data.estado ?? 'activo',
        identity_key: data.identity_key ?? id,
        idempotency_key: data._idempotency_key ?? data.idempotency_key ?? `PI:ASSIGN:${id}`,
      };

      await savePrecioItem(entity);
      return entity;
    },

    /**
     * updatePrecioItem
     */
    async updatePrecioItem(data) {
      const id = data.id ?? data.identity_key;
      const existing = await getPrecioItem(id);
      if (!existing) throw new Error(`Item de precio ${id} no encontrado`);

      const updated = {
        ...existing,
        ...data,
        id: existing.id,
        identity_key: existing.identity_key,
      };
      
      await savePrecioItem(updated);
      return updated;
    },

    /**
     * savePrecioItems
     * Guarda múltiples items de una lista.
     */
    async savePrecioItems(data) {
      const { lista_id, items } = data;
      const saved = [];
      
      for (const item of items) {
        const itemWithLista = { 
          ...item, 
          lista_id: lista_id ?? item.lista_id 
        };
        const result = await this.assignPrecioItem(itemWithLista);
        saved.push(result);
      }
      
      return saved;
    },

    /**
     * createDinamicaComercial
     */
    async createDinamicaComercial(data) {
      const id = data.id ?? data.identity_key;
      const entity = {
        ...data,
        id,
        estado: data.estado ?? 'borrador',
        identity_key: data.identity_key ?? id,
        idempotency_key: data._idempotency_key ?? data.idempotency_key ?? `DC:CREATE:${id}`,
      };

      await saveWithOutbox('dinamica_comercial', entity, {
        type: 'CREATE',
        entity: 'dinamica_comercial',
        entity_id: id,
        payload: entity,
        idempotency_key: data._idempotency_key ?? data.idempotency_key ?? `OUTBOX:DC:${id}:CREATE`,
      });
      
      return entity;
    },

    /**
     * updateDinamicaComercial
     */
    async updateDinamicaComercial(dinamicaId, data) {
      const existing = await getDinamica(dinamicaId);
      if (!existing) throw new Error(`Dinámica comercial ${dinamicaId} no encontrada`);

      const { id, identity_key, ...updateData } = data;

      const updated = {
        ...existing,
        ...updateData,
        id: existing.id,
        identity_key: existing.identity_key,
      };

      await saveWithOutbox('dinamica_comercial', updated, {
        type: 'UPDATE',
        entity: 'dinamica_comercial',
        entity_id: dinamicaId,
        payload: updated,
        idempotency_key: data._idempotency_key ?? data.idempotency_key ?? `OUTBOX:DC:${dinamicaId}:UPDATE`,
      });
      
      return updated;
    },

    async activateDinamicaComercial(dinamicaId, data = {}) {
      return this.updateDinamicaComercial(dinamicaId, { ...data, estado: 'activa' });
    },

    async suspendDinamicaComercial(dinamicaId, data = {}) {
      return this.updateDinamicaComercial(dinamicaId, { ...data, estado: 'suspendida' });
    },

    /**
     * resolvePrice
     * Requerido por handlers-pc4. Implementación real delegada al motor de resolución.
     */
    async resolvePrice(query) {
      // Delegamos a la instancia singleton del servicio para evitar duplicidad de lógica
      // import tardío o manual para evitar ciclos si fuera necesario, 
      // pero aquí usamos la lógica directamente o importamos el servicio.
      const { politicasQueryService } = await import('./politicas-query-service.js');
      return politicasQueryService.resolvePrice(query);
    }
  };
}

export const politicasRepository = createPoliticasRepository();
