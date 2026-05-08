export * from './lista-precios-handlers.js';
export * from './precio-item-handlers.js';
export * from './dinamica-comercial-handlers.js';
export * from './price-resolution-handlers.js';

import {
  createListaPreciosHandler,
  updateListaPreciosHandler,
  activateListaPreciosHandler,
  suspendListaPreciosHandler,
  cancelListaPreciosHandler,
} from './lista-precios-handlers.js';

import {
  assignPrecioItemHandler,
  updatePrecioItemHandler,
  savePrecioItemsHandler,
} from './precio-item-handlers.js';

import {
  createDinamicaComercialHandler,
  updateDinamicaComercialHandler,
  activateDinamicaComercialHandler,
  suspendDinamicaComercialHandler,
} from './dinamica-comercial-handlers.js';

import { resolvePriceHandler } from './price-resolution-handlers.js';


/**
 * createPoliticasComercialesHandlers
 * Factory para inyectar dependencias en todos los handlers del módulo
 * @param {Object} deps - dependencias (eventBus, repository, queryService)
 */
export function createPoliticasComercialesHandlers(deps = {}) {
  return {
    createListaPrecios: createListaPreciosHandler(deps),
    updateListaPrecios: updateListaPreciosHandler(deps),
    activateListaPrecios: activateListaPreciosHandler(deps),
    suspendListaPrecios: suspendListaPreciosHandler(deps),
    cancelListaPrecios: cancelListaPreciosHandler(deps),
    
    assignPrecioItem: assignPrecioItemHandler(deps),
    updatePrecioItem: updatePrecioItemHandler(deps),
    savePrecioItems: savePrecioItemsHandler(deps),
    
    createDinamicaComercial: createDinamicaComercialHandler(deps),
    updateDinamicaComercial: updateDinamicaComercialHandler(deps),
    activateDinamicaComercial: activateDinamicaComercialHandler(deps),
    suspendDinamicaComercial: suspendDinamicaComercialHandler(deps),
    
    resolvePrice: resolvePriceHandler(deps),
  };
}
