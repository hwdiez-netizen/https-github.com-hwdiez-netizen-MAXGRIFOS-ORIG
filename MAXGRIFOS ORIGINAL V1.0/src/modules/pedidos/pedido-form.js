function formatCopAmount(value) {
  const n = Math.round(Number(value)) || 0;
  return new Intl.NumberFormat('es-CO').format(n);
}
import {
  handleGetPedidoFormCatalogs,
  handleGetPedidoCompleto,
  handleIniciarEdicionPedido,
  handleCancelarProcesoPedido,
  handleEditarPedido as handleEditarPedidoCmd,
  handleCrearPedido as handleCrearPedidoCmd,
  handleAnularPedido as handleAnularPedidoCmd,
} from './handlers/index.js';
import { mapFormaPagoToTipoCliente, getPrecioParaProducto, getPrecioConOrigen, getListaStatusParaFormaPago } from '../politicas-comerciales/precio-assignment.js';
import { FORMA_PAGO_LABELS } from '../politicas-comerciales/lista-precios-store.js';
import QRCode from 'qrcode';

export class PedidoForm {
  constructor(container, pedidoId = null, mode = 'create') {
    this.container = container;
    this.pedidoId = pedidoId;
    this._mode = mode;
    this._isEditExisting = Boolean(pedidoId && mode === 'edit');

    this._saved = false;
    this._products = [];
    this._clientes = [];
    this._items = [];
    this._pedidoBase = null;
    this._pendingPrefill = null;
    this._pendingPrefillClienteId = null;
    this._closeCliDropdown = null;
  }

  setPrefillClienteId(clienteId) {
    this._pendingPrefillClienteId = clienteId;
  }

  async canUnmount() {
    if (this._saved) return true;
    if (!this.pedidoId) return true;  // Sin persistencia aún, salida segura
    return confirm('¿Salir sin guardar? Los cambios no guardados se perderán.');
  }

  unmount() {
    if (this._closeDropdown) document.removeEventListener('click', this._closeDropdown);
    if (this._closeCliDropdown) document.removeEventListener('click', this._closeCliDropdown);
  }

  async mount() {
    const catalogs = await handleGetPedidoFormCatalogs();
    this._products = catalogs.products;
    this._clientes = catalogs.clientes;

    if (this._isEditExisting) {
      const data = await handleGetPedidoCompleto(this.pedidoId);
      if (!data) {
        this.container.innerHTML = `<div class="form-error">Pedido no encontrado para editar.</div>`;
        return;
      }
      if (!['creacion', 'edicion', 'creado', 'standby', 'picking', 'packing'].includes(data.pedido.estado)) {
        this.container.innerHTML = `<div class="form-error">Solo se pueden editar pedidos que no hayan sido facturados.</div>`;
        return;
      }

      this._pedidoBase = data.pedido;
      this._items = data.items.map((it) => ({
        product_id: it.product_id,
        product_sku: it.product_sku,
        product_name: it.product_name,
        cantidad: Number(it.cantidad_pedida),
        precio_unitario: Math.round(Number(it.precio_unitario ?? 0)),
        subtotal: Number(it.cantidad_pedida) * Math.round(Number(it.precio_unitario ?? 0)),
      }));

      // Re-resolve prices from current lista so displayed prices match what will be saved.
      // Uses this._clientes directly (no DOM needed, runs before rendering).
      const clienteRec = this._pedidoBase.cliente_id
        ? this._clientes.find((c) => c.id === this._pedidoBase.cliente_id) ?? null
        : null;
      if (clienteRec?.forma_pago) {
        const fp = String(clienteRec.forma_pago).trim();
        for (const it of this._items) {
          const resultado = await getPrecioConOrigen(it.product_id, fp);
          if (resultado != null && Math.round(Number(resultado.precio)) > 0) {
            const p = Math.round(Number(resultado.precio));
            it.precio_unitario = p;
            it.subtotal = it.cantidad * p;
            it.precio_origen = {
              lista_id: resultado.lista_id,
              lista_nombre: resultado.lista_nombre,
              tipo_cliente: resultado.tipo_cliente,
            };
          }
        }
      }
    } else if (this.pedidoId) {
      await handleIniciarEdicionPedido(this.pedidoId);
    }
    // Nuevo pedido: no se persiste nada hasta que el usuario confirme con ítems válidos

    this.container.innerHTML = this._template();
    this._bindEvents();
    this._renderItems();
    if (this._pendingPrefillClienteId) {
      const cId = this._pendingPrefillClienteId;
      this._pendingPrefillClienteId = null;
      const found = this._clientes.find((c) => c.id === cId);
      if (found) await this._selectCliente(found);
    }
    if (this._pendingPrefill) {
      const prefill = this._pendingPrefill;
      this._pendingPrefill = null;
      await this.setPrefillProduct(prefill);
    }
  }

