import {
  handlePrepararFormularioCompra,
  handleGuardarCompra,
  handleRecibirCompra,
  handleCrearProductoDesdeCompra,
} from './handlers/index.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { BODEGA_CENTRAL_ID } from '../kardex/bodega-store.js';

function parseCop(str) { return parseInt(String(str).replace(/\D/g, ''), 10) || 0; }
function fmtCop(v) { return new Intl.NumberFormat('es-CO').format(Math.round(Number(v) || 0)); }

export class CompraForm {
  constructor(container) {
    this._container = container;
    this._compra = null;         // existing compra object (null = new)
    this._items = [];            // current items in DOM / loaded from IDB
    this._products = [];
    this._proveedores = [];
    this._bodegas = [];
    this._selectedProv = null;
    this._selectedBodegaId = BODEGA_CENTRAL_ID;
    this._receiving = false;     // Guardia contra doble recepción
  }

  setCompra(c) { this._compra = c; }

  async mount() {
    this._container.innerHTML = '<div class="loading">Cargando...</div>';
    
    const prepared = await handlePrepararFormularioCompra({
      compra: this._compra,
      bodegaDefaultId: BODEGA_CENTRAL_ID,
    });

    this._products = prepared.products;
    this._proveedores = prepared.proveedores;
    this._bodegas = prepared.bodegas;
    this._items = prepared.items;
    this._selectedProv = prepared.selectedProv;
    this._selectedBodegaId = prepared.selectedBodegaId;

    this._render();
  }

  unmount() {}

  _isReadOnly() { return this._compra?.estado === 'recibida'; }

