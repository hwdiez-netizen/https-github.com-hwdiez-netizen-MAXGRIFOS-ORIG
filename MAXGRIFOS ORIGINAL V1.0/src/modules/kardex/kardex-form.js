import {
  getSaldoByProduct,
  TIPOS_ENTRADA,
  TIPOS_SALIDA,
  TIPO_LABEL,
} from './kardex-store.js';
import { handleCrearMovimientoKardex, handleRegistrarGarantiaKardex, handleRegistrarNcGarantiaKardex } from './handlers/index.js';
import { getProducts } from '../maestro-productos/product-store.js';
import { getBodegas, BODEGA_CENTRAL_ID, BODEGA_GARANTIAS_ID } from './bodega-store.js';
import { getClientes } from '../clientes/cliente-store.js';

const TIPOS_MANUALES = [...TIPOS_ENTRADA, ...TIPOS_SALIDA, 'AJUSTE'];

function formatCop(value) {
  const n = Math.trunc(Math.abs(Number(value) || 0));
  if (!n) return '';
  return n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function parseCop(raw) {
  const digits = String(raw ?? '').replace(/\D+/g, '');
  return digits ? (Number.parseInt(digits, 10) || 0) : 0;
}

export class KardexForm {
  constructor(container) {
    this.container = container;
    this._saved = false;
    this._mode = 'manual';
    this._product = null;
    this._saldoActual = 0;
    this._products = [];
    this._bodegas = [];
    this._clientes = [];
  }

  setPrefillProduct(product) {
    this._product = product;
  }

  canUnmount() {
    if (this._saved) return true;
    if (this._product || this.container.querySelector('#kx-cantidad')?.value) {
      return confirm('¿Salir sin guardar?\nSe perderán los datos ingresados.');
    }
    return true;
  }

  unmount() {}

  async mount() {
    [this._products, this._bodegas, this._clientes] = await Promise.all([
      getProducts(),
      getBodegas(),
      getClientes(),
    ]);
    this.container.innerHTML = this._template();
    if (this._product) await this._applyPrefill();
    this._bindEvents();
    this._switchMode(this._mode);
  }

  _template() {
    const tipoOpts = TIPOS_MANUALES.map(
      (t) => `<option value="${t}">${TIPO_LABEL[t]}</option>`
    ).join('');

    const activeProducts = this._products.filter((p) => p.status === 'active');

    const productOptsCentral = activeProducts
      .map((p) => `<option value="${p.id}" data-sku="${p.sku}">${p.sku} — ${p.nombre ?? ''}</option>`)
      .join('');

    const productOptsGarantias = activeProducts
      .map((p) => `<option value="${p.id}" data-sku="${p.sku}">${p.sku} — ${p.nombre ?? ''}</option>`)
      .join('');

    const bodegaOpts = this._bodegas
      .filter((b) => b.tipo !== 'transit')
      .map((b) => `<option value="${b.id}">${b.nombre}</option>`)
      .join('');

    const clienteOpts = this._clientes
      .filter((c) => c.status === 'active' || !c.status)
      .map((c) => `<option value="${c.id}">${c.razon_social}</option>`)
      .join('');

    return `
      <div class="form-container">
        <h2>Registrar Movimiento</h2>

        <div class="kx-mode-tabs" style="display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap">
          <button type="button" class="kx-mode-tab btn-secondary active" data-mode="manual"
            style="flex:1;min-width:120px;padding:10px 6px;font-size:13px">
            Movimiento Manual
          </button>
          <button type="button" class="kx-mode-tab btn-secondary" data-mode="garantia"
            style="flex:1;min-width:120px;padding:10px 6px;font-size:13px">
            Garantía a Cliente
          </button>
          <button type="button" class="kx-mode-tab btn-secondary" data-mode="nc_descarga"
            style="flex:1;min-width:120px;padding:10px 6px;font-size:13px">
            Descarga NC Proveedor
          </button>
        </div>

        <!-- MODO MANUAL -->
        <form id="kx-form-manual" novalidate>
          <div class="field-group">
            <label for="kx-bodega">Bodega *</label>
            <select id="kx-bodega" name="bodega_id" required>
              ${bodegaOpts}
            </select>
          </div>
          <div class="field-group">
            <label for="kx-producto">Producto *</label>
            <select id="kx-producto" name="product_id" required>
              <option value="">— Seleccionar producto —</option>
              ${productOptsCentral}
            </select>
            <button type="button" class="btn-secondary kx-scan-btn" id="btn-scan-producto"
              style="margin-top:8px;width:100%">
              📷 Escanear Code 128 para buscar
            </button>
          </div>
          <div id="kx-saldo-info" class="kx-saldo-info hidden">
            Saldo en bodega: <strong id="kx-saldo-val">—</strong> unidades
          </div>
          <div class="field-group">
            <label for="kx-tipo">Tipo de movimiento *</label>
            <select id="kx-tipo" name="tipo" required>
              ${tipoOpts}
            </select>
          </div>
          <div class="field-group">
            <label for="kx-cantidad" id="kx-cantidad-label">Cantidad *</label>
            <input type="number" id="kx-cantidad" name="cantidad"
              min="0" step="1" placeholder="0" required inputmode="numeric">
            <p class="field-hint" id="kx-cantidad-hint"></p>
          </div>
          <div class="field-group">
            <label for="kx-referencia">Referencia <span class="field-optional">(opcional)</span></label>
            <input type="text" id="kx-referencia" name="referencia"
              placeholder="EJ: FACTURA 001-2345" autocomplete="off" autocapitalize="characters">
          </div>
          <div class="field-group">
            <label for="kx-observacion">Observación <span class="field-optional">(opcional)</span></label>
            <textarea id="kx-observacion" name="observacion" rows="2"
              placeholder="Notas del movimiento…" style="resize:vertical;min-height:60px"></textarea>
          </div>
          <div id="kx-form-error-manual" class="form-error hidden"></div>
          <button type="submit" class="btn-primary" id="btn-guardar-mov"
            style="width:100%;margin-top:8px">
            💾 Guardar Movimiento
          </button>
        </form>

        <!-- MODO GARANTIA -->
        <form id="kx-form-garantia" novalidate class="hidden">
          <div class="form-mode-badge form-mode-edit" style="margin-bottom:14px">
            Salida de Bodega Central → Bodega Garantías
          </div>
          <div class="field-group">
            <label for="gx-producto">Producto *</label>
            <select id="gx-producto" name="product_id" required>
              <option value="">— Seleccionar producto —</option>
              ${productOptsCentral}
            </select>
          </div>
          <div id="gx-saldo-info" class="kx-saldo-info hidden">
            Saldo en Bodega Central: <strong id="gx-saldo-val">—</strong> unidades
          </div>
          <div class="field-group">
            <label for="gx-cliente">Cliente al que se reconoció la Garantía *</label>
            <select id="gx-cliente" name="cliente_id" required>
              <option value="">— Seleccionar cliente —</option>
              ${clienteOpts}
            </select>
          </div>
          <div class="field-group">
            <label for="gx-cantidad">Cantidad *</label>
            <input type="number" id="gx-cantidad" name="cantidad"
              min="1" step="1" placeholder="0" required inputmode="numeric">
          </div>
          <div class="field-group">
            <label for="gx-costo">Costo Unitario (COP) <span class="field-optional">(opcional)</span></label>
            <input type="text" id="gx-costo" name="costo_unitario"
              inputmode="numeric" placeholder="0" autocomplete="off">
          </div>
          <div class="field-group">
            <label for="gx-motivo">Motivo de la Garantía <span class="field-optional">(opcional)</span></label>
            <input type="text" id="gx-motivo" name="garantia_motivo"
              placeholder="EJ: DEFECTO DE FABRICA, AVERIA EN USO" autocomplete="off"
              autocapitalize="characters">
          </div>
          <div class="field-group">
            <label for="gx-referencia">Referencia <span class="field-optional">(Nro. documento origen)</span></label>
            <input type="text" id="gx-referencia" name="referencia"
              placeholder="EJ: FAC-2025-0045" autocomplete="off" autocapitalize="characters">
          </div>
          <div class="field-group">
            <label for="gx-observacion">Observación <span class="field-optional">(opcional)</span></label>
            <textarea id="gx-observacion" rows="2"
              placeholder="Descripción adicional de la garantía…"
              style="resize:vertical;min-height:60px"></textarea>
          </div>
          <div id="kx-form-error-garantia" class="form-error hidden"></div>
          <button type="submit" class="btn-primary" id="btn-guardar-garantia"
            style="width:100%;margin-top:8px">
            🔄 Registrar Garantía
          </button>
        </form>

        <!-- MODO NC PROVEEDOR -->
        <form id="kx-form-nc" novalidate class="hidden">
          <div class="form-mode-badge form-mode-edit" style="margin-bottom:14px">
            Descarga de Bodega Garantías por Nota Crédito Proveedor
          </div>
          <div class="field-group">
            <label for="nc-producto">Producto *</label>
            <select id="nc-producto" name="product_id" required>
              <option value="">— Seleccionar producto —</option>
              ${productOptsGarantias}
            </select>
          </div>
          <div id="nc-saldo-info" class="kx-saldo-info hidden">
            Saldo en Bodega Garantías: <strong id="nc-saldo-val">—</strong> unidades
          </div>
          <div class="field-group">
            <label for="nc-referencia">N° Nota Crédito Proveedor *</label>
            <input type="text" id="nc-referencia" name="nc_referencia"
              placeholder="EJ: NC-PROV-2025-001" autocomplete="off" autocapitalize="characters"
              required>
          </div>
          <div class="field-group">
            <label for="nc-cantidad">Cantidad *</label>
            <input type="number" id="nc-cantidad" name="cantidad"
              min="1" step="1" placeholder="0" required inputmode="numeric">
          </div>
          <div class="field-group">
            <label for="nc-observacion">Observación <span class="field-optional">(opcional)</span></label>
            <textarea id="nc-observacion" rows="2"
              placeholder="Notas de la descarga…"
              style="resize:vertical;min-height:60px"></textarea>
          </div>
          <div id="kx-form-error-nc" class="form-error hidden"></div>
          <button type="submit" class="btn-primary" id="btn-guardar-nc"
            style="width:100%;margin-top:8px">
            📄 Registrar Descarga NC
          </button>
        </form>

      </div>`;
  }

  _switchMode(mode) {
    this._mode = mode;
    ['manual', 'garantia', 'nc_descarga'].forEach((m) => {
      const formId = m === 'manual' ? 'kx-form-manual' : m === 'garantia' ? 'kx-form-garantia' : 'kx-form-nc';
      const form = this.container.querySelector(`#${formId}`);
      if (form) form.classList.toggle('hidden', m !== mode);
    });
    this.container.querySelectorAll('.kx-mode-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
      btn.style.opacity = btn.dataset.mode === mode ? '1' : '0.65';
      btn.style.fontWeight = btn.dataset.mode === mode ? '600' : '400';
    });
  }

  async _applyPrefill() {
    const select = this.container.querySelector('#kx-producto');
    const opt = select?.querySelector(`option[value="${this._product.id}"]`);
    if (opt) {
      select.value = this._product.id;
      await this._refreshSaldo('manual');
    }
  }

  async _refreshSaldo(mode) {
    if (mode === 'manual') {
      const productId = this.container.querySelector('#kx-producto')?.value;
      const bodegaId  = this.container.querySelector('#kx-bodega')?.value;
      if (!productId) { this.container.querySelector('#kx-saldo-info')?.classList.add('hidden'); return; }
      const saldo = await getSaldoByProduct(productId, bodegaId || null);
      this._saldoActual = saldo;
      const info = this.container.querySelector('#kx-saldo-info');
      const val  = this.container.querySelector('#kx-saldo-val');
      if (info && val) { val.textContent = saldo.toLocaleString('es-CO'); info.classList.remove('hidden'); }
      this._updateHint();
    } else if (mode === 'garantia') {
      const productId = this.container.querySelector('#gx-producto')?.value;
      if (!productId) { this.container.querySelector('#gx-saldo-info')?.classList.add('hidden'); return; }
      const saldo = await getSaldoByProduct(productId, BODEGA_CENTRAL_ID);
      const info = this.container.querySelector('#gx-saldo-info');
      const val  = this.container.querySelector('#gx-saldo-val');
      if (info && val) { val.textContent = saldo.toLocaleString('es-CO'); info.classList.remove('hidden'); }
    } else if (mode === 'nc_descarga') {
      const productId = this.container.querySelector('#nc-producto')?.value;
      if (!productId) { this.container.querySelector('#nc-saldo-info')?.classList.add('hidden'); return; }
      const saldo = await getSaldoByProduct(productId, BODEGA_GARANTIAS_ID);
      const info = this.container.querySelector('#nc-saldo-info');
      const val  = this.container.querySelector('#nc-saldo-val');
      if (info && val) { val.textContent = saldo.toLocaleString('es-CO'); info.classList.remove('hidden'); }
    }
  }

  _updateHint() {
    const tipo  = this.container.querySelector('#kx-tipo')?.value ?? '';
    const label = this.container.querySelector('#kx-cantidad-label');
    const hint  = this.container.querySelector('#kx-cantidad-hint');
    if (!label || !hint) return;
    if (TIPOS_ENTRADA.includes(tipo)) {
      label.textContent = 'Cantidad a ingresar *';
      hint.textContent  = 'Unidades que ingresan a la bodega.';
    } else if (TIPOS_SALIDA.includes(tipo)) {
      label.textContent = 'Cantidad a retirar *';
      hint.textContent  = `Saldo actual: ${this._saldoActual.toLocaleString('es-CO')} uds.`;
    } else {
      label.textContent = 'Nuevo saldo objetivo *';
      hint.textContent  = `Saldo actual: ${this._saldoActual.toLocaleString('es-CO')} uds. Ingrese el saldo correcto.`;
    }
  }

  _bindEvents() {
    this.container.querySelectorAll('.kx-mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => this._switchMode(btn.dataset.mode));
    });

    // Manual mode events
    this.container.querySelector('#kx-producto')?.addEventListener('change', () => this._refreshSaldo('manual'));
    this.container.querySelector('#kx-bodega')?.addEventListener('change', () => this._refreshSaldo('manual'));
    this.container.querySelector('#kx-tipo')?.addEventListener('change', () => this._updateHint());
    this.container.querySelector('#btn-scan-producto')?.addEventListener('click', () => {
      sessionStorage.setItem('kardex_pending_scan', '1');
      navigate('escaner');
    });
    const refInput = this.container.querySelector('#kx-referencia');
    refInput?.addEventListener('input', () => {
      const pos = refInput.selectionStart;
      refInput.value = refInput.value.toUpperCase();
      try { refInput.setSelectionRange(pos, pos); } catch { /* noop */ }
    });
    this.container.querySelector('#kx-form-manual')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleSubmitManual();
    });

    // Garantia mode events
    this.container.querySelector('#gx-producto')?.addEventListener('change', () => this._refreshSaldo('garantia'));
    const costoInput = this.container.querySelector('#gx-costo');
    costoInput?.addEventListener('input', () => {
      const n = parseCop(costoInput.value);
      costoInput.value = n > 0 ? formatCop(n) : '';
    });
    costoInput?.addEventListener('blur', () => {
      const n = parseCop(costoInput.value);
      costoInput.value = n > 0 ? formatCop(n) : '';
    });
    const motivoInput = this.container.querySelector('#gx-motivo');
    motivoInput?.addEventListener('input', () => {
      const pos = motivoInput.selectionStart;
      motivoInput.value = motivoInput.value.toUpperCase();
      try { motivoInput.setSelectionRange(pos, pos); } catch { /* noop */ }
    });
    const gxRef = this.container.querySelector('#gx-referencia');
    gxRef?.addEventListener('input', () => {
      const pos = gxRef.selectionStart;
      gxRef.value = gxRef.value.toUpperCase();
      try { gxRef.setSelectionRange(pos, pos); } catch { /* noop */ }
    });
    this.container.querySelector('#kx-form-garantia')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleSubmitGarantia();
    });

    // NC Proveedor mode events
    this.container.querySelector('#nc-producto')?.addEventListener('change', () => this._refreshSaldo('nc_descarga'));
    const ncRef = this.container.querySelector('#nc-referencia');
    ncRef?.addEventListener('input', () => {
      const pos = ncRef.selectionStart;
      ncRef.value = ncRef.value.toUpperCase();
      try { ncRef.setSelectionRange(pos, pos); } catch { /* noop */ }
    });
    this.container.querySelector('#kx-form-nc')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleSubmitNC();
    });

    this._updateHint();
  }

  async _handleSubmitManual() {
    const errorEl = this.container.querySelector('#kx-form-error-manual');
    const btn     = this.container.querySelector('#btn-guardar-mov');
    const showErr = (msg) => { errorEl.textContent = msg; errorEl.classList.remove('hidden'); };
    errorEl.classList.add('hidden');

    const productId   = this.container.querySelector('#kx-producto').value;
    const bodegaId    = this.container.querySelector('#kx-bodega').value;
    const tipo        = this.container.querySelector('#kx-tipo').value;
    const cantidadRaw = Number(this.container.querySelector('#kx-cantidad').value);
    const referencia  = this.container.querySelector('#kx-referencia').value.trim();
    const observacion = this.container.querySelector('#kx-observacion').value.trim();

    if (!productId) { showErr('Selecciona un producto.'); return; }
    if (!cantidadRaw || cantidadRaw <= 0) { showErr('La cantidad debe ser mayor a cero.'); return; }
    if (TIPOS_SALIDA.includes(tipo) && cantidadRaw > this._saldoActual) {
      showErr(`Saldo insuficiente. Disponible: ${this._saldoActual.toLocaleString('es-CO')} uds.`); return;
    }

    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      await handleCrearMovimientoKardex({ product_id: productId, bodega_id: bodegaId, tipo, cantidad: cantidadRaw, referencia, observacion });
      this._saved = true;
      window.alert('Movimiento registrado correctamente.');
      navigate('kardex');
    } catch (err) {
      showErr(`Error: ${err.message}`);
      btn.disabled = false;
      btn.textContent = '💾 Guardar Movimiento';
    }
  }

  async _handleSubmitGarantia() {
    const errorEl = this.container.querySelector('#kx-form-error-garantia');
    const btn     = this.container.querySelector('#btn-guardar-garantia');
    const showErr = (msg) => { errorEl.textContent = msg; errorEl.classList.remove('hidden'); };
    errorEl.classList.add('hidden');

    const productId     = this.container.querySelector('#gx-producto').value;
    const clienteId     = this.container.querySelector('#gx-cliente').value;
    const cantidadRaw   = Number(this.container.querySelector('#gx-cantidad').value);
    const costoRaw      = parseCop(this.container.querySelector('#gx-costo').value);
    const motivoRaw     = this.container.querySelector('#gx-motivo').value.trim();
    const referenciaRaw = this.container.querySelector('#gx-referencia').value.trim();
    const observRaw     = this.container.querySelector('#gx-observacion').value.trim();

    if (!productId)   { showErr('Selecciona un producto.'); return; }
    if (!clienteId)   { showErr('Selecciona el cliente al que se le reconoció la garantía.'); return; }
    if (!cantidadRaw || cantidadRaw <= 0) { showErr('La cantidad debe ser mayor a cero.'); return; }

    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      await handleRegistrarGarantiaKardex({
        product_id: productId,
        cantidad: cantidadRaw,
        cliente_id: clienteId || null,
        costo_unitario: costoRaw > 0 ? costoRaw : null,
        garantia_motivo: motivoRaw || null,
        referencia: referenciaRaw || '',
        observacion: observRaw || '',
      });
      this._saved = true;
      window.alert('Garantía registrada correctamente.\nProducto trasladado a Bodega Garantías.');
      navigate('kardex');
    } catch (err) {
      showErr(`Error: ${err.message}`);
      btn.disabled = false;
      btn.textContent = '🔄 Registrar Garantía';
    }
  }

  async _handleSubmitNC() {
    const errorEl = this.container.querySelector('#kx-form-error-nc');
    const btn     = this.container.querySelector('#btn-guardar-nc');
    const showErr = (msg) => { errorEl.textContent = msg; errorEl.classList.remove('hidden'); };
    errorEl.classList.add('hidden');

    const productId  = this.container.querySelector('#nc-producto').value;
    const ncRef      = this.container.querySelector('#nc-referencia').value.trim();
    const cantidadRaw = Number(this.container.querySelector('#nc-cantidad').value);
    const observRaw  = this.container.querySelector('#nc-observacion').value.trim();

    if (!productId)  { showErr('Selecciona un producto.'); return; }
    if (!ncRef)      { showErr('El número de Nota Crédito del proveedor es obligatorio.'); return; }
    if (!cantidadRaw || cantidadRaw <= 0) { showErr('La cantidad debe ser mayor a cero.'); return; }

    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      const result = await handleRegistrarNcGarantiaKardex({
        product_id: productId,
        cantidad: cantidadRaw,
        nc_referencia: ncRef,
        observacion: observRaw || '',
      });
      if (result === null) {
        showErr('Esta Nota Crédito ya fue registrada anteriormente (registro duplicado prevenido).');
        btn.disabled = false;
        btn.textContent = '📄 Registrar Descarga NC';
        return;
      }
      this._saved = true;
      window.alert('Descarga por Nota Crédito registrada correctamente.\nProducto dado de baja en Bodega Garantías.');
      navigate('kardex');
    } catch (err) {
      showErr(`Error: ${err.message}`);
      btn.disabled = false;
      btn.textContent = '📄 Registrar Descarga NC';
    }
  }
}

function navigate(view, options = {}) { window.__erp_navigate?.(view, options); }
