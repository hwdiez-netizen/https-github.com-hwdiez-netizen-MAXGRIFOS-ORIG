import { getPedidos } from './pedido-store.js';
import { eventBus, Events } from '../../events/domain-events.js';

const ESTADO_CFG = {
  creado: { label: 'CREADO', cls: 'estado-creado', icon: '🆕' },
  picking: { label: 'PICKING', cls: 'estado-picking', icon: '🔍' },
  packing: { label: 'PACKING', cls: 'estado-packing', icon: '📦' },
  facturado: { label: 'FACTURADO', cls: 'estado-facturado', icon: '🧾' },
  remisionado: { label: 'REMISIONADO', cls: 'estado-remisionado', icon: '📋' },
  despacho: { label: 'EN DESPACHO', cls: 'estado-despacho', icon: '🚚' },
  pod: { label: 'ENTREGADO', cls: 'estado-pod', icon: '✅' },
  anulado: { label: 'ANULADO', cls: 'estado-anulado', icon: '❌' },
  cancelado: { label: 'CANCELADO', cls: 'estado-anulado', icon: '🚫' },
  standby:  { label: 'EN EDICIÓN', cls: 'estado-creado', icon: '🆕' },
  creacion: { label: 'EN EDICIÓN', cls: 'estado-creado', icon: '🆕' },
  edicion:  { label: 'EN EDICIÓN', cls: 'estado-creado', icon: '🆕' },
};

const ESTADOS_CERRADOS = ['pod', 'anulado', 'cancelado'];

function fmtDate(iso) {
  return new Date(iso).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export class PedidoList {
  constructor(container) {
    this.container = container;
    this._pedidos = [];
    this._tab = 'activos';
    this._query = '';
    this._unsubs = [];
  }

  setPrefillQuery(q) {
    this._query = q ?? '';
  }

  async mount() {
    this.container.innerHTML = '<div class="loading">Cargando pedidos...</div>';
    this._pedidos = await getPedidos();
    this._render();
    this._subscribeEvents();
  }

  unmount() {
    this._unsubs.forEach((fn) => fn());
  }

  _subscribeEvents() {
    const reload = async () => {
      this._pedidos = await getPedidos();
      this._render();
    };

    [
      Events.PEDIDO_CREATED,
      Events.PEDIDO_PICKING,
      Events.PEDIDO_PACKING,
      Events.FACTURA_EMITIDA,
      Events.REMISION_EMITIDA,
      Events.PEDIDO_DESPACHADO,
      Events.PEDIDO_POD,
      Events.PEDIDO_ANULADO,
    ].forEach((ev) => {
      this._unsubs.push(eventBus.on(ev, reload));
    });
  }

  _filtered() {
    const q = this._query.toLowerCase();
    return this._pedidos.filter((p) => {
      const activo = !ESTADOS_CERRADOS.includes(p.estado);
      if (this._tab === 'activos' && !activo) return false;
      if (this._tab === 'cerrados' && activo) return false;
      if (!q) return true;
      return (
        (p.consecutivo ?? '').toLowerCase().includes(q) ||
        (p.cliente_nombre ?? '').toLowerCase().includes(q)
      );
    });
  }

  _render() {
    const activos = this._pedidos.filter((p) => !ESTADOS_CERRADOS.includes(p.estado)).length;
    const cerrados = this._pedidos.filter((p) => ESTADOS_CERRADOS.includes(p.estado)).length;
    const list = this._filtered();

    this.container.innerHTML = `
      <div class="list-container">
        <div class="list-header">
          <h2>Pedidos</h2>
          <span class="product-count">${activos} activos · ${cerrados} cerrados</span>
        </div>

        <button class="btn-primary" id="btn-nuevo-pedido" style="margin-bottom:16px;width:100%">
          + Nuevo Pedido
        </button>

        <input type="search" class="search-input" id="ped-search"
          placeholder="Buscar por consecutivo o cliente..."
          value="${this._query}" autocomplete="off">

        <div class="sub-tabs" style="margin-top:12px">
          <button class="sub-tab ${this._tab === 'activos' ? 'active' : ''}" data-tab="activos">Activos (${activos})</button>
          <button class="sub-tab ${this._tab === 'cerrados' ? 'active' : ''}" data-tab="cerrados">Cerrados (${cerrados})</button>
        </div>

        <div id="ped-list-body" style="margin-top:14px">
          ${list.length === 0 ? this._emptyState() : list.map((p) => this._cardHtml(p)).join('')}
        </div>
      </div>`;

    this._bindEvents();
  }

  _cardHtml(p) {
    const cfg = ESTADO_CFG[p.estado] ?? ESTADO_CFG.creado;
    const sync = p.sync_status === 'synced' ? '🟢' : p.sync_status === 'error' ? '🔴' : '🟡';
    return `
      <div class="product-card ped-card" data-id="${p.id}" role="button" tabindex="0">
        <div class="product-card-header">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="ped-consec">${p.consecutivo}</span>
            <span class="ped-estado-badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
          </div>
          <span class="product-sync">${sync}</span>
        </div>
        <div class="product-meta">
          <span>👤 ${p.cliente_nombre}</span>
          <span>${fmtDate(p.created_at)}</span>
        </div>
        ${this._sagaBar(p.estado)}
      </div>`;
  }

  _sagaBar(estado) {
    const fases = ['creado', 'picking', 'packing', 'facturado', 'despacho', 'pod'];
    const idx = fases.indexOf(estado === 'remisionado' ? 'facturado' : estado);
    return `<div class="saga-bar">
      ${fases
        .map(
          (f, i) =>
            `<div class="saga-dot ${i < idx ? 'done' : i === idx ? 'active' : ''}" title="${ESTADO_CFG[f]?.label}"></div>`
        )
        .join('')}
    </div>`;
  }

  _emptyState() {
    return `<div class="empty-state">
      <div style="font-size:40px;margin-bottom:12px">📋</div>
      <p>${this._query ? 'Sin resultados.' : 'No hay pedidos registrados aún.'}</p>
    </div>`;
  }

  _bindEvents() {
    this.container.querySelector('#btn-nuevo-pedido')?.addEventListener('click', () => navigate('pedido-form'));
    this.container.querySelector('#ped-search')?.addEventListener('input', (e) => {
      this._query = e.target.value;
      this._render();
    });
    this.container.querySelectorAll('.sub-tab').forEach((b) =>
      b.addEventListener('click', () => {
        this._tab = b.dataset.tab;
        this._render();
      })
    );
    this.container.querySelectorAll('.ped-card').forEach((card) => {
      card.addEventListener('click', () => navigate('pedido-detail', { pedidoId: card.dataset.id }));
    });
  }
}

function navigate(view, opts = {}) {
  window.__erp_navigate?.(view, opts);
}