  _render() {
    const c = this._compra;
    const ro = this._isReadOnly();
    const isNew = !c;
    const titulo = isNew ? 'Nueva Orden de Compra' : ro ? `OC — ${c.consecutivo}` : `Editar — ${c.consecutivo ?? 'Borrador'}`;
    const totalSub = this._items.reduce((s, i) => s + (Number(i.cantidad) * Number(i.costo_unitario)), 0);
    const iva = Math.round(totalSub * 0.19);
    const total = totalSub + iva;

    this._container.innerHTML = `
      <div class="form-container">
        <button class="btn-back" id="btn-back">← Compras</button>
        <h2>${titulo}</h2>

        ${ro ? `<div class="form-mode-badge form-mode-edit" style="background:#f0fdf4;color:#15803d;border-color:#86efac">
          ✅ RECIBIDA — Solo lectura
        </div>` : ''}

        <!-- Proveedor -->
        <div class="field-group">
          <label>Proveedor *</label>
          ${ro
            ? `<div class="field-input" style="background:#f9fafb">${c?.proveedor_nombre ?? '—'}</div>`
            : `<input type="text" id="prov-buscar" class="field-input"
                placeholder="Buscar proveedor por razón social o NIT..."
                value="${this._selectedProv?.razon_social ?? ''}" autocomplete="off">
               <div id="prov-dropdown" style="display:none;border:1px solid #e2e8f0;border-radius:6px;background:#fff;max-height:180px;overflow-y:auto;margin-top:2px"></div>
               <input type="hidden" id="prov-id" value="${this._selectedProv?.id ?? ''}">
            `
          }
        </div>

        ${!isNew && c?.proveedor_nit ? `<div class="product-meta" style="margin-bottom:12px"><span>NIT: ${c.proveedor_nit}</span></div>` : ''}

        <!-- Forma de pago -->
        <div class="field-group">
          <label>Forma de pago</label>
          ${ro
            ? `<div class="field-input" style="background:#f9fafb">${c?.forma_pago ?? '—'}</div>`
            : `<select id="forma-pago" class="field-input">
                 <option value="CONTADO" ${(c?.forma_pago ?? 'CONTADO') === 'CONTADO' ? 'selected' : ''}>Contado</option>
                 <option value="CREDITO" ${c?.forma_pago === 'CREDITO' ? 'selected' : ''}>Crédito</option>
               </select>`
          }
        </div>

        <!-- Bodega destino -->
        <div class="field-group">
          <label>Bodega destino *</label>
          ${ro
            ? `<div class="field-input" style="background:#f9fafb">${this._bodegas.find((b) => b.id === (c?.bodega_destino ?? BODEGA_CENTRAL_ID))?.nombre ?? 'Bodega Central'}</div>`
            : `<select id="bodega-destino" class="field-input">
                ${this._bodegas.map((b) => `<option value="${b.id}" ${(this._selectedBodegaId === b.id) ? 'selected' : ''}>${b.nombre}</option>`).join('')}
               </select>`
          }
        </div>

        <!-- Items -->
        <div class="field-group">
          <label>Ítems de la Orden</label>

          ${!ro ? `
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <input type="text" id="prod-buscar" class="field-input"
                placeholder="Buscar producto por nombre o código proveedor..."
                style="flex:1" autocomplete="off">
            </div>
            <div id="prod-dropdown" style="display:none;border:1px solid #e2e8f0;border-radius:6px;background:#fff;max-height:180px;overflow-y:auto;margin-bottom:8px"></div>
          ` : ''}

          <div class="precio-table">
            <div class="precio-table-header" style="grid-template-columns:2fr 3fr 1fr 1fr 1fr">
              <span>Cód. Proveedor</span>
              <span>Descripción</span>
              <span>Cantidad</span>
              <span>Costo Unit.</span>
              <span style="text-align:center">${ro ? 'Subtotal' : 'Subtotal / Eliminar'}</span>
            </div>
            <div id="items-body">
              ${this._items.length === 0
                ? `<div style="padding:16px;text-align:center;color:#9ca3af;font-size:13px">Sin ítems. Busca un producto para agregar.</div>`
                : this._items.map((it, idx) => this._itemRow(it, idx, ro)).join('')}
            </div>
          </div>
        </div>

        <!-- Totales -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="color:#64748b;font-size:13px">Subtotal</span>
            <span style="font-weight:600">$${fmtCop(totalSub)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="color:#64748b;font-size:13px">IVA 19%</span>
            <span style="font-weight:600">$${fmtCop(iva)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:4px">
            <span style="font-weight:700">Total</span>
            <span style="font-weight:800;font-size:16px;color:var(--primary)">$${fmtCop(total)}</span>
          </div>
        </div>

        ${!ro ? `
          <!-- No. Factura Proveedor — obligatorio en recepción -->
          <div class="field-group">
            <label>No. Factura del Proveedor ${!isNew ? '<span style="color:#dc2626">*</span>' : ''}</label>
            <input type="text" id="factura-prov" class="field-input"
              placeholder="EJ: 2024-1234"
              value="${c?.factura_proveedor ?? ''}">
          </div>

          <div id="compra-fb" class="feedback hidden"></div>

          <div style="display:flex;gap:10px;margin-top:8px">
            <button class="btn-secondary" id="btn-cancel" style="flex:1">Cancelar</button>
            <button class="btn-primary" id="btn-guardar" style="flex:2">
              ${isNew ? '💾 Guardar Borrador' : '💾 Guardar Cambios'}
            </button>
            ${!isNew ? `
              <button class="btn-primary" id="btn-recibir"
                style="flex:2;background:#15803d;border-color:#15803d">
                ✅ Confirmar Recepción
              </button>
            ` : ''}
          </div>
        ` : `
          <button class="btn-secondary" id="btn-back2" style="width:100%;margin-top:8px">← Volver a Compras</button>
        `}
      </div>`;

    this._bindEvents();
  }

