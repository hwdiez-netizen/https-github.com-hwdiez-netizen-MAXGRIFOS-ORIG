import { getAllDinamicas, getDinamicaCompleta } from './dinamica-store.js';
import { handleActivarDinamicaComercial, handleDesactivarDinamicaComercial } from './handlers/index.js';

const ESTADO_LABEL = {
  creacion: 'Creación', edicion: 'Edición', standby: 'Standby',
  activa: 'Activa', inactiva: 'Inactiva', cancelada: 'Cancelada',
};

const ESTADO_CLASS = {
  creacion: 'ep-creacion', edicion: 'ep-edicion', standby: 'ep-standby',
  activa: 'ep-activa', inactiva: 'ep-suspendida', cancelada: 'ep-cancelada',
};

const AUDIT_LABEL = {
  CREACION: 'Creación', MODIFICACION: 'Modificación', ACTIVACION: 'Activación',
  DESACTIVACION: 'Desactivación', STANDBY: 'Standby', CANCELACION: 'Cancelación',
  PEDIDO_CERRADO: 'Pedido cerrado',
};

export class DinamicaList {
  constructor(container) {
    this._container = container;
    this._tab = 'activas';
    this._expandedHistory = new Set();
  }

  async mount() {
    this._render();
  }

  unmount() {
    this._container.innerHTML = '';
  }

  async _render() {
    const all = await getAllDinamicas();
    const activas = all.filter((d) => ['activa', 'inactiva', 'edicion', 'standby'].includes(d.estado_proceso));
    const enProceso = all.filter((d) => ['creacion'].includes(d.estado_proceso));
    const canceladas = all.filter((d) => d.estado_proceso === 'cancelada');

    const lista = this._tab === 'activas' ? [...activas, ...enProceso]
      : canceladas;

    this._container.innerHTML = `
      <div class="list-container">
        <div class="list-header">
          <h2 class="page-title">Políticas Comerciales</h2>
        </div>
        <div class="politicas-module-tabs">
          <button class="politicas-module-tab" data-view="politicas">Listas de Precios</button>
          <button class="politicas-module-tab active" data-view="dinamicas">Dinámicas</button>
        </div>
        <div class="list-header" style="margin-top:16px">
          <span class="product-count">${all.filter((d) => d.estado_proceso !== 'cancelada').length} dinámica(s)</span>
          <button class="btn-nueva-din btn-primary" style="width:auto;padding:9px 18px;font-size:14px">+ Nueva Dinámica</button>
        </div>
        <div class="sub-tabs">
          <button class="sub-tab ${this._tab === 'activas' ? 'active' : ''}" data-tab="activas">Activas / En proceso</button>
          <button class="sub-tab ${this._tab === 'canceladas' ? 'active' : ''}" data-tab="canceladas">Canceladas</button>
        </div>
        <div class="dinamica-list-body" id="din-body">
          ${lista.length === 0
            ? '<div class="empty-state">Sin dinámicas en esta categoría</div>'
            : lista.map((d) => this._renderCard(d)).join('')}
        </div>
      </div>`;

    this._container.querySelector('.btn-nueva-din')
      .addEventListener('click', () => window.__erp_navigate('dinamica-form'));

    this._container.querySelector('[data-view="politicas"]')
      .addEventListener('click', () => window.__erp_navigate('politicas'));

    this._container.querySelectorAll('.sub-tab').forEach((btn) => {
      btn.addEventListener('click', () => { this._tab = btn.dataset.tab; this._render(); });
    });

    this._container.querySelectorAll('.btn-editar-din').forEach((btn) => {
      btn.addEventListener('click', () => window.__erp_navigate('dinamica-form', { dinamicaId: btn.dataset.id }));
    });

    this._container.querySelectorAll('.btn-toggle-din').forEach((btn) => {
      btn.addEventListener('click', () => this._toggleActiva(btn.dataset.id, btn.dataset.activa === 'true'));
    });

    this._container.querySelectorAll('.btn-history-din').forEach((btn) => {
      btn.addEventListener('click', () => this._toggleHistory(btn.dataset.id));
    });
  }

