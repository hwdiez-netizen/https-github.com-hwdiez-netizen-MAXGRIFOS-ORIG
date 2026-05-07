import { eventBus, Events } from '../../events/domain-events.js';
import { generateSKU } from './sku-engine.js';
import { handleDeactivateProduct, handleActivateProduct } from './product-handlers.js';
import { applyProductsNisPhase1Overlay, bindSwipeRightToBack } from './product-nis-phase1-overlay.js';

function formatCost(val) {
  if (!val && val !== 0) return null;
  return Number(val).toLocaleString('es-CO', { minimumFractionDigits: 0 });
}

function _costoAutorizado() {
  try { return localStorage.getItem('erp_show_costo') === '1'; } catch { return false; }
}

export class ProductDetail {
  constructor(container, product) {
    this.container = container;
    this.product = product;
    this._gestureCleanup = null;
  }

  mount() {
    applyProductsNisPhase1Overlay(this.container);
    
    // RUNTIME NORMALIZATION: Ensure legacy or incomplete products have SKU/Metadata
    if ((!this.product.sku || this.product.sku === '—') && this.product.nombre) {
      const engine = generateSKU(this.product.nombre, this.product.ref_proveedor || '');
      this.product.sku = engine.sku;
      this.product.categoria = engine.cat;
      this.product.subcategoria = engine.sub;
      this.product.atributo = engine.atr;
    }

    const p = this.product;
    const costStr = formatCost(p.costo);

    this.container.innerHTML = `
      <div class="form-container mg-premium-flow module-productos">
        <button type="button" class="btn-back" id="btn-back-det">← Volver</button>
        <div class="form-mode-badge form-mode-v5">📷 Producto encontrado por escaneo</div>
        <h2>Producto Encontrado</h2>

        <div class="product-detail-card">
          <div class="detail-row"><span class="detail-label">SKU</span><span class="detail-value sku-code-sm">${p.sku}</span></div>
          <div class="detail-row"><span class="detail-label">Descripción</span><span class="detail-value">${p.nombre}</span></div>
          <div class="detail-row"><span class="detail-label">Ref. Proveedor</span><span class="detail-value">${p.ref_proveedor ?? '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Categoría</span><span class="detail-value">${p.categoria ?? '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Subcategoría</span><span class="detail-value">${p.subcategoria ?? '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Atributo</span><span class="detail-value">${p.atributo ?? '—'}</span></div>
          <div class="detail-row"><span class="detail-label">UoM</span><span class="detail-value">${p.uom}</span></div>
          <div class="detail-row"><span class="detail-label">📦 Cantidad</span><span class="detail-value">${p.cantidad ?? 0}</span></div>
          ${costStr && _costoAutorizado() ? `<div class="detail-row"><span class="detail-label">💰 Costo</span><span class="detail-value">$${costStr}</span></div>` : ''}
          <div class="detail-row">
            <span class="detail-label">Estado</span>
            <span class="detail-value status-badge status-${p.status}">
              ${p.status === 'active' ? '🟢 Activo' : '🔴 Inactivo'}
            </span>
          </div>
        </div>

        <div class="detail-actions">
          <button class="btn-primary" id="btn-det-edit">✏️ Editar</button>
          <button class="btn-action ${p.status === 'active' ? 'btn-deactivate' : 'btn-activate'}" id="btn-det-toggle">
            ${p.status === 'active' ? '🔴 Desactivar' : '✅ Activar'}
          </button>
          <button class="btn-action btn-audit-action" id="btn-det-audit">📋 Iniciar Auditoría</button>
        </div>
      </div>`;

    this.container.querySelector('#btn-back-det').addEventListener('click', () => {
      window.__erp_navigate?.('lista');
    });

    this.container.querySelector('#btn-det-edit').addEventListener('click', () => {
      eventBus.emit(Events.EDIT_PRODUCT, this.product);
    });

    this.container.querySelector('#btn-det-toggle').addEventListener('click', async () => {
      if (this.product.status === 'active') {
        if (!confirm('¿Desactivar este producto? Quedará registrado y podrá reactivarse.')) return;
        await handleDeactivateProduct(this.product.id);
      } else {
        if (!confirm('¿Activar este producto? Quedará disponible nuevamente.')) return;
        await handleActivateProduct(this.product.id);
      }
      window.__erp_navigate?.('lista');
    });

    this.container.querySelector('#btn-det-audit').addEventListener('click', () => {
      eventBus.emit(Events.AUDIT_SINGLE_PRODUCT, this.product);
    });

    this._gestureCleanup?.();
    this._gestureCleanup = bindSwipeRightToBack(this.container, () => {
      window.__erp_navigate?.('lista');
    });
  }

  unmount() {
    this._gestureCleanup?.();
    this._gestureCleanup = null;
  }
}
