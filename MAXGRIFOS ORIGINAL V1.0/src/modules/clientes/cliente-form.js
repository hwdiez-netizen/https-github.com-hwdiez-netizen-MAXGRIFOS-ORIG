import { handleCreateCliente, handleUpdateCliente } from './handlers/index.js';
import { HorarioBuilder } from '../../components/horario-builder.js';
import { BirthdayPicker } from '../../components/birthday-picker.js';
import { confirmDialog } from '../../utils/confirm-dialog.js';

const ADDR_TYPES = ['CALLE', 'CARRERA', 'AVENIDA', 'DIAGONAL', 'TRANSVERSAL', 'CIRCULAR', 'AUTOPISTA'];
const CREDITO_FORMAS = new Set(['CREDITO_15', 'CREDITO_30', 'CREDITO_45']);

const FORMA_PAGO_OPTIONS = [
  ['', 'SELECCIONE FORMA DE PAGO'],
  ['CONTADO_B2B', 'CONTADO B2B'],
  ['CREDITO_15', 'CREDITO 15 DIAS'],
  ['CREDITO_30', 'CREDITO 30 DIAS'],
  ['CREDITO_45', 'CREDITO 45 DIAS'],
  ['B2C_REDES', 'B2C REDES SOCIALES'],
  ['B2C_CONSTRUCTOR', 'B2C CONSTRUCTOR'],
];

const PAGO_BADGE_CFG = {
  '':               { label: 'SIN DEFINIR',     cls: 'pago-pendiente' },
  CONTADO_B2B:      { label: 'CONTADO B2B',     cls: 'pago-contado' },
  CREDITO_15:       { label: 'CREDITO 15 DIAS', cls: 'pago-credito15' },
  CREDITO_30:       { label: 'CREDITO 30 DIAS', cls: 'pago-credito30' },
  CREDITO_45:       { label: 'CREDITO 45 DIAS', cls: 'pago-credito45' },
  B2C_REDES:        { label: 'B2C REDES',       cls: 'pago-b2c' },
  B2C_CONSTRUCTOR:  { label: 'B2C CONSTRUCTOR', cls: 'pago-b2c' },
};

function toUpperInput(input) {
  const pos = input.selectionStart;
  input.value = input.value.toUpperCase();
  try { input.setSelectionRange(pos, pos); } catch { /* non-text */ }
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

function normalizeAddressToken(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 8);
}

