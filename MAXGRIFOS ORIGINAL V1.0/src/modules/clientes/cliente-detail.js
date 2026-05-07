import QRCode from 'qrcode';
import { handleDeactivateCliente, handleActivateCliente } from './handlers/index.js';
import { queryClienteById } from './cliente-query.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { applyClientesNisPhase1Overlay, bindSwipeRightToBack } from './cliente-nis-phase1-overlay.js';

const PAGO_LABELS = {
  '':               'SIN DEFINIR',
  CONTADO:          'CONTADO',
  CONTADO_B2B:      'CONTADO B2B',
  CREDITO_15:       'CREDITO 15 DIAS',
  CREDITO_30:       'CREDITO 30 DIAS',
  CREDITO_45:       'CREDITO 45 DIAS',
  B2C_REDES:        'B2C REDES SOCIALES',
  B2C_CONSTRUCTOR:  'B2C CONSTRUCTOR',
  B2C_PROYECTO:     'B2C CONSTRUCTOR PROYECTO',
};

const PAGO_BADGE_CFG = {
  '':               'pago-pendiente',
  CONTADO:          'pago-contado',
  CONTADO_B2B:      'pago-contado',
  CREDITO_15:       'pago-credito15',
  CREDITO_30:       'pago-credito30',
  CREDITO_45:       'pago-credito45',
  B2C_REDES:        'pago-b2c',
  B2C_CONSTRUCTOR:  'pago-b2c',
  B2C_PROYECTO:     'pago-b2c',
};

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatCop(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  return `$${Math.trunc(amount).toLocaleString('es-CO')}`;
}

