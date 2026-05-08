import { Contracts } from '../../../contracts/index.js';
import { Events } from '../../../events/domain-events.js';

/**
 * createDinamicaComercialHandler
 */
export function createDinamicaComercialHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.createDinamicaComercial) {
    throw new Error('repository.createDinamicaComercial requerido para createDinamicaComercialHandler');
  }

  return async (data) => {
    Contracts.validateCrearDinamicaComercial(data);

    await eventBus.emit(Events.DINAMICA_COMERCIAL_CREATE_REQUESTED, data);

    const result = await repository.createDinamicaComercial(data);

    await eventBus.emit(Events.DINAMICA_COMERCIAL_CREATED, {
      ...data,
      id: result?.id ?? result,
    });

    return result;
  };
}

/**
 * updateDinamicaComercialHandler
 */
export function updateDinamicaComercialHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.updateDinamicaComercial) {
    throw new Error('repository.updateDinamicaComercial requerido para updateDinamicaComercialHandler');
  }

  return async (dinamicaId, data) => {
    Contracts.validateActualizarDinamicaComercial(dinamicaId, data);

    await eventBus.emit(Events.DINAMICA_COMERCIAL_UPDATE_REQUESTED, { dinamicaId, ...data });

    const result = await repository.updateDinamicaComercial(dinamicaId, data);

    await eventBus.emit(Events.DINAMICA_COMERCIAL_UPDATED, {
      id: dinamicaId,
      ...data,
      result,
    });

    return result;
  };
}

/**
 * activateDinamicaComercialHandler
 */
export function activateDinamicaComercialHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.activateDinamicaComercial) {
    throw new Error('repository.activateDinamicaComercial requerido para activateDinamicaComercialHandler');
  }

  return async (dinamicaId, data = {}) => {
    Contracts.validateActivarDinamicaComercial(dinamicaId, data);

    await eventBus.emit(Events.DINAMICA_COMERCIAL_ACTIVATE_REQUESTED, { dinamicaId, ...data });

    const result = await repository.activateDinamicaComercial(dinamicaId, data);

    await eventBus.emit(Events.DINAMICA_COMERCIAL_ACTIVATED, {
      id: dinamicaId,
      ...data,
    });

    return result;
  };
}

/**
 * suspendDinamicaComercialHandler
 */
export function suspendDinamicaComercialHandler(deps = {}) {
  const { eventBus, repository } = deps;

  if (!eventBus?.emit) {
    throw new Error('eventBus.emit requerido para handlers de políticas comerciales');
  }
  if (!repository?.suspendDinamicaComercial) {
    throw new Error('repository.suspendDinamicaComercial requerido para suspendDinamicaComercialHandler');
  }

  return async (dinamicaId, data = {}) => {
    Contracts.validateSuspenderDinamicaComercial(dinamicaId, data);

    await eventBus.emit(Events.DINAMICA_COMERCIAL_SUSPEND_REQUESTED, { dinamicaId, ...data });

    const result = await repository.suspendDinamicaComercial(dinamicaId, data);

    await eventBus.emit(Events.DINAMICA_COMERCIAL_SUSPENDED, {
      id: dinamicaId,
      ...data,
    });

    return result;
  };
}
