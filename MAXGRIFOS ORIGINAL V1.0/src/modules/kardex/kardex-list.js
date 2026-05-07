import { getMovimientos, getSaldoByProduct, TIPO_LABEL } from './kardex-store.js';
import { getBodegasConSistema } from './bodega-store.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { getProduct } from '../../db/local-db.js';

const CATEGORIA_TIPO = {
  ENTRADA_COMPRA: 'entrada', ENTRADA_DEVOLUCION_CLIENTE: 'entrada',
  SALIDA_AVERIA: 'salida', SALIDA_ROBO: 'salida',
  SALIDA_DEVOLUCION_PROVEEDOR: 'salida', SALIDA_AJUSTE_AUDITORIA: 'salida',
  AJUSTE: 'ajuste',
  RESERVA_OUT: 'interno', RESERVA_IN: 'interno',
  LIBERACION: 'interno', REVERSION_OUT: 'interno', REVERSION_IN: 'interno',
};
const CLASE_CAT = { entrada: 'kx-badge-entrada', salida: 'kx-badge-salida', ajuste: 'kx-badge-ajuste', interno: 'kx-badge-interno' };
const ICON_CAT  = { entrada: '⬆️', salida: '⬇️', ajuste: '🔧', interno: '🔄' };

function fmtDate(iso) { return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }); }
function fmtNum(n)    { return Number(n).toLocaleString('es-CO'); }

export class KardexList {
  constructor(container) {
    this.container = container;
    this._movimientos = [];
    this._bodegas = [];
    this._tab = 'TODOS';
    this._bodegaFiltro = '';
    this._query = '';
    this._unsubMoved = null;
    this._unsubAdjusted = null;
    this._unsubAlert = null;
  }

  async mount() {
    this.container.innerHTML = `<div class="loading">Cargando kardex...</div>`;
    [this._movimientos, this._bodegas] = await Promise.all([getMovimientos(), getBodegasConSistema()]);
    this._render();
    this._subscribeEvents();
  }

  unmount() {
    this._unsubMoved?.();
    this._unsubAdjusted?.();
    this._unsubAlert?.();
  }

  _subscribeEvents() {
    const reload = async () => {
      this._movimientos = await getMovimientos();
      this._render();
    };
    this._unsubMoved    = eventBus.on(Events.STOCK_MOVED,     reload);
    this._unsubAdjusted = eventBus.on(Events.STOCK_ADJUSTED,  reload);
    this._unsubAlert    = eventBus.on(Events.STOCK_ALERT, ({ payload }) => this._showAlertBanner(payload));
  }

  _filtered() {
    const q = this._query.toLowerCase();
    return this._movimientos.filter((m) => {
      const cat = CATEGORIA_TIPO[m.tipo] ?? 'interno';
      if (this._tab !== 'TODOS' && cat !== this._tab) return false;
      if (this._bodegaFiltro && m.bodega_id !== this._bodegaFiltro) return false;
      if (!q) return true;
      return (
        (m.product_sku ?? '').toLowerCase().includes(q) ||
        (m.product_name ?? '').toLowerCase().includes(q) ||
        (m.referencia ?? '').toLowerCase().includes(q)
      );
    });
  }

