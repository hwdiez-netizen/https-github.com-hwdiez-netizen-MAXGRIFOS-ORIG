import {
  getAllListas,
  getLista,
  getPrecioItemsByLista,
  getPrecioItemsByProduct,
  getAllDinamicasDB
} from '../../db/local-db.js';

/**
 * createPoliticasQueryService
 * Provee servicios de consulta para el módulo de Políticas Comerciales.
 * @param {Object} repository - Referencia opcional al repository
 */
export function createPoliticasQueryService(repository) {
  return {
    async getListasPrecios() {
      return getAllListas();
    },

    async getListaPreciosById(id) {
      return getLista(id);
    },

    async getPrecioItemsByLista(listaId) {
      return getPrecioItemsByLista(listaId);
    },

    async getDinamicasComerciales() {
      return getAllDinamicasDB();
    },

    /**
     * resolvePrice
     * Motor de resolución de precios real basado en listas activas y items vigentes.
     * @param {Object} query - Objeto de consulta { product_id, lista_id?, forma_pago?, cliente_id? }
     */
    async resolvePrice(query) {
      const { product_id, lista_id, forma_pago, cliente_id } = query;

      if (!product_id) {
        throw new Error('product_id es requerido para resolver el precio');
      }

      // 1. Obtener todos los precios definidos para este producto
      const items = await getPrecioItemsByProduct(product_id);
      
      // Filtrar por items que estén en estado activo (no descontinuados o anulados)
      const activeItems = items.filter(it => it.estado === 'activo' || !it.estado);
      
      if (activeItems.length === 0) {
        throw new Error('No se encontró precio vigente para el producto');
      }

      // 2. Obtener todas las listas para validar su estado y metadata
      const allListas = await getAllListas();
      const activasMap = new Map(
        allListas
          .filter(l => l.estado === 'activa')
          .map(l => [l.id, l])
      );

      // 3. Cruzar items con listas activas
      let candidates = activeItems
        .filter(it => activasMap.has(it.lista_id))
        .map(it => ({
          item: it,
          lista: activasMap.get(it.lista_id)
        }));

      // 4. Aplicar filtros de la consulta
      
      // Filtro por lista_id específica (si el usuario la pide)
      if (lista_id) {
        candidates = candidates.filter(c => c.lista.id === lista_id);
      }

      // Filtro por forma de pago (si el contexto de venta lo requiere)
      if (forma_pago) {
        candidates = candidates.filter(c => c.lista.forma_pago === forma_pago);
      }

      if (candidates.length === 0) {
        throw new Error('No se encontró precio vigente para el producto en listas activas');
      }

      // 5. Selección determinista: lista_id ascendente y luego item_id ascendente.
      candidates = candidates.slice().sort((a, b) => {
        const aListaId = String(a.lista?.id ?? '');
        const bListaId = String(b.lista?.id ?? '');
        const aItemId = String(a.item?.id ?? a.item?.identity_key ?? '');
        const bItemId = String(b.item?.id ?? b.item?.identity_key ?? '');

        if (aListaId !== bListaId) return aListaId.localeCompare(bListaId);
        return aItemId.localeCompare(bItemId);
      });

      const bestMatch = candidates[0];
      const { item, lista } = bestMatch;

      return {
        product_id,
        cliente_id: cliente_id ?? null,
        lista_id: lista.id,
        precio_item: item,
        lista: lista,
        precio_venta: item.precio_venta,
        moneda: item.moneda ?? 'COP',
        fuente: 'politicas-comerciales'
      };
    }
  };
}

export const politicasQueryService = createPoliticasQueryService();
