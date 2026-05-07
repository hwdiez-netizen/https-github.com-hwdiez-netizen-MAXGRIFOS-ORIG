import { getPedidoCompleto, agregarItemAlPicking } from './pedido-store.js';
import { sagaIniciarPicking, sagaCompletarPicking, sagaIniciarPacking, sagaAnularPedido } from './pedido-saga.js';
import { getAllProducts } from '../../db/local-db.js';
import { getSaldoByProduct } from '../kardex/kardex-store.js';
import { BODEGA_CENTRAL_ID } from '../kardex/bodega-store.js';
import { getPrecioConOrigen } from '../politicas-comerciales/precio-assignment.js';

export class PickingForm {
  constructor(container, pedidoId) {
    this.container = container;
    this._pedidoId = pedidoId;
    this._data     = null;
    this._ajustes  = [];
    this._quitados = new Set();
    this._nuevos   = [];
    this._saved    = false;
  }

  async canUnmount() { return true; }

  async mount() {
    this.container.innerHTML = `<div class="loading">Cargando picking...</div>`;
    this._data = await getPedidoCompleto(this._pedidoId);
    if (!this._data) { this.container.innerHTML = `<div class="form-error">Pedido no encontrado.</div>`; return; }

    if (['creacion', 'edicion', 'creado', 'standby'].includes(this._data.pedido.estado)) {
      await sagaIniciarPicking(this._pedidoId);
      this._data = await getPedidoCompleto(this._pedidoId);
    }

    this._ajustes = this._data.items.map((it) => ({ item_id: it.id, cantidad_picking: it.cantidad_picking }));
    this._render();
  }

  unmount() {}

  _render() {
    const { pedido, items } = this._data;
    const itemsVisibles = items.filter((it) => !this._quitados.has(it.id));
    this.container.innerHTML = `
      <div class="form-container">
        <button type="button" class="btn-back" id="btn-back">← Volver</button>
        <h2>Picking — ${pedido.consecutivo}</h2>
        <p class="field-hint">Verifica y ajusta las cantidades encontradas físicamente. Escanea el Code 128 del producto para confirmarlo.</p>

        <div style="margin-bottom:12px">
          <button type="button" class="btn-secondary" id="btn-scan-pick" style="width:100%">
            📷 Escanear producto (Code 128)
          </button>
        </div>

        <div style="margin-bottom:12px;border:1px solid var(--border);border-radius:8px;padding:10px">
          <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">Agregar producto</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="pick-search-input" placeholder="Nombre, SKU o ref. proveedor…"
              style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px" autocomplete="off">
            <button type="button" class="btn-secondary" id="btn-pick-search" style="white-space:nowrap">Buscar</button>
          </div>
          <div id="pick-search-results" style="margin-top:8px"></div>
        </div>

        <div id="picking-items">
          ${itemsVisibles.map((it) => this._itemRow(it)).join('')}
          ${this._nuevos.map((it) => this._newItemRow(it)).join('')}
        </div>

        <div id="pick-error" class="form-error hidden" style="margin-top:12px"></div>

        <div style="display:flex;gap:10px;margin-top:20px">
          <button type="button" class="btn-danger" id="btn-cancelar" style="flex:1">🚫 Cancelar</button>
          <button type="button" class="btn-primary" id="btn-ir-packing" style="flex:2">
            ✅ Completar Picking
          </button>
        </div>
      </div>`;

    this._bindEvents();
  }

