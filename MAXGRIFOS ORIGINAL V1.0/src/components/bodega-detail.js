import { getMovimientos, TIPO_LABEL } from '../modules/kardex/kardex-store.js';
import { BODEGA_PEDIDOS_ID } from '../modules/kardex/bodega-store.js';
import { getPedidos } from '../modules/pedidos/pedido-store.js';
import { getProducts } from '../modules/maestro-productos/product-store.js';
import { eventBus, Events } from '../events/domain-events.js';

const CATEGORIA_TIPO = {
  ENTRADA_COMPRA: 'entrada',           ENTRADA_DEVOLUCION_CLIENTE: 'entrada',
  SALIDA_AVERIA: 'salida',             SALIDA_ROBO: 'salida',
  SALIDA_DEVOLUCION_PROVEEDOR: 'salida', SALIDA_AJUSTE_AUDITORIA: 'salida',
  SALIDA_VENTA: 'salida',
  AJUSTE: 'ajuste',
  GARANTIA_OUT: 'garantia',            GARANTIA_IN: 'garantia',
  GARANTIA_NC_OUT: 'garantia',
  RESERVA_OUT: 'interno',              RESERVA_IN: 'interno',
  LIBERACION: 'interno',               REVERSION_OUT: 'interno',
  REVERSION_IN: 'interno',             DESACTIVACION_OUT: 'interno',
  DESACTIVACION_IN: 'interno',         DESACTIVACION_COMP: 'interno',
  REACTIVACION_OUT: 'interno',         REACTIVACION_IN: 'interno',
};

const CLASE_CAT = {
  entrada:  'kx-badge-entrada',
  salida:   'kx-badge-salida',
  ajuste:   'kx-badge-ajuste',
  garantia: 'kx-badge-garantia',
  interno:  'kx-badge-interno',
};

const ICON_CAT = {
  entrada: '⬆️', salida: '⬇️', ajuste: '🔧', garantia: '🔁', interno: '🔄',
};

const TH = 'padding:8px 10px;text-align:left;font-size:12px;font-weight:700;border-bottom:1px solid var(--border-color,#e0e0e0);white-space:nowrap';
const TD = 'padding:8px 10px;border-bottom:1px solid var(--border-color,#e0e0e0);vertical-align:middle';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}
function fmtNum(n) { return Number(n).toLocaleString('es-CO'); }
function fmtCosto(n) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString('es-CO')}`;
}
function estadoBadgeStyle(estado) {
  const map = {
    creado: '#2196F3', picking: '#FF9800', packing: '#FF9800',
    facturado: '#9C27B0', remisionado: '#9C27B0', despacho: '#4CAF50',
    pod: '#4CAF50', anulado: '#F44336', cancelado: '#F44336',
  };
  const bg = map[estado] ?? '#9E9E9E';
  return `background:${bg};color:#fff;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap`;
}
function navigate(view, opts = {}) { window.__erp_navigate?.(view, opts); }

export class BodegaDetail {
  constructor(container, bodega) {
    this.container    = container;
    this._bodega      = bodega;
    this._movimientos = [];
    this._tab         = 'TODOS';
    this._query       = '';
    this._invSku      = '';
    this._invPedido   = '';
    this._invCliente  = '';
    this._invFecha    = '';
    this._pedidosMap  = new Map();
    this._productCostById = new Map();
    this._unsubs      = [];
  }

  get _esPedidos() { return this._bodega?.id === BODEGA_PEDIDOS_ID; }

  async mount() {
    if (!this._bodega) {
      this.container.innerHTML = `
        <div class="list-container">
          <p style="margin-top:24px;color:var(--text-secondary)">Bodega no encontrada.</p>
        </div>`;
      return;
    }
    this.container.innerHTML = `<div class="loading">Cargando inventario...</div>`;
    await this._loadData();
    this._render();
    this._subscribeEvents();
  }

  unmount() { this._unsubs.forEach((fn) => fn()); }