  _clienteInfoHtml(c) {
    if (!c) return '';
    const fp = c.forma_pago ? c.forma_pago.replace(/_/g, ' ') : 'SIN DEFINIR';
    const cupo = Number(c.cupo_credito ?? 0) > 0
      ? `$${Math.trunc(c.cupo_credito).toLocaleString('es-CO')}`
      : '—';
    return `💳 ${fp} &nbsp;|&nbsp; 💰 Cupo: ${cupo}`;
  }

  _template() {
    const selectedClienteId = this._pedidoBase?.cliente_id ?? '';
    const observacion = this._pedidoBase?.observacion ?? '';
    const selectedCliente = selectedClienteId
      ? this._clientes.find((c) => c.id === selectedClienteId) ?? null
      : null;
    const selectedLabel = selectedCliente
      ? `${selectedCliente.razon_social}${selectedCliente.nit ? ` | NIT: ${selectedCliente.nit}` : ''}`
      : '';

    const title = this._isEditExisting ? 'Editar Pedido' : 'Nuevo Pedido';
    const submitId = this._isEditExisting ? 'btn-save-pedido' : 'btn-crear-pedido';
    const submitText = this._isEditExisting ? '💾 Guardar Cambios' : '🛒 Procesar Pedido';

    return `
      <div class="form-container">
        <button type="button" class="btn-back" id="btn-back">← Volver</button>
        <h2>${title}</h2>

        <div id="ped-form-error-top" class="form-error hidden" role="alert" aria-live="assertive" style="margin:8px 0 12px;padding:12px 14px;border-left:4px solid #d92d20;background:#fef3f2;color:#912018;font-weight:600;border-radius:4px;position:sticky;top:0;z-index:5"></div>

        <form id="ped-form" novalidate>
          <div class="field-group">
            <label>Cliente</label>
            <div style="position:relative">
              <input type="text" id="ped-cli-search" class="search-input"
                placeholder="Buscar por razón social, NIT o cédula..."
                autocomplete="off" value="${selectedCliente ? selectedCliente.razon_social : ''}">
              <div id="ped-cli-dropdown" class="ped-prod-dropdown hidden"></div>
              <div id="ped-cli-selected" class="ped-prod-selected ${selectedCliente ? '' : 'hidden'}">
                <span id="ped-cli-label" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${selectedLabel || '— MOSTRADOR —'}</span>
                <button type="button" id="btn-clear-cli" class="btn-clear-prod">✕</button>
              </div>
              <input type="hidden" id="ped-cliente-id" value="${selectedClienteId}">
            </div>
            <div id="ped-cli-info" class="ped-cli-info ${selectedCliente ? '' : 'hidden'}">${this._clienteInfoHtml(selectedCliente)}</div>
          </div>

          <div class="field-group">
            <label for="ped-obs">Observaciones <span class="field-optional">(opcional)</span></label>
            <textarea id="ped-obs" rows="2" style="resize:vertical;min-height:50px" placeholder="Notas del pedido...">${observacion}</textarea>
          </div>

          <div class="ped-items-section">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <h3 style="margin:0">Items del pedido</h3>
              ${this._isEditExisting ? '' : '<button type="button" class="btn-secondary" id="btn-scan-item" style="font-size:13px;padding:6px 10px">📷 Escanear</button>'}
            </div>

            <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap">
              <div style="flex:1;min-width:160px;position:relative">
                <label for="ped-search-prod" style="font-size:12px">Buscar producto</label>
                <input type="text" id="ped-search-prod" class="search-input" placeholder="Ref. proveedor o descripción..." autocomplete="off">
                <div id="ped-prod-dropdown" class="ped-prod-dropdown hidden"></div>
                <div id="ped-prod-selected" class="ped-prod-selected hidden">
                  <span id="ped-selected-label" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">—</span>
                  <button type="button" id="btn-clear-prod" class="btn-clear-prod">✕</button>
                </div>
                <input type="hidden" id="ped-add-prod" data-id="" data-sku="" data-nombre="" data-precio="">
              </div>
              <div style="width:80px">
                <label for="ped-add-qty" style="font-size:12px">Cant.</label>
                <input type="number" id="ped-add-qty" class="search-input" min="1" value="1" inputmode="numeric">
              </div>
              <div style="width:100px">
                <label for="ped-add-precio" style="font-size:12px">Precio</label>
                <input type="text" id="ped-add-precio" class="search-input" value="0" readonly title="Precio comercial resuelto por Politicas">
              </div>
              <button type="button" class="btn-secondary" id="btn-add-item" style="height:38px;padding:0 14px">+ Agregar</button>
            </div>

            <div id="ped-items-list"></div>
          </div>

          <div id="ped-form-error" class="form-error hidden"></div>

          ${this._isEditExisting
            ? `<div style="display:flex;gap:10px;margin-top:16px">
                 <button type="button" class="btn-secondary" id="btn-cancel-edit" style="flex:1">Cancelar</button>
                 <button type="submit" class="btn-primary" id="${submitId}" style="flex:2" disabled>💾 Guardar</button>
               </div>`
            : `<div style="display:flex;gap:10px;margin-top:16px">
                 <button type="button" class="btn-danger" id="btn-cancelar" style="flex:1">Cancelar</button>
                 <button type="submit" class="btn-primary" id="${submitId}" style="flex:2" disabled>Crear</button>
               </div>`
          }
        </form>
      </div>`;
  }