  _itemRow(it, idx, ro) {
    const sub = fmtCop(Number(it.cantidad) * Number(it.costo_unitario));
    if (ro) {
      return `
        <div class="precio-table-row" style="grid-template-columns:2fr 3fr 1fr 1fr 1fr">
          <span style="font-size:13px;color:#64748b">${it.ref_proveedor ?? '—'}</span>
          <span class="precio-name">${it.descripcion ?? it.product_name ?? '—'}</span>
          <span style="text-align:center">${it.cantidad}</span>
          <span>$${fmtCop(it.costo_unitario)}</span>
          <span style="text-align:right;font-weight:600">$${sub}</span>
        </div>`;
    }
    return `
      <div class="precio-table-row" data-idx="${idx}" style="grid-template-columns:2fr 3fr 1fr 1fr 1fr">
        <input class="precio-venta-input item-ref" type="text" data-field="ref_proveedor"
          data-idx="${idx}" value="${it.ref_proveedor ?? ''}"
          placeholder="Cód. prov." style="font-size:13px">
        <input class="precio-venta-input item-desc" type="text" data-field="descripcion"
          data-idx="${idx}" value="${it.descripcion ?? it.product_name ?? ''}"
          placeholder="Descripción">
        <input class="precio-venta-input item-qty" type="number" data-field="cantidad"
          data-idx="${idx}" value="${it.cantidad ?? 1}"
          min="1" step="1" style="text-align:center;width:60px">
        <input class="precio-venta-input item-costo" type="text" data-field="costo_unitario"
          data-idx="${idx}" value="${it.costo_unitario ? fmtCop(it.costo_unitario) : ''}"
          placeholder="0" inputmode="numeric">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
          <span class="item-sub" data-idx="${idx}" style="font-size:12px;color:#374151;min-width:60px;text-align:right">$${sub}</span>
          <button class="btn-action btn-deactivate item-del" data-idx="${idx}"
            style="padding:2px 8px;font-size:11px">✕</button>
        </div>
      </div>`;
  }