function formatBirthday(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';

  const parts = raw.split('-').map((p) => p.trim());
  let day = '';
  let month = '';

  if (parts.length === 3) {
    // Legacy YYYY-MM-DD
    month = parts[1];
    day = parts[2];
  } else if (parts.length === 2) {
    // Current MM-DD
    month = parts[0];
    day = parts[1];
  } else {
    return '—';
  }

  const dayNum = Number.parseInt(day, 10);
  const monthNum = Number.parseInt(month, 10);
  if (!Number.isFinite(dayNum) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return '—';
  return `${dayNum} ${MESES_CORTOS[monthNum - 1]}`;
}

export class ClienteDetail {
  constructor(container, cliente) {
    this.container = container;
    this._cliente = cliente;
    this._swipeCleanup = null;
  }

  async mount() {
    applyClientesNisPhase1Overlay(this.container);
    // Always reload from DB to get latest data.
    const fresh = await queryClienteById(this._cliente.id);
    if (fresh) this._cliente = fresh;
    this._render();
    await this._renderQR();
    this._bindSwipe();
  }

  unmount() {
    this._swipeCleanup?.();
    this._swipeCleanup = null;
  }

  _render() {
    const c = this._cliente;
    const isActive = c.status === 'active' || !c.status;
    const pagoKey = c.forma_pago ?? '';
    const pagoCls = PAGO_BADGE_CFG[pagoKey] ?? 'pago-pendiente';
    const pagoLabel = (PAGO_LABELS[pagoKey] ?? pagoKey) || 'SIN DEFINIR';

    this.container.innerHTML = `
      <div class="list-container mg-premium-flow module-clientes">
        <button type="button" class="btn-back" id="btn-back">← Volver</button>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px">
          <h2 style="margin-bottom:0">${c.razon_social}</h2>
          <span class="pago-badge ${pagoCls}">${pagoLabel}</span>
        </div>

        <div class="product-detail-card" style="margin-bottom:20px">
          ${this._row('NIT', c.nit || '—')}
          ${this._row('Cedula', c.cedula || '—')}
          ${this._row('Celular', c.celular || '—')}
          ${this._row('Correo', c.correo || '—')}
          ${this._row('Direccion', c.direccion || '—')}
          ${this._row('Barrio / Sector', c.barrio || '—')}
          ${this._row('Ciudad', c.ciudad || '—')}
          ${this._row('Fecha Cumpleanos', formatBirthday(c.fecha_cumpleanos))}
          ${this._row('Contacto', c.contacto || '—')}
          ${this._row('Cupo Credito', formatCop(c.cupo_credito))}
          ${this._row('Compra Minima', formatCop(c.compra_minima))}
          ${this._row('Horarios', c.horarios_atencion || '—')}
          ${this._row('Estado', `<span class="badge ${isActive ? 'status-active' : 'status-inactive'}">${isActive ? 'Activo' : 'Inactivo'}</span>`)}
        </div>

        <div class="qr-section">
          <div class="qr-section-title">Codigo QR del Cliente</div>
          <div class="qr-container">
            <canvas id="qr-canvas"></canvas>
          </div>
          <div class="qr-code-text">${c.qr_code ?? '—'}</div>
          <button class="btn-secondary" id="btn-download-qr" style="margin-top:12px">
            Descargar QR como PNG
          </button>
        </div>

        <div class="detail-actions" style="margin-top:20px">
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <button class="btn-secondary" id="btn-crear-pedido" style="flex:1;padding:12px">
              🛒 Crear Pedido
            </button>
            <button class="btn-secondary" id="btn-ver-pedidos" style="flex:1;padding:12px">
              📋 Ver Pedidos
            </button>
          </div>
          <button class="btn-primary" id="btn-edit" style="margin-bottom:8px">Editar Cliente</button>
          ${isActive
            ? `<button class="btn-action btn-deactivate" id="btn-toggle" style="width:100%;padding:12px">Desactivar Cliente</button>`
            : `<button class="btn-action btn-activate" id="btn-toggle" style="width:100%;padding:12px">Activar Cliente</button>`
          }
        </div>
      </div>`;

    this._bindEvents();
  }

  _row(label, value) {
    return `
      <div class="detail-row">
        <span class="detail-label">${label}</span>
        <span class="detail-value">${value}</span>
      </div>`;
  }

  async _renderQR() {
    const canvas = this.container.querySelector('#qr-canvas');
    if (!canvas || !this._cliente.qr_code) return;
    try {
      await QRCode.toCanvas(canvas, this._cliente.qr_code, {
        width: 200,
        margin: 2,
        color: { dark: '#111827', light: '#ffffff' },
      });
    } catch (err) {
      console.error('QR render error:', err);
    }
  }

  _showPedidosBlockedNotice() {
    const message = 'Pedidos no está conectado en esta microfase.';
    if (window.showNisToast) {
      window.showNisToast(message);
    } else {
      window.alert(message);
    }
    console.warn('[Clientes][NavScope] Navegación a Pedidos bloqueada en esta microfase.');
  }

  _bindEvents() {
    this.container.querySelector('#btn-back')
      ?.addEventListener('click', () => window.__erp_navigate?.('clientes'));

    this.container.querySelector('#btn-crear-pedido')
      ?.addEventListener('click', () => {
        this._showPedidosBlockedNotice();
      });

    this.container.querySelector('#btn-ver-pedidos')
      ?.addEventListener('click', () => {
        this._showPedidosBlockedNotice();
      });

    this.container.querySelector('#btn-edit')
      ?.addEventListener('click', () => {
        if (!confirm(`Editar cliente ${this._cliente.razon_social}?\nPodras guardar o cancelar cambios en el formulario.`)) return;
        eventBus.emit(Events.EDIT_CLIENTE, this._cliente);
      });

    this.container.querySelector('#btn-toggle')
      ?.addEventListener('click', () => this._handleToggle());

    this.container.querySelector('#btn-download-qr')
      ?.addEventListener('click', () => this._downloadQR());
  }

  _bindSwipe() {
    this._swipeCleanup?.();
    const swipeSurface = this.container.querySelector('.list-container') ?? this.container;
    this._swipeCleanup = bindSwipeRightToBack(swipeSurface, () => {
      window.__erp_navigate?.('clientes');
    });
  }

  async _handleToggle() {
    const c = this._cliente;
    const isActive = c.status === 'active' || !c.status;
    if (isActive) {
      if (!confirm(`Desactivar a ${c.razon_social}?\nEl cliente quedara inactivo pero no sera eliminado.`)) return;
      this._cliente = await handleDeactivateCliente(c.id);
    } else {
      this._cliente = await handleActivateCliente(c.id);
    }
    this._render();
    await this._renderQR();
  }

  _downloadQR() {
    const canvas = this.container.querySelector('#qr-canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `QR-${this._cliente.cedula || this._cliente.id}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}