  async _loadData() {
    const [movimientos, pedidos, products] = await Promise.all([
      getMovimientos(this._bodega.id),
      this._esPedidos ? getPedidos() : Promise.resolve([]),
      getProducts(),
    ]);
    this._movimientos = movimientos;
    this._productCostById = new Map(
      (products ?? []).map((p) => {
        const costoNum = Number(p.costo);
        return [p.id, Number.isFinite(costoNum) ? costoNum : null];
      }),
    );
    if (this._esPedidos) {
      this._pedidosMap = new Map(
        pedidos.map((p) => [p.id, {
          consecutivo: p.consecutivo ?? p.id,
          cliente:     p.cliente_nombre ?? 'MOSTRADOR',
          estado:      p.estado ?? '—',
        }])
      );
    }
  }

  _subscribeEvents() {
    const reload = async () => { await this._loadData(); this._render(); };
    this._unsubs.push(
      eventBus.on(Events.STOCK_MOVED,    reload),
      eventBus.on(Events.STOCK_ADJUSTED, reload),
      eventBus.on(Events.PRODUCT_UPDATED, reload),
      eventBus.on(Events.COSTO_PRODUCTO_CAMBIADO, reload),
    );
  }

  _filtered() {
    const q = this._query.toLowerCase();
    return this._movimientos.filter((m) => {
      const cat = CATEGORIA_TIPO[m.tipo] ?? 'interno';
      if (this._tab !== 'TODOS' && cat !== this._tab) return false;
      if (!q) return true;
      return (
        (m.product_sku  ?? '').toLowerCase().includes(q) ||
        (m.product_name ?? '').toLowerCase().includes(q)
      );
    });
  }

  _buildInventario() {
    // Sort ASC so last iteration wins for costo and ultimoMov
    const sorted = [...this._movimientos].sort((a, b) =>
      (a.created_at ?? '').localeCompare(b.created_at ?? '')
    );

    const map = new Map();
    for (const m of sorted) {
      // PEDIDOS: group per product+pedido to show trazabilidad per order
      const key = (this._esPedidos && m.pedido_id)
        ? `${m.product_id}::${m.pedido_id}`
        : m.product_id;

      const cur = map.get(key);
      if (cur) {
        cur.saldo += (m.delta ?? 0);
        if (m.costo_unitario != null) cur.costo = m.costo_unitario;
        if ((m.created_at ?? '') > (cur.ultimoMov ?? '')) cur.ultimoMov = m.created_at;
      } else {
        const pd = (this._esPedidos && m.pedido_id)
          ? (this._pedidosMap.get(m.pedido_id) ?? null)
          : null;
        map.set(key, {
          product_id: m.product_id ?? null,
          sku:       m.product_sku  ?? '—',
          name:      m.product_name ?? '—',
          saldo:     m.delta ?? 0,
          costo:     m.costo_unitario ?? this._productCostById.get(m.product_id) ?? null,
          ultimoMov: m.created_at ?? null,
          pedido_num: pd?.consecutivo ?? m.pedido_id ?? null,
          cliente:    pd?.cliente ?? null,
          estado:     pd?.estado ?? null,
        });
      }
    }

    let items = [...map.values()].filter((p) => p.saldo !== 0);

    // Apply inventory-level filters
    if (this._invSku) {
      const q = this._invSku.toLowerCase();
      items = items.filter((p) =>
        p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      );
    }
    if (this._esPedidos && this._invPedido) {
      const q = this._invPedido.toLowerCase();
      items = items.filter((p) =>
        (p.pedido_num ?? '').toString().toLowerCase().includes(q)
      );
    }
    if (this._esPedidos && this._invCliente) {
      const q = this._invCliente.toLowerCase();
      items = items.filter((p) =>
        (p.cliente ?? '').toLowerCase().includes(q)
      );
    }
    if (this._invFecha) {
      items = items.filter((p) =>
        p.ultimoMov && p.ultimoMov.slice(0, 10) >= this._invFecha
      );
    }

    return items.sort((a, b) => a.sku.localeCompare(b.sku, 'es-CO'));
  }