  _itemRow(it) {
    const aj = this._ajustes.find((a) => a.item_id === it.id);
    const qty = aj ? aj.cantidad_picking : it.cantidad_picking;
    const diff = qty - it.cantidad_pedida;
    const diffCls = diff < 0 ? 'pick-diff-neg' : diff > 0 ? 'pick-diff-pos' : '';
    return `
      <div class="picking-item" data-item-id="${it.id}" style="display:flex;align-items:flex-start;gap:8px">
        <div style="flex:1">
          <div class="picking-item-info">
            <span class="pick-sku">${it.product_sku}</span>
            <span class="pick-name">${it.product_name}</span>
          </div>
          <div class="picking-item-qty">
            <span class="pick-label">Pedido: <strong>${it.cantidad_pedida}</strong></span>
            <div style="display:flex;align-items:center;gap:6px">
              <label style="font-size:12px;color:var(--text-secondary)">Encontrado:</label>
              <input type="number" class="pick-qty-input" data-item-id="${it.id}"
                min="0" step="1" value="${qty}" inputmode="numeric" style="width:70px;text-align:center">
            </div>
            ${diff !== 0 ? `<span class="pick-diff ${diffCls}">${diff > 0 ? '+' : ''}${diff} vs pedido</span>` : ''}
          </div>
        </div>
        <button type="button" class="btn-pick-quitar" data-item-id="${it.id}"
          style="background:none;border:none;color:var(--danger,#dc2626);font-size:20px;cursor:pointer;padding:4px 8px;line-height:1" title="Quitar del picking">×</button>
      </div>`;
  }

  _newItemRow(it) {
    return `
      <div class="picking-item picking-item-nuevo" data-nuevo-id="${it.id}" style="display:flex;align-items:flex-start;gap:8px;border-left:3px solid var(--primary,#2563eb);padding-left:8px">
        <div style="flex:1">
          <div class="picking-item-info">
            <span class="pick-sku">${it.product_sku}</span>
            <span class="pick-name">${it.product_name}
              <small style="color:var(--primary,#2563eb);font-size:11px;margin-left:4px">[NUEVO]</small>
            </span>
          </div>
          <div class="picking-item-qty">
            <span class="pick-label" style="color:var(--primary,#2563eb)">Agregado: <strong>${it.cantidad_picking}</strong></span>
            <span style="font-size:12px;color:var(--text-secondary);margin-left:8px">$${Number(it.precio_unitario ?? 0).toLocaleString('es-CO')}</span>
          </div>
        </div>
        <button type="button" class="btn-pick-quitar-nuevo" data-nuevo-id="${it.id}"
          style="background:none;border:none;color:var(--danger,#dc2626);font-size:20px;cursor:pointer;padding:4px 8px;line-height:1" title="Quitar">×</button>
      </div>`;
  }