  _render() {
    const total    = this._movimientos.length;
    const entradas = this._movimientos.filter((m) => CATEGORIA_TIPO[m.tipo] === 'entrada').length;
    const salidas  = this._movimientos.filter((m) => CATEGORIA_TIPO[m.tipo] === 'salida').length;
    const ajustes  = this._movimientos.filter((m) => CATEGORIA_TIPO[m.tipo] === 'ajuste').length;
    const list     = this._filtered();

    const bodegaOpts = this._bodegas.map((b) =>
      `<option value="${b.id}" ${this._bodegaFiltro === b.id ? 'selected' : ''}>${b.nombre}</option>`
    ).join('');

    this.container.innerHTML = `
      <div class="list-container">
        <div id="kx-alert-banner" class="kx-alert-banner hidden"></div>
        <div class="list-header">
          <h2>Kardex</h2>
          <span class="product-count">${total} movimientos</span>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <button class="btn-primary" id="btn-nuevo-mov" style="flex:1">+ Registrar Movimiento</button>
          <button class="btn-secondary" id="btn-conciliacion" style="flex:0 0 auto">📊 Conciliación</button>
          <button class="btn-secondary" id="btn-bodegas" style="flex:0 0 auto">⚙️ Bodegas</button>
        </div>

        <select id="kx-bodega-filtro" class="search-input" style="margin-bottom:8px">
          <option value="">Todas las bodegas</option>
          ${bodegaOpts}
        </select>

        <input type="search" class="search-input" id="kx-search"
          placeholder="Buscar por SKU, producto o referencia…"
          value="${this._query}" autocomplete="off">

        <div class="sub-tabs" style="margin-top:12px">
          ${[['TODOS',`Todos (${total})`],['entrada',`Entradas (${entradas})`],['salida',`Salidas (${salidas})`],['ajuste',`Ajustes (${ajustes})`]]
            .map(([k,l]) => `<button class="sub-tab ${this._tab===k?'active':''}" data-tab="${k}">${l}</button>`).join('')}
        </div>

        <div id="kx-list-body" style="margin-top:14px">
          ${list.length === 0 ? this._emptyState() : list.map((m) => this._cardHtml(m)).join('')}
        </div>
      </div>`;

    this._bindEvents();
  }

  _cardHtml(m) {
    const cat      = CATEGORIA_TIPO[m.tipo] ?? 'interno';
    const cls      = CLASE_CAT[cat];
    const icon     = ICON_CAT[cat];
    const label    = TIPO_LABEL[m.tipo] ?? m.tipo;
    const sync     = m.sync_status === 'synced' ? '🟢' : m.sync_status === 'error' ? '🔴' : '🟡';
    const deltaStr = (m.delta ?? 0) >= 0 ? `+${fmtNum(m.delta)}` : fmtNum(m.delta);
    const bodega   = this._bodegas.find((b) => b.id === m.bodega_id);

    return `
      <div class="product-card kx-card kx-card-tappable" data-product-id="${m.product_id ?? ''}" data-product-sku="${m.product_sku ?? ''}" data-product-name="${(m.product_name ?? '').replace(/"/g, '&quot;')}" role="button" tabindex="0">
        <div class="product-card-header">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="kx-tipo-badge ${cls}">${icon} ${label}</span>
            <span class="product-nombre">${m.product_sku || '—'}</span>
          </div>
          <span class="product-sync">${sync}</span>
        </div>
        <div class="product-meta">
          <span>${m.product_name || '—'}</span>
          ${bodega ? `<span>📦 ${bodega.nombre}</span>` : ''}
          ${m.referencia ? `<span>Ref: ${m.referencia}</span>` : ''}
          <span>${fmtDate(m.created_at)}</span>
        </div>
        <div class="kx-saldo-row">
          <span class="kx-delta ${(m.delta??0)>=0?'kx-delta-pos':'kx-delta-neg'}">${deltaStr} uds</span>
          <span class="kx-saldo-result">Saldo: <strong>${fmtNum(m.saldo_resultante ?? 0)}</strong></span>
        </div>
        ${m.observacion ? `<div class="kx-obs">${m.observacion}</div>` : ''}
      </div>`;
  }

  _emptyState() {
    return `<div class="empty-state">
      <div style="font-size:40px;margin-bottom:12px">🗂️</div>
      <p>${this._query ? 'Sin resultados.' : 'No hay movimientos registrados aún.'}</p>
    </div>`;
  }