  _render() {
    const b          = this._bodega;
    const list       = this._filtered();
    const inventario = this._buildInventario();
    const total      = this._movimientos.length;
    const entradas   = this._movimientos.filter((m) => CATEGORIA_TIPO[m.tipo] === 'entrada').length;
    const salidas    = this._movimientos.filter((m) => CATEGORIA_TIPO[m.tipo] === 'salida').length;
    const garantias  = this._movimientos.filter((m) => CATEGORIA_TIPO[m.tipo] === 'garantia').length;
    const internos   = this._movimientos.filter((m) => CATEGORIA_TIPO[m.tipo] === 'interno').length;

    this.container.innerHTML = `
      <div class="list-container">
        <h2>📦 ${b.nombre}</h2>
        ${b.descripcion
          ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">${b.descripcion}</p>`
          : ''}

        <section style="margin-bottom:24px">
          <h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;
                     color:var(--text-secondary);margin-bottom:10px">
            Inventario Actual
          </h3>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
            <input type="search" class="search-input" id="inv-sku"
              placeholder="Filtrar SKU o producto…"
              value="${this._invSku}" autocomplete="off"
              style="flex:1;min-width:140px">
            ${this._esPedidos ? `
              <input type="search" class="search-input" id="inv-pedido"
                placeholder="Filtrar por Pedido…"
                value="${this._invPedido}" autocomplete="off"
                style="flex:1;min-width:120px">
              <input type="search" class="search-input" id="inv-cliente"
                placeholder="Filtrar por Cliente…"
                value="${this._invCliente}" autocomplete="off"
                style="flex:1;min-width:120px">
            ` : ''}
            <input type="date" class="search-input" id="inv-fecha"
              value="${this._invFecha}" title="Último movimiento desde"
              style="flex:0 0 auto;min-width:140px">
          </div>

          ${this._inventarioHtml(inventario)}
        </section>

        <section>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;
                       color:var(--text-secondary)">
              Movimientos
            </h3>
            <span style="font-size:12px;color:var(--text-secondary)">${total} en total</span>
          </div>

          <input type="search" class="search-input" id="bd-search"
            placeholder="Buscar por SKU o producto…"
            value="${this._query}" autocomplete="off" style="margin-bottom:10px">

          <div class="sub-tabs" style="flex-wrap:wrap">
            ${[
              ['TODOS',    `Todos (${total})`],
              ['entrada',  `Entradas (${entradas})`],
              ['salida',   `Salidas (${salidas})`],
              ['garantia', `Garantías (${garantias})`],
              ['interno',  `Internos (${internos})`],
            ].map(([k, l]) =>
              `<button class="sub-tab ${this._tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`
            ).join('')}
          </div>

