import { Contracts } from '../../../contracts/index.js';
import { Events } from '../../../events/domain-events.js';

/**
 * createListaPreciosHandler
 * @param {Object} deps - inyección de dependencias
 */
export function createListaPreciosHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.createListaPrecios) {
    throw new Error('repository.createListaPrecios requerido para crearListaPreciosHandler');
  }

  return async (data) => {
    Contracts.validateCrearListaPrecios(data);

    await eventBus.emit(Events.LISTA_PRECIOS_CREATE_REQUESTED, data);

    const result = await repository.createListaPrecios(data);

    await eventBus.emit(Events.LISTA_PRECIOS_CREATED, {
      ...data,
      id: result?.id ?? result,
    });

    return result;
  };
}

/**
 * updateListaPreciosHandler
 */
export function updateListaPreciosHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.updateListaPrecios) {
    throw new Error('repository.updateListaPrecios requerido para updateListaPreciosHandler');
  }

  return async (listaId, data) => {
    Contracts.validateActualizarListaPrecios(listaId, data);

    await eventBus.emit(Events.LISTA_PRECIOS_UPDATE_REQUESTED, { listaId, ...data });

    const result = await repository.updateListaPrecios(listaId, data);

    await eventBus.emit(Events.LISTA_PRECIOS_UPDATED, {
      id: listaId,
      ...data,
      result,
    });

    return result;
  };
}

/**
 * activateListaPreciosHandler
 */
export function activateListaPreciosHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.activateListaPrecios) {
    throw new Error('repository.activateListaPrecios requerido para activateListaPreciosHandler');
  }

  return async (listaId, data = {}) => {
    Contracts.validateActivarListaPrecios(listaId, data);

    await eventBus.emit(Events.LISTA_PRECIOS_ACTIVATE_REQUESTED, { listaId, ...data });

    const result = await repository.activateListaPrecios(listaId, data);

    await eventBus.emit(Events.LISTA_PRECIOS_ACTIVATED, {
      id: listaId,
      ...data,
    });

    return result;
  };
}

/**
 * suspendListaPreciosHandler
 */
export function suspendListaPreciosHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.suspendListaPrecios) {
    throw new Error('repository.suspendListaPrecios requerido para suspendListaPreciosHandler');
  }

  return async (listaId, data = {}) => {
    Contracts.validateSuspenderListaPrecios(listaId, data);

    await eventBus.emit(Events.LISTA_PRECIOS_SUSPEND_REQUESTED, { listaId, ...data });

    const result = await repository.suspendListaPrecios(listaId, data);

    await eventBus.emit(Events.LISTA_PRECIOS_SUSPENDED, {
      id: listaId,
      ...data,
    });

    return result;
  };
}

/**
 * cancelListaPreciosHandler
 */
export function cancelListaPreciosHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.cancelListaPrecios) {
    throw new Error('repository.cancelListaPrecios requerido para cancelListaPreciosHandler');
  }

  return async (listaId, data = {}) => {
    Contracts.validateCancelarListaPrecios(listaId, data);

    await eventBus.emit(Events.LISTA_PRECIOS_CANCEL_REQUESTED, { listaId, ...data });

    const result = await repository.cancelListaPrecios(listaId, data);

    await eventBus.emit(Events.LISTA_PRECIOS_CANCELLED, {
      id: listaId,
      ...data,
    });

    return result;
  };
}
