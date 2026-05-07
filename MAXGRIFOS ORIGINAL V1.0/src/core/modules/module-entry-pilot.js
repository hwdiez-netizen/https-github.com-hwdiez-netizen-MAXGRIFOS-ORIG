/**
 * Module Entry Pilot View
 * Componente visual piloto para probar la arquitectura de entrada.
 */

import { ModuleEntryJoint } from './module-entry-end-joint.js';

export const renderModuleEntryPilot = (container) => {
  if (!container) return;

  const view = document.createElement('div');
  view.className = 'mg-pilot-view mg-fade-in';

  view.innerHTML = `
    <div class="mg-pilot-header">
      <span class="mg-pilot-badge">PROTOTIPO F6</span>
      <h1>Piloto de Entrada</h1>
      <p>Validación de contratos NIS 2.0</p>
    </div>

    <div class="mg-pilot-content">
      <div class="mg-pilot-card">
        <h3>Contrato de Acceso</h3>
        <p>Este botón activa el flujo: Joint &rarr; Contract &rarr; Handler &rarr; Bus.</p>
        <button id="btn-request-access" class="mg-btn mg-btn-primary">
          Solicitar Acceso Seguro
        </button>
      </div>

      <div class="mg-pilot-logs" id="pilot-logs">
        <div class="mg-log-entry meta">Esperando interacción...</div>
      </div>
    </div>
  `;

  const btn = view.querySelector('#btn-request-access');
  const logs = view.querySelector('#pilot-logs');

  const addLog = (msg, type = 'info') => {
    const entry = document.createElement('div');
    entry.className = `mg-log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logs.prepend(entry);
  };

  btn.addEventListener('click', () => {
    addLog('Clic detectado. Iniciando requestEntry...', 'meta');
    
    const result = ModuleEntryJoint.requestEntry('PILOT_MODULE', '/module-entry-pilot', 'PILOT_UI');
    
    if (result.ok) {
      addLog('Contrato Aceptado: Entrada validada.', 'success');
      btn.textContent = 'Acceso Concedido';
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = 'Solicitar Acceso Seguro';
        btn.disabled = false;
      }, 2000);
    } else {
      addLog(`Contrato Rechazado: ${result.message}`, 'error');
    }
  });

  container.innerHTML = '';
  container.appendChild(view);
};
