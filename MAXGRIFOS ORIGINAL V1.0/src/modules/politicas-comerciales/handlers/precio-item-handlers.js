import { Contracts } from '../../../contracts/index.js';
import { Events } from '../../../events/domain-events.js';

/**
 * assignPrecioItemHandler
 */
export function assignPrecioItemHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.assignPrecioItem) {
    throw new Error('repository.assignPrecioItem requerido para assignPrecioItemHandler');
  }

  return async (data) => {
    Contracts.validateGuardarPrecioItem(data);

    await eventBus.emit(Events.PRECIO_ITEM_ASSIGN_REQUESTED, data);

    const result = await repository.assignPrecioItem(data);

    await eventBus.emit(Events.PRECIO_ITEM_ASSIGNED, {
      ...data,
      result,
    });

    return result;
  };
}

/**
 * updatePrecioItemHandler
 */
export function updatePrecioItemHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.updatePrecioItem) {
    throw new Error('repository.updatePrecioItem requerido para updatePrecioItemHandler');
  }

  return async (data) => {
    Contracts.validateGuardarPrecioItem(data);

    await eventBus.emit(Events.PRECIO_ITEM_UPDATE_REQUESTED, data);

    const result = await repository.updatePrecioItem(data);

    await eventBus.emit(Events.PRECIO_ITEM_UPDATED, {
      ...data,
      result,
    });

    return result;
  };
}

/**
 * savePrecioItemsHandler
 */
export function savePrecioItemsHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.savePrecioItems) {
    throw new Error('repository.savePrecioItems requerido para savePrecioItemsHandler');
  }

  return async (data) => {
    Contracts.validateGuardarPrecioItems(data);

    await eventBus.emit(Events.PRECIO_ITEMS_SAVE_REQUESTED, data);

    const result = await repository.savePrecioItems(data);

    await eventBus.emit(Events.PRECIO_ITEMS_SAVED, {
      ...data,
      result,
    });

    return result;
  };
}
