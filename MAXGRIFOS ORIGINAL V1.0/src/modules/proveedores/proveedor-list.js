import { getAllProveedores } from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { handleDesactivarProveedor, handleActivarProveedor } from './handlers/index.js';

function fmtSync(s) {
  return s === 'synced' ? '🟢' : s === 'error' ? '🔴' : '🟡';
}

export class ProveedorList {
  constructor(container) {
    this._container = container;
    this._proveedores = [];
    this._query = '';
    this._showInactive = false;
    this._unsubs = [];
  }

  async mount() {
    this._container.innerHTML = '<div class="loading">Cargando proveedores...</div>';
    this._proveedores = await getAllProveedores();
    this._render();
    this._subscribeEvents();
  }

  unmount() {
    this._unsubs.forEach((fn) => fn());
  }

  _subscribeEvents() {
    const reload = async () => {
      this._proveedores = await getAllProveedores();
      this._render();
    };
    this._unsubs.push(eventBus.on(Events.PROVEEDOR_CREADO, reload));
    this._unsubs.push(eventBus.on(Events.PROVEEDOR_ACTUALIZADO, reload));
    this._unsubs.push(eventBus.on(Events.PROVEEDOR_DESACTIVADO, reload));
    this._unsubs.push(eventBus.on(Events.PROVEEDOR_ACTIVADO, reload));
  }

  _filtered() {
    const q = this._query.toLowerCase();
    let list = this._showInactive
      ? this._proveedores
      : this._proveedores.filter((p) => p.status !== 'inactive');
    if (!q) return list;
    return list.filter(
      (p) =>
        (p.razon_social ?? '').toLowerCase().includes(q) ||
        (p.nit ?? '').toLowerCase().includes(q)
    );
  }

  _render() {
    const list = this._filtered();
    const totalActivos = this._proveedores.filter((p) => p.status === 'active').length;
    const totalInactivos = this._proveedores.filter((p) => p.status === 'inactive').length;

    this._container.innerHTML = `
      <div class="list-container">
        <div class="list-header">
          <h2>Proveedores</h2>
          <span class="product-count">${totalActivos} activos${totalInactivos > 0 ? ` · ${totalInactivos} inactivos` : ''}</span>
        </div>

        <button class="btn-primary" id="btn-nuevo-prov" style="margin-bottom:12px;width:100%">
          + Nuevo Proveedor
        </button>

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;cursor:pointer;user-select:none">
            <input type="checkbox" id="toggle-inactivos" ${this._showInactive ? 'checked' : ''}
              style="width:16px;height:16px;cursor:pointer">
            Mostrar inactivos
          </label>
        </div>

        <input type="search" class="search-input" id="prov-search"
          placeholder="Buscar por razón social o NIT..."
          value="${this._query}" autocomplete="off">

        <div id="prov-list-body" style="margin-top:14px">
          ${list.length === 0 ? this._emptyState() : list.map((p) => this._cardHtml(p)).join('')}
        </div>
      </div>`;

    this._bindEvents();
  }

  _cardHtml(p) {
    const sync = fmtSync(p.sync_status);
    const isInactive = p.status === 'inactive';
    return `
      <div class="product-card${isInactive ? ' opacity-60' : ''}" data-id="${p.id}" role="button" tabindex="0"
           style="cursor:pointer${isInactive ? ';opacity:0.6;border-left:3px solid #dc2626' : ''}">
        <div class="product-card-header">
          <span class="product-nombre">${p.razon_social}${isInactive ? ' <span style="color:#dc2626;font-size:0.75em">[INACTIVO]</span>' : ''}</span>
          <span class="product-sync">${sync}</span>
        </div>
        <div class="product-meta">
          ${p.nit ? `<span>NIT: ${p.nit}</span>` : ''}
          ${p.ciudad ? `<span>${p.ciudad}</span>` : ''}
          ${p.celular ? `<span>${p.celular}</span>` : ''}
          ${p.forma_pago ? `<span>${p.forma_pago}</span>` : ''}
        </div>
        <div class="card-actions">
          ${!isInactive
            ? `<button class="btn-action btn-edit" data-action="edit" data-id="${p.id}">Editar</button>
               <button class="btn-action" data-action="deactivate" data-id="${p.id}"
                 style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5">Desactivar</button>`
            : `<button class="btn-action" data-action="activate" data-id="${p.id}"
                 style="background:#d1fae5;color:#059669;border:1px solid #6ee7b7">Activar</button>`
          }
        </div>
      </div>`;
  }

  _emptyState() {
    return `<div class="empty-state">
      <div style="font-size:40px;margin-bottom:12px">🏭</div>
      <p>${this._query ? 'Sin resultados para tu búsqueda.' : 'No hay proveedores registrados aún.'}</p>
    </div>`;
  }

  _bindEvents() {

    this._container.querySelector('#btn-nuevo-prov')?.addEventListener('click', () => {
      window.__erp_navigate?.('proveedor-form');
    });

    const search = this._container.querySelector('#prov-search');
    search?.addEventListener('input', () => {
      this._query = search.value;
      this._render();
    });

    const toggleEl = this._container.querySelector('#toggle-inactivos');
    toggleEl?.addEventListener('change', () => {
      this._showInactive = toggleEl.checked;
      this._render();
    });

    this._container.querySelectorAll('.product-card[data-id]').forEach((card) => {
      card.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('[data-action]');
        const id = actionBtn?.dataset.id ?? card.dataset.id;
        const action = actionBtn?.dataset.action;

        if (action === 'edit') {
          const p = this._proveedores.find((x) => x.id === id);
          if (p) window.__erp_navigate?.('proveedor-form', { proveedor: p });
          return;
        }

        if (action === 'deactivate') {
          if (!confirm('¿Desactivar este proveedor? Quedará inactivo.')) return;
          try {
            await handleDesactivarProveedor(id);
          } catch (err) {
            alert(`Error: ${err.message}`);
          }
          return;
        }

        if (action === 'activate') {
          try {
            await handleActivarProveedor(id);
          } catch (err) {
            alert(`Error: ${err.message}`);
          }
          return;
        }

        const p = this._proveedores.find((x) => x.id === id);
        if (p && p.status !== 'inactive') window.__erp_navigate?.('proveedor-form', { proveedor: p });
      });
    });
  }
}

