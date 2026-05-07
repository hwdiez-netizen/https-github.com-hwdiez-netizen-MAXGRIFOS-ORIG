import { getPedidoCompleto, ponerEnStandby, cancelarProceso } from './pedido-store.js';
import { sagaEmitirDocumento, sagaEditarPedidoCreado } from './pedido-saga.js';
import { getAllProducts } from '../../db/local-db.js';
import { getSaldoByProduct } from '../kardex/kardex-store.js';
import { BODEGA_CENTRAL_ID } from '../kardex/bodega-store.js';
import { getPrecioConOrigen } from '../politicas-comerciales/precio-assignment.js';
import { generarYDescargarPDF } from '../facturacion/pdf-generator.js';
import { getTipoSugerido } from '../facturacion/factura-store.js';

export class PackingForm {
  constructor(container, pedidoId) {
    this.container = container;
    this._pedidoId = pedidoId;
    this._data     = null;
    this._ajustes  = [];       // [{ item_id, cantidad_picking }]
    this._quitados = new Set();
    this._nuevos   = [];       // [{ product_id, product_sku, product_name, cantidad_picking, precio_unitario, precio_origen }]
    this._saved    = false;
  }

  async canUnmount() {
    if (this._saved) return true;
    const rsp = confirm('Advertencia: Proceso en ejecución.\n¿Deseas dejarlo en Standby?\n[Aceptar] = Standby\n[Cancelar] = Cancelar Proceso');
    if (rsp) {
      await ponerEnStandby(this._pedidoId, 'Abandono de vista');
    } else {
      await cancelarProceso(this._pedidoId, 'Abandono de vista');
    }
    return true;
  }

  async mount() {
    this.container.innerHTML = `<div class="loading">Cargando packing...</div>`;
    this._data = await getPedidoCompleto(this._pedidoId);
    if (!this._data) { this.container.innerHTML = `<div class="form-error">Pedido no encontrado.</div>`; return; }
    this._ajustes = this._data.items.map((it) => ({ item_id: it.id, cantidad_picking: it.cantidad_picking }));
    this._render();
  }

  unmount() {}

  _render() {
    const { pedido, items } = this._data;
    const tipoSugerido  = getTipoSugerido(pedido.cliente_nit);
    const itemsVisibles = items.filter((it) => !this._quitados.has(it.id));

    this.container.innerHTML = `
      <div class="form-container">
        <button type="button" class="btn-back" id="btn-back">← Volver</button>
        <h2>Packing — ${pedido.consecutivo}</h2>
        <div class="doc-immutable-banner">📦 Ajusta cantidades y productos antes de emitir el documento fiscal.</div>

        <div class="product-detail-card" style="margin:16px 0">
          <div class="detail-row"><span class="detail-label">Cliente</span><span class="detail-value">${pedido.cliente_nombre}</span></div>
          ${pedido.cliente_nit ? `<div class="detail-row"><span class="detail-label">NIT</span><span class="detail-value">${pedido.cliente_nit}</span></div>` : ''}
          <div class="detail-row"><span class="detail-label">Pedido</span><span class="detail-value">${pedido.consecutivo}</span></div>
        </div>

        <div style="margin-bottom:12px;border:1px solid var(--border);border-radius:8px;padding:10px">
          <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">Agregar producto</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="pack-search-input" placeholder="Nombre, SKU o ref. proveedor…"
              style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px" autocomplete="off">
            <button type="button" class="btn-secondary" id="btn-pack-search" style="white-space:nowrap">Buscar</button>
          </div>
          <div id="pack-search-results" style="margin-top:8px"></div>
        </div>

        <div id="packing-items">
          ${itemsVisibles.map((it) => this._itemRow(it)).join('')}
          ${this._nuevos.map((it) => this._newItemRow(it)).join('')}
        </div>

        <div class="field-group" style="margin-top:16px">
          <label>Tipo de documento a emitir *</label>
          <div style="display:flex;gap:10px;margin-top:6px">
            <label class="doc-tipo-opt"><input type="radio" name="doc-tipo" value="FAC" ${tipoSugerido === 'FAC' ? 'checked' : ''}> 🧾 Factura</label>
            <label class="doc-tipo-opt"><input type="radio" name="doc-tipo" value="REM" ${tipoSugerido === 'REM' ? 'checked' : ''}> 📋 Remisión</label>
          </div>
        </div>

        <div id="pack-error" class="form-error hidden"></div>

        <div style="display:flex;gap:10px;margin-top:20px">
          <button type="button" class="btn-danger" id="btn-cancelar" style="flex:1">🚫 Cancelar</button>
          <button type="button" class="btn-primary" id="btn-emitir" style="flex:2">🧾 Emitir y Descargar</button>
        </div>
      </div>`;

    this._bindEvents();
  }

