import { queryClientes } from './cliente-query.js';
import { handleDeactivateCliente, handleActivateCliente } from './handlers/index.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import { applyClientesNisPhase1Overlay, bindSwipeLeftOnList } from './cliente-nis-phase1-overlay.js';

const PAGO_BADGE = {
  '':              { label: 'SIN DEFINIR',   cls: 'pago-pendiente' },
  CONTADO:         { label: 'CONTADO',        cls: 'pago-contado' },
  CONTADO_B2B:     { label: 'CONTADO B2B',    cls: 'pago-contado' },
  CREDITO_15:      { label: 'CREDITO 15 DIAS', cls: 'pago-credito15' },
  CREDITO_30:      { label: 'CREDITO 30 DIAS', cls: 'pago-credito30' },
  CREDITO_45:      { label: 'CREDITO 45 DIAS', cls: 'pago-credito45' },
  B2C_REDES:       { label: 'B2C REDES',       cls: 'pago-b2c' },
  B2C_PROYECTO:    { label: 'B2C PROYECTO',    cls: 'pago-b2c' },
  B2C_CONSTRUCTOR: { label: 'B2C CONSTRUCTOR', cls: 'pago-b2c' },
};

function pagoBadgeHtml(formaPago) {
  const cfg = PAGO_BADGE[formaPago ?? ''] ?? PAGO_BADGE[''];
  return `<span class="pago-badge ${cfg.cls}">${cfg.label}</span>`;
}

export class ClienteList {
  constructor(container) {
    this.container = container;
    this._clientes = [];
    this._tab = 'active';
    this._query = '';
    this._unsubCreated = null;
    this._unsubUpdated = null;
    this._unsubDisc = null;
    this._unsubActiv = null;
    this._swipeCleanup = null;
  }

  async mount() {
    applyClientesNisPhase1Overlay(this.container);
    this.container.innerHTML = '<div class="loading">Cargando clientes...</div>';
    this._clientes = await queryClientes();
    this._render();
    this._subscribeEvents();
    this._bindSwipe();
  }

  unmount() {
    this._unsubCreated?.();
    this._unsubUpdated?.();
    this._unsubDisc?.();
    this._unsubActiv?.();
    this._swipeCleanup?.();
    this._swipeCleanup = null;
  }

  _subscribeEvents() {
    const reload = async () => {
      this._clientes = await queryClientes();
      this._render();
    };
    this._unsubCreated = eventBus.on(Events.CLIENTE_CREATED, reload);
    this._unsubUpdated = eventBus.on(Events.CLIENTE_UPDATED, reload);
    this._unsubDisc = eventBus.on(Events.CLIENTE_DISCONTINUED, reload);
    this._unsubActiv = eventBus.on(Events.CLIENTE_ACTIVATED, reload);
  }

  _filtered() {
    const q = this._query.toLowerCase();
    return this._clientes.filter((c) => {
      if (c.status !== this._tab && !(this._tab === 'active' && !c.status)) return false;
      if (!q) return true;
      return (
        (c.razon_social ?? '').toLowerCase().includes(q) ||
        (c.cedula ?? '').toLowerCase().includes(q) ||
        (c.nit ?? '').toLowerCase().includes(q) ||
        (c.ciudad ?? '').toLowerCase().includes(q)
      );
    });
  }

  _render() {
    const total = this._clientes.filter((c) => c.status === 'active' || !c.status).length;
    const inactivo = this._clientes.filter((c) => c.status === 'inactive').length;
    const list = this._filtered();

    this.container.innerHTML = `
      <div class="list-container">
        <div class="list-header">
          <h2>Clientes</h2>
          <span class="product-count">${total} activos · ${inactivo} inactivos</span>
        </div>

        <button class="btn-primary" id="btn-nuevo-cliente" style="margin-bottom:16px">
          + Nuevo Cliente
        </button>

        <input type="search" class="search-input" id="cliente-search"
          placeholder="Buscar por nombre, cedula, NIT o ciudad..."
          value="${this._query}" autocomplete="off">

        <div class="sub-tabs" style="margin-top:12px">
          <button class="sub-tab ${this._tab === 'active' ? 'active' : ''}" data-tab="active">
            Activos (${this._clientes.filter((c) => c.status === 'active' || !c.status).length})
          </button>
          <button class="sub-tab ${this._tab === 'inactive' ? 'active' : ''}" data-tab="inactive">
            Inactivos (${inactivo})
          </button>
        </div>

        <div id="cliente-list-body" style="margin-top:14px">
          ${list.length === 0 ? this._emptyState() : list.map((c) => this._cardHtml(c)).join('')}
        </div>
      </div>`;

    this._bindEvents();
    this._bindSwipe();
  }

