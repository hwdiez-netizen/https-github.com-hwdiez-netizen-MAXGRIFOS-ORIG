/**
 * CAUSALES HANDLERS — Capa Handler para catálogo de causales de ajuste
 * Flujo obligatorio: UI → Handler → Contract → Store
 */

import {
  getCausalesActivas as _getCausalesActivas,
  getAllCausales as _getAllCausales,
  addCausal as _addCausal,
  updateCausal as _updateCausal,
  toggleCausal as _toggleCausal,
  resetToPreset as _resetToPreset,
  initCausalesPreset as _initCausalesPreset,
} from './causales-store.js';
import { Contracts } from '../../contracts/index.js';

export function handleInitCausalesPreset() {
  _initCausalesPreset();
}

export function handleGetCausalesActivas() {
  return _getCausalesActivas();
}

export function handleGetAllCausales() {
  return _getAllCausales();
}

export function handleAddCausal(data) {
  Contracts.validateNuevaCausal(data);
  return _addCausal(data);
}

export function handleUpdateCausal(id, data) {
  if (!id || !String(id).trim()) throw new Error('ID de causal requerido');
  Contracts.validateNuevaCausal(data);
  return _updateCausal(id, data);
}

export function handleToggleCausal(id) {
  if (!id || !String(id).trim()) throw new Error('ID de causal requerido');
  return _toggleCausal(id);
}

export function handleResetCausalesPreset() {
  return _resetToPreset();
}