  _itemRow(it) {
    const aj  = this._ajustes.find((a) => a.item_id === it.id);
    const qty = aj ? aj.cantidad_picking : it.cantidad_picking;
    return `
      <div class="picking-item" data-item-id="${it.id}" style="display:flex;align-items:flex-start;gap:8px">
        <div style="flex:1">
          <div class="picking-item-info">
            <span class="pick-sku">${it.product_sku}</span>
            <span class="pick-name">${it.product_name}</span>
          </div>
          <div class="picking-item-qty">
            <span class="pick-label">Picking: <strong>${it.cantidad_picking}</strong></span>
            <div style="display:flex;align-items:center;gap:6px">
              <label style="font-size:12px;color:var(--text-secondary)">Empacar:</label>
              <input type="number" class="pack-qty-input" data-item-id="${it.id}"
                min="0" step="1" value="${qty}" inputmode="numeric" style="width:70px;text-align:center">
            </div>
            <span style="font-size:12px;color:var(--text-secondary)">$${Number(it.precio_unitario).toLocaleString('es-CO')}</span>
          </div>
        </div>
        <button type="button" class="btn-pack-quitar" data-item-id="${it.id}"
          style="background:none;border:none;color:var(--danger,#dc2626);font-size:20px;cursor:pointer;padding:4px 8px;line-height:1" title="Quitar del packing">×</button>
      </div>`;
  }

  _newItemRow(it) {
    return `
      <div class="picking-item picking-item-nuevo" data-nuevo-sku="${it.product_sku}" style="display:flex;align-items:flex-start;gap:8px;border-left:3px solid var(--primary,#2563eb);padding-left:8px">
        <div style="flex:1">
          <div class="picking-item-info">
            <span class="pick-sku">${it.product_sku}</span>
            <span class="pick-name">${it.product_name}
              <small style="color:var(--primary,#2563eb);font-size:11px;margin-left:4px">[NUEVO]</small>
            </span>
          </div>
          <div class="picking-item-qty">
            <span class="pick-label" style="color:var(--primary,#2563eb)">Cantidad: <strong>${it.cantidad_picking}</strong></span>
            <span style="font-size:12px;color:var(--text-secondary);margin-left:8px">$${Number(it.precio_unitario).toLocaleString('es-CO')}</span>
          </div>
        </div>
        <button type="button" class="btn-pack-quitar-nuevo" data-nuevo-sku="${it.product_sku}"
          style="background:none;border:none;color:var(--danger,#dc2626);font-size:20px;cursor:pointer;padding:4px 8px;line-height:1" title="Quitar">×</button>
      </div>`;
  }

