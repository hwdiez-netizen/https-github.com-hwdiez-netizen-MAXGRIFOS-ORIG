/**
 * Module Entry Handler
 * Orquestador de entrada a módulos.
 * 
 * Flujo: Intent > Contract > EventBus
 * No escribe en Store.
 */

import { validateModuleEntry } from './module-entry-contract.js';
import { eventBus } from '../event-bus/event-bus.js';
import { CORE_EVENTS } from '../event-bus/event-types.js';

export const handleModuleEntry = (intent) => {
  console.debug('[ModuleHandler] Entry requested:', intent.moduleId);

  // 1. Ejecutar Contrato
  const validation = validateModuleEntry(intent);

  if (!validation.ok) {
    console.warn('[ModuleHandler] Rejection:', validation.message, validation.issues);
    
    eventBus.publish({
      type: CORE_EVENTS.UI_NOTICE,
      payload: {
        message: `Error al entrar al módulo: ${validation.issues.join(', ')}`,
        type: 'error'
      }
    });

    return validation;
  }

  // 2. Emitir Intención Validada (Sin transacciones de datos)
  eventBus.publish({
    type: 'CORE_MODULE_ENTRY_SUCCESS',
    payload: {
      ...validation.normalized,
      status: 'ROUTING_ALLOWED'
    }
  });

  return validation;
};
