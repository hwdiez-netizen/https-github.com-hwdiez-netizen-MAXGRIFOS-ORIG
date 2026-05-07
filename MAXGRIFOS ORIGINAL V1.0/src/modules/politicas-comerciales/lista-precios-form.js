import {
  crearLista, actualizarLista, activarLista, suspenderLista,
  guardarPrecioItems, getListaCompleta, registrarCambioLista,
  FORMA_PAGO_OPTIONS, FORMA_PAGO_LABELS,
} from './lista-precios-store.js';
import { getProducts } from '../maestro-productos/product-store.js';

function parseCopAmount(str) {
  return parseInt(String(str).replace(/\D/g, ''), 10) || 0;
}

function formatCopAmount(value) {
  const n = Math.round(Number(value)) || 0;
  return new Intl.NumberFormat('es-CO').format(n);
}

function bindCopInput(el) {
  if (el._copInputBound) return;
  el._copInputBound = true;

  el.addEventListener('input', () => {
    const raw = parseCopAmount(el.value);
    const pos = el.selectionStart;
    el.value = raw > 0 ? formatCopAmount(raw) : '';
    try { el.setSelectionRange(pos, pos); } catch (_) { /* readonly */ }
  });
  el.addEventListener('blur', () => {
    const raw = parseCopAmount(el.value);
    el.value = raw > 0 ? formatCopAmount(raw) : '';
  });
}

export class ListaPreciosForm {
  constructor(container) {
    this._container = container;
    this._lista = null;
    this._items = [];
    this._products = [];
    this._dirty = false;
    this._modoEdicion = false;
  }

  setEditLista(lista) {
    this._lista = lista;
    this._modoEdicion = !!(lista && lista.estado_proceso !== 'creacion');
  }

  async canUnmount() {
    if (!this._dirty) return true;
    return confirm('Hay cambios sin guardar. ¿Desea salir de todas formas?');
  }

  async mount() {
    this._products = (await getProducts()).filter((p) => p.status === 'active');

    if (this._lista) {
      const completa = await getListaCompleta(this._lista.id);
      if (completa) {
        this._lista = completa.lista;
        this._items = completa.items;
      }
      // Al entrar en modo edición: auto-desactivar para evitar precios inconsistentes
      if (this._modoEdicion && this._lista.estado_proceso === 'activa') {
        try {
          this._lista = await suspenderLista(this._lista.id);
        } catch (_) { /* continuar de todas formas */ }
      }
    }

    this._render();
  }

  unmount() {
    this._container.innerHTML = '';
  }

