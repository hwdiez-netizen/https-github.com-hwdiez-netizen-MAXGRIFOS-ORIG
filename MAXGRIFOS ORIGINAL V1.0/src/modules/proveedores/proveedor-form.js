import { eventBus, Events } from '../../events/domain-events.js';
import { handleCrearProveedor, handleActualizarProveedor } from './handlers/index.js';

function toUpper(input) {
  const pos = input.selectionStart;
  input.value = input.value.toUpperCase();
  try { input.setSelectionRange(pos, pos); } catch { /* not a text input */ }
}

export class ProveedorForm {
  constructor(container) {
    this._container = container;
    this._proveedor = null;
  }

  setEditProveedor(p) {
    this._proveedor = p;
  }

  mount() {
    this._render();
  }

  unmount() {}

  _render() {
    const p = this._proveedor;
    const isEdit = !!p;
    const isInactive = p?.status === 'inactive';
    this._container.innerHTML = `
      <div class="form-container">
        <button class="btn-back" id="btn-back">← Proveedores</button>
        <h2>${isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'}${isInactive ? ' <span style="color:#dc2626;font-size:0.75em">[INACTIVO]</span>' : ''}</h2>

        <form id="prov-form" novalidate>
          <div class="field-group">
            <label>Razón Social *</label>
            <input type="text" id="razon-social" class="field-input"
              placeholder="EJ: DISTRIBUIDORA ALFA S.A.S." autocapitalize="characters"
              value="${p?.razon_social ?? ''}" required>
          </div>

          <div class="field-group">
            <label>Nombre del Establecimiento</label>
            <input type="text" id="nombre-establecimiento" class="field-input"
              placeholder="EJ: ALFA DISTRIBUCIONES"
              value="${p?.nombre_establecimiento ?? ''}">
          </div>

          <div class="form-row">
            <div class="field-group" style="flex:2">
              <label>NIT *</label>
              <input type="text" id="nit" class="field-input"
                placeholder="EJ: 900123456" inputmode="numeric"
                value="${p?.nit ?? ''}" required
                ${isEdit ? 'readonly style="background:#f9fafb"' : ''}>
            </div>
            <div class="field-group" style="flex:1">
              <label>DV</label>
              <input type="text" id="dv" class="field-input"
                placeholder="0" maxlength="1" inputmode="numeric"
                value="${p?.dv ?? ''}">
            </div>
          </div>

          <div class="form-row">
            <div class="field-group" style="flex:1">
              <label>Ciudad</label>
              <input type="text" id="ciudad" class="field-input"
                placeholder="EJ: BOGOTÁ" autocapitalize="characters"
                value="${p?.ciudad ?? ''}">
            </div>
            <div class="field-group" style="flex:2">
              <label>Dirección</label>
              <input type="text" id="direccion" class="field-input"
                placeholder="EJ: CRA 7 # 45-12"
                value="${p?.direccion ?? ''}">
            </div>
          </div>

          <div class="form-row">
            <div class="field-group" style="flex:1">
              <label>Teléfono</label>
              <input type="tel" id="telefono" class="field-input"
                placeholder="6012345678" inputmode="numeric"
                value="${p?.telefono ?? ''}">
            </div>
            <div class="field-group" style="flex:1">
              <label>Celular</label>
              <input type="tel" id="celular" class="field-input"
                placeholder="3001234567" inputmode="numeric"
                value="${p?.celular ?? ''}">
            </div>
          </div>

          <div class="field-group">
            <label>Contacto</label>
            <input type="text" id="contacto" class="field-input"
              placeholder="Nombre del contacto"
              value="${p?.contacto ?? ''}">
          </div>

          <div class="field-group">
            <label>Asesor que atiende</label>
            <input type="text" id="asesor" class="field-input"
              placeholder="NOMBRE ASESOR" autocapitalize="characters"
              value="${p?.asesor ?? ''}">
          </div>

          <div class="form-row">
            <div class="field-group" style="flex:1">
              <label>Descuento (%)</label>
              <input type="number" id="descuento" class="field-input"
                placeholder="0" min="0" max="100" step="0.1"
                value="${p?.descuento ?? ''}">
            </div>
            <div class="field-group" style="flex:2">
              <label>Forma de pago</label>
              <select id="forma-pago" class="field-input">
                <option value="CONTADO"    ${(p?.forma_pago ?? '') === 'CONTADO' ? 'selected' : ''}>Contado</option>
                <option value="CREDITO_30" ${(p?.forma_pago ?? '') === 'CREDITO_30' ? 'selected' : ''}>Crédito 30 días</option>
                <option value="CREDITO_60" ${(p?.forma_pago ?? '') === 'CREDITO_60' ? 'selected' : ''}>Crédito 60 días</option>
                <option value="CREDITO_90" ${(p?.forma_pago ?? '') === 'CREDITO_90' ? 'selected' : ''}>Crédito 90 días</option>
              </select>
            </div>
          </div>

          <div class="field-group">
            <label>No. Cuenta Bancaria</label>
            <input type="text" id="cuenta-bancaria" class="field-input"
              placeholder="EJ: 3456789012 — Bancolombia"
              value="${p?.cuenta_bancaria ?? ''}">
          </div>

          <div id="prov-feedback" class="feedback hidden"></div>

          <button type="submit" class="btn-primary" id="btn-save" style="margin-top:8px">
            ${isEdit ? 'Actualizar Proveedor' : 'Guardar Proveedor'}
          </button>
          <button type="button" class="btn-cancel" id="btn-cancel">Cancelar</button>
        </form>
      </div>`;

    this._bindEvents();
  }