  _bindEvents() {
    const g = (id) => this._container.querySelector(id);

    g('#btn-back')?.addEventListener('click', () => window.__erp_navigate?.('compras'));
    g('#btn-back2')?.addEventListener('click', () => window.__erp_navigate?.('compras'));
    g('#btn-cancel')?.addEventListener('click', () => window.__erp_navigate?.('compras'));
    g('#btn-guardar')?.addEventListener('click', () => this._guardar());
    g('#btn-recibir')?.addEventListener('click', () => this._recibirCompra());
    g('#bodega-destino')?.addEventListener('change', (e) => { this._selectedBodegaId = e.target.value; });

    // Proveedor search
    const provInput = g('#prov-buscar');
    const provDrop  = g('#prov-dropdown');
    provInput?.addEventListener('input', () => {
      const q = provInput.value.toLowerCase();
      const matches = this._proveedores.filter(
        (p) =>
          (p.razon_social ?? '').toLowerCase().includes(q) ||
          (p.nit ?? '').toLowerCase().includes(q)
      );
      if (!q || matches.length === 0) { provDrop.style.display = 'none'; return; }
      provDrop.innerHTML = matches.slice(0, 8).map((p) => `
        <div data-prov-id="${p.id}" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:13px"
             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          <strong>${p.razon_social}</strong><br>
          <span style="color:#9ca3af">NIT: ${p.nit ?? '—'}</span>
        </div>`).join('');
      provDrop.style.display = 'block';
    });
    provDrop?.addEventListener('click', (e) => {
      const id = e.target.closest('[data-prov-id]')?.dataset.provId;
      if (!id) return;
      this._selectedProv = this._proveedores.find((p) => p.id === id);
      if (this._selectedProv) {
        provInput.value = this._selectedProv.razon_social;
        g('#prov-id').value = this._selectedProv.id;
      }
      provDrop.style.display = 'none';
    });

    // Product search
    const prodInput = g('#prod-buscar');
    const prodDrop  = g('#prod-dropdown');
    prodInput?.addEventListener('input', () => {
      const q = prodInput.value.toLowerCase();
      if (!q) { prodDrop.style.display = 'none'; return; }
      const matches = this._products.filter(
        (p) =>
          (p.nombre ?? '').toLowerCase().includes(q) ||
          (p.ref_proveedor ?? '').toLowerCase().includes(q)
      );
      const rows = matches.slice(0, 8).map((p) => `
        <div data-prod-id="${p.id}" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:13px"
             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          <strong>${p.ref_proveedor ?? p.sku}</strong> — ${p.nombre}
          ${p.costo > 0 ? `<span style="color:#9ca3af;float:right">$${fmtCop(p.costo)}</span>` : ''}
        </div>`).join('');
      const crearRow = `
        <div data-crear-nombre="${prodInput.value}" style="padding:10px 12px;cursor:pointer;font-size:13px;color:#15803d;border-top:1px solid #e2e8f0;background:#f0fdf4"
             onmouseover="this.style.background='#dcfce7'" onmouseout="this.style.background='#f0fdf4'">
          ➕ Crear nuevo producto: <strong>${prodInput.value}</strong>
        </div>`;
      prodDrop.innerHTML = rows + crearRow;
      prodDrop.style.display = 'block';
    });
    prodDrop?.addEventListener('click', (e) => {
      const crearEl = e.target.closest('[data-crear-nombre]');
      if (crearEl) {
        prodDrop.style.display = 'none';
        this._showCrearProductoForm(crearEl.dataset.crearNombre, (newProd) => {
          this._products.push(newProd);
          this._items.push({
            product_id:     newProd.id,
            product_name:   newProd.nombre,
            ref_proveedor:  newProd.ref_proveedor ?? '',
            descripcion:    newProd.nombre,
            cantidad:       1,
            costo_unitario: Number(newProd.costo) || 0,
          });
          prodInput.value = '';
          this._rerenderItems();
        });
        return;
      }
      const id = e.target.closest('[data-prod-id]')?.dataset.prodId;
      if (!id) return;
      const prod = this._products.find((p) => p.id === id);
      if (!prod) return;
      this._items.push({
        product_id:    prod.id,
        product_name:  prod.nombre,
        ref_proveedor: prod.ref_proveedor ?? '',
        descripcion:   prod.nombre,
        cantidad:      1,
        costo_unitario: Number(prod.costo) || 0,
      });
      prodInput.value = '';
      prodDrop.style.display = 'none';
      this._rerenderItems();
    });

    // Item edits
    this._container.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.classList.contains('precio-venta-input')) return;
      const idx = parseInt(el.dataset.idx, 10);
      if (isNaN(idx)) return;
      const field = el.dataset.field;
      if (field === 'costo_unitario') {
        const raw = parseCop(el.value);
        this._items[idx][field] = raw;
      } else if (field === 'cantidad') {
        this._items[idx][field] = parseInt(el.value, 10) || 1;
      } else {
        this._items[idx][field] = el.value;
      }
      // Update subtotal
      const sub = (Number(this._items[idx].cantidad) || 0) * (Number(this._items[idx].costo_unitario) || 0);
      const subEl = this._container.querySelector(`.item-sub[data-idx="${idx}"]`);
      if (subEl) subEl.textContent = `$${fmtCop(sub)}`;
    });

    // Delete item
    this._container.addEventListener('click', (e) => {
      const btn = e.target.closest('.item-del');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      if (!isNaN(idx)) {
        this._items.splice(idx, 1);
        this._rerenderItems();
      }
    });
  }

  _showCrearProductoForm(nombreInicial, onCreado) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:999;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:100%;max-width:420px;box-shadow:0 4px 32px rgba(0,0,0,0.18)">
        <h3 style="margin:0 0 16px">Nuevo producto</h3>
        <div class="field-group" style="margin-bottom:12px">
          <label>Nombre *</label>
          <input type="text" id="np-nombre" class="field-input" value="${nombreInicial}" placeholder="Nombre del producto">
        </div>
        <div class="field-group" style="margin-bottom:12px">
          <label>Referencia proveedor</label>
          <input type="text" id="np-ref" class="field-input" placeholder="Cód. proveedor (opcional)">
        </div>
        <div class="field-group" style="margin-bottom:16px">
          <label>Costo unitario</label>
          <input type="text" id="np-costo" class="field-input" placeholder="0" inputmode="numeric">
        </div>
        <div id="np-fb" style="display:none;color:#dc2626;font-size:13px;margin-bottom:8px"></div>
        <div style="display:flex;gap:10px">
          <button id="np-cancel" class="btn-secondary" style="flex:1">Cancelar</button>
          <button id="np-guardar" class="btn-primary" style="flex:2">💾 Crear producto</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const fb = overlay.querySelector('#np-fb');
    overlay.querySelector('#np-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#np-guardar').addEventListener('click', async () => {
      const nombre = overlay.querySelector('#np-nombre').value.trim();
      const ref    = overlay.querySelector('#np-ref').value.trim();
      const costo  = parseCop(overlay.querySelector('#np-costo').value);
      if (!nombre) { fb.textContent = 'El nombre es obligatorio.'; fb.style.display = 'block'; return; }
      const btn = overlay.querySelector('#np-guardar');
      btn.disabled = true; btn.textContent = 'Creando...';
      try {
        const newProd = await handleCrearProductoDesdeCompra({ nombre, ref_proveedor: ref || undefined, costo });
        overlay.remove();
        onCreado(newProd);
      } catch (err) {
        fb.textContent = err.message; fb.style.display = 'block';
        btn.disabled = false; btn.textContent = '💾 Crear producto';
      }
    });
  }

  _rerenderItems() {
    const body = this._container.querySelector('#items-body');
    if (!body) return;
    if (this._items.length === 0) {
      body.innerHTML = `<div style="padding:16px;text-align:center;color:#9ca3af;font-size:13px">Sin ítems. Busca un producto para agregar.</div>`;
      return;
    }
    body.innerHTML = this._items.map((it, idx) => this._itemRow(it, idx, false)).join('');
    // Recalc totals
    const totalSub = this._items.reduce((s, i) => s + (Number(i.cantidad) * Number(i.costo_unitario)), 0);
    const iva = Math.round(totalSub * 0.19);
    const total = totalSub + iva;
    const totSection = this._container.querySelector('[style*="background:#f8fafc"]');
    if (totSection) {
      totSection.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="color:#64748b;font-size:13px">Subtotal</span>
          <span style="font-weight:600">$${fmtCop(totalSub)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="color:#64748b;font-size:13px">IVA 19%</span>
          <span style="font-weight:600">$${fmtCop(iva)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:4px">
          <span style="font-weight:700">Total</span>
          <span style="font-weight:800;font-size:16px;color:var(--primary)">$${fmtCop(total)}</span>
        </div>`;
    }
  }

  _collectItems() {
    return this._items.map((it, idx) => {
      // Sync from DOM in case of programmatic changes
      const ref = this._container.querySelector(`.item-ref[data-idx="${idx}"]`)?.value ?? it.ref_proveedor ?? '';
      const desc = this._container.querySelector(`.item-desc[data-idx="${idx}"]`)?.value ?? it.descripcion ?? '';
      const qty = parseInt(this._container.querySelector(`.item-qty[data-idx="${idx}"]`)?.value ?? it.cantidad, 10) || 1;
      const costo = parseCop(this._container.querySelector(`.item-costo[data-idx="${idx}"]`)?.value ?? '') || Number(it.costo_unitario) || 0;
      return { ...it, ref_proveedor: ref, descripcion: desc, cantidad: qty, costo_unitario: costo };
    });
  }

  _fb(msg, type) {
    const el = this._container.querySelector('#compra-fb');
    if (!el) return;
    el.textContent = msg;
    el.className = `feedback ${type}`;
    setTimeout(() => { el.className = 'feedback hidden'; }, 4000);
  }

  async _guardar() {
    const provId = this._container.querySelector('#prov-id')?.value || this._selectedProv?.id || this._compra?.proveedor_id;
    const items = this._collectItems();

    const btn = this._container.querySelector('#btn-guardar');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    try {
      const command = {
        compra: this._compra,
        proveedorId: provId || this._compra?.proveedor_id,
        proveedor: this._proveedores.find((p) => p.id === provId) ?? this._selectedProv,
        items,
        forma_pago: this._container.querySelector('#forma-pago')?.value ?? this._compra?.forma_pago ?? 'CONTADO',
        factura_proveedor: this._container.querySelector('#factura-prov')?.value?.trim() ?? this._compra?.factura_proveedor ?? '',
        bodega_destino: this._selectedBodegaId,
      };

      const { compra: compraData, items: savedItems } = await handleGuardarCompra(command);

      this._fb('✅ Orden de compra guardada.', 'success');
      this._compra = compraData;
      this._items = savedItems;
      setTimeout(() => window.__erp_navigate?.('compras'), 1200);
    } catch (err) {
      this._fb(`Error: ${err.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Cambios'; }
    }
  }

  async _recibirCompra() {
    // Guardia de estado: verificar si ya fue recibida
    if (this._compra?.estado === 'recibida') {
      this._fb('Esta compra ya fue recibida.', 'info');
      return;
    }

    // Guardia de ejecución: evitar doble recepción por doble click
    if (this._receiving) {
      this._fb('Procesando recepción... Por favor espere.', 'info');
      return;
    }
    this._receiving = true;

    const items = this._collectItems();
    if (items.length === 0) {
      this._receiving = false;
      this._fb('No hay ítems para recibir.', 'error');
      return;
    }

    const factura = this._container.querySelector('#factura-prov')?.value?.trim() ?? '';

    // Snapshot costos actuales para detectar cambios después de recepción
    const costosSnapshot = {};
    for (const item of items) {
      const prod = this._products.find((p) => p.id === item.product_id);
      if (prod) costosSnapshot[item.product_id] = Number(prod.costo) || 0;
    }

    const bodegaSeleccionada = this._selectedBodegaId ?? BODEGA_CENTRAL_ID;
    const bodegaNombre = this._bodegas.find((b) => b.id === bodegaSeleccionada)?.nombre ?? 'Bodega Central';

    const lineas = items.map((i) => `• ${i.ref_proveedor || i.descripcion}: ${i.cantidad} × $${fmtCop(i.costo_unitario)}`).join('\n');
    const totalSub = items.reduce((s, i) => s + (Number(i.cantidad) * Number(i.costo_unitario)), 0);
    const total = totalSub + Math.round(totalSub * 0.19);
    const msg = `¿Confirmar recepción de la orden ${this._compra?.consecutivo}?\n\nFactura: ${factura}\nBodega destino: ${bodegaNombre}\n\n${lineas}\n\nTotal: $${fmtCop(total)}\n\nEsto ingresará el stock a inventario y actualizará costos si cambiaron.`;
    if (!confirm(msg)) {
      this._receiving = false;
      return;
    }

    const btn = this._container.querySelector('#btn-recibir');
    if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

    try {
      // Adjuntar bodega_id a cada item para que el listener la respete
      const itemsConBodega = items.map((i) => ({ ...i, bodega_id: bodegaSeleccionada }));

      const { compra: updated } = await handleRecibirCompra({
        compra: this._compra,
        items: itemsConBodega,
        factura_proveedor: factura,
      });

      this._compra = updated;

      // Aviso de costos cambiados para revisión de listas de precios
      const cambiados = items.filter((i) => {
        const prev = costosSnapshot[i.product_id];
        return prev !== undefined && Number(i.costo_unitario) !== prev;
      });
      if (cambiados.length > 0) {
        const lista = cambiados.map((i) => `• ${i.descripcion || i.ref_proveedor}: $${fmtCop(costosSnapshot[i.product_id])} → $${fmtCop(i.costo_unitario)}`).join('\n');
        alert(`⚠️ Aviso — Cambio de costo detectado\n\nRevise las listas de precios para:\n\n${lista}`);
      }

      alert(`Recepción confirmada — ${updated.consecutivo}. Stock ingresado a ${bodegaNombre}.`);
      window.__erp_navigate?.('compras');
    } catch (err) {
      this._fb(`Error al recibir: ${err.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Recepción'; }
    } finally {
      this._receiving = false;
    }
  }
}