  _renderCard(d) {
    const epLabel = ESTADO_LABEL[d.estado_proceso] ?? d.estado_proceso;
    const epClass = ESTADO_CLASS[d.estado_proceso] ?? '';
    const syncIcon = d.sync_status === 'synced' ? '🟢' : d.sync_status === 'error' ? '🔴' : '🟡';
    const editable = ['creacion', 'edicion', 'standby', 'inactiva'].includes(d.estado_proceso);
    const togglable = ['activa', 'inactiva', 'edicion', 'standby'].includes(d.estado_proceso);
    const isActiva = d.activa;
    const expanded = this._expandedHistory.has(d.id);

    const fechas = [
      d.fecha_inicio ? `Inicio: ${d.fecha_inicio}` : '',
      d.fecha_fin ? `Fin: ${d.fecha_fin}` : '',
    ].filter(Boolean).join('  ·  ');

    return `
      <div class="dinamica-card">
        <div class="dinamica-card-header">
          <div class="dinamica-card-title">${d.nombre}</div>
          <span class="product-sync">${syncIcon}</span>
        </div>
        ${fechas ? `<div class="dinamica-card-fechas">${fechas}</div>` : ''}
        ${d.condiciones ? `<div class="dinamica-card-condiciones">${d.condiciones.slice(0, 120)}${d.condiciones.length > 120 ? '…' : ''}</div>` : ''}
        <div class="card-badges" style="margin-top:8px">
          <span class="ep-badge ${epClass}">${epLabel}</span>
          ${togglable ? `
            <label class="status-toggle" title="${isActiva ? 'Desactivar' : 'Activar'}">
              <input type="checkbox" class="toggle-input" ${isActiva ? 'checked' : ''} disabled>
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              <span class="toggle-label">${isActiva ? 'ON' : 'OFF'}</span>
            </label>` : ''}
        </div>
        <div class="card-actions">
          ${editable || d.estado_proceso === 'activa' ? `<button class="btn-action btn-edit btn-editar-din" data-id="${d.id}">Editar</button>` : ''}
          ${togglable ? `<button class="btn-action ${isActiva ? 'btn-deactivate' : 'btn-activate'} btn-toggle-din" data-id="${d.id}" data-activa="${isActiva}">${isActiva ? 'Desactivar' : 'Activar'}</button>` : ''}
          <button class="btn-action btn-history-din" data-id="${d.id}" style="border-color:#c7d7f9;color:#1e40af">
            ${expanded ? 'Ocultar historial' : 'Ver historial'}
          </button>
        </div>
        <div class="dinamica-history ${expanded ? '' : 'hidden'}" id="hist-${d.id}">
          <div class="loading" style="padding:12px;font-size:12px">Cargando historial…</div>
        </div>
      </div>`;
  }

  async _toggleActiva(id, isActiva) {
    try {
      if (isActiva) await handleDesactivarDinamicaComercial(id);
      else await handleActivarDinamicaComercial(id);
      this._render();
    } catch (e) {
      alert(e.message);
    }
  }

  async _toggleHistory(id) {
    if (this._expandedHistory.has(id)) {
      this._expandedHistory.delete(id);
      this._render();
      return;
    }
    this._expandedHistory.add(id);
    this._render();
    const histEl = this._container.querySelector(`#hist-${id}`);
    if (!histEl) return;
    const completa = await getDinamicaCompleta(id);
    if (!completa || completa.auditoria.length === 0) {
      histEl.innerHTML = '<div style="padding:10px;font-size:12px;color:#6b7280">Sin historial registrado.</div>';
      return;
    }
    histEl.innerHTML = completa.auditoria.map((a) => `
      <div class="history-entry">
        <span class="history-tipo">${AUDIT_LABEL[a.tipo] ?? a.tipo}</span>
        <span class="history-fecha">${new Date(a.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>`).join('');
  }
}