  _bindEvents() {
    this._container.querySelector('#btn-back')?.addEventListener('click', () => {
      window.__erp_navigate?.('proveedores');
    });
    this._container.querySelector('#btn-cancel')?.addEventListener('click', () => {
      window.__erp_navigate?.('proveedores');
    });

    ['#razon-social', '#nombre-establecimiento', '#ciudad', '#asesor'].forEach((sel) => {
      const el = this._container.querySelector(sel);
      if (el) el.addEventListener('input', () => toUpper(el));
    });

    this._container.querySelector('#prov-form')
      ?.addEventListener('submit', (e) => { e.preventDefault(); this._handleSubmit(); });
  }

  async _handleSubmit() {
    const g = (id) => this._container.querySelector(id)?.value?.trim() ?? '';

    const btn = this._container.querySelector('#btn-save');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      const data = {
        razon_social:           g('#razon-social'),
        nombre_establecimiento: g('#nombre-establecimiento'),
        nit:                    g('#nit'),
        dv:                     g('#dv'),
        ciudad:                 g('#ciudad'),
        direccion:              g('#direccion'),
        telefono:               g('#telefono'),
        celular:                g('#celular'),
        contacto:               g('#contacto'),
        asesor:                 g('#asesor'),
        descuento:              parseFloat(g('#descuento')) || 0,
        forma_pago:             this._container.querySelector('#forma-pago')?.value ?? 'CONTADO',
        cuenta_bancaria:        g('#cuenta-bancaria'),
      };

      if (this._proveedor) {
        await handleActualizarProveedor(this._proveedor.id, data);
      } else {
        await handleCrearProveedor(data);
      }

      this._fb(`✅ Proveedor ${this._proveedor ? 'actualizado' : 'creado'} exitosamente.`, 'success');
      setTimeout(() => window.__erp_navigate?.('proveedores'), 1200);
    } catch (err) {
      this._fb(`Error: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = this._proveedor ? 'Actualizar Proveedor' : 'Guardar Proveedor';
    }
  }

  _fb(msg, type) {
    const el = this._container.querySelector('#prov-feedback');
    if (!el) return;
    el.textContent = msg;
    el.className = `feedback ${type}`;
    setTimeout(() => { el.className = 'feedback hidden'; }, 5000);
  }
}
