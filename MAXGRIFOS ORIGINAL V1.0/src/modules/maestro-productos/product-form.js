import { generateSKU, decodeSkuV5 } from './sku-engine.js';
import { handleCreateProduct, handleUpdateProduct, handleCheckSkuAvailability } from './product-handlers.js';

const UOM_OPTIONS = [
  ['UND', 'Unidad (UND)'],
  ['PAR', 'Par (PAR)'],
  ['CAJ', 'Caja (CAJ)'],
  ['KIT', 'Kit (KIT)'],
  ['MTR', 'Metro (MTR)'],
  ['BLS', 'Bolsa (BLS)'],
];

function toUppercase(input) {
  const pos = input.selectionStart;
  input.value = input.value.toUpperCase();
  try { input.setSelectionRange(pos, pos); } catch { /* not a text input */ }
}

function parseCopAmount(rawValue) {
  const digits = String(rawValue ?? '').replace(/\D+/g, '');
  if (!digits) return 0;
  return Number.parseInt(digits, 10) || 0;
}

function formatCopAmount(value) {
  const amount = Math.trunc(Math.abs(Number(value) || 0));
  return amount.toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function bindCopCurrencyInput(input) {
  if (!input) return;
  const applyFormat = () => {
    const amount = parseCopAmount(input.value);
    input.value = amount > 0 ? formatCopAmount(amount) : '';
  };
  input.addEventListener('input', applyFormat);
  input.addEventListener('blur', applyFormat);
}

export class ProductForm {
  constructor(container) {
    this.container = container;
    this._prefillRef = null;
    this._prefillSku = null;
    this._editProduct = null;
    this._skuLocked = false;
  }

  canUnmount() {
    const nombre = this.container.querySelector('#nombre')?.value?.trim();
    const ref    = this.container.querySelector('#ref-proveedor')?.value?.trim();
    if (nombre || ref || this._editProduct) {
      return confirm('¿Salir sin guardar?\nSe perderán los datos ingresados.');
    }
    return true;
  }

  prefill(refProveedor) {
    this._prefillRef = String(refProveedor).toUpperCase();
  }

  prefillSku(sku) {
    this._prefillSku = sku;
    this._prefillRef = sku.slice(-4);
    this._skuLocked = true;
  }

  setEditProduct(product) {
    this._editProduct = product;
    this._prefillSku = product.sku;
    this._skuLocked = true;
  }

  mount() {
    this.container.innerHTML = this._template();
    this._applyPrefills();
    this._bindEvents();
    this._updateSkuPreview();
  }

  _template() {
    const isEdit = !!this._editProduct;
    const isV5Bypass = this._skuLocked && !isEdit;
    const uomOpts = UOM_OPTIONS.map(
      ([val, label]) => `<option value="${val}">${label}</option>`
    ).join('');

    const modeBadge = isEdit
      ? `<div class="form-mode-badge form-mode-edit">✏️ Editando producto existente</div>`
      : isV5Bypass
        ? `<div class="form-mode-badge form-mode-v5">✅ SKU V5 detectado — código fijo</div>`
        : '';

    return `
      <div class="form-container mg-mobile-form-safe mg-premium-flow module-productos">
        <button type="button" class="btn-back" id="btn-back">← Volver</button>
        <h2>${isEdit ? 'Editar Producto' : 'Nuevo Producto'}</h2>
        ${modeBadge}
        <form id="product-form" novalidate>

          <div class="field-group">
            <label for="nombre">Descripción del producto</label>
            <input type="text" id="nombre" name="nombre"
              placeholder="EJ: DUCHA LLUVIA CROMADA 8 PULGADAS"
              autocomplete="off" autocapitalize="characters" required>
          </div>

          <div class="field-group">
            <label for="ref-proveedor">Código proveedor</label>
            <div class="input-with-action">
              <input type="text" id="ref-proveedor" name="ref_proveedor"
                placeholder="EJ: 16160615"
                autocomplete="off" autocapitalize="characters" required
                ${this._skuLocked ? 'readonly style="background:#f9fafb"' : ''}>
              ${!this._skuLocked
                ? `<button type="button" id="btn-scan-ref" class="btn-icon" title="Escanear código">📷</button>`
                : ''}
            </div>
          </div>

          <div class="form-row">
            <div class="field-group" style="flex:1">
              <label for="uom">Unidad de medida</label>
              <select id="uom" name="uom" required>${uomOpts}</select>
            </div>
            <div class="field-group" style="flex:1">
              <label for="cantidad">📦 Cantidad</label>
              <input type="number" id="cantidad" name="cantidad"
                placeholder="0" min="0" step="1" disabled readonly>
              <small class="field-hint">Se actualiza desde Kardex (stock ledger).</small>
            </div>
          </div>

          <div class="field-group">
            <label for="costo">💰 Costo unitario (COP)</label>
            <input type="text" id="costo" name="costo" inputmode="numeric"
              placeholder="0" autocomplete="off" disabled readonly>
            <small class="field-hint">Se actualiza desde compras/costo real vigente.</small>
          </div>

          <div class="sku-preview">
            <div class="sku-preview-label">
              SKU GENERADO
              ${this._skuLocked ? '<span class="sku-locked-badge">🔒 CÓDIGO FIJO</span>' : ''}
            </div>
            <div class="sku-code" id="sku-code">—</div>
            <div class="sku-meta">
              <span id="sku-cat">Categoría: —</span>
              <span id="sku-sub">Subcategoría: —</span>
              <span id="sku-atr">Atributo: —</span>
            </div>
          </div>

          <div id="dup-alert" class="sku-alert hidden"></div>

          <button type="submit" class="btn-primary" id="btn-submit">
            ${isEdit ? 'Actualizar Producto' : 'Guardar Producto'}
          </button>
          <button type="button" class="btn-cancel" id="btn-cancel">
            Cancelar
          </button>
        </form>
        <div id="form-feedback" class="feedback hidden"></div>
      </div>`;
  }

  _applyPrefills() {
    if (this._editProduct) {
      const p = this._editProduct;
      this._set('#nombre', p.nombre ?? '');
      this._set('#ref-proveedor', p.ref_proveedor ?? '');
      this._set('#uom', p.uom ?? 'UND');
      this._set('#costo', Number(p.costo_vigente_real ?? p.costo ?? 0) > 0 ? formatCopAmount(p.costo_vigente_real ?? p.costo) : '');
      this._set('#cantidad', p.stock_disponible_real ?? p.cantidad ?? '');
    } else if (this._prefillRef) {
      this._set('#ref-proveedor', this._prefillRef);
    }
  }

  _set(selector, value) {
    const el = this.container.querySelector(selector);
    if (el) el.value = value;
  }

  _bindEvents() {
    const form = this.container.querySelector('#product-form');
    const nombre = this.container.querySelector('#nombre');
    const ref = this.container.querySelector('#ref-proveedor');
    const costo = this.container.querySelector('#costo');
    const scanBtn = this.container.querySelector('#btn-scan-ref');

    // Force UPPERCASE in real-time on text inputs
    [nombre, ref].forEach((inp) => {
      if (!inp || inp.readOnly) return;
      inp.addEventListener('input', () => {
        toUppercase(inp);
        if (!this._skuLocked) this._updateSkuPreview();
      });
    });
    if (costo && !costo.disabled) bindCopCurrencyInput(costo);

    if (scanBtn) {
      scanBtn.addEventListener('click', () => {
        window.__erp_navigate?.('scanner');
      });
    }

    this.container.querySelector('#btn-back')?.addEventListener('click', () => {
      window.__erp_navigate?.('lista');
    });

    this.container.querySelector('#btn-cancel')?.addEventListener('click', () => {
      const nombre = this.container.querySelector('#nombre')?.value?.trim();
      const ref    = this.container.querySelector('#ref-proveedor')?.value?.trim();
      if (this._editProduct) {
        if (!confirm('¿Cancelar la edición?\nEl producto NO será eliminado. Solo se descartan los cambios no guardados.')) return;
        window.__erp_navigate?.('lista');
        return;
      }
      if ((nombre || ref) &&
          !confirm('¿Cancelar el registro?\nSe perderán los datos ingresados.')) return;
      window.__erp_navigate?.('lista');
    });

    form.addEventListener('submit', (e) => this._handleSubmit(e));
  }

  async _updateSkuPreview() {
    if (this._skuLocked) {
      const sku = this._prefillSku;
      const decoded = sku ? decodeSkuV5(sku) : null;
      this._renderPreview(sku ?? '—', decoded);
      return;
    }

    const nombre = this.container.querySelector('#nombre')?.value ?? '';
    const ref = this.container.querySelector('#ref-proveedor')?.value ?? '';

    if (!nombre && !ref) {
      this._renderPreview('—', null);
      return;
    }

    const result = generateSKU(nombre || 'PRODUCTO', ref || '0000');
    this._renderPreview(result.sku, result);
    await this._checkDuplicate(result.sku);
  }

  _renderPreview(sku, meta) {
    const code = this.container.querySelector('#sku-code');
    const cat = this.container.querySelector('#sku-cat');
    const sub = this.container.querySelector('#sku-sub');
    const atr = this.container.querySelector('#sku-atr');

    if (code) code.textContent = sku;
    if (meta) {
      if (cat) cat.textContent = `Categoría: ${meta.cat}`;
      if (sub) sub.textContent = `Subcategoría: ${meta.sub}`;
      if (atr) atr.textContent = `Atributo: ${meta.atr}`;
    }
  }

  async _checkDuplicate(sku) {
    const excludeId = this._editProduct?.id ?? null;
    const exists = await handleCheckSkuAvailability(sku, excludeId);
    const alert = this.container.querySelector('#dup-alert');
    const btn = this.container.querySelector('#btn-submit');

    if (!alert) return;
    if (exists) {
      alert.className = 'sku-alert visible';
      alert.textContent = '🔴 SKU ya existe en el sistema — verifique los datos';
      if (btn) btn.disabled = true;
    } else {
      alert.className = 'sku-alert hidden';
      if (btn) btn.disabled = false;
    }
  }

  async _handleSubmit(e) {
    e.preventDefault();

    const nombre = this.container.querySelector('#nombre').value.trim();
    const refProveedor = this.container.querySelector('#ref-proveedor').value.trim();
    const uom = this.container.querySelector('#uom').value;
    
    if (!nombre || !refProveedor) {
      this._showFeedback('⚠️ Complete todos los campos requeridos.', 'error');
      return;
    }

    let sku, cat, sub, atr;
    if (this._skuLocked) {
      sku = this._prefillSku;
      const decoded = decodeSkuV5(sku) ?? {};
      cat = this._editProduct?.categoria ?? decoded.cat ?? '—';
      sub = this._editProduct?.subcategoria ?? decoded.sub ?? '—';
      atr = this._editProduct?.atributo ?? decoded.atr ?? '—';
    } else {
      const result = generateSKU(nombre, refProveedor);
      sku = result.sku;
      cat = result.cat;
      sub = result.sub;
      atr = result.atr;
    }

    // Final duplicate guard (idempotent with live check)
    const excludeId = this._editProduct?.id ?? null;
    if (await handleCheckSkuAvailability(sku, excludeId)) {
      this._showFeedback('🔴 SKU ya existe — creación bloqueada.', 'error');
      return;
    }

    const isEdit = !!this._editProduct;
    const confirmMsg = isEdit
      ? `¿Actualizar este producto?\n\nSKU: ${sku}\n${nombre}`
      : `¿Guardar nuevo producto?\n\nSKU: ${sku}\n${nombre}`;
    if (!confirm(confirmMsg)) return;

    const btn = this.container.querySelector('#btn-submit');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      if (isEdit) {
        await handleUpdateProduct(this._editProduct.id, { nombre, ref_proveedor: refProveedor, uom });
        this._showFeedback(`✅ Producto actualizado: ${sku}`, 'success');
        setTimeout(() => window.__erp_navigate?.('lista'), 1200);
      } else {
        await handleCreateProduct({ nombre, ref_proveedor: refProveedor, uom, sku, categoria: cat, subcategoria: sub, atributo: atr });
        this._showFeedback(`✅ Creado: ${sku}`, 'success');
        e.target.reset();
        this._renderPreview('—', null);
      }
    } catch (err) {
      this._showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = this._editProduct ? 'Actualizar Producto' : 'Guardar Producto';
    }
  }

  _showFeedback(msg, type) {
    const el = this.container.querySelector('#form-feedback');
    if (!el) return;
    el.textContent = msg;
    el.className = `feedback ${type}`;
    setTimeout(() => { el.className = 'feedback hidden'; }, 5000);
  }

  unmount() {}
}
