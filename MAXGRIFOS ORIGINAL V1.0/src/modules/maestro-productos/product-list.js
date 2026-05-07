import { eventBus, Events } from '../../events/domain-events.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';
import {
  handleQueryProductosList,
  handleDeactivateProduct,
  handleActivateProduct,
  handleDeleteProduct
} from './product-handlers.js';
import {
  applyProductsNisPhase1Overlay,
  bindSwipeLeftOnCatalog,
  bindSwipeLeftToOpenDetail,
} from './product-nis-phase1-overlay.js';

const SYNC_ICON = { synced: '🟢', pending: '🟡', error: '🔴' };

function formatCost(val) {
  if (!val && val !== 0) return null;
  return Number(val).toLocaleString('es-CO', { minimumFractionDigits: 0 });
}

function _costoAutorizado() {
  try { return localStorage.getItem('erp_show_costo') === '1'; } catch { return false; }
}

export class ProductList {
  constructor(container) {
    this.container = container;
    this._tab = 'active';
    this._query = '';
    this._itemsById = new Map();
    this._unsubs = [];
    this._gestureCleanups = [];
    this._catalogGestureCleanup = null;
  }

  async mount() {
    applyProductsNisPhase1Overlay(this.container);
    this.container.innerHTML = `
      <div class="list-container mg-premium-flow module-productos">
        <div class="list-header">
          <h2>Productos</h2>
          <span class="product-count" id="pcount"></span>
        </div>
        <button class="btn-primary" id="btn-nuevo-producto" style="width:100%;margin-bottom:12px">+ Nuevo Producto</button>
        <input type="search" id="prod-search" placeholder="Buscar por nombre, SKU o ref. proveedor…"
          style="width:100%;box-sizing:border-box;margin-bottom:10px;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        <div class="sub-tabs" role="tablist">
          <button class="sub-tab active" data-tab="active" role="tab">🟢 Activos</button>
          <button class="sub-tab" data-tab="inactive" role="tab">🔴 Inactivos</button>
        </div>
        <div id="plist-body"><div class="loading">Cargando...</div></div>
      </div>`;

    this.container.querySelector('#btn-nuevo-producto')?.addEventListener('click', () => {
      window.__erp_navigate?.('nuevo');
    });

    this.container.querySelector('#prod-search')?.addEventListener('input', (e) => {
      this._query = e.target.value.trim().toLowerCase();
      this._reload();
    });

    this.container.querySelectorAll('.sub-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._tab = btn.dataset.tab;
        this.container.querySelectorAll('.sub-tab').forEach((b) =>
          b.classList.toggle('active', b.dataset.tab === this._tab)
        );
        this._reload();
      });
    });

    await this._reload();
    this._catalogGestureCleanup?.();
    this._catalogGestureCleanup = bindSwipeLeftOnCatalog(this.container, () => {
      const firstId = this.container.querySelector('.product-card.nis-swipe-target')?.dataset.productId;
      if (!firstId) return;
      const product = this._itemsById.get(firstId);
      if (!product) return;
      window.__erp_navigate?.('detail', { product });
    });
    this._subscribeEvents();
  }

  async _reload() {
    const { items: filtered, active_count: activeCount, inactive_count: inactiveCount } = await handleQueryProductosList({
      tab: this._tab,
      query: this._query,
    });
    this._itemsById = new Map(filtered.map((item) => [item.id, item]));

    const count = this.container.querySelector('#pcount');
    if (count) {
      count.textContent =
        this._tab === 'active'
          ? `${activeCount} activos`
          : `${inactiveCount} inactivos`;
    }

    // Update sub-tab counters
    const tabs = this.container.querySelectorAll('.sub-tab');
    tabs[0] && (tabs[0].textContent = `🟢 Activos (${activeCount})`);
    tabs[1] && (tabs[1].textContent = `🔴 Inactivos (${inactiveCount})`);

    const body = this.container.querySelector('#plist-body');
    if (!body) return;

    if (!filtered.length) {
      body.innerHTML = `<div class="empty-state">
        ${this._query
          ? '<p>Sin resultados para tu búsqueda.</p>'
          : this._tab === 'active'
            ? '<p>Sin productos activos.<br>Usa <strong>Nuevo</strong> o <strong>Escanear</strong>.</p>'
            : '<p>No hay productos inactivos.</p>'}
      </div>`;
      return;
    }

    body.innerHTML = filtered.map((p) => this._cardHTML(p)).join('');
    this._gestureCleanups.forEach((cleanup) => cleanup());
    this._gestureCleanups = [];

    body.querySelectorAll('.product-card.nis-swipe-target').forEach((card) => {
      const id = card.dataset.productId;
      if (!id) return;
      const cleanup = bindSwipeLeftToOpenDetail(card, () => {
        const product = this._itemsById.get(id);
        if (!product) return;
        window.__erp_navigate?.('detail', { product });
      });
      this._gestureCleanups.push(cleanup);
    });

    body.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () =>
        this._handleAction(btn.dataset.action, btn.dataset.id)
      );
    });

    body.querySelectorAll('input.toggle-input').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        e.preventDefault();
        chk.checked = !chk.checked; // revert until confirmed
        this._handleAction(chk.dataset.action, chk.dataset.id);
      });
    });
  }

  _cardHTML(p) {
    const sync = SYNC_ICON[p.sync_status] ?? '🟡';
    const costStr = formatCost(p.costo_vigente_real);
    const hasQty = p.stock_disponible_real != null && p.stock_disponible_real !== '';
    const hasCost = costStr !== null && _costoAutorizado();

    const badges = [
      hasQty ? `<span class="badge badge-stock">📦 ${p.stock_disponible_real} ${p.uom}</span>` : '',
      hasCost ? `<span class="badge badge-cost">💰 $${costStr}</span>` : '',
    ].filter(Boolean).join('');

    const toggleChecked = p.status === 'active' ? 'checked' : '';
    const toggleLabel   = p.status === 'active' ? 'Activo' : 'Inactivo';
    const toggleAction  = p.status === 'active' ? 'deactivate' : 'activate';

    const actions = `
      <label class="status-toggle" title="${p.status === 'active' ? 'Desactivar' : 'Activar'}">
        <input type="checkbox" class="toggle-input" data-action="${toggleAction}" data-id="${p.id}" ${toggleChecked}>
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
        <span class="toggle-label">${toggleLabel}</span>
      </label>
      <button class="btn-action btn-edit" data-action="edit" data-id="${p.id}">✏️ Editar</button>
      ${p.status === 'inactive' ? `<button class="btn-action btn-delete" data-action="delete" data-id="${p.id}">🗑️ Eliminar</button>` : ''}`;

    return `
      <div class="product-card nis-swipe-target ${p.status === 'inactive' ? 'deactivated' : ''}" data-product-id="${p.id}">
        <div class="product-card-header">
          <span class="product-sku">${p.sku}</span>
          <span class="product-sync" title="${p.sync_status}">${sync}</span>
        </div>
        <div class="product-nombre">${p.nombre}</div>
        <div class="card-ref">📋 ${p.ref_proveedor ?? '—'}</div>
        ${badges ? `<div class="card-badges">${badges}</div>` : ''}
        <div class="product-meta">
          ${p.categoria ? `<span>${p.categoria}</span>` : ''}
          ${p.subcategoria ? `<span>${p.subcategoria}</span>` : ''}
          ${p.atributo ? `<span>${p.atributo}</span>` : ''}
          <span class="status-badge status-${p.status}">
            ${p.status === 'active' ? '🟢 Activo' : '🔴 Inactivo'}
          </span>
        </div>
        <div class="card-actions">${actions}</div>
      </div>`;
  }

  async _handleAction(action, id) {
    const product = this._itemsById.get(id);

    if (action === 'edit') {
      if (!product) return;
      eventBus.emit(Events.EDIT_PRODUCT, product);
      return;
    }

    if (action === 'deactivate') {
      if (!await confirmDialog('¿Desactivar este producto?\nQuedará registrado y podrá reactivarse.')) return;
      await handleDeactivateProduct(id);
      return;
    }

    if (action === 'activate') {
      if (!await confirmDialog('¿Activar este producto?\nQuedará disponible nuevamente.')) return;
      await handleActivateProduct(id);
      return;
    }

    if (action === 'delete') {
      if (!await confirmDialog('⚠️ ELIMINAR permanentemente este producto.\nEsta acción no se puede deshacer.')) return;
      await handleDeleteProduct(id);
      return;
    }
  }

  _subscribeEvents() {
    const reload = () => this._reload();
    this._unsubs = [
      eventBus.on(Events.PRODUCT_CREATED, reload),
      eventBus.on(Events.PRODUCT_UPDATED, reload),
      eventBus.on(Events.PRODUCT_DEACTIVATED, reload),
      eventBus.on(Events.PRODUCT_ACTIVATED, reload),
      eventBus.on(Events.PRODUCT_DELETED, reload),
      eventBus.on(Events.SYNC_STATUS_CHANGED, reload),
    ];
  }

  unmount() {
    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
    this._gestureCleanups.forEach((cleanup) => cleanup());
    this._gestureCleanups = [];
    this._catalogGestureCleanup?.();
    this._catalogGestureCleanup = null;
  }
}
