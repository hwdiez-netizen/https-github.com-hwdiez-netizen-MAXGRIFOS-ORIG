/**
 * Kernel de Handlers - Ejecutor de lógica transaccional V2
 */
import { contractKernel } from '../contracts/contract-kernel.js';
import { eventBus } from '../event-bus/event-bus.js';
import { HandlerResult } from './handler-result.js';

export class HandlerKernel {
  constructor() {
    this.handlers = new Map();
  }

  /**
   * Registrar un handler con su contrato asociado
   */
  register(intentName, { contract, logic }) {
    this.handlers.set(intentName, { contract, logic });
  }

  /**
   * Ejecutar un handler asegurando cumplimiento de contrato
   */
  async execute(intentName, payload, metadata = {}) {
    const handler = this.handlers.get(intentName);
    if (!handler) {
      return HandlerResult.Fail(`Handler ${intentName} not found`, 'NOT_FOUND');
    }

    // 1. Validar Contrato
    const validation = await contractKernel.validate(handler.contract, payload);
    if (!validation.ok) {
      return HandlerResult.Fail(validation.message, 'CONTRACT_VIOLATION');
    }

    // 2. Ejecutar Lógica
    try {
      const resultData = await handler.logic(payload, metadata);
      
      // 3. Emitir evento si fue exitoso
      eventBus.publish({
        type: `intent:${intentName}:success`,
        payload: resultData,
        metadata: { ...metadata, intent: intentName }
      });

      return HandlerResult.Success(resultData);
    } catch (error) {
      return HandlerResult.Fail(error.message, 'LOGIC_EXCEPTION');
    }
  }
}

export const handlerKernel = new HandlerKernel();
export default handlerKernel;