  _searchClientes(query) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return this._clientes
      .filter((c) => c.status === 'active')
      .filter((c) =>
        (c.razon_social ?? '').toLowerCase().includes(q) ||
        (c.nit ?? '').toLowerCase().includes(q) ||
        (c.cedula ?? '').toLowerCase().includes(q) ||
        (c.qr_code ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  _renderClienteDropdown(results) {
    const dd = this.container.querySelector('#ped-cli-dropdown');
    if (!dd) return;
    if (results.length === 0) {
      dd.innerHTML = `<div class="ped-prod-dropdown-empty">Sin resultados</div>`;
      dd.classList.remove('hidden');
      return;
    }
    dd.innerHTML = results.map((c) => {
      const nit = c.nit ? `<span class="ped-dd-ref">${c.nit}</span>` : '';
      const ced = c.cedula ? `<span>${c.cedula}</span>` : '';
      return `<div class="ped-prod-dropdown-item" data-id="${c.id}">
        <div class="ped-dd-nombre">${c.razon_social}</div>
        <div class="ped-dd-meta">${nit}${ced}</div>
      </div>`;
    }).join('');
    dd.classList.remove('hidden');
    dd.querySelectorAll('.ped-prod-dropdown-item').forEach((row) => {
      row.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        const found = this._clientes.find((c) => c.id === row.dataset.id);
        if (found) await this._selectCliente(found);
      });
    });
  }

  async _selectCliente(cliente) {
    const searchInput = this.container.querySelector('#ped-cli-search');
    const selectedDiv = this.container.querySelector('#ped-cli-selected');
    const selectedLabel = this.container.querySelector('#ped-cli-label');
    const dd = this.container.querySelector('#ped-cli-dropdown');
    const hiddenId = this.container.querySelector('#ped-cliente-id');

    const label = `${cliente.razon_social}${cliente.nit ? ` | NIT: ${cliente.nit}` : ''}`;
    if (searchInput) searchInput.value = '';
    if (selectedLabel) selectedLabel.textContent = label;
    if (selectedDiv) selectedDiv.classList.remove('hidden');
    if (dd) dd.classList.add('hidden');
    if (hiddenId) hiddenId.value = cliente.id;

    this._updateClienteInfo(cliente);

    // Check lista status for client's forma_pago
    const fp = String(cliente.forma_pago ?? '').trim();
    if (fp) {
      const listaStatus = await getListaStatusParaFormaPago(fp);
      const fpLabel = FORMA_PAGO_LABELS[fp] ?? fp;
      if (listaStatus === 'inactiva') {
        this._setFormError(`⚠️ La lista de precios para ${fpLabel} está INACTIVA. Actívela en Políticas Comerciales antes de continuar.`);
        return;
      } else if (listaStatus === 'no_existe') {
        this._setFormError(`Sin lista de precios para ${fpLabel}. Créela en Políticas Comerciales.`);
        return;
      }
    }

    // Re-resolve price if product already selected
    const hidden = this.container.querySelector('#ped-add-prod');
    const priceInput = this.container.querySelector('#ped-add-precio');
    const policyError = this._validateSelectedClientePolicy();
    if (policyError) {
      if (priceInput) priceInput.value = 0;
      this._setFormError(policyError);
      return;
    }
    if (!hidden?.dataset.id) {
      this._setFormError('');
      return;
    }
    const precio = await this._resolvePrecioComercial(hidden.dataset.id);
    if (precio == null) {
      hidden.dataset.precio = '';
      if (priceInput) priceInput.value = 0;
      this._setFormError(`No existe precio comercial activo para ${hidden.dataset.sku}.`);
      return;
    }
    hidden.dataset.precio = String(precio);
    if (priceInput) priceInput.value = formatCopAmount(precio);
    this._setFormError('');
  }

