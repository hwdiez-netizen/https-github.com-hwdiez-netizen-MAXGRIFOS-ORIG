import {
  handleGetPedidoCompleto,
  handleGetDocumentoByPedido,
  handleDespachar,
  handleRegistrarPOD,
  handleAnularPedido,
} from './handlers/index.js';
import { generarYDescargarPDF } from '../facturacion/pdf-generator.js';
import QRCode from 'qrcode';

const ESTADO_CFG = {
  creacion:   { label: 'CREADO',      cls: 'estado-creado',     icon: '🆕' },
  edicion:    { label: 'CREADO',      cls: 'estado-creado',     icon: '🆕' },
  creado:     { label: 'CREADO',      cls: 'estado-creado',     icon: '🆕' },
  picking:    { label: 'PICKING',     cls: 'estado-picking',    icon: '🔍' },
  packing:    { label: 'PACKING',     cls: 'estado-packing',    icon: '📦' },
  facturado:  { label: 'FACTURADO',   cls: 'estado-facturado',  icon: '🧾' },
  remisionado:{ label: 'REMISIONADO', cls: 'estado-remisionado',icon: '📋' },
  despacho:   { label: 'EN DESPACHO', cls: 'estado-despacho',   icon: '🚚' },
  pod:        { label: 'ENTREGADO',   cls: 'estado-pod',        icon: '✅' },
  anulado:    { label: 'ANULADO',     cls: 'estado-anulado',    icon: '❌' },
  standby:    { label: 'EN EDICIÓN',  cls: 'estado-creado',     icon: '🆕' },
  cancelado:  { label: 'CANCELADO',   cls: 'estado-anulado',    icon: '🚫' },
};

