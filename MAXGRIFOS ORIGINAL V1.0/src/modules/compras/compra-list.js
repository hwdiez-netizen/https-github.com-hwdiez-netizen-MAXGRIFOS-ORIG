import { getAllCompras } from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';

const ESTADO_CFG = {
  borrador:  { label: 'BORRADOR',  cls: 'estado-standby',   icon: '📝' },
  enviada:   { label: 'ENVIADA',   cls: 'estado-picking',   icon: '📤' },
  recibida:  { label: 'RECIBIDA',  cls: 'estado-pod',       icon: '✅' },
};

const CERRADOS = ['recibida'];

function fmtDate(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export class CompraList {
  constructor(container) {
    this._container = container;
    this._compras = [];
    this._tab = 'activas';
    this._query = '';
    this._unsubs = [];
  }

  async mount() {
    this._container.innerHTML = '<div class="loading">Cargando compras...</div>';
    this._compras = await getAllCompras();
    this._render();
    this._subscribeEvents();
  }

  unmount() {
    this._unsubs.forEach((fn) => fn());
  }

  _subscribeEvents() {
    const reload = async () => {
      this._compras = await getAllCompras();
      this._render();
    };
    this._unsubs.push(eventBus.on(Events.COMPRA_CREADA, reload));
    this._unsubs.push(eventBus.on(Events.COMPRA_RECEPCIONADA, reload));
  }

  _filtered() {
    const q = this._query.toLowerCase();
    return this._compras.filter((c) => {
      const cerrado = CERRADOS.includes(c.estado);
      if (this._tab === 'activas' && cerrado) return false;
      if (this._tab === 'cerradas' && !cerrado) return false;
      if (!q) return true;
      return (
        (c.consecutivo ?? '').toLowerCase().includes(q) ||
        (c.proveedor_nombre ?? '').toLowerCase().includes(q)
      );
    });
  }

  _render() {
    const activas  = this._compras.filter((c) => !CERRADOS.includes(c.estado)).length;
    const cerradas = this._compras.filter((c) =>  CERRADOS.includes(c.estado)).length;
    const list = this._filtered();

    this._container.innerHTML = `
      <div class="list-container">
        <div class="list-header">
          <h2>Órdenes de Compra</h2>
          <span class="product-count">${activas} activas · ${cerradas} cerradas</span>
        </div>

        <button class="btn-primary" id="btn-nueva-compra" style="margin-bottom:16px;width:100%">
          + Nueva Orden de Compra
        </button>

        <input type="search" class="search-input" id="compra-search"
          placeholder="Buscar por número o proveedor..."
          value="${this._query}" autocomplete="off">

        <div class="sub-tabs" style="margin-top:12px">
          <button class="sub-tab ${this._tab === 'activas'  ? 'active' : ''}" data-tab="activas">
            Activas (${activas})
          </button>
          <button class="sub-tab ${this._tab === 'cerradas' ? 'active' : ''}" data-tab="cerradas">
            Cerradas (${cerradas})
          </button>
        </div>

        <div id="compra-list-body" style="margin-top:14px">
          ${list.length === 0 ? this._emptyState() : list.map((c) => this._cardHtml(c)).join('')}
        </div>
      </div>`;

    this._bindEvents();
  }

  _cardHtml(c) {
    const cfg = ESTADO_CFG[c.estado] ?? ESTADO_CFG.borrador;
    const total = Number(c.total ?? 0).toLocaleString('es-CO');
    return `
      <div class="product-card ped-card" data-id="${c.id}" role="button" tabindex="0">
        <div class="product-card-header">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="ped-consec">${c.consecutivo ?? c.id.slice(0, 8)}</span>
            <span class="ped-estado-badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
          </div>
        </div>
        <div class="product-meta">
          <span>🏭 ${c.proveedor_nombre ?? '—'}</span>
          <span>${fmtDate(c.created_at)}</span>
          ${c.factura_proveedor ? `<span>Fac: ${c.factura_proveedor}</span>` : ''}
        </div>
        <div class="product-meta">
          <span style="font-weight:700;color:var(--primary)">Total: $${total}</span>
        </div>
      </div>`;
  }

  _emptyState() {
    return `<div class="empty-state">
      <div style="font-size:40px;margin-bottom:12px">📦</div>
      <p>${this._query ? 'Sin resultados.' : 'No hay órdenes de compra registradas aún.'}</p>
    </div>`;
  }

  _bindEvents() {
    this._container.querySelector('#btn-nueva-compra')?.addEventListener('click', () => {
      window.__erp_navigate?.('compra-form');
    });

    const s = this._container.querySelector('#compra-search');
    s?.addEventListener('input', () => { this._query = s.value; this._render(); });

    this._container.querySelectorAll('.sub-tab').forEach((b) => {
      b.addEventListener('click', () => { this._tab = b.dataset.tab; this._render(); });
    });

    this._container.querySelectorAll('.ped-card').forEach((card) => {
      card.addEventListener('click', () => {
        const c = this._compras.find((x) => x.id === card.dataset.id);
        if (c) window.__erp_navigate?.('compra-form', { compra: c });
      });
    });
  }
}