  _showAlertBanner({ product_sku, product_name, saldo_resultante, stock_minimo }) {
    const banner = this.container.querySelector('#kx-alert-banner');
    if (!banner) return;
    banner.innerHTML = `⚠️ Stock bajo — <strong>${product_sku}</strong> ${product_name}: saldo ${fmtNum(saldo_resultante)} (mín. ${fmtNum(stock_minimo)})`;
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 8000);
  }

  _bindEvents() {
    this.container.querySelector('#btn-nuevo-mov')?.addEventListener('click', () => navigate('kardex-form'));
    this.container.querySelector('#btn-conciliacion')?.addEventListener('click', () => navigate('kardex-conciliacion'));
    this.container.querySelector('#btn-bodegas')?.addEventListener('click', () => navigate('bodegas'));
    this.container.querySelector('#kx-bodega-filtro')?.addEventListener('change', (e) => {
      this._bodegaFiltro = e.target.value;
      this._render();
    });
    this.container.querySelector('#kx-search')?.addEventListener('input', (e) => {
      this._query = e.target.value;
      this._render();
    });
    this.container.querySelectorAll('.sub-tab').forEach((btn) => {
      btn.addEventListener('click', () => { this._tab = btn.dataset.tab; this._render(); });
    });
    this.container.querySelectorAll('.kx-card-tappable').forEach((card) => {
      card.addEventListener('click', () => {
        const productId = card.dataset.productId;
        const productSku = card.dataset.productSku;
        const productName = card.dataset.productName;
        if (productId) this._showProductDetail(productId, productSku, productName);
      });
    });
  }

  async _showProductDetail(productId, productSku, productName) {
    const [product, saldoCentral] = await Promise.all([
      getProduct(productId).catch(() => null),
      getSaldoByProduct(productId).catch(() => 0),
    ]);

    const sku = product?.sku ?? productSku ?? '—';
    const nombre = product?.nombre ?? productName ?? '—';
    const costo = Number(product?.costo ?? 0);
    const cantidad = Number(saldoCentral ?? 0);
    const subtotal = costo > 0 && cantidad > 0 ? costo * cantidad : 0;

    const skuParts = sku.split('-');
    const categoria = skuParts[0] ?? '—';
    const subcategoria = skuParts[1] ?? '—';
    const atributo = skuParts[2] ?? '—';

    const overlay = document.createElement('div');
    overlay.className = 'kx-detail-overlay';
    overlay.innerHTML = `
      <div class="kx-detail-panel">
        <button type="button" class="kx-detail-close" id="kx-close-detail">✕</button>
        <div class="kx-detail-sku">${sku}</div>
        <div class="kx-detail-nombre">${nombre}</div>
        <div class="product-detail-card" style="margin-top:12px">
          <div class="detail-row"><span class="detail-label">SKU</span><span class="detail-value" style="font-family:monospace">${sku}</span></div>
          <div class="detail-row"><span class="detail-label">Categoría</span><span class="detail-value">${categoria}</span></div>
          <div class="detail-row"><span class="detail-label">Subcategoría</span><span class="detail-value">${subcategoria}</span></div>
          <div class="detail-row"><span class="detail-label">Atributo</span><span class="detail-value">${atributo}</span></div>
          <div class="detail-row"><span class="detail-label">Nombre</span><span class="detail-value">${nombre}</span></div>
          <div class="detail-row"><span class="detail-label">Stock (Bodega)</span><span class="detail-value"><strong>${fmtNum(cantidad)} uds</strong></span></div>
          <div class="detail-row"><span class="detail-label">Costo Unitario</span><span class="detail-value">${costo > 0 ? `$${fmtNum(costo)}` : '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Valor en Stock</span><span class="detail-value">${subtotal > 0 ? `$${fmtNum(subtotal)}` : '—'}</span></div>
        </div>
        <button type="button" class="btn-primary" id="kx-btn-mov" style="width:100%;margin-top:16px">+ Registrar Movimiento</button>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#kx-close-detail')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#kx-btn-mov')?.addEventListener('click', () => {
      overlay.remove();
      navigate('kardex-form');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }
}

function navigate(view, options = {}) { window.__erp_navigate?.(view, options); }