          <div id="bd-list-body" style="margin-top:14px">
            ${list.length === 0 ? this._emptyState() : list.map((m) => this._cardHtml(m)).join('')}
          </div>
        </section>
      </div>`;

    this._bindEvents();
  }

  _inventarioHtml(items) {
    const hasFilters = this._invSku || this._invPedido || this._invCliente || this._invFecha;
    if (items.length === 0) {
      return `<div style="padding:16px 0;color:var(--text-secondary);font-size:13px;text-align:center">
        ${hasFilters ? 'Sin resultados con los filtros actuales.' : 'Sin stock registrado en esta bodega.'}
      </div>`;
    }

    const extraHeaders = this._esPedidos
      ? `<th style="${TH}">Pedido</th><th style="${TH}">Cliente</th><th style="${TH}">Estado</th>`
      : '';

    const rows = items.map((p) => {
      const estadoHtml = p.estado
        ? `<span style="${estadoBadgeStyle(p.estado)}">${p.estado.toUpperCase()}</span>`
        : '—';
      const extraCols = this._esPedidos ? `
        <td style="${TD}">${p.pedido_num ?? '—'}</td>
        <td style="${TD}">${p.cliente ?? '—'}</td>
        <td style="${TD}">${estadoHtml}</td>
      ` : '';
      return `
        <tr>
          <td style="${TD};font-weight:700">${p.sku}</td>
          <td style="${TD}">${p.name}</td>
          <td style="${TD};text-align:right;font-weight:700" class="${p.saldo >= 0 ? 'kx-delta-pos' : 'kx-delta-neg'}">${fmtNum(p.saldo)}</td>
          <td style="${TD};text-align:right">${fmtCosto(p.costo)}</td>
          <td style="${TD};font-size:11px;color:var(--text-secondary)">${fmtDate(p.ultimoMov)}</td>
          ${extraCols}
        </tr>`;
    }).join('');

    return `
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:var(--surface-secondary,#f5f5f5)">
              <th style="${TH}">SKU</th>
              <th style="${TH}">Producto</th>
              <th style="${TH};text-align:right">Cantidad</th>
              <th style="${TH};text-align:right">Costo</th>
              <th style="${TH}">Último mov.</th>
              ${extraHeaders}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  _cardHtml(m) {
    const cat      = CATEGORIA_TIPO[m.tipo] ?? 'interno';
    const cls      = CLASE_CAT[cat] ?? 'kx-badge-interno';
    const icon     = ICON_CAT[cat]  ?? '🔄';
    const label    = TIPO_LABEL[m.tipo] ?? m.tipo;
    const sync     = m.sync_status === 'synced' ? '🟢' : m.sync_status === 'error' ? '🔴' : '🟡';
    const deltaStr = (m.delta ?? 0) >= 0 ? `+${fmtNum(m.delta)}` : fmtNum(m.delta);

    return `
      <div class="product-card kx-card">
        <div class="product-card-header">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="kx-tipo-badge ${cls}">${icon} ${label}</span>
            <span class="product-nombre">${m.product_sku || '—'}</span>
          </div>
          <span class="product-sync">${sync}</span>
        </div>
        <div class="product-meta">
          <span>${m.product_name || '—'}</span>
          ${m.referencia ? `<span>Ref: ${m.referencia}</span>` : ''}
          <span>${fmtDate(m.created_at)}</span>
        </div>
        <div class="kx-saldo-row">
          <span class="kx-delta ${(m.delta ?? 0) >= 0 ? 'kx-delta-pos' : 'kx-delta-neg'}">${deltaStr} uds</span>
          <span class="kx-saldo-result">Saldo: <strong>${fmtNum(m.saldo_resultante ?? 0)}</strong></span>
        </div>
        ${m.observacion ? `<div class="kx-obs">${m.observacion}</div>` : ''}
      </div>`;
  }

  _emptyState() {
    return `<div class="empty-state">
      <div style="font-size:40px;margin-bottom:12px">🗂️</div>
      <p>${this._query ? 'Sin resultados para la búsqueda.' : 'No hay movimientos en esta bodega.'}</p>
    </div>`;
  }

  _bindEvents() {
    this.container.querySelector('#bd-search')
      ?.addEventListener('input', (e) => { this._query = e.target.value; this._render(); });
    this.container.querySelectorAll('.sub-tab').forEach((btn) => {
      btn.addEventListener('click', () => { this._tab = btn.dataset.tab; this._render(); });
    });
    this.container.querySelector('#inv-sku')
      ?.addEventListener('input', (e) => { this._invSku = e.target.value; this._render(); });
    this.container.querySelector('#inv-pedido')
      ?.addEventListener('input', (e) => { this._invPedido = e.target.value; this._render(); });
    this.container.querySelector('#inv-cliente')
      ?.addEventListener('input', (e) => { this._invCliente = e.target.value; this._render(); });
    this.container.querySelector('#inv-fecha')
      ?.addEventListener('change', (e) => { this._invFecha = e.target.value; this._render(); });
  }
}