  _updateClienteInfo(cliente) {
    const infoEl = this.container.querySelector('#ped-cli-info');
    if (!infoEl) return;
    if (!cliente) {
      infoEl.classList.add('hidden');
      infoEl.innerHTML = '';
      return;
    }
    infoEl.innerHTML = this._clienteInfoHtml(cliente);
    infoEl.classList.remove('hidden');
  }

  _searchProducts(query) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return this._products
      .filter((p) => p.status === 'active')
      .map((p) => {
        const ref = (p.ref_proveedor ?? '').toLowerCase();
        const nombre = (p.nombre ?? '').toLowerCase();
        let score = -1;
        if (ref && ref === q) score = 3;
        else if (ref && ref.startsWith(q)) score = 2;
        else if (ref && ref.includes(q)) score = 1;
        else if (nombre.includes(q)) score = 0;
        return { p, score };
      })
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ p }) => p);
  }

  _renderDropdown(results) {
    const dd = this.container.querySelector('#ped-prod-dropdown');
    if (!dd) return;
    if (results.length === 0) {
      dd.innerHTML = `<div class="ped-prod-dropdown-empty">Sin resultados</div>`;
      dd.classList.remove('hidden');
      return;
    }
    dd.innerHTML = results.map((p) => {
      const ref = p.ref_proveedor
        ? `<span class="ped-dd-ref">${p.ref_proveedor}</span>`
        : '';
      return `<div class="ped-prod-dropdown-item" data-id="${p.id}" data-sku="${p.sku ?? ''}" data-nombre="${(p.nombre ?? '').replace(/"/g, '&quot;')}">
        <div class="ped-dd-nombre">${p.nombre ?? '—'}</div>
        <div class="ped-dd-meta">${ref}<span>${p.sku ?? ''}</span></div>
      </div>`;
    }).join('');
    dd.classList.remove('hidden');
    dd.querySelectorAll('.ped-prod-dropdown-item').forEach((row) => {
      row.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        await this._selectProduct(row.dataset);
      });
    });
  }

  async _selectProduct({ id, sku, nombre }) {
    const policyError = this._validateSelectedClientePolicy();
    if (policyError) {
      this._setFormError(policyError);
      return;
    }

    const precio = await this._resolvePrecioComercial(id);
    if (precio == null) {
      const fp = this._getSelectedFormaPago();
      const fpMsg = fp ? `"${fp}"` : 'sin definir';
      this._setFormError(`Sin lista de precios activa para ${sku}. Forma de pago del cliente: ${fpMsg}. Active la FORMA DE PAGO correcta en el Módulo CLIENTES para que se cargue la lista correspondiente.`);
      return;
    }

    const hidden = this.container.querySelector('#ped-add-prod');
    const searchInput = this.container.querySelector('#ped-search-prod');
    const selectedDiv = this.container.querySelector('#ped-prod-selected');
    const selectedLabel = this.container.querySelector('#ped-selected-label');
    const dd = this.container.querySelector('#ped-prod-dropdown');
    const priceInput = this.container.querySelector('#ped-add-precio');

    if (hidden) {
      hidden.dataset.id = id;
      hidden.dataset.sku = sku;
      hidden.dataset.nombre = nombre;
      hidden.dataset.precio = String(precio);
    }
    if (searchInput) searchInput.value = '';
    if (selectedLabel) selectedLabel.textContent = `${sku} — ${nombre}`;
    if (selectedDiv) selectedDiv.classList.remove('hidden');
    if (dd) dd.classList.add('hidden');
    if (priceInput) priceInput.value = formatCopAmount(precio);
    this._setFormError('');
  }

  _setFormError(message = '') {
    // FASE 1.5 R6: visibilidad radical — escribir en banner superior (sticky)
    // Y en el banner inferior legacy. El usuario debe ver el bloqueo de
    // "sin lista de precios" inmediatamente sin tener que scrollear.
    const topEl = this.container.querySelector('#ped-form-error-top');
    const errorEl = this.container.querySelector('#ped-form-error');
    if (message) {
      if (topEl) {
        topEl.textContent = message;
        topEl.classList.remove('hidden');
        topEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
      }
      return;
    }
    if (topEl) { topEl.textContent = ''; topEl.classList.add('hidden'); }
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
  }

  _getSelectedClienteRecord() {
    const clienteId = this.container.querySelector('#ped-cliente-id')?.value?.trim();
    if (!clienteId) return null;
    return this._clientes.find((c) => c.id === clienteId) ?? null;
  }

  _getSelectedFormaPago() {
    const cliente = this._getSelectedClienteRecord();
    if (!cliente) return '';
    return String(cliente.forma_pago ?? '').trim();
  }

  _isCreditoFormaPago(formaPago) {
    const normalized = String(formaPago ?? '').trim().toUpperCase();
    return normalized === 'CREDITO_15' || normalized === 'CREDITO_30' || normalized === 'CREDITO_45';
  }

  _validateSelectedClientePolicy() {
    const cliente = this._getSelectedClienteRecord();
    if (!cliente) return '';

    const formaPago = this._getSelectedFormaPago();
    if (!formaPago) {
      return 'Este cliente no tiene Forma de Pago definida. Debe completarla antes de crear el pedido.';
    }

    if (this._isCreditoFormaPago(formaPago)) {
      const cupo = Number(cliente.cupo_credito ?? 0);
      if (!Number.isFinite(cupo) || cupo <= 0) {
        return 'Para pedidos a credito, el cliente debe tener Cupo Credito mayor a cero.';
      }
    }
    return '';
  }

  _resolveTipoClienteForPedido() {
    const cliente = this._getSelectedClienteRecord();
    if (!cliente) return 'B2C'; // Mostrador
    const tipoCliente = mapFormaPagoToTipoCliente(this._getSelectedFormaPago());
    return tipoCliente ?? null;
  }

  async _resolvePrecioComercial(productId) {
    const policyError = this._validateSelectedClientePolicy();
    if (policyError) {
      this._setFormError(policyError);
      return null;
    }

    const tipoCliente = this._resolveTipoClienteForPedido();
    if (!tipoCliente) return null;

    const precio = await getPrecioParaProducto(productId, tipoCliente);
    if (precio == null) return null;
    const normalized = Math.round(Number(precio));
    if (!Number.isFinite(normalized) || normalized <= 0) return null;
    return normalized;
  }

  async _resolvePrecioConOrigen(productId) {
    const policyError = this._validateSelectedClientePolicy();
    if (policyError) {
      this._setFormError(policyError);
      return null;
    }

    const tipoCliente = this._resolveTipoClienteForPedido();
    if (!tipoCliente) return null;

    const resultado = await getPrecioConOrigen(productId, tipoCliente);
    if (!resultado) return null;
    const normalized = Number(resultado.precio);
    if (!Number.isFinite(normalized) || normalized <= 0) return null;
    return resultado;
  }

  async _buildItemsConPrecioComercial() {
    const resolved = [];
    for (const it of this._items) {
      const resultado = await this._resolvePrecioConOrigen(it.product_id);
      if (resultado == null) {
        const fp = this._getSelectedFormaPago();
        const fpMsg = fp ? `"${fp}"` : 'sin definir';
        throw new Error(`Sin lista de precios activa para SKU ${it.product_sku}. Forma de pago del cliente: ${fpMsg}. Active la FORMA DE PAGO correcta en el Módulo CLIENTES para que se cargue la lista correspondiente.`);
      }
      const precioUnit = Math.round(Number(resultado.precio));
      if (precioUnit <= 0) {
        const fp = this._getSelectedFormaPago();
        const fpMsg = fp ? `"${fp}"` : 'sin definir';
        throw new Error(`Sin precio válido para SKU ${it.product_sku} (precio=${precioUnit}). Forma de pago: ${fpMsg}. Verifique Políticas Comerciales.`);
      }
      resolved.push({
        ...it,
        precio_unitario: precioUnit,
        subtotal: Number(it.cantidad) * precioUnit,
        precio_origen: {
          lista_id: resultado.lista_id,
          lista_nombre: resultado.lista_nombre,
          tipo_cliente: resultado.tipo_cliente,
        },
      });
    }
    return resolved;
  }

  _submitButton() {
    return this.container.querySelector(this._isEditExisting ? '#btn-save-pedido' : '#btn-crear-pedido');
  }

  _renderItems() {
    const container = this.container.querySelector('#ped-items-list');
    const btn = this._submitButton();
    if (!container) return;

    if (this._items.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:16px;font-size:13px">Agrega al menos un item para continuar.</div>`;
      if (btn) btn.disabled = true;
      return;
    }

    const total = this._items.reduce((s, i) => s + i.subtotal, 0);
    container.innerHTML = `
      <table class="ped-table">
        <thead><tr><th>SKU</th><th>Descripcion</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>
          ${this._items.map((it, idx) => `
            <tr>
              <td class="ped-sku">${it.product_sku}</td>
              <td>${it.product_name}</td>
              <td>${it.cantidad}</td>
              <td>$${it.precio_unitario.toLocaleString('es-CO')}</td>
              <td>$${it.subtotal.toLocaleString('es-CO')}</td>
              <td><button type="button" class="btn-rm-item" data-idx="${idx}" title="Eliminar">✕</button></td>
            </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="4" style="text-align:right;font-weight:600">Total:</td>
          <td colspan="2" style="font-weight:700;color:var(--primary)">$${total.toLocaleString('es-CO')}</td></tr></tfoot>
      </table>`;

    container.querySelectorAll('.btn-rm-item').forEach((rmBtn) => {
      rmBtn.addEventListener('click', () => {
        this._items.splice(Number(rmBtn.dataset.idx), 1);
        this._renderItems();
      });
    });

    if (btn) btn.disabled = false;
  }

  _bindEvents() {
    this.container.querySelector('#btn-back')?.addEventListener('click', async () => {
      if (!(await this.canUnmount())) return;
      this._saved = true;
      if (this._isEditExisting) {
        navigate('pedido-detail', { pedidoId: this.pedidoId });
      } else {
        navigate('pedidos');
      }
    });

    this.container.querySelector('#btn-cancel-edit')?.addEventListener('click', async () => {
      const ok = confirm('Descartar cambios de este pedido?');
      if (!ok) return;
      this._saved = true;
      navigate('pedido-detail', { pedidoId: this.pedidoId });
    });

    this.container.querySelector('#btn-cancelar')?.addEventListener('click', async () => {
      const confirmCancel = confirm('¿Seguro de cancelar? Se descartará el pedido.');
      if (!confirmCancel) return;
      if (this.pedidoId) await handleCancelarProcesoPedido(this.pedidoId, 'Cancelado por el usuario');
      this._saved = true;
      navigate('pedidos');
    });

    let _searchTimer = null;
    this.container.querySelector('#ped-search-prod')?.addEventListener('input', (e) => {
      clearTimeout(_searchTimer);
      const dd = this.container.querySelector('#ped-prod-dropdown');
      if (!e.target.value.trim()) {
        if (dd) dd.classList.add('hidden');
        return;
      }
      _searchTimer = setTimeout(() => {
        this._renderDropdown(this._searchProducts(e.target.value));
      }, 250);
    });

    this.container.querySelector('#btn-clear-prod')?.addEventListener('click', () => {
      const hidden = this.container.querySelector('#ped-add-prod');
      const selectedDiv = this.container.querySelector('#ped-prod-selected');
      const priceInput = this.container.querySelector('#ped-add-precio');
      if (hidden) { hidden.dataset.id = ''; hidden.dataset.sku = ''; hidden.dataset.nombre = ''; hidden.dataset.precio = ''; }
      if (selectedDiv) selectedDiv.classList.add('hidden');
      if (priceInput) priceInput.value = 0;
      this._setFormError('');
    });

    this._closeDropdown = (e) => {
      const wrapper = this.container.querySelector('#ped-search-prod')?.closest('[style*="position:relative"]');
      if (wrapper && !wrapper.contains(e.target)) {
        const dd = this.container.querySelector('#ped-prod-dropdown');
        if (dd) dd.classList.add('hidden');
      }
    };
    document.addEventListener('click', this._closeDropdown);

    // ── Client search ──────────────────────────────────────────────────────────
    let _cliTimer = null;
    this.container.querySelector('#ped-cli-search')?.addEventListener('input', (e) => {
      clearTimeout(_cliTimer);
      const dd = this.container.querySelector('#ped-cli-dropdown');
      const selectedDiv = this.container.querySelector('#ped-cli-selected');
      const hiddenId = this.container.querySelector('#ped-cliente-id');
      if (selectedDiv && !selectedDiv.classList.contains('hidden')) {
        selectedDiv.classList.add('hidden');
        if (hiddenId) hiddenId.value = '';
        this._updateClienteInfo(null);
      }
      if (!e.target.value.trim()) {
        if (dd) dd.classList.add('hidden');
        return;
      }
      _cliTimer = setTimeout(() => {
        this._renderClienteDropdown(this._searchClientes(e.target.value));
      }, 250);
    });

    this.container.querySelector('#btn-clear-cli')?.addEventListener('click', () => {
      const selectedDiv = this.container.querySelector('#ped-cli-selected');
      const searchInput = this.container.querySelector('#ped-cli-search');
      const hiddenId = this.container.querySelector('#ped-cliente-id');
      const priceInput = this.container.querySelector('#ped-add-precio');
      if (selectedDiv) selectedDiv.classList.add('hidden');
      if (searchInput) searchInput.value = '';
      if (hiddenId) hiddenId.value = '';
      if (priceInput) priceInput.value = 0;
      this._updateClienteInfo(null);
      this._setFormError('');
    });

    this._closeCliDropdown = (e) => {
      const wrapper = this.container.querySelector('#ped-cli-search')?.parentElement;
      if (wrapper && !wrapper.contains(e.target)) {
        const dd = this.container.querySelector('#ped-cli-dropdown');
        if (dd) dd.classList.add('hidden');
      }
    };
    document.addEventListener('click', this._closeCliDropdown);

    this.container.querySelector('#btn-add-item')?.addEventListener('click', async () => {
      const hidden = this.container.querySelector('#ped-add-prod');
      const qtyInput = this.container.querySelector('#ped-add-qty');
      const precioInput = this.container.querySelector('#ped-add-precio');
      const policyError = this._validateSelectedClientePolicy();
      if (policyError) {
        this._setFormError(policyError);
        return;
      }

      if (!hidden?.dataset.id) {
        alert('Selecciona un producto de la lista.');
        return;
      }

      const cantidad = Number(qtyInput.value) || 1;
      if (cantidad <= 0) {
        alert('La cantidad debe ser mayor a cero.');
        return;
      }

      const productId = hidden.dataset.id;
      const precioUnit = await this._resolvePrecioComercial(productId);
      if (precioUnit == null) {
        this._setFormError(`No existe precio comercial activo para ${hidden.dataset.sku}.`);
        return;
      }

      const existing = this._items.find((i) => i.product_id === productId);
      if (existing) {
        existing.cantidad += cantidad;
        existing.precio_unitario = precioUnit;
        existing.subtotal = existing.cantidad * precioUnit;
      } else {
        this._items.push({
          product_id: productId,
          product_sku: hidden.dataset.sku,
          product_name: hidden.dataset.nombre,
          cantidad,
          precio_unitario: precioUnit,
          subtotal: cantidad * precioUnit,
        });
      }

      hidden.dataset.id = '';
      hidden.dataset.sku = '';
      hidden.dataset.nombre = '';
      hidden.dataset.precio = '';
      const selectedDiv = this.container.querySelector('#ped-prod-selected');
      if (selectedDiv) selectedDiv.classList.add('hidden');
      qtyInput.value = 1;
      if (precioInput) precioInput.value = 0;
      this._setFormError('');
      this._renderItems();
    });

    this.container.querySelector('#btn-scan-item')?.addEventListener('click', () => {
      sessionStorage.setItem('pedido_scan_item', '1');
      navigate('escaner');
    });

    this.container.querySelector('#ped-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleSubmit();
    });
  }

  async setPrefillProduct(product) {
    if (!product) return;

    if (!this.container.querySelector('#ped-form-error')) {
      this._pendingPrefill = product;
      return;
    }

    const policyError = this._validateSelectedClientePolicy();
    if (policyError) {
      this._setFormError(policyError);
      return;
    }

    const precioUnit = await this._resolvePrecioComercial(product.id);
    if (precioUnit == null) {
      this._setFormError(`No existe precio comercial activo para ${product.sku}.`);
      return;
    }

    const existing = this._items.find((i) => i.product_id === product.id);
    if (existing) {
      existing.cantidad += 1;
      existing.precio_unitario = precioUnit;
      existing.subtotal = existing.cantidad * precioUnit;
      this._renderItems();
      return;
    }

    this._items.push({
      product_id: product.id,
      product_sku: product.sku,
      product_name: product.nombre ?? '',
      cantidad: 1,
      precio_unitario: precioUnit,
      subtotal: precioUnit,
    });
    this._setFormError('');
    this._renderItems();
  }

  async _handleSubmit() {
    const btn = this._submitButton();
    const showErr = (msg) => this._setFormError(msg);
    this._setFormError('');

    const policyError = this._validateSelectedClientePolicy();
    if (policyError) {
      showErr(policyError);
      return;
    }

    if (this._items.length === 0) {
      showErr('Agrega al menos un item al pedido.');
      return;
    }

    const itemsConPrecioComercial = await this._buildItemsConPrecioComercial();
    this._items = itemsConPrecioComercial;

    const clienteId = this.container.querySelector('#ped-cliente-id')?.value?.trim() || null;
    const clienteRecord = clienteId ? this._clientes.find((c) => c.id === clienteId) ?? null : null;
    const clienteNombre = clienteRecord ? clienteRecord.razon_social : 'MOSTRADOR';
    const clienteNit = clienteRecord?.nit ?? '';
    const observacion = this.container.querySelector('#ped-obs').value.trim();

    btn.disabled = true;
    btn.textContent = this._isEditExisting ? 'Guardando...' : 'Reservando stock...';

    try {
      if (this._isEditExisting) {
        await handleEditarPedidoCmd(this.pedidoId, {
          cliente_id: clienteId,
          cliente_nombre: clienteNombre,
          cliente_nit: clienteNit,
          observacion,
          items: itemsConPrecioComercial.map((it) => ({
            product_id: it.product_id,
            product_sku: it.product_sku,
            product_name: it.product_name,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            precio_origen: it.precio_origen ?? null,
          })),
        });
        this._saved = true;
        window.alert('Pedido actualizado correctamente.');
        navigate('pedidos');
        return;
      }

      const { pedido } = await handleCrearPedidoCmd({
        cliente_id: clienteId,
        cliente_nombre: clienteNombre,
        cliente_nit: clienteNit,
        observacion,
        items: itemsConPrecioComercial.map((it) => ({
          product_id: it.product_id,
          product_sku: it.product_sku,
          product_name: it.product_name,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario,
          precio_origen: it.precio_origen ?? null,
        })),
      });

      this._saved = true;
      await this._renderConfirmacion(pedido);
    } catch (err) {
      showErr(err.message);
      btn.disabled = false;
      btn.textContent = this._isEditExisting ? '💾 Guardar Cambios' : '🛒 Procesar Pedido';
    }
  }

  async _renderConfirmacion(pedido) {
    const items = this._items ?? [];
    const total = items.reduce((s, it) => s + it.subtotal, 0);
    const clienteId = pedido.cliente_id;
    const clienteRecord = clienteId ? this._clientes.find((c) => c.id === clienteId) ?? null : null;
    const clienteNombre = pedido.cliente_nombre ?? (clienteRecord?.razon_social ?? 'MOSTRADOR');
    const clienteNit = pedido.cliente_nit ?? clienteRecord?.nit ?? '';

    this.container.innerHTML = `
      <div class="form-container">
        <button type="button" class="btn-back" id="btn-back-confirm">← Volver</button>
        <h2 style="color:var(--success-color);margin-bottom:8px;text-align:center">¡Pedido Confirmado!</h2>

        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:13px;color:var(--text-secondary)">Consecutivo</div>
          <div style="font-size:20px;font-weight:700;font-family:monospace">${pedido.consecutivo}</div>
        </div>

        <div class="product-detail-card" style="margin-bottom:16px">
          <div class="detail-row"><span class="detail-label">Cliente</span><span class="detail-value">${clienteNombre}</span></div>
          ${clienteNit ? `<div class="detail-row"><span class="detail-label">NIT</span><span class="detail-value">${clienteNit}</span></div>` : ''}
        </div>

        <table class="ped-table" style="margin-bottom:16px">
          <thead><tr><th>SKU</th><th>Descripcion</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
          <tbody>
            ${items.map((it) => `
              <tr>
                <td class="ped-sku">${it.product_sku}</td>
                <td>${it.product_name}</td>
                <td>${it.cantidad}</td>
                <td>$${it.precio_unitario.toLocaleString('es-CO')}</td>
                <td>$${it.subtotal.toLocaleString('es-CO')}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <td colspan="4" style="text-align:right;font-weight:600">Total:</td>
            <td style="font-weight:700;color:var(--primary)">$${total.toLocaleString('es-CO')}</td>
          </tr></tfoot>
        </table>

        <div class="qr-section" style="text-align:center;padding:16px;background:white;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:20px">
          <div style="font-size:12px;color:#666;margin-bottom:8px;font-weight:bold">QR de Trazabilidad</div>
          <canvas id="qr-canvas"></canvas>
          <div style="font-size:13px;font-family:monospace;margin-top:8px;color:#333">${pedido.qr_code}</div>
        </div>

        <div style="display:flex;gap:10px;margin-top:20px">
          <button type="button" class="btn-danger" id="btn-confirm-cancelar" style="flex:1">🚫 Cancelar</button>
          <button type="button" class="btn-primary" id="btn-ir-picking" style="flex:2">📦 Iniciar Picking</button>
        </div>
      </div>
    `;

    const canvas = this.container.querySelector('#qr-canvas');
    if (canvas && pedido.qr_code) {
      try {
        await QRCode.toCanvas(canvas, pedido.qr_code, {
          width: 200,
          margin: 2,
          color: { dark: '#111827', light: '#ffffff' },
        });
      } catch (err) {
        console.error('QR render error:', err);
      }
    }

    this.container.querySelector('#btn-back-confirm')?.addEventListener('click', () => {
      navigate('pedidos');
    });

    this.container.querySelector('#btn-confirm-cancelar')?.addEventListener('click', async () => {
      const confirmCancel = confirm('¿Esta seguro de anular este pedido confirmado?\nSe revertira el stock reservado.');
      if (!confirmCancel) return;
      await handleAnularPedidoCmd(pedido.id, 'Anulado por el usuario desde confirmacion');
      navigate('pedidos');
    });

    this.container.querySelector('#btn-ir-picking')?.addEventListener('click', () => {
      navigate('picking-form', { pedidoId: pedido.id });
    });
  }
}

function navigate(view, opts = {}) {
  window.__erp_navigate?.(view, opts);
}
