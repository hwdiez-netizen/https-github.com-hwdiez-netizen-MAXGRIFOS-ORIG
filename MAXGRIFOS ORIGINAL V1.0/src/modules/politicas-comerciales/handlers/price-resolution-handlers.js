import { Contracts } from '../../../contracts/index.js';
import { Events } from '../../../events/domain-events.js';

/**
 * resolvePriceHandler
 */
export function resolvePriceHandler(deps = {}) {
  const { eventBus, queryService, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }

  const resolver = queryService?.resolvePrice || repository?.resolvePrice;
  if (!resolver) {
    throw new Error('queryService.resolvePrice o repository.resolvePrice requerido para resolvePriceHandler');
  }

  return async (data) => {
    Contracts.validateResolverPrecio(data);

    await eventBus.emit(Events.PRICE_RESOLUTION_REQUESTED, data);

    try {
      const result = await resolver(data);

      await eventBus.emit(Events.PRICE_RESOLUTION_RESOLVED, {
        query: data,
        result,
      });

      return result;
    } catch (error) {
      await eventBus.emit(Events.PRICE_RESOLUTION_FAILED, {
        query: data,
        error: error.message,
      });
      throw error;
    }
  };
}
