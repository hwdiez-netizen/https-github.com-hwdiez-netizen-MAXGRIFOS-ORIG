/**
 * Module Entry End Joint
 * Punto de unión entre UI e infraestructura de entrada.
 * 
 * F6 Arquitectura:
 * UI Intent -> [End Joint] -> Contract -> Handler -> Event Bus
 */

import { handleModuleEntry } from './module-entry-handler.js';

export const ModuleEntryJoint = {
  /**
   * Solicita acceso a un módulo de forma segura.
   */
  requestEntry: (moduleId, route, source = 'UI_MANUAL') => {
    const idempotency_key = `ENTRY:${moduleId}:${route}:${source}`;
    
    const intent = {
      moduleId,
      route,
      source,
      idempotency_key
    };

    return handleModuleEntry(intent);
  }
};