  _bindEvents() {
    this.container.querySelector('#btn-back')?.addEventListener('click', () => navigate('pedido-detail', { pedidoId: this._pedidoId }));

    this.container.querySelector('#btn-scan-pick')?.addEventListener('click', () => {
      sessionStorage.setItem('picking_pending_scan', this._pedidoId);
      this._saved = true;
      navigate('escaner');
    });

    this.container.querySelectorAll('.pick-qty-input').forEach((inp) => {
      inp.addEventListener('change', () => {
        const itemId = inp.dataset.itemId;
        const aj     = this._ajustes.find((a) => a.item_id === itemId);
        if (aj) aj.cantidad_picking = Number(inp.value);
        const item   = this._data.items.find((i) => i.id === itemId);
        const diff   = Number(inp.value) - item.cantidad_pedida;
        const row    = this.container.querySelector(`.picking-item[data-item-id="${itemId}"] .pick-diff`);
        if (row) { row.textContent = `${diff >= 0 ? '+' : ''}${diff} vs pedido`; row.className = `pick-diff ${diff < 0 ? 'pick-diff-neg' : 'pick-diff-pos'}`; }
      });
    });

    this.container.querySelectorAll('.btn-pick-quitar').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.itemId;
        this._quitados.add(itemId);
        const aj = this._ajustes.find((a) => a.item_id === itemId);
        if (aj) aj.cantidad_picking = 0;
        this._render();
      });
    });

    this.container.querySelectorAll('.btn-pick-quitar-nuevo').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nuevoId = btn.dataset.nuevoId;
        this._nuevos = this._nuevos.filter((n) => n.id !== nuevoId);
        this._render();
      });
    });

    const searchInput = this.container.querySelector('#pick-search-input');
    const searchBtn   = this.container.querySelector('#btn-pick-search');
    const searchRes   = () => this.container.querySelector('#pick-search-results');

    const doSearch = async () => {
      const q = (searchInput?.value ?? '').trim().toLowerCase();
      if (q.length < 2) { searchRes().innerHTML = ''; return; }
      searchRes().innerHTML = `<p style="font-size:13px;color:var(--text-secondary);margin:0">Buscando…</p>`;
      try {
        const all = await getAllProducts();
        const matches = all
          .filter((p) => p.status === 'active')
          .filter((p) => {
            const n = (p.nombre ?? '').toLowerCase();
            const s = (p.sku ?? '').toLowerCase();
            const r = (p.ref_proveedor ?? '').toLowerCase();
            return n.includes(q) || s.includes(q) || r.includes(q);
          })
          .slice(0, 8);

        if (matches.length === 0) {
          searchRes().innerHTML = `<p style="font-size:13px;color:var(--text-secondary);margin:0">Sin resultados.</p>`;
          return;
        }

        const rows = await Promise.all(matches.map(async (p) => {
          const saldo      = await getSaldoByProduct(p.id, BODEGA_CENTRAL_ID);
          const yaEnPedido = this._data.items.some((it) => it.product_id === p.id && !this._quitados.has(it.id));
          const yaNuevo    = this._nuevos.some((n) => n.product_id === p.id);
          const disabled   = yaEnPedido || yaNuevo || !(saldo > 0);
          const etiqueta   = yaEnPedido ? 'En pedido' : yaNuevo ? 'Agregado' : saldo > 0 ? `Stock: ${saldo}` : 'Sin stock';
          const colorStock = saldo > 0 ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)';
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
            <div style="min-width:0;flex:1">
              <span style="font-size:13px;font-weight:600">${p.sku}</span>
              <span style="font-size:12px;color:var(--text-secondary);margin-left:6px">${p.nombre}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <span style="font-size:12px;color:${colorStock}">${etiqueta}</span>
              ${!disabled ? `<button type="button" class="btn-secondary btn-pick-agregar" data-product-id="${p.id}"
                style="font-size:12px;padding:4px 10px">+ Agregar</button>` : ''}
            </div>
          </div>`;
        }));

        searchRes().innerHTML = rows.join('');
        searchRes().querySelectorAll('.btn-pick-agregar').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const productId = btn.dataset.productId;
            btn.disabled = true;
            btn.textContent = '…';
            await this._agregarProducto(productId);
          });
        });
      } catch (err) {
        searchRes().innerHTML = `<p style="color:var(--danger,#dc2626);font-size:13px">Error en búsqueda: ${err.message}</p>`;
      }
    };

    searchBtn?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

    this.container.querySelector('#btn-cancelar')?.addEventListener('click', async () => {
      const { pedido, items } = this._data;
      const lineas = items
        .filter((it) => Number(it.cantidad_pedida) > 0)
        .map((it) => `• ${it.product_sku}: ${it.cantidad_pedida} unid`)
        .join('\n');
      const msg = `¿Cancelar pedido ${pedido.consecutivo}?\n\nStock a devolver a Bodega Central:\n${lineas || '(sin ítems)'}\n\nEsta acción no se puede deshacer.`;
      if (!confirm(msg)) return;
      const errorEl = this.container.querySelector('#pick-error');
      try {
        await sagaAnularPedido(this._pedidoId, 'Cancelado desde Picking');
        this._saved = true;
        alert(`Pedido ${pedido.consecutivo} cancelado. Stock devuelto a Bodega Central.`);
        navigate('pedidos');
      } catch (err) {
        if (errorEl) { errorEl.textContent = `Error al cancelar: ${err.message}`; errorEl.classList.remove('hidden'); }
      }
    });

    this.container.querySelector('#btn-ir-packing')?.addEventListener('click', async () => {
      const { pedido } = this._data;
      const ajustesConDiff = this._ajustes.filter((aj) => {
        const item = this._data.items.find((i) => i.id === aj.item_id);
        return item && aj.cantidad_picking !== item.cantidad_pedida;
      });

      const lineasAjuste = ajustesConDiff.length > 0
        ? ajustesConDiff.map((aj) => {
            const item = this._data.items.find((i) => i.id === aj.item_id);
            const diff = aj.cantidad_picking - (item?.cantidad_pedida ?? 0);
            return `• ${item?.product_sku ?? aj.item_id}: ${item?.cantidad_pedida ?? '?'} → ${aj.cantidad_picking} (${diff >= 0 ? '+' : ''}${diff})`;
          }).join('\n')
        : 'Sin ajustes — cantidades coinciden.';
      const nuevosLines = this._nuevos.length > 0
        ? `\nProductos agregados:\n${this._nuevos.map((n) => `• ${n.product_sku}: ${n.cantidad_picking} unid`).join('\n')}`
        : '';
      const quitadosCount = [...this._quitados].filter((id) => this._data.items.some((it) => it.id === id)).length;
      const quitadosLines = quitadosCount > 0 ? `\nProductos quitados: ${quitadosCount}` : '';

      if (!confirm(`¿Confirmar picking completado — ${pedido.consecutivo}?\n\n${lineasAjuste}${nuevosLines}${quitadosLines}\n\nEl pedido avanzará a PACKING.`)) return;

      const errorEl = this.container.querySelector('#pick-error');
      errorEl.classList.add('hidden');
      const btn = this.container.querySelector('#btn-ir-packing');
      btn.disabled = true;
      btn.textContent = 'Procesando…';
      try {
        await sagaCompletarPicking(this._pedidoId, ajustesConDiff);
        await sagaIniciarPacking(this._pedidoId);
        this._saved = true;
        navigate('packing-form', { pedidoId: this._pedidoId });
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = '✅ Completar Picking';
      }
    });
  }

  async _agregarProducto(productId) {
    const searchRes = this.container.querySelector('#pick-search-results');
    try {
      const saldo = await getSaldoByProduct(productId, BODEGA_CENTRAL_ID);
      if (!(saldo > 0)) {
        alert('Sin stock disponible en Bodega Central para este producto.');
        this._render();
        return;
      }
      const all = await getAllProducts();
      const product = all.find((p) => p.id === productId);
      if (!product) return;

      const precioResult = await getPrecioConOrigen(productId, 'CONTADO');
      const precio       = precioResult?.precio ?? product.costo ?? 0;
      const precioOrigen = precioResult ? precioResult.lista_id : 'COSTO';

      const qtyStr = prompt(
        `Agregar: ${product.sku} — ${product.nombre}\nStock disponible: ${saldo}\nPrecio: $${Number(precio).toLocaleString('es-CO')}\n\nCantidad a agregar:`,
        '1',
      );
      if (qtyStr === null) { this._render(); return; }
      const qty = Number(qtyStr);
      if (!Number.isFinite(qty) || qty <= 0) { alert('Cantidad inválida.'); this._render(); return; }
      if (qty > saldo) { alert(`Cantidad (${qty}) supera el stock disponible (${saldo}).`); this._render(); return; }

      const newItem = await agregarItemAlPicking(this._pedidoId, {
        product_id:       product.id,
        product_sku:      product.sku,
        product_name:     product.nombre,
        cantidad_picking: qty,
        precio_unitario:  precio,
        precio_origen:    precioOrigen,
      });

      this._nuevos.push(newItem);
      this._render();
    } catch (err) {
      if (searchRes) searchRes.innerHTML = `<p style="color:var(--danger,#dc2626);font-size:13px">Error: ${err.message}</p>`;
    }
  }

  confirmarProductoEscaneado(sku) {
    const item = this._data.items.find((i) => i.product_sku === sku);
    if (!item) { alert(`Producto ${sku} no pertenece a este pedido.`); return; }
    const inp = this.container.querySelector(`.pick-qty-input[data-item-id="${item.id}"]`);
    if (inp) { inp.value = item.cantidad_pedida; inp.dispatchEvent(new Event('change')); }
  }
}

function navigate(view, opts = {}) { window.__erp_navigate?.(view, opts); }