  _cardHtml(c) {
    const sync = c.sync_status === 'synced' ? '🟢' : c.sync_status === 'error' ? '🔴' : '🟡';
    return `
      <div class="product-card cliente-card nis-swipe-target ${c.status === 'inactive' ? 'deactivated' : ''}"
           data-id="${c.id}" role="button" tabindex="0">
        <div class="product-card-header">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="product-nombre">${c.razon_social}</span>
            ${pagoBadgeHtml(c.forma_pago)}
          </div>
          <span class="product-sync">${sync}</span>
        </div>
        <div class="product-meta">
          ${c.cedula ? `<span>CC/CE: ${c.cedula}</span>` : ''}
          ${c.nit ? `<span>NIT: ${c.nit}</span>` : ''}
          ${c.ciudad ? `<span>${c.ciudad}</span>` : ''}
          ${c.celular ? `<span>${c.celular}</span>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn-action btn-edit" data-action="edit" data-id="${c.id}">Editar</button>
          ${c.status === 'inactive'
            ? `<button class="btn-action btn-activate" data-action="activate" data-id="${c.id}">Activar</button>`
            : `<button class="btn-action btn-deactivate" data-action="deactivate" data-id="${c.id}">Desactivar</button>`
          }
        </div>
      </div>`;
  }

  _emptyState() {
    return `<div class="empty-state">
      <div style="font-size:40px;margin-bottom:12px">👤</div>
      <p>${this._query ? 'Sin resultados para tu búsqueda.' : 'No hay clientes registrados aún.'}</p>
    </div>`;
  }

  _bindEvents() {

    this.container.querySelector('#btn-nuevo-cliente')
      ?.addEventListener('click', () => navigate('cliente-form'));

    const searchInput = this.container.querySelector('#cliente-search');
    searchInput?.addEventListener('input', () => {
      this._query = searchInput.value;
      this._render();
    });

    this.container.querySelectorAll('.sub-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._tab = btn.dataset.tab;
        this._render();
      });
    });

    this.container.querySelectorAll('.cliente-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        const id = e.target.closest('[data-id]')?.dataset.id ?? card.dataset.id;
        if (action === 'edit') {
          const c = this._clientes.find((x) => x.id === id);
          if (c) eventBus.emit(Events.EDIT_CLIENTE, c);
          return;
        }
        if (action === 'deactivate') { this._doDeactivate(id); return; }
        if (action === 'activate') { this._doActivate(id); return; }
        const c = this._clientes.find((x) => x.id === card.dataset.id);
        if (c) navigate('cliente-detail', { cliente: c });
      });
    });
  }

  _bindSwipe() {
    this._swipeCleanup?.();
    const swipeSurface = this.container.querySelector('#cliente-list-body') ?? this.container;
    this._swipeCleanup = bindSwipeLeftOnList(swipeSurface, () => {
      const firstCard = this.container.querySelector('.cliente-card[data-id]');
      const firstId = firstCard?.dataset.id;
      if (!firstId) {
        navigate('cliente-form');
        return;
      }
      const cliente = this._clientes.find((x) => x.id === firstId);
      if (!cliente) return;
      navigate('cliente-detail', { cliente });
    });
  }

  async _doDeactivate(id) {
    const c = this._clientes.find((x) => x.id === id);
    if (!c) return;
    if (!await confirmDialog(`Desactivar a ${c.razon_social}?\nEl cliente quedará inactivo pero no será eliminado.`)) return;
    await handleDeactivateCliente(id);
  }

  async _doActivate(id) {
    const c = this._clientes.find((x) => x.id === id);
    if (!c) return;
    await handleActivateCliente(id);
  }
}

function navigate(view, options = {}) {
  window.__erp_navigate?.(view, options);
}