  _bindEvents() {
    this.container.querySelector('#btn-back')?.addEventListener('click', () => navigate('pedido-detail', { pedidoId: this._pedidoId }));

    this.container.querySelectorAll('.pack-qty-input').forEach((inp) => {
      inp.addEventListener('change', () => {
        const itemId = inp.dataset.itemId;
        const aj = this._ajustes.find((a) => a.item_id === itemId);
        if (aj) aj.cantidad_picking = Number(inp.value);
      });
    });

    this.container.querySelectorAll('.btn-pack-quitar').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.itemId;
        this._quitados.add(itemId);
        const aj = this._ajustes.find((a) => a.item_id === itemId);
        if (aj) aj.cantidad_picking = 0;
        this._render();
      });
    });

    this.container.querySelectorAll('.btn-pack-quitar-nuevo').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sku = btn.dataset.nuevoSku;
        this._nuevos = this._nuevos.filter((n) => n.product_sku !== sku);
        this._render();
      });
    });

    const searchInput = this.container.querySelector('#pack-search-input');
    const searchBtn   = this.container.querySelector('#btn-pack-search');
    const searchRes   = () => this.container.querySelector('#pack-search-results');

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
              ${!disabled ? `<button type="button" class="btn-secondary btn-pack-agregar" data-product-id="${p.id}"
                style="font-size:12px;padding:4px 10px">+ Agregar</button>` : ''}
            </div>
          </div>`;
        }));

        searchRes().innerHTML = rows.join('');
        searchRes().querySelectorAll('.btn-pack-agregar').forEach((btn) => {
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
      if (confirm('¿Está seguro de cancelar este proceso? No se eliminarán los registros.')) {
        await cancelarProceso(this._pedidoId, 'Cancelado por el usuario (Packing)');
        this._saved = true;
        navigate('pedidos');
      }
    });

    this.container.querySelector('#btn-emitir')?.addEventListener('click', async () => {
      const tipo    = this.container.querySelector('input[name="doc-tipo"]:checked')?.value ?? 'FAC';
      const errorEl = this.container.querySelector('#pack-error');
      const btn     = this.container.querySelector('#btn-emitir');
      errorEl.classList.add('hidden');
      btn.disabled    = true;
      btn.textContent = 'Emitiendo…';

      try {
        await this._persistirCambios();
        const { documento } = await sagaEmitirDocumento(this._pedidoId, tipo);
        await generarYDescargarPDF(documento, documento.items_snapshot);
        this._saved = true;
        navigate('pedido-detail', { pedidoId: this._pedidoId });
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
        btn.disabled    = false;
        btn.textContent = '🧾 Emitir y Descargar';
      }
    });
  }

  async _persistirCambios() {
    const { pedido, items } = this._data;

    const hayEdiciones = this._quitados.size > 0 || this._nuevos.length > 0 ||
      this._ajustes.some((aj) => {
        const item = items.find((i) => i.id === aj.item_id);
        return item && Number(aj.cantidad_picking) !== Number(item.cantidad_picking);
      });

    if (!hayEdiciones) return;

    const itemsFinales = [
      ...items
        .filter((it) => !this._quitados.has(it.id))
        .map((it) => {
          const aj = this._ajustes.find((a) => a.item_id === it.id);
          return {
            product_id:      it.product_id,
            product_sku:     it.product_sku,
            product_name:    it.product_name,
            cantidad:        aj ? Number(aj.cantidad_picking) : Number(it.cantidad_picking),
            precio_unitario: Number(it.precio_unitario),
            precio_origen:   it.precio_origen ?? null,
          };
        })
        .filter((it) => it.cantidad > 0),
      ...this._nuevos.map((it) => ({
        product_id:      it.product_id,
        product_sku:     it.product_sku,
        product_name:    it.product_name,
        cantidad:        Number(it.cantidad_picking),
        precio_unitario: Number(it.precio_unitario),
        precio_origen:   it.precio_origen ?? null,
      })),
    ];

    if (itemsFinales.length === 0) {
      throw new Error('El packing debe tener al menos un ítem con cantidad > 0.');
    }

    await sagaEditarPedidoCreado(this._pedidoId, {
      cliente_id:     pedido.cliente_id,
      cliente_nombre: pedido.cliente_nombre,
      cliente_nit:    pedido.cliente_nit,
      observacion:    pedido.observacion,
      items:          itemsFinales,
    });
  }

  async _agregarProducto(productId) {
    const searchRes = this.container.querySelector('#pack-search-results');
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

      this._nuevos.push({
        product_id:      product.id,
        product_sku:     product.sku,
        product_name:    product.nombre,
        cantidad_picking: qty,
        precio_unitario:  precio,
        precio_origen:    precioOrigen,
      });
      this._render();
    } catch (err) {
      if (searchRes) searchRes.innerHTML = `<p style="color:var(--danger,#dc2626);font-size:13px">Error: ${err.message}</p>`;
    }
  }
}

function navigate(view, opts = {}) { window.__erp_navigate?.(view, opts); }