function fmtDate(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export class PedidoDetail {
  constructor(container, pedidoId) {
    this.container = container;
    this._pedidoId = pedidoId;
    this._data = null;
    this._doc = null;
  }

  async mount() {
    this.container.innerHTML = `<div class="loading">Cargando pedido...</div>`;
    this._data = await handleGetPedidoCompleto(this._pedidoId);
    if (!this._data) {
      this.container.innerHTML = `<div class="form-error">Pedido no encontrado.</div>`;
      return;
    }

    if (this._data.pedido.documento_id) {
      this._doc = await handleGetDocumentoByPedido(this._pedidoId);
    } else {
      this._doc = null;
    }

    this._render();
    await this._renderQR();
  }

  unmount() {}

  _render() {
    const { pedido, items, log } = this._data;
    const cfg = ESTADO_CFG[pedido.estado] ?? ESTADO_CFG.creado;
    const total = items.reduce((s, i) => s + (i.cantidad_picking * i.precio_unitario), 0);

    this.container.innerHTML = `
      <div class="list-container">
        <button type="button" class="btn-back" id="btn-back">← Pedidos</button>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <h2 style="margin:0">${pedido.consecutivo}</h2>
          <span class="ped-estado-badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
        </div>

        ${this._checkpointTimeline(pedido, log)}

        <div class="product-detail-card" style="margin-bottom:16px">
          <div class="detail-row"><span class="detail-label">Cliente</span><span class="detail-value">${pedido.cliente_nombre}</span></div>
          ${pedido.cliente_nit ? `<div class="detail-row"><span class="detail-label">NIT</span><span class="detail-value">${pedido.cliente_nit}</span></div>` : ''}
          <div class="detail-row"><span class="detail-label">Creado</span><span class="detail-value">${fmtDate(pedido.created_at)}</span></div>
          ${pedido.observacion ? `<div class="detail-row"><span class="detail-label">Notas</span><span class="detail-value">${pedido.observacion}</span></div>` : ''}
        </div>

        <table class="ped-table" style="margin-bottom:16px">
          <thead><tr><th>SKU</th><th>Descripcion</th><th>Ped.</th><th>Pick.</th><th>Subtotal</th></tr></thead>
          <tbody>
            ${items.map((it) => `
              <tr>
                <td class="ped-sku">${it.product_sku}</td>
                <td>${it.product_name}</td>
                <td>${it.cantidad_pedida}</td>
                <td class="${it.cantidad_picking < it.cantidad_pedida ? 'pick-diff-neg' : ''}">${it.cantidad_picking}</td>
                <td>$${(it.cantidad_picking * it.precio_unitario).toLocaleString('es-CO')}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="4" style="text-align:right;font-weight:600">Total:</td>
            <td style="font-weight:700;color:var(--primary)">$${total.toLocaleString('es-CO')}</td></tr></tfoot>
        </table>

        <div class="qr-section" style="margin-bottom:16px">
          <div class="qr-section-title">QR de Trazabilidad del Pedido</div>
          <div class="qr-container"><canvas id="ped-qr-canvas"></canvas></div>
          <div class="qr-code-text" style="font-size:11px">${pedido.qr_code}</div>
        </div>

        ${this._doc ? this._docSection() : ''}

        <div class="detail-actions" id="ped-acciones">
          ${this._accionesPorEstado(pedido.estado)}
        </div>

        <details style="margin-top:20px">
          <summary style="cursor:pointer;font-size:13px;color:var(--text-secondary)">🕐 Historial de la saga</summary>
          <div style="margin-top:8px">
            ${log.map((e) => `<div class="saga-log-entry"><span class="saga-log-fase">${e.fase}</span><span class="saga-log-ts">${fmtDate(e.created_at)}</span></div>`).join('')}
          </div>
        </details>
      </div>`;

    this._bindEvents();
  }

  _checkpointTimeline(pedido, log) {
    const getLogTs = (fase) => log.find((e) => e.fase === fase)?.created_at ?? null;

    const past = new Set(['packing', 'facturado', 'remisionado', 'despacho', 'pod']);
    const pastFact = new Set(['facturado', 'remisionado', 'despacho', 'pod']);

    const checkpoints = [
      {
        label: 'CREADO', icon: '🆕',
        done: true, active: false,
        ts: pedido.created_at,
      },
      {
        label: 'PICKING', icon: '🔍',
        done: past.has(pedido.estado),
        active: pedido.estado === 'picking',
        ts: getLogTs('PICKING_COMPLETADO'),
      },
      {
        label: 'PACKING', icon: '📦',
        done: pastFact.has(pedido.estado),
        active: pedido.estado === 'packing',
        ts: getLogTs('PACKING_INICIADO'),
      },
      {
        label: 'FACTURADO', icon: '🧾',
        done: pastFact.has(pedido.estado),
        active: false,
        ts: getLogTs('DOCUMENTO_EMITIDO'),
      },
    ];

    return `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:16px">
        ${checkpoints.map((cp) => {
          const clr   = cp.done ? '#15803d' : cp.active ? '#2563eb' : '#9ca3af';
          const bg    = cp.done ? '#f0fdf4'  : cp.active ? '#eff6ff'  : '#f9fafb';
          const bd    = cp.done ? '#86efac'  : cp.active ? '#93c5fd'  : '#e5e7eb';
          const dotBg = cp.done ? '#15803d'  : cp.active ? '#2563eb'  : '#e5e7eb';
          const mark  = cp.done ? '✓' : cp.active ? '…' : '○';
          const sub   = cp.done && cp.ts
            ? fmtDate(cp.ts)
            : cp.active ? 'En proceso' : '—';
          return `
            <div style="background:${bg};border:1.5px solid ${bd};border-radius:8px;
                        padding:8px 6px;text-align:center">
              <div style="width:24px;height:24px;border-radius:50%;background:${dotBg};
                          color:#fff;display:flex;align-items:center;justify-content:center;
                          margin:0 auto 4px;font-size:13px;font-weight:700">
                ${mark}
              </div>
              <div style="font-weight:700;font-size:11px;color:${clr};margin-bottom:2px">
                ${cp.icon} ${cp.label}
              </div>
              <div style="font-size:10px;color:${clr};opacity:.8;word-break:break-word">
                ${sub}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  _docSection() {
    const d = this._doc;
    return `<div class="doc-card">
      <div class="doc-card-header">${d.tipo === 'FAC' ? '🧾 Factura' : '📋 Remision'} — ${d.consecutivo}</div>
      <div class="product-meta"><span>Emitido: ${fmtDate(d.emitido_at)}</span><span>Estado: ${d.estado}</span></div>
      <button class="btn-secondary" id="btn-reimprimir" style="margin-top:8px;width:100%">🖨️ Reimprimir / Descargar PDF</button>
    </div>`;
  }

  _accionesPorEstado(estado) {
    const btnCancelar = `<button class="btn-danger" id="btn-cancelar-pedido" style="flex:1">🚫 Cancelar</button>`;

    if (estado === 'creado' || estado === 'creacion' || estado === 'edicion') {
      return `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn-secondary" id="btn-editar-pedido" style="flex:1">✏️ Editar</button>
          ${btnCancelar}
        </div>
        <button class="btn-primary" id="btn-picking" style="width:100%">🔍 Ir a Picking</button>
      `;
    }

    if (estado === 'picking') {
      return `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn-secondary" id="btn-editar-pedido" style="flex:1">✏️ Editar</button>
          ${btnCancelar}
        </div>
        <button class="btn-primary" id="btn-picking" style="width:100%">🔍 Ir a Picking</button>
      `;
    }

    if (estado === 'packing') {
      return `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn-secondary" id="btn-editar-pedido" style="flex:1">✏️ Editar</button>
          ${btnCancelar}
        </div>
        <button class="btn-primary" id="btn-packing" style="width:100%">📦 Ir a Packing / Emitir Documento</button>
      `;
    }

    if (estado === 'standby') {
      return `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn-secondary" id="btn-editar-pedido" style="flex:1">✏️ Editar</button>
          ${btnCancelar}
        </div>
        <button class="btn-primary" id="btn-picking" style="width:100%">▶️ Continuar Pedido</button>
      `;
    }

    if (estado === 'facturado' || estado === 'remisionado') {
      return `<button class="btn-primary" id="btn-despacho" style="width:100%">🚚 Marcar como Despachado</button>`;
    }

    if (estado === 'despacho') {
      return `<button class="btn-primary" id="btn-pod" style="width:100%">✅ Registrar Entrega (POD)</button>`;
    }

    return '';
  }

  async _renderQR() {
    const canvas = this.container.querySelector('#ped-qr-canvas');
    if (!canvas || !this._data?.pedido?.qr_code) return;
    try {
      await QRCode.toCanvas(canvas, this._data.pedido.qr_code, {
        width: 180,
        margin: 2,
        color: { dark: '#111827', light: '#ffffff' },
      });
    } catch {
      // noop
    }
  }

  _bindEvents() {
    this.container.querySelector('#btn-back')?.addEventListener('click', () => navigate('pedidos'));

    this.container.querySelector('#btn-editar-pedido')?.addEventListener('click', () => {
      navigate('pedido-form', { pedidoId: this._pedidoId, mode: 'edit' });
    });

    this.container.querySelector('#btn-eliminar-pedido')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar pedido ${this._data.pedido.consecutivo}?\nSe anulara y se revertira la reserva de stock.`)) return;
      await handleAnularPedido(this._pedidoId, 'Eliminado por usuario');
      navigate('pedidos');
    });

    this.container.querySelector('#btn-cancelar-pedido')?.addEventListener('click', async () => {
      const pedido = this._data.pedido;
      if (pedido.estado === 'anulado' || pedido.estado === 'cancelado') {
        alert('Este pedido ya fue anulado anteriormente.');
        return;
      }
      const { items } = this._data;
      const lineas = items
        .filter((it) => Number(it.cantidad_pedida) > 0)
        .map((it) => `• ${it.product_sku}: ${it.cantidad_pedida} unid`)
        .join('\n');
      const msg = `¿Cancelar pedido ${pedido.consecutivo}?\n\nStock a devolver a Bodega Central:\n${lineas || '(sin ítems)'}\n\nEsta acción no se puede deshacer.`;
      if (!confirm(msg)) return;
      try {
        await handleAnularPedido(this._pedidoId, 'Cancelado por usuario');
        alert(`Pedido ${pedido.consecutivo} cancelado. Stock devuelto a Bodega Central.`);
        navigate('pedidos');
      } catch (err) {
        alert(`Error al cancelar: ${err.message}`);
      }
    });

    this.container.querySelector('#btn-picking')?.addEventListener('click', () => {
      navigate('picking-form', { pedidoId: this._pedidoId });
    });

    this.container.querySelector('#btn-packing')?.addEventListener('click', () => {
      navigate('packing-form', { pedidoId: this._pedidoId });
    });

    this.container.querySelector('#btn-despacho')?.addEventListener('click', async () => {
      if (!confirm('¿Confirmar despacho del pedido?')) return;
      await handleDespachar(this._pedidoId);
      await this.mount();
    });

    this.container.querySelector('#btn-pod')?.addEventListener('click', async () => {
      if (!confirm('¿Confirmar entrega al cliente (POD)?\nEsta accion cerrara definitivamente el pedido y descargara el inventario.')) return;
      await handleRegistrarPOD(this._pedidoId);
      await this.mount();
    });

    this.container.querySelector('#btn-reimprimir')?.addEventListener('click', async () => {
      const { items } = this._data;
      await generarYDescargarPDF(this._doc, items, true);
    });
  }
}

function navigate(view, opts = {}) {
  window.__erp_navigate?.(view, opts);
}