  _render() {
    const isNew = !this._lista;
    const ep = this._lista?.estado_proceso ?? 'creacion';
    const enEdicion = this._modoEdicion;

    this._container.innerHTML = `
      <div class="form-container">
        <button class="btn-back" id="btn-back">← Volver</button>

        <div class="form-mode-badge ${isNew ? 'form-mode-v5' : 'form-mode-edit'}"
          style="${enEdicion ? 'background:#fee2e2;color:#dc2626;border-color:#fca5a5' : ''}">
          ${isNew
            ? 'Nueva Lista de Precios'
            : enEdicion
              ? '🔴 INACTIVA — en edición'
              : `Editando Lista — ${ep}`}
        </div>

        <div class="field-group">
          <label class="field-label">Nombre *</label>
          <input class="field-input" id="inp-nombre" type="text" maxlength="120"
            value="${this._lista?.nombre ?? ''}"
            placeholder="Ej: Lista Mayorista Contado" />
        </div>

        <div class="field-group">
          <label class="field-label">Forma de pago *</label>
          <select class="field-input" id="sel-tipo" ${!isNew ? 'disabled' : ''}>
            <option value="">-- Seleccione --</option>
            ${FORMA_PAGO_OPTIONS.map((o) => `
              <option value="${o.value}"
                ${(this._lista?.forma_pago ?? this._lista?.tipo_cliente) === o.value ? 'selected' : ''}>
                ${o.label}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="field-group">
          <label class="field-label">Descripción <span style="font-weight:400;color:#9ca3af">(opcional)</span></label>
          <input class="field-input" id="inp-desc" type="text" maxlength="220"
            value="${this._lista?.descripcion ?? ''}" placeholder="Opcional" />
        </div>

        <div class="field-group">
          <label class="field-label">Editor de Precios</label>

          <!-- Tabs de modo -->
          <div style="display:flex;border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:12px">
            <button id="tab-masiva" type="button"
              style="flex:1;padding:9px 0;font-size:13px;font-weight:700;background:#0369a1;color:#fff;border:none;cursor:pointer">
              📊 Edición Masiva
            </button>
            <button id="tab-manual" type="button"
              style="flex:1;padding:9px 0;font-size:13px;font-weight:600;background:#fff;color:#64748b;border:none;cursor:pointer">
              🔍 Edición Manual
            </button>
          </div>

          <!-- Sección Masiva -->
          <div id="section-masiva" style="margin-bottom:10px;padding:12px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span style="font-weight:700;font-size:13px;color:#0369a1">Margen de utilidad:</span>
              <div style="display:flex;align-items:center;border:1.5px solid #93c5fd;border-radius:6px;overflow:hidden;background:#fff">
                <input type="number" id="inp-margen" class="field-input"
                  placeholder="25" min="1" max="99" step="0.1"
                  style="width:70px;padding:6px 8px;border:none;outline:none;font-size:14px;font-weight:600;text-align:right">
                <span style="padding:6px 10px 6px 4px;font-size:15px;font-weight:700;color:#0369a1;background:#eff6ff">%</span>
              </div>
              <button type="button" id="btn-margen-apply" class="btn-secondary" style="padding:7px 16px;font-size:13px;font-weight:600">
                Calcular y revisar →
              </button>
              <span style="font-size:11px;color:#64748b">Fórmula: Precio = Costo × 100 ÷ (100 − Margen%)</span>
            </div>
            <div id="margen-preview" style="display:none;margin-top:12px"></div>
          </div>

          <!-- Sección Manual -->
          <div id="section-manual" style="display:none;margin-bottom:10px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
            <div style="font-weight:700;font-size:13px;color:#374151;margin-bottom:8px">Buscar producto</div>
            <input id="inp-buscar" type="text" class="field-input"
              placeholder="Código proveedor o nombre del producto..."
              style="width:100%;padding:9px 12px;font-size:14px" autocomplete="off" />
            <div id="buscar-sin-resultado" style="display:none;font-size:13px;color:#dc2626;margin-top:6px;padding:6px 0">
              Sin productos que coincidan con la búsqueda.
            </div>
          </div>

          <!-- Tabla de precios (siempre visible, filtrada en modo manual) -->
          <div class="precio-table">
            <div class="precio-table-header" style="grid-template-columns:1fr 2fr 1fr 1fr 70px">
              <span>SKU</span><span>Nombre</span><span>Costo</span><span>Precio Venta</span><span style="text-align:center">Utilidad %</span>
            </div>
            ${this._products.length === 0
              ? '<div class="empty-state" style="padding:20px">Sin productos activos</div>'
              : this._products.map((p) => {
                  const existing = this._items.find((i) => i.product_id === p.id);
                  const costo = Number(p.costo ?? 0);
                  const nombre = p.nombre ?? p.name ?? '';
                  const ref = p.ref_proveedor ?? '';
                  const precioExist = existing?.precio_venta ?? 0;
                  const margenInit = (precioExist > costo && costo > 0)
                    ? `${((1 - costo / precioExist) * 100).toFixed(1)}%`
                    : '—';
                  return `
                    <div class="precio-table-row" style="grid-template-columns:1fr 2fr 1fr 1fr 70px"
                      data-pid="${p.id}" data-ref="${ref.toLowerCase()}" data-nombre="${nombre.toLowerCase()}">
                      <span class="precio-sku">${p.sku ?? ''}</span>
                      <span class="precio-name">${nombre}</span>
                      <span style="font-size:13px;color:#6b7280">${costo > 0 ? formatCopAmount(costo) : '—'}</span>
                      <input class="precio-venta-input" type="text" inputmode="numeric"
                        data-pid="${p.id}" data-sku="${p.sku ?? ''}" data-name="${nombre}"
                        data-costo="${costo}"
                        value="${precioExist ? formatCopAmount(precioExist) : ''}"
                        placeholder="0" />
                      <span class="precio-margen-live" style="font-size:12px;font-weight:700;text-align:center;color:${margenInit === '—' ? '#9ca3af' : '#15803d'}">${margenInit}</span>
                    </div>`;
                }).join('')}
          </div>
        </div>

        <div class="feedback hidden" id="fb"></div>

        <div class="politicas-action-bar" style="display:flex;gap:10px;margin-top:16px">
          <button class="btn-secondary" id="btn-cancelar" style="flex:1">Cancelar</button>
          <button class="btn-primary" id="btn-guardar" style="flex:2">
            ${isNew ? 'Guardar' : 'Guardar cambios'}
          </button>
        </div>
      </div>`;

    this._container.querySelector('#btn-back')
      .addEventListener('click', () => this._handleCancelar());

    const inp = (id) => this._container.querySelector(`#${id}`);

    ['inp-nombre', 'inp-desc'].forEach((id) => {
      inp(id)?.addEventListener('input', () => { this._dirty = true; });
    });

    this._container.querySelectorAll('.precio-venta-input').forEach((el) => {
      if (el._precioInputBound) return;
      el._precioInputBound = true;

      el.addEventListener('input', () => {
        this._dirty = true;
        // Live margin calculation
        const precio = parseCopAmount(el.value);
        const costo = Number(el.dataset.costo ?? 0);
        const span = el.closest('.precio-table-row')?.querySelector('.precio-margen-live');
        if (span) {
          if (precio > 0 && costo > 0 && precio > costo) {
            const m = ((1 - costo / precio) * 100).toFixed(1);
            span.textContent = `${m}%`;
            span.style.color = '#15803d';
          } else if (precio > 0 && costo > 0 && precio <= costo) {
            span.textContent = '≤0%';
            span.style.color = '#dc2626';
          } else {
            span.textContent = '—';
            span.style.color = '#9ca3af';
          }
        }
      });
      bindCopInput(el);
    });

    // Tab switching
    inp('tab-masiva')?.addEventListener('click', () => {
      inp('section-masiva').style.display = '';
      inp('section-manual').style.display = 'none';
      inp('tab-masiva').style.background = '#0369a1';
      inp('tab-masiva').style.color = '#fff';
      inp('tab-masiva').style.fontWeight = '700';
      inp('tab-manual').style.background = '#fff';
      inp('tab-manual').style.color = '#64748b';
      inp('tab-manual').style.fontWeight = '600';
      // Reset search filter
      this._container.querySelectorAll('.precio-table-row[data-pid]').forEach((r) => { r.style.display = ''; });
    });

    inp('tab-manual')?.addEventListener('click', () => {
      inp('section-masiva').style.display = 'none';
      inp('section-manual').style.display = '';
      inp('tab-manual').style.background = '#0369a1';
      inp('tab-manual').style.color = '#fff';
      inp('tab-manual').style.fontWeight = '700';
      inp('tab-masiva').style.background = '#fff';
      inp('tab-masiva').style.color = '#64748b';
      inp('tab-masiva').style.fontWeight = '600';
      inp('inp-buscar')?.focus();
    });

    // Search filter (manual mode)
    inp('inp-buscar')?.addEventListener('input', () => {
      const q = (inp('inp-buscar')?.value ?? '').toLowerCase().trim();
      let visible = 0;
      this._container.querySelectorAll('.precio-table-row[data-pid]').forEach((row) => {
        const match = !q || row.dataset.nombre?.includes(q) || row.dataset.ref?.includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      const sinRes = inp('buscar-sin-resultado');
      if (sinRes) sinRes.style.display = (q && visible === 0) ? '' : 'none';
    });

    inp('btn-guardar')?.addEventListener('click', () => this._guardar());
    inp('btn-cancelar')?.addEventListener('click', () => this._handleCancelar());
    inp('btn-margen-apply')?.addEventListener('click', () => this._aplicarMargen());
  }

  _aplicarMargen() {
    const margen = parseFloat(this._container.querySelector('#inp-margen')?.value || '0');
    if (margen <= 0 || margen >= 100) {
      this._showFb('El margen debe estar entre 1 y 99%.', 'error');
      return;
    }

    // Collect preview data — do NOT apply yet
    const filas = [];
    this._container.querySelectorAll('.precio-venta-input').forEach((el) => {
      const costo = Number(el.dataset.costo ?? 0);
      if (costo <= 0) return;
      // Round UP to nearest 100 (e.g. 13,333 → 13,400)
      const precioVenta = Math.ceil(costo / (1 - margen / 100) / 100) * 100;
      filas.push({ el, sku: el.dataset.sku, name: el.dataset.name, costo, precioVenta });
    });

    const preview = this._container.querySelector('#margen-preview');
    if (!preview) return;

    if (filas.length === 0) {
      preview.style.display = 'block';
      preview.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:8px 0">
        ⚠️ Ningún producto tiene costo definido. Ve al módulo de Productos y edita el campo "Costo unitario (COP)" primero.
      </div>`;
      return;
    }

    // Show confirmation table
    const filaRows = filas.map((f) => `
      <div style="display:grid;grid-template-columns:1fr 2fr 1fr 1fr;gap:6px;padding:5px 0;border-bottom:1px solid #e0f2fe;font-size:12px">
        <span style="color:#64748b">${f.sku}</span>
        <span style="color:#1e293b;font-weight:500">${f.name}</span>
        <span style="color:#6b7280">${formatCopAmount(f.costo)}</span>
        <span style="color:#15803d;font-weight:700">$ ${formatCopAmount(f.precioVenta)}</span>
      </div>`).join('');

    preview.style.display = 'block';
    preview.innerHTML = `
      <div style="background:#fff;border:1.5px solid #86efac;border-radius:8px;padding:12px">
        <div style="font-weight:700;font-size:13px;color:#15803d;margin-bottom:8px">
          Vista previa — Margen ${margen}% aplicado a ${filas.length} producto(s)
        </div>
        <div style="display:grid;grid-template-columns:1fr 2fr 1fr 1fr;gap:6px;padding:4px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #86efac;margin-bottom:4px">
          <span>SKU</span><span>Producto</span><span>Costo</span><span>Precio venta</span>
        </div>
        ${filaRows}
        <div style="display:flex;gap:10px;margin-top:12px">
          <button id="btn-margen-confirmar" class="btn-primary" style="flex:2;padding:9px 0;font-size:13px;font-weight:700">
            ✅ Confirmar — aplicar ${filas.length} precios
          </button>
          <button id="btn-margen-cancelar" class="btn-secondary" style="flex:1;padding:9px 0;font-size:13px">
            Cancelar
          </button>
        </div>
      </div>`;

    this._container.querySelector('#btn-margen-confirmar').addEventListener('click', () => {
      filas.forEach((f) => { f.el.value = formatCopAmount(f.precioVenta); });
      this._dirty = true;

      // Audit table: verify actual margin per product
      const auditRows = filas.map((f) => {
        const margenReal = ((1 - f.costo / f.precioVenta) * 100).toFixed(1);
        const ok = Math.abs(parseFloat(margenReal) - margen) < 0.2;
        return `
          <div style="display:grid;grid-template-columns:1fr 2fr 1fr 1fr 1fr;gap:6px;padding:5px 0;border-bottom:1px solid #dcfce7;font-size:12px;align-items:center">
            <span style="color:#64748b">${f.sku}</span>
            <span style="color:#1e293b;font-weight:500">${f.name}</span>
            <span style="color:#6b7280">$ ${formatCopAmount(f.costo)}</span>
            <span style="color:#15803d;font-weight:700">$ ${formatCopAmount(f.precioVenta)}</span>
            <span style="font-weight:800;color:${ok ? '#15803d' : '#dc2626'};text-align:center">
              ${ok ? '✅' : '⚠️'} ${margenReal}%
            </span>
          </div>`;
      }).join('');

      preview.innerHTML = `
        <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:14px">
          <div style="font-weight:800;font-size:14px;color:#15803d;margin-bottom:10px">
            ✅ APLICADO — Margen ${margen}% verificado en ${filas.length} producto(s)
          </div>
          <div style="display:grid;grid-template-columns:1fr 2fr 1fr 1fr 1fr;gap:6px;padding:4px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #86efac;margin-bottom:4px">
            <span>SKU</span><span>Producto</span><span>Costo</span><span>Precio venta</span><span style="text-align:center">Margen real</span>
          </div>
          ${auditRows}
          <div style="margin-top:10px;padding:8px 10px;background:#dcfce7;border-radius:6px;font-size:12px;color:#166534;font-weight:600">
            Todos los precios están listos. Pulsa <strong>"Guardar"</strong> para persistir la lista.
          </div>
        </div>`;
    });

    this._container.querySelector('#btn-margen-cancelar').addEventListener('click', () => {
      preview.style.display = 'none';
      preview.innerHTML = '';
    });
  }

  async _refreshFromStore() {
    if (!this._lista) return;
    const completa = await getListaCompleta(this._lista.id);
    if (completa) {
      this._lista = completa.lista;
      this._items = completa.items;
    }
  }

  _collectPrecioItems() {
    const items = [];

    const inputs = this._container.querySelectorAll('.precio-venta-input');

    inputs.forEach((el) => {
      const raw = el.value.trim();
      const val = parseCopAmount(el.value);

      const product_id = el.dataset.pid;
      const product_sku = el.dataset.sku;
      const product_name = el.dataset.name;

      if (!product_id) return; // protección mínima

      if (raw === '' || val === 0) {
        items.push({
          product_id,
          product_sku,
          product_name,
          precio_venta: 0,
          _action: 'DEACTIVATE',
        });
      } else {
        items.push({
          product_id,
          product_sku,
          product_name,
          precio_venta: val,
          _action: 'UPSERT',
        });
      }
    });

    return items;
  }

  _showFb(msg, type = 'success') {
    const fb = this._container.querySelector('#fb');
    if (!fb) return;
    fb.textContent = msg;
    fb.className = `feedback ${type}`;
    setTimeout(() => { fb.className = 'feedback hidden'; }, 3500);
  }

  _handleCancelar() {
    if (this._modoEdicion) {
      if (!confirm('¿Cancelar la edición?\nLa lista permanecerá INACTIVA hasta que la active manualmente desde el listado.')) return;
    } else if (this._dirty) {
      if (!confirm('¿Cancelar la creación? Los datos no se guardarán.')) return;
    }
    window.__erp_navigate('politicas');
  }

  async _guardar() {
    const nombre = this._container.querySelector('#inp-nombre')?.value.trim();
    const tipo_cliente = this._container.querySelector('#sel-tipo')?.value;
    const descripcion = this._container.querySelector('#inp-desc')?.value.trim() ?? '';

    if (!nombre) { this._showFb('El nombre es obligatorio.', 'error'); return; }
    if (!this._lista && !tipo_cliente) { this._showFb('Seleccione la forma de pago.', 'error'); return; }

    try {
      const esNueva = !this._lista;
      const camposModificados = [];

      if (!this._lista) {
        this._lista = await crearLista({ nombre, tipo_cliente, descripcion });
      } else {
        if (nombre !== this._lista.nombre) camposModificados.push('nombre');
        if (descripcion !== this._lista.descripcion) camposModificados.push('descripción');
        this._lista = await actualizarLista(this._lista.id, { nombre, descripcion });
      }

      const nuevosItems = this._collectPrecioItems();
      const preciosAntesCount = this._items.length;
      if (nuevosItems.length > 0 || this._items.length > 0) {
        await guardarPrecioItems(this._lista.id, nuevosItems);
      }
      const preciosModificados = Math.abs(nuevosItems.length - preciosAntesCount);

      // Registrar trazabilidad en edición
      if (!esNueva) {
        if (nuevosItems.length !== preciosAntesCount) camposModificados.push('precios');
        await registrarCambioLista(this._lista.id, {
          campos: camposModificados,
          preciosModificados,
        });
      }

      this._lista = await activarLista(this._lista.id);
      await this._refreshFromStore();
      this._dirty = false;

      const msg = esNueva ? 'Lista creada y activada exitosamente.' : 'Lista actualizada y reactivada exitosamente.';
      this._showFb(msg);
      setTimeout(() => {
        if (typeof window.__erp_navigate === 'function') {
          window.__erp_navigate('politicas');
        }
      }, 1000);
    } catch (e) {
      this._showFb(e.message, 'error');
    }
  }
}