function normalizeAddressComplement(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAddress(fullAddress) {
  const parsed = {
    type: 'CALLE',
    main: '',
    cross: '',
    suffix: '',
    complement: '',
  };
  if (!fullAddress) return parsed;

  const source = String(fullAddress).trim().toUpperCase();
  let rest = source;

  for (const t of ADDR_TYPES) {
    if (source === t || source.startsWith(`${t} `)) {
      parsed.type = t;
      rest = source.slice(t.length).trim();
      break;
    }
  }

  const match = rest.match(/^([0-9A-Z]+)\s*#\s*([0-9A-Z]+)\s*-\s*([0-9A-Z]+)(?:\s+(.*))?$/);
  if (match) {
    parsed.main = normalizeAddressToken(match[1]);
    parsed.cross = normalizeAddressToken(match[2]);
    parsed.suffix = normalizeAddressToken(match[3]);
    parsed.complement = normalizeAddressComplement(match[4] ?? '');
    return parsed;
  }

  parsed.complement = normalizeAddressComplement(rest);
  return parsed;
}

function buildAddress({ type, main, cross, suffix, complement }) {
  if (!main && !cross && !suffix && !complement) return '';
  if (!main || !cross || !suffix) return null;
  const comp = complement ? ` ${complement}` : '';
  return `${type} ${main} # ${cross}-${suffix}${comp}`;
}

function isCreditoFormaPago(value) {
  return CREDITO_FORMAS.has(String(value ?? '').trim().toUpperCase());
}

export class ClienteForm {
  constructor(container) {
    this.container = container;
    this._editCliente = null;
    this._saved = false;
    this._horarioBuilder = null;
    this._birthdayPicker = null;
  }

  setEditCliente(cliente) {
    this._editCliente = cliente;
  }

  async canUnmount() {
    if (this._saved) return true;
    const razon = this.container.querySelector('#razon-social')?.value?.trim();
    const cedula = this.container.querySelector('#cedula')?.value?.trim();
    if (razon || cedula || this._editCliente) {
      return await confirmDialog('¿Salir sin guardar?\nSe perderán los datos ingresados.');
    }
    return true;
  }

  unmount() {}

  mount() {
    this.container.innerHTML = this._template();
    if (this._editCliente) this._applyPrefills();
    this._bindEvents();
    this._updateBadge();

    const horarioWrap = this.container.querySelector('#horario-builder-wrap');
    this._horarioBuilder = new HorarioBuilder(horarioWrap, this._editCliente?.horarios_atencion ?? '');
    this._horarioBuilder.render();

    const bdWrap = this.container.querySelector('#birthday-picker-wrap');
    this._birthdayPicker = new BirthdayPicker(bdWrap, this._editCliente?.fecha_cumpleanos ?? '');
    this._birthdayPicker.render();
  }

  _template() {
    const isEdit = !!this._editCliente;
    const pagoOpts = FORMA_PAGO_OPTIONS.map(
      ([val, label]) => `<option value="${val}">${label}</option>`
    ).join('');

    return `
      <div class="form-container mg-mobile-form-safe mg-premium-flow module-clientes">
        <button type="button" class="btn-back" id="btn-back">← Volver</button>
        <h2>${isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
        ${isEdit ? `<div class="form-mode-badge form-mode-edit">Editando cliente existente</div>` : ''}

        <form id="cliente-form" novalidate>

          <div class="field-group">
            <label for="razon-social">Razon Social *</label>
            <div style="display:flex;align-items:center;gap:10px">
              <input type="text" id="razon-social" name="razon_social"
                placeholder="EJ: FERRETERIA EL TORNILLO S.A.S"
                autocomplete="off" autocapitalize="characters" required style="flex:1">
              <span id="pago-badge-inline" class="pago-badge pago-pendiente">SIN DEFINIR</span>
            </div>
          </div>

          <div class="field-group">
            <label style="display:flex;align-items:center;gap:6px">
              NIT / Cedula
              <span class="sku-locked-badge">Al menos uno obligatorio</span>
            </label>
            <div class="form-row" style="margin-bottom:0">
              <div style="flex:1">
                <input type="text" id="nit" name="nit"
                  placeholder="NIT · EJ: 900123456-1"
                  autocomplete="off" style="width:100%">
              </div>
              <div style="flex:1">
                <input type="text" id="cedula" name="cedula"
                  placeholder="Cedula · EJ: 10234567"
                  autocomplete="off" style="width:100%">
              </div>
            </div>
          </div>

          <div id="dup-alert" class="sku-alert hidden"></div>

          <div class="form-row">
            <div class="field-group" style="flex:1">
              <label for="celular">Celular</label>
              <input type="tel" id="celular" name="celular"
                placeholder="EJ: 3001234567">
            </div>
            <div class="field-group" style="flex:1">
              <label for="correo">Correo</label>
              <input type="email" id="correo" name="correo"
                placeholder="cliente@email.com">
            </div>
          </div>

          <div class="field-group">
            <label>Direccion</label>
            <div class="addr-main-row">
              <select id="addr-type" class="addr-type-sel">
                ${ADDR_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
              </select>
              <input type="text" id="addr-main" class="addr-segment-input"
                placeholder="45" inputmode="numeric" maxlength="8" autocomplete="off">
              <span class="addr-token">#</span>
              <input type="text" id="addr-cross" class="addr-segment-input"
                placeholder="12" inputmode="numeric" maxlength="8" autocomplete="off">
              <span class="addr-token">-</span>
              <input type="text" id="addr-suffix" class="addr-segment-input"
                placeholder="34" inputmode="numeric" maxlength="8" autocomplete="off">
            </div>
            <div class="addr-row" style="margin-top:8px">
              <input type="text" id="addr-comp"
                placeholder="COMPLEMENTO (CASA, APTO, TORRE) - OPCIONAL"
                autocomplete="off">
            </div>
            <div class="addr-hint">Formato: CALLE 45 # 12-34 · Ej: CALLE 45 # 12-34 APTO 302</div>
          </div>

          <div class="form-row">
            <div class="field-group" style="flex:1">
              <label for="barrio">Barrio / Sector</label>
              <input type="text" id="barrio" name="barrio"
                placeholder="EJ: BOSTON" autocomplete="off">
            </div>
            <div class="field-group" style="flex:1">
              <label for="ciudad">Ciudad</label>
              <input type="text" id="ciudad" name="ciudad"
                placeholder="EJ: MEDELLIN" autocomplete="off" autocapitalize="characters">
            </div>
          </div>

          <div class="form-row">
            <div class="field-group" style="flex:1">
              <label>Fecha Cumpleanos</label>
              <div id="birthday-picker-wrap"></div>
            </div>
            <div class="field-group" style="flex:1">
              <label for="contacto">Contacto</label>
              <input type="text" id="contacto" name="contacto"
                placeholder="EJ: JUAN PEREZ" autocomplete="off">
            </div>
          </div>

          <div class="form-row">
            <div class="field-group" style="flex:1">
              <label for="forma-pago">Forma de Pago *</label>
              <select id="forma-pago" name="forma_pago" required>${pagoOpts}</select>
            </div>
          </div>

          <div class="form-row">
            <div class="field-group" style="flex:1">
              <label for="cupo-credito">Cupo Credito (COP) *</label>
              <input type="text" id="cupo-credito" name="cupo_credito" inputmode="numeric"
                placeholder="0" autocomplete="off">
              <span class="field-error hidden" id="err-cupo-credito"></span>
            </div>
            <div class="field-group" style="flex:1">
              <label for="compra-minima">Compra Minima (COP) *</label>
              <input type="text" id="compra-minima" name="compra_minima" inputmode="numeric"
                placeholder="0" autocomplete="off">
              <span class="field-error hidden" id="err-compra-minima"></span>
            </div>
          </div>

          <div id="horario-builder-wrap"></div>

          <button type="submit" class="btn-primary" id="btn-submit">
            ${isEdit ? 'Actualizar Cliente' : 'Guardar Cliente'}
          </button>
          <button type="button" class="btn-cancel" id="btn-cancel">Cancelar</button>
        </form>
      </div>`;
  }

  _applyPrefills() {
    const p = this._editCliente;
    const set = (sel, val) => {
      const el = this.container.querySelector(sel);
      if (el) el.value = val ?? '';
    };

    set('#razon-social', p.razon_social);
    set('#nit', p.nit);
    set('#cedula', p.cedula);
    set('#celular', p.celular);
    set('#correo', p.correo);
    set('#barrio', p.barrio);
    set('#ciudad', p.ciudad);
    set('#contacto', p.contacto);
    set('#forma-pago', p.forma_pago ?? '');
    set('#cupo-credito', Number(p.cupo_credito ?? 0) > 0 ? formatCopAmount(p.cupo_credito) : '');
    set('#compra-minima', Number(p.compra_minima ?? 0) > 0 ? formatCopAmount(p.compra_minima) : '');

    const addr = parseAddress(p.direccion);
    set('#addr-type', addr.type);
    set('#addr-main', addr.main);
    set('#addr-cross', addr.cross);
    set('#addr-suffix', addr.suffix);
    set('#addr-comp', addr.complement);

    this._updateFormaPago();
  }

  _bindEvents() {
    const upperFields = ['#razon-social', '#nit', '#cedula', '#ciudad', '#contacto', '#barrio', '#addr-comp'];
    upperFields.forEach((sel) => {
      const el = this.container.querySelector(sel);
      if (el) {
        el.addEventListener('input', () => toUpperInput(el));
      }
    });

    ['#addr-main', '#addr-cross', '#addr-suffix'].forEach((sel) => {
      const el = this.container.querySelector(sel);
      if (!el) return;
      el.addEventListener('input', () => {
        el.value = normalizeAddressToken(el.value);
      });
    });

    bindCopCurrencyInput(this.container.querySelector('#cupo-credito'));
    bindCopCurrencyInput(this.container.querySelector('#compra-minima'));

    this.container.querySelector('#cupo-credito')
      ?.addEventListener('blur', () => this._validateCupoCompraInline());
    this.container.querySelector('#compra-minima')
      ?.addEventListener('blur', () => this._validateCupoCompraInline());

    this.container.querySelector('#forma-pago')
      ?.addEventListener('change', () => this._updateFormaPago());

    this.container.querySelector('#btn-back')
      ?.addEventListener('click', () => window.__erp_navigate?.('clientes'));

    this.container.querySelector('#btn-cancel')
      ?.addEventListener('click', async () => {
        if (this._saved) { window.__erp_navigate?.('clientes'); return; }
        if (this._editCliente) {
          if (!await confirmDialog('¿Cancelar la edición?\nEl cliente NO será eliminado. Solo se descartan los cambios.')) return;
          window.__erp_navigate?.('clientes');
          return;
        }
        const razon = this.container.querySelector('#razon-social')?.value?.trim();
        const cedula = this.container.querySelector('#cedula')?.value?.trim();
        if ((razon || cedula) && !await confirmDialog('¿Cancelar el registro?\nSe perderán los datos ingresados.')) return;
        window.__erp_navigate?.('clientes');
      });

    this.container.querySelector('#cliente-form')
      ?.addEventListener('submit', (e) => this._handleSubmit(e));
  }

  _updateBadge() {
    const forma = this.container.querySelector('#forma-pago')?.value ?? '';
    const cfg = PAGO_BADGE_CFG[forma] ?? PAGO_BADGE_CFG[''];
    const badge = this.container.querySelector('#pago-badge-inline');
    if (!badge) return;
    badge.className = `pago-badge ${cfg.cls}`;
    badge.textContent = cfg.label;
  }

  _updateFormaPago() {
    this._updateBadge();
    const forma = this.container.querySelector('#forma-pago')?.value ?? '';
    const isContado = forma === 'CONTADO_B2B' || forma === 'CONTADO';
    const cupoInput = this.container.querySelector('#cupo-credito');
    const cupoLabel = this.container.querySelector('label[for="cupo-credito"]');
    const errCupo = this.container.querySelector('#err-cupo-credito');
    if (!cupoInput) return;
    if (isContado) {
      cupoInput.disabled = true;
      cupoInput.value = '';
      cupoInput.placeholder = 'N/A — Pago Contado';
      if (cupoLabel) cupoLabel.textContent = 'Cupo Crédito (COP)';
      if (errCupo) errCupo.classList.add('hidden');
    } else {
      cupoInput.disabled = false;
      cupoInput.placeholder = '0';
      if (cupoLabel) cupoLabel.textContent = 'Cupo Crédito (COP) *';
    }
  }

  async _handleSubmit(e) {
    e.preventDefault();

    const get = (sel) => this.container.querySelector(sel)?.value?.trim() ?? '';

    const razon_social = get('#razon-social');
    const nit = get('#nit');
    const cedula = get('#cedula');
    const celular = get('#celular');
    const correo = get('#correo');
    const barrio = get('#barrio');
    const ciudad = get('#ciudad');
    const contacto = get('#contacto');
    const forma_pago = get('#forma-pago');
    const fecha_cumpleanos = this._birthdayPicker?.getValue() ?? '';
    const horarios_atencion = this._horarioBuilder?.getValue() ?? '';

    const addressData = {
      type: get('#addr-type') || 'CALLE',
      main: normalizeAddressToken(get('#addr-main')),
      cross: normalizeAddressToken(get('#addr-cross')),
      suffix: normalizeAddressToken(get('#addr-suffix')),
      complement: normalizeAddressComplement(get('#addr-comp')),
    };
    const isEdit = !!this._editCliente;
    let direccion = buildAddress(addressData);
    if (
      isEdit &&
      direccion === null &&
      !addressData.main &&
      !addressData.cross &&
      !addressData.suffix
    ) {
      const legacyAddress = String(this._editCliente?.direccion ?? '').trim();
      if (legacyAddress) direccion = legacyAddress;
    }

    const cupo_credito_input = parseCopAmount(get('#cupo-credito'));
    const compra_minima_input = parseCopAmount(get('#compra-minima'));
    const cupo_credito = cupo_credito_input > 0
      ? cupo_credito_input
      : (isEdit ? Number(this._editCliente?.cupo_credito ?? 0) : 0);
    const compra_minima = compra_minima_input > 0
      ? compra_minima_input
      : (isEdit ? Number(this._editCliente?.compra_minima ?? 0) : 0);

    if (!razon_social) {
      window.__mg_feedback?.warn('La Razón Social es obligatoria.');
      return;
    }
    if (!nit && !cedula) {
      window.__mg_feedback?.warn('Debe ingresar al menos NIT o Cédula.');
      return;
    }
    if (!forma_pago) {
      window.__mg_feedback?.warn('Debe definir la Forma de Pago del cliente.');
      return;
    }
    if (direccion === null) {
      window.__mg_feedback?.warn('Dirección incompleta.');
      return;
    }
    const isContadoFormaPago = forma_pago === 'CONTADO_B2B' || forma_pago === 'CONTADO';
    if (!isEdit && !isContadoFormaPago && cupo_credito <= 0) {
      window.__mg_feedback?.warn('Cupo Crédito debe ser mayor a cero.');
      return;
    }
    if (!isEdit && compra_minima <= 0) {
      window.__mg_feedback?.warn('Compra Mínima debe ser mayor a cero.');
      return;
    }

    const btn = this.container.querySelector('#btn-submit');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      const data = {
        razon_social,
        nit,
        cedula,
        celular,
        correo,
        direccion,
        barrio,
        ciudad,
        fecha_cumpleanos,
        contacto,
        forma_pago,
        cupo_credito,
        compra_minima,
        horarios_atencion,
      };

      if (isEdit) {
        if (!this._editCliente?.id) {
          window.__mg_feedback?.error('ID de cliente requerido para editar.');
          return;
        }
        await handleUpdateCliente(this._editCliente.id, data);
        this._saved = true;
        window.__mg_feedback?.success('Cliente actualizado correctamente.');
        setTimeout(() => window.__erp_navigate?.('clientes'), 300);
      } else {
        await handleCreateCliente(data);
        this._saved = true;
        window.__mg_feedback?.success('Cliente creado correctamente.');
        setTimeout(() => window.__erp_navigate?.('clientes'), 300);
      }
    } catch (err) {
      window.__mg_feedback?.error(err.message || 'Error crítico al procesar cliente.');
    } finally {
      btn.disabled = false;
      btn.textContent = isEdit ? 'Actualizar Cliente' : 'Guardar Cliente';
    }
  }

  _validateCupoCompraInline() {
    const cupoInput = this.container.querySelector('#cupo-credito');
    const compraInput = this.container.querySelector('#compra-minima');
    const errCupo = this.container.querySelector('#err-cupo-credito');
    const errCompra = this.container.querySelector('#err-compra-minima');
    const forma = this.container.querySelector('#forma-pago')?.value ?? '';
    const isContado = forma === 'CONTADO_B2B' || forma === 'CONTADO';

    if (cupoInput && errCupo && !isContado) {
      const val = parseCopAmount(cupoInput.value);
      if (val <= 0) {
        errCupo.textContent = 'Debe ser mayor a cero';
        errCupo.classList.remove('hidden');
      } else {
        errCupo.classList.add('hidden');
      }
    }
    if (compraInput && errCompra) {
      const val = parseCopAmount(compraInput.value);
      if (val <= 0) {
        errCompra.textContent = 'Debe ser mayor a cero';
        errCompra.classList.remove('hidden');
      } else {
        errCompra.classList.add('hidden');
      }
    }
  }

  _showFeedback(_message, _type = 'success') {
    // Deprecated local inline feedback.
    // Messages are NOT removed.
    // All user-facing feedback must be routed through NIS global feedback:
    // window.__mg_feedback.warn / success / error.
  }
}
