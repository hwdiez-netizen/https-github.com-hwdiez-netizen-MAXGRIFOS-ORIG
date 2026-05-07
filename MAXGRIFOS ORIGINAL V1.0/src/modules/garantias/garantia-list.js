import { getGarantias, ESTADOS_GARANTIA, ESTADO_LABEL } from './garantia-store.js';
import { getClientes } from '../clientes/cliente-store.js';
import { getAllProveedores } from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { getSaldoByProduct } from '../kardex/kardex-store.js';
import { handleTransicionarGarantia, handleRegistrarGarantia, handleRegistrarNcGarantia } from './handlers/index.js';
import { getProducts } from '../maestro-productos/product-store.js';
import { BODEGA_CENTRAL_ID } from '../kardex/bodega-store.js';

const ESTADO_BADGE = {
  RECIBIDA:          'badge-recibida',
  EN_REVISION:       'badge-en-revision',
  ENVIADA_PROVEEDOR: 'badge-enviada',
  APROBADA:          'badge-aprobada',
  RECHAZADA:         'badge-rechazada',
  CERRADA:           'badge-cerrada',
};

function formatCOP(value) {
  const n = Number(value ?? 0);
  if (!n) return '—';
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const TRANSICIONES_LABEL = {
  EN_REVISION:       'En revisión',
  ENVIADA_PROVEEDOR: 'Enviada a proveedor',
  APROBADA:          'Aprobada',
  RECHAZADA:         'Rechazada',
  CERRADA:           'Cerrada',
};

export class GarantiaList {
  constructor(container) {
    this.container = container;
    this._garantias = [];
    this._clientes = [];
    this._proveedores = [];
    this._products = [];
    this._filtroEstado = '';
    this._filtroBusqueda = '';
    this._unsub = null;
    this._selectedId = null;
    this._formPanel = null;   // null | 'nueva' | 'nc'
    this._ncGarantia = null;  // garantia selected for NC flow
  }

  canUnmount() {
    if (this._formPanel) {
      this._formPanel = null;
      this._ncGarantia = null;
      this._render();
      this._bindEvents();
      return false;
    }
    return true;
  }

  unmount() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  async mount() {
    [this._garantias, this._clientes, this._proveedores, this._products] = await Promise.all([
      getGarantias(),
      getClientes(),
      getAllProveedores().catch(() => []),
      getProducts().catch(() => []),
    ]);
    this._applyScannedCodeFromSession();
    this._render();
    this._bindEvents();
    this._listenDomain();
  }

  _applyScannedCodeFromSession() {
    const scanned = String(sessionStorage.getItem('garantias_scanned_code') ?? '').trim();
    if (!scanned) return;
    sessionStorage.removeItem('garantias_scanned_code');
    this._filtroBusqueda = scanned;
    this._formPanel = 'nueva';
  }

  _clienteLabel(id) {
    const c = this._clientes.find((x) => x.id === id);
    return c ? (c.razon_social ?? c.nombre ?? id) : (id ?? '—');
  }

  _proveedorLabel(id) {
    const p = this._proveedores.find((x) => x.id === id);
    return p ? (p.razon_social ?? p.nombre ?? id) : (id ? id : '—');
  }

  _garantiasFiltradas() {
    let base = this._garantias;
    if (this._filtroEstado) {
      base = base.filter((g) => g.estado === this._filtroEstado);
    }

    const query = String(this._filtroBusqueda ?? '').trim().toLowerCase();
    if (!query) return base;

    const matchedByCode128 = this._getProductIdsByCode128(query);
    return base.filter((g) => {
      const text = [
        g.product_sku,
        g.product_name,
        g.referencia,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');

      if (text.includes(query)) return true;
      return matchedByCode128.has(String(g.product_id ?? ''));
    });
  }

  _getProductIdsByCode128(query) {
    const matches = new Set();
    for (const p of this._products) {
      const fields = [
        p?.sku,
        p?.ref_proveedor,
        p?.barcode,
        p?.codigo_barras,
        p?.code128,
        p?.ean,
        p?.upc,
      ].map((v) => String(v ?? '').trim().toLowerCase()).filter(Boolean);
      if (fields.includes(query) && p?.id) {
        matches.add(String(p.id));
      }
    }
    return matches;
  }

  _render() {
    const filtradas = this._garantiasFiltradas();
    const totalCosto = filtradas.reduce((acc, g) => acc + (Number(g.costo_unitario ?? 0) * Number(g.cantidad ?? 1)), 0);

    const countByEstado = {};
    for (const e of ESTADOS_GARANTIA) {
      countByEstado[e] = this._garantias.filter((g) => g.estado === e).length;
    }

    this.container.innerHTML = `
      <div class="form-container">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <h2 style="margin:0;flex:1;min-width:120px">Garantías Postventa</h2>
          <span style="font-size:12px;color:#6b7280">${filtradas.length} registro(s)</span>
          <button type="button" id="btn-nueva-garantia" class="btn-primary"
            style="font-size:13px;padding:8px 14px;white-space:nowrap">
            + Nueva Garantía
          </button>
        </div>

        <div class="gar-kpi-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          ${ESTADOS_GARANTIA.map((e) => `
            <button type="button" class="gar-kpi-btn ${this._filtroEstado === e ? 'gar-kpi-active' : ''}"
              data-estado="${e}"
              style="border:1.5px solid #d1d5db;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;background:${this._filtroEstado === e ? '#1e3a5f' : '#fff'};color:${this._filtroEstado === e ? '#fff' : '#374151'}">
              <span class="gar-kpi-count" style="font-weight:700;font-size:14px">${countByEstado[e]}</span>
              <span style="display:block;font-size:10px">${ESTADO_LABEL[e]}</span>
            </button>`).join('')}
          ${this._filtroEstado ? `<button type="button" id="btn-clear-filtro"
            style="border:1.5px dashed #9ca3af;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;background:#f9fafb;color:#6b7280">
            ✕ Ver todas
          </button>` : ''}
        </div>

        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
          <input
            type="search"
            id="gar-busqueda"
            value="${this._filtroBusqueda.replace(/"/g, '&quot;')}"
            placeholder="Buscar por SKU, nombre, referencia o Code128"
            autocomplete="off"
            style="flex:1;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box"
          />
          <button
            type="button"
            id="btn-gar-scan"
            class="btn-secondary"
            style="white-space:nowrap;padding:9px 12px;font-size:12px"
          >📷 Escanear Code128</button>
        </div>

        ${totalCosto > 0 ? `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:13px;color:#92400e">
          Costo total en garantías activas: <strong>${formatCOP(totalCosto)}</strong>
        </div>` : ''}

        <!-- Panel inline: Nueva Garantía o NC Proveedor -->
        <div id="gar-inline-panel" class="${this._formPanel ? '' : 'hidden'}">
          ${this._formPanel === 'nueva' ? this._nuevaGarantiaFormHtml() : ''}
          ${this._formPanel === 'nc' && this._ncGarantia ? this._ncFormHtml(this._ncGarantia) : ''}
        </div>

        <div id="gar-detail-panel" class="hidden"></div>

        <div class="gar-table-wrap" style="overflow-x:auto">
          ${filtradas.length === 0 ? `
            <div style="text-align:center;padding:40px;color:#9ca3af;font-size:14px">
              ${this._filtroEstado ? `No hay garantías en estado "${ESTADO_LABEL[this._filtroEstado]}"` : 'No hay garantías registradas.<br><small>Use "+ Nueva Garantía" para registrar una.</small>'}
            </div>` : `
          <table class="gar-table" style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f3f4f6;text-align:left">
                <th style="padding:8px 10px;font-weight:600;color:#374151">Fecha</th>
                <th style="padding:8px 10px;font-weight:600;color:#374151">SKU / Producto</th>
                <th style="padding:8px 10px;font-weight:600;color:#374151">Cliente</th>
                <th style="padding:8px 10px;font-weight:600;color:#374151">Causal</th>
                <th style="padding:8px 10px;font-weight:600;color:#374151">Proveedor</th>
                <th style="padding:8px 10px;font-weight:600;color:#374151">Costo</th>
                <th style="padding:8px 10px;font-weight:600;color:#374151">Estado</th>
                <th style="padding:8px 10px;font-weight:600;color:#374151"></th>
              </tr>
            </thead>
            <tbody>
              ${filtradas.map((g) => this._rowHtml(g)).join('')}
            </tbody>
          </table>`}
        </div>
      </div>`;
  }

  // ── Inline form: Nueva Garantía ────────────────────────────────────────────
  _nuevaGarantiaFormHtml() {
    const productoOpts = this._products
      .filter((p) => p.status !== 'inactive')
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
      .map((p) => `<option value="${p.id}">${p.sku} — ${p.nombre}</option>`)
      .join('');

    const clienteOpts = this._clientes
      .filter((c) => c.status !== 'inactive')
      .sort((a, b) => (a.razon_social ?? a.nombre ?? '').localeCompare(b.razon_social ?? b.nombre ?? ''))
      .map((c) => `<option value="${c.id}">${c.razon_social ?? c.nombre}</option>`)
      .join('');

    return `
      <div style="border:1.5px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:14px;background:#f0f9ff">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <strong style="font-size:14px;color:#1e40af">Nueva Garantía — Central → Bodega Garantías</strong>
          <button type="button" id="btn-cancel-nueva"
            style="border:none;background:none;cursor:pointer;color:#6b7280;font-size:18px">×</button>
        </div>
        <form id="gar-nueva-form" novalidate>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field-group" style="grid-column:1/-1">
              <label for="gn-producto" style="font-size:12px;font-weight:600">Producto *</label>
              <select id="gn-producto" required
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
                <option value="">— Seleccionar producto —</option>
                ${productoOpts}
              </select>
              <div id="gn-saldo-info" style="font-size:11px;color:#6b7280;margin-top:3px;display:none"></div>
            </div>
            <div class="field-group" style="grid-column:1/-1">
              <label for="gn-cliente" style="font-size:12px;font-weight:600">Cliente *</label>
              <select id="gn-cliente" required
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
                <option value="">— Seleccionar cliente —</option>
                ${clienteOpts}
              </select>
            </div>
            <div class="field-group">
              <label for="gn-cantidad" style="font-size:12px;font-weight:600">Cantidad *</label>
              <input type="number" id="gn-cantidad" min="1" step="1" required inputmode="numeric"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
            </div>
            <div class="field-group">
              <label for="gn-costo" style="font-size:12px">Costo Unitario (COP)</label>
              <input type="text" id="gn-costo" inputmode="numeric" placeholder="0" autocomplete="off"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
            </div>
            <div class="field-group">
              <label for="gn-motivo" style="font-size:12px">Causal / Motivo</label>
              <input type="text" id="gn-motivo" placeholder="Ej: DEFECTO DE FABRICA" autocapitalize="characters"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
            </div>
            <div class="field-group">
              <label for="gn-referencia" style="font-size:12px">Referencia (Nro. doc.)</label>
              <input type="text" id="gn-referencia" placeholder="Ej: FAC-2025-0045" autocapitalize="characters"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
            </div>
            <div class="field-group" style="grid-column:1/-1">
              <label for="gn-observacion" style="font-size:12px">Observación</label>
              <textarea id="gn-observacion" rows="2" placeholder="Descripción adicional…"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical;min-height:55px"></textarea>
            </div>
          </div>
          <div id="gar-nueva-error" style="color:#dc2626;font-size:12px;margin-top:6px;display:none"></div>
          <button type="submit" class="btn-primary" id="btn-submit-nueva"
            style="margin-top:10px;width:100%;padding:9px;font-size:13px">
            🔄 Registrar Garantía (Central → Garantías)
          </button>
        </form>
      </div>`;
  }

  // ── Inline form: NC Proveedor ──────────────────────────────────────────────
  _ncFormHtml(g) {
    const proveedorOpts = this._proveedores
      .filter((p) => p.status === 'active' || !p.status)
      .sort((a, b) => (a.razon_social ?? a.nombre ?? '').localeCompare(b.razon_social ?? b.nombre ?? ''))
      .map((p) => `<option value="${p.id}" ${g.proveedor_id === p.id ? 'selected' : ''}>${p.razon_social ?? p.nombre}</option>`)
      .join('');

    const today = new Date().toISOString().split('T')[0];

    return `
      <div style="border:1.5px solid #d1fae5;border-radius:8px;padding:16px;margin-bottom:14px;background:#f0fdf4">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <strong style="font-size:14px;color:#065f46">Nota Crédito Proveedor — Descarga Bodega Garantías</strong>
          <button type="button" id="btn-cancel-nc"
            style="border:none;background:none;cursor:pointer;color:#6b7280;font-size:18px">×</button>
        </div>
        <div style="background:#fff;border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:12px;color:#374151">
          <strong>Garantía seleccionada:</strong>
          ${g.product_sku} — ${g.product_name}
          &nbsp;|&nbsp; Cliente: ${this._clienteLabel(g.cliente_id)}
          &nbsp;|&nbsp; Cantidad disponible: ${g.cantidad}
        </div>
        <form id="gar-nc-form" novalidate>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field-group" style="grid-column:1/-1">
              <label for="nc-proveedor" style="font-size:12px;font-weight:600">Proveedor</label>
              <select id="nc-proveedor"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
                <option value="">— Sin asignar —</option>
                ${proveedorOpts}
              </select>
            </div>
            <div class="field-group">
              <label for="nc-referencia" style="font-size:12px;font-weight:600">N° Nota Crédito Proveedor *</label>
              <input type="text" id="nc-referencia" required placeholder="Ej: NC-PROV-2025-001"
                autocapitalize="characters"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
            </div>
            <div class="field-group">
              <label for="nc-fecha" style="font-size:12px">Fecha NC</label>
              <input type="date" id="nc-fecha" value="${today}"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
            </div>
            <div class="field-group">
              <label for="nc-valor" style="font-size:12px">Valor NC (COP)</label>
              <input type="text" id="nc-valor" inputmode="numeric" placeholder="0" autocomplete="off"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
            </div>
            <div class="field-group">
              <label for="nc-cantidad" style="font-size:12px;font-weight:600">Cantidad a descargar *</label>
              <input type="number" id="nc-cantidad" min="1" step="1" value="${g.cantidad}" required
                inputmode="numeric"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box">
            </div>
            <div class="field-group" style="grid-column:1/-1">
              <label for="nc-observacion" style="font-size:12px">Observación</label>
              <textarea id="nc-observacion" rows="2" placeholder="Notas de la NC…"
                style="width:100%;padding:7px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical;min-height:55px"></textarea>
            </div>
          </div>
          <div id="gar-nc-error" style="color:#dc2626;font-size:12px;margin-top:6px;display:none"></div>
          <button type="submit" class="btn-primary" id="btn-submit-nc"
            style="margin-top:10px;width:100%;padding:9px;font-size:13px;background:#065f46">
            📄 Registrar Descarga NC (Garantías → Cerrado)
          </button>
        </form>
      </div>`;
  }

  // ── Row HTML ───────────────────────────────────────────────────────────────
  _rowHtml(g) {
    const transiciones = this._getTransicionesValidas(g.estado);
    const acciones = transiciones.map((t) =>
      `<button type="button" class="gar-btn-transicion btn-secondary"
        data-id="${g.id}" data-estado="${t}"
        style="font-size:11px;padding:4px 8px;margin:2px 0;width:100%;text-align:left">
        → ${TRANSICIONES_LABEL[t] ?? t}
      </button>`
    ).join('');

    // NC button: show for ENVIADA_PROVEEDOR state (stock is in Bodega Garantías)
    const ncBtn = g.estado === 'ENVIADA_PROVEEDOR' ? `
      <button type="button" class="gar-btn-nc btn-primary"
        data-id="${g.id}"
        style="font-size:11px;padding:4px 8px;margin:2px 0;width:100%;text-align:left;background:#065f46;border:none;color:#fff;border-radius:4px;cursor:pointer">
        📄 Registrar NC
      </button>` : '';

    return `
      <tr class="gar-row ${this._selectedId === g.id ? 'gar-row-selected' : ''}"
        data-id="${g.id}"
        style="border-bottom:1px solid #f3f4f6;cursor:pointer;${this._selectedId === g.id ? 'background:#eff6ff' : ''}">
        <td style="padding:8px 10px;color:#6b7280;white-space:nowrap">${formatDate(g.created_at)}</td>
        <td style="padding:8px 10px">
          <span style="font-weight:600;color:#111827">${g.product_sku || '—'}</span>
          <span style="display:block;font-size:11px;color:#6b7280">${g.product_name || ''}</span>
        </td>
        <td style="padding:8px 10px;font-size:12px">${this._clienteLabel(g.cliente_id)}</td>
        <td style="padding:8px 10px;font-size:12px;color:#374151">${g.causal || '—'}</td>
        <td style="padding:8px 10px;font-size:12px">${this._proveedorLabel(g.proveedor_id)}</td>
        <td style="padding:8px 10px;font-size:12px;white-space:nowrap">${formatCOP(Number(g.costo_unitario ?? 0) * Number(g.cantidad ?? 1))}</td>
        <td style="padding:8px 10px">
          <span class="estado-badge ${ESTADO_BADGE[g.estado] ?? ''}"
            style="padding:3px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${_badgeBg(g.estado)};color:${_badgeFg(g.estado)}">
            ${ESTADO_LABEL[g.estado] ?? g.estado}
          </span>
        </td>
        <td style="padding:8px 10px;min-width:150px">
          ${acciones || ''}
          ${ncBtn}
          ${!acciones && !ncBtn ? '<span style="color:#d1d5db;font-size:11px">—</span>' : ''}
        </td>
      </tr>`;
  }

  _getTransicionesValidas(estado) {
    const map = {
      RECIBIDA:          ['EN_REVISION', 'RECHAZADA'],
      EN_REVISION:       ['ENVIADA_PROVEEDOR', 'RECHAZADA'],
      ENVIADA_PROVEEDOR: ['APROBADA', 'RECHAZADA'],
      APROBADA:          ['CERRADA'],
      RECHAZADA:         ['CERRADA'],
      CERRADA:           [],
    };
    return map[estado] ?? [];
  }

  _renderDetailPanel(g) {
    const panel = this.container.querySelector('#gar-detail-panel');
    if (!panel) return;

    const transiciones = this._getTransicionesValidas(g.estado);
    const proveedorOpts = this._proveedores
      .filter((p) => p.status === 'active' || !p.status)
      .map((p) => `<option value="${p.id}" ${g.proveedor_id === p.id ? 'selected' : ''}>${p.razon_social ?? p.nombre ?? p.id}</option>`)
      .join('');

    panel.innerHTML = `
      <div style="border:1.5px solid #dbeafe;border-radius:8px;padding:14px;margin-bottom:14px;background:#f0f9ff">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <strong style="font-size:14px;color:#1e40af">Garantía — ${g.product_sku} / ${g.product_name}</strong>
          <button type="button" id="btn-close-detail" style="border:none;background:none;cursor:pointer;color:#6b7280;font-size:18px">×</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:12px">
          <div><span style="color:#6b7280">Cliente:</span> <strong>${this._clienteLabel(g.cliente_id)}</strong></div>
          <div><span style="color:#6b7280">Estado:</span> <strong>${ESTADO_LABEL[g.estado]}</strong></div>
          <div><span style="color:#6b7280">Causal:</span> ${g.causal || '—'}</div>
          <div><span style="color:#6b7280">Cantidad:</span> ${g.cantidad}</div>
          <div><span style="color:#6b7280">Costo unitario:</span> ${formatCOP(g.costo_unitario)}</div>
          <div><span style="color:#6b7280">Fecha:</span> ${formatDate(g.created_at)}</div>
          <div><span style="color:#6b7280">Referencia:</span> ${g.referencia || '—'}</div>
          <div><span style="color:#6b7280">NC proveedor:</span> ${g.nc_referencia || '—'}</div>
        </div>
        ${transiciones.length > 0 ? `
        <div style="border-top:1px solid #bfdbfe;padding-top:10px">
          <div style="font-size:12px;font-weight:600;color:#1e3a5f;margin-bottom:8px">Cambiar estado:</div>
          ${transiciones.includes('ENVIADA_PROVEEDOR') ? `
          <div class="field-group" style="margin-bottom:8px">
            <label for="gar-proveedor-sel" style="font-size:12px">Proveedor (opcional)</label>
            <select id="gar-proveedor-sel" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px">
              <option value="">— Sin asignar —</option>
              ${proveedorOpts}
            </select>
          </div>` : ''}
          <div class="field-group" style="margin-bottom:8px">
            <label for="gar-nota-input" style="font-size:12px">Nota (opcional)</label>
            <input type="text" id="gar-nota-input" placeholder="Observación del cambio de estado…"
              style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;box-sizing:border-box">
          </div>
          <div id="gar-detail-error" class="form-error hidden" style="margin-bottom:8px"></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${transiciones.map((t) => `
              <button type="button" class="gar-btn-trans-detail ${t === 'RECHAZADA' ? 'btn-danger' : 'btn-primary'}"
                data-id="${g.id}" data-estado="${t}"
                style="font-size:12px;padding:7px 14px;${t === 'RECHAZADA' ? 'background:#dc2626;color:#fff;border:none;border-radius:6px' : ''}">
                → ${TRANSICIONES_LABEL[t] ?? t}
              </button>`).join('')}
          </div>
        </div>` : `<div style="color:#6b7280;font-size:12px">Estado final — sin más transiciones posibles.</div>`}
        ${g.historial_estados?.length > 1 ? `
        <div style="border-top:1px solid #bfdbfe;padding-top:10px;margin-top:10px">
          <div style="font-size:12px;font-weight:600;color:#1e3a5f;margin-bottom:6px">Historial:</div>
          ${g.historial_estados.map((h) => `
            <div style="font-size:11px;color:#374151;margin-bottom:3px">
              <span style="color:#6b7280">${formatDate(h.fecha)}</span>
              → <strong>${ESTADO_LABEL[h.estado] ?? h.estado}</strong>
              ${h.nota ? `— ${h.nota}` : ''}
            </div>`).join('')}
        </div>` : ''}
      </div>`;

    panel.classList.remove('hidden');

    panel.querySelector('#btn-close-detail')?.addEventListener('click', () => {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      this._selectedId = null;
      this._refreshRows();
    });

    panel.querySelectorAll('.gar-btn-trans-detail').forEach((btn) => {
      btn.addEventListener('click', () => this._handleTransicion(btn.dataset.id, btn.dataset.estado, panel));
    });
  }

  async _handleTransicion(id, nuevoEstado, panel) {
    const errorEl = panel?.querySelector('#gar-detail-error');
    const nota = panel?.querySelector('#gar-nota-input')?.value?.trim() ?? null;
    const proveedorId = panel?.querySelector('#gar-proveedor-sel')?.value || null;

    try {
      await handleTransicionarGarantia(id, nuevoEstado, { nota, proveedor_id: proveedorId });
      this._garantias = await getGarantias();
      this._selectedId = null;
      this._render();
      this._bindEvents();
    } catch (err) {
      if (errorEl) { errorEl.textContent = err.message; errorEl.classList.remove('hidden'); }
      else alert(err.message);
    }
  }

  // ── Submit: Nueva Garantía ─────────────────────────────────────────────────
  async _handleSubmitNueva() {
    const form    = this.container.querySelector('#gar-nueva-form');
    const errorEl = this.container.querySelector('#gar-nueva-error');
    const btn     = this.container.querySelector('#btn-submit-nueva');
    if (!form || !errorEl || !btn) return;

    const showErr = (msg) => { errorEl.textContent = msg; errorEl.style.display = 'block'; };
    errorEl.style.display = 'none';

    const productId  = form.querySelector('#gn-producto').value;
    const clienteId  = form.querySelector('#gn-cliente').value;
    const cantidad   = Number(form.querySelector('#gn-cantidad').value);
    const costoRaw   = form.querySelector('#gn-costo').value;
    const costo      = costoRaw ? (Number(costoRaw.replace(/\D+/g, '')) || null) : null;
    const motivo     = form.querySelector('#gn-motivo').value.trim() || null;
    const referencia = form.querySelector('#gn-referencia').value.trim() || '';
    const observacion = form.querySelector('#gn-observacion').value.trim() || '';

    if (!productId)              { showErr('Selecciona un producto.'); return; }
    if (!clienteId)              { showErr('Selecciona el cliente al que se le reconoció la garantía.'); return; }
    if (!cantidad || cantidad <= 0) { showErr('La cantidad debe ser mayor a cero.'); return; }

    btn.disabled = true;
    btn.textContent = 'Registrando…';
    try {
      await handleRegistrarGarantia({ product_id: productId, cantidad, cliente_id: clienteId, costo_unitario: costo, garantia_motivo: motivo, referencia, observacion });
      this._formPanel = null;
      this._garantias = await getGarantias();
      this._render();
      this._bindEvents();
    } catch (err) {
      showErr(`Error: ${err.message}`);
      btn.disabled = false;
      btn.textContent = '🔄 Registrar Garantía (Central → Garantías)';
    }
  }

  // ── Submit: NC Proveedor ───────────────────────────────────────────────────
  async _handleSubmitNC() {
    const form    = this.container.querySelector('#gar-nc-form');
    const errorEl = this.container.querySelector('#gar-nc-error');
    const btn     = this.container.querySelector('#btn-submit-nc');
    if (!form || !errorEl || !btn || !this._ncGarantia) return;

    const showErr = (msg) => { errorEl.textContent = msg; errorEl.style.display = 'block'; };
    errorEl.style.display = 'none';

    const g          = this._ncGarantia;
    const proveedorId = form.querySelector('#nc-proveedor').value || null;
    const ncRef      = form.querySelector('#nc-referencia').value.trim();
    const fecha      = form.querySelector('#nc-fecha').value || '';
    const valorRaw   = form.querySelector('#nc-valor').value;
    const valor      = valorRaw ? (Number(valorRaw.replace(/\D+/g, '')) || 0) : 0;
    const cantidad   = Number(form.querySelector('#nc-cantidad').value);
    const obsBase    = form.querySelector('#nc-observacion').value.trim();

    if (!ncRef)                  { showErr('El número de Nota Crédito del proveedor es obligatorio.'); return; }
    if (!cantidad || cantidad <= 0) { showErr('La cantidad debe ser mayor a cero.'); return; }

    // Compose observacion with fecha and valor for trazabilidad
    const partes = [];
    if (fecha)  partes.push(`Fecha NC: ${fecha}`);
    if (valor)  partes.push(`Valor NC: ${formatCOP(valor)}`);
    if (obsBase) partes.push(obsBase);
    const observacion = partes.join(' | ') || '';

    btn.disabled = true;
    btn.textContent = 'Registrando…';
    try {
      const result = await handleRegistrarNcGarantia({ product_id: g.product_id, cantidad, nc_referencia: ncRef, observacion });
      if (result === null) {
        showErr('Esta Nota Crédito ya fue registrada anteriormente (registro duplicado prevenido).');
        btn.disabled = false;
        btn.textContent = '📄 Registrar Descarga NC (Garantías → Cerrado)';
        return;
      }
      // Also update proveedor on the garantía if provided
      if (proveedorId) {
        // State may already be APROBADA from the event handler; reload first
        const gReloaded = (await getGarantias()).find((x) => x.id === g.id);
        if (gReloaded && gReloaded.estado !== 'CERRADA') {
          await handleTransicionarGarantia(g.id, gReloaded.estado, { proveedor_id: proveedorId, nota: `NC: ${ncRef}` }).catch(() => {});
        }
      }
      this._formPanel = null;
      this._ncGarantia = null;
      this._garantias = await getGarantias();
      this._render();
      this._bindEvents();
    } catch (err) {
      showErr(`Error: ${err.message}`);
      btn.disabled = false;
      btn.textContent = '📄 Registrar Descarga NC (Garantías → Cerrado)';
    }
  }

  _refreshRows() {
    const tbody = this.container.querySelector('.gar-table tbody');
    if (!tbody) return;
    const filtradas = this._garantiasFiltradas();
    tbody.innerHTML = filtradas.map((g) => this._rowHtml(g)).join('');
    this._bindRowEvents();
  }

  _bindEvents() {
    this.container.querySelector('#btn-clear-filtro')?.addEventListener('click', () => {
      this._filtroEstado = '';
      this._render();
      this._bindEvents();
    });

    this.container.querySelector('#gar-busqueda')?.addEventListener('input', (e) => {
      this._filtroBusqueda = String(e.target?.value ?? '');
      this._render();
      this._bindEvents();
    });
    this.container.querySelector('#btn-gar-scan')?.addEventListener('click', () => {
      sessionStorage.setItem('garantias_pending_scan', '1');
      navigate('escaner');
    });

    this.container.querySelectorAll('.gar-kpi-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const e = btn.dataset.estado;
        this._filtroEstado = this._filtroEstado === e ? '' : e;
        this._render();
        this._bindEvents();
      });
    });

    // Nueva Garantía toggle
    this.container.querySelector('#btn-nueva-garantia')?.addEventListener('click', () => {
      if (this._formPanel === 'nueva') {
        this._formPanel = null;
      } else {
        this._formPanel = 'nueva';
        this._ncGarantia = null;
      }
      this._render();
      this._bindEvents();
    });

    // Cancel buttons for inline panels
    this.container.querySelector('#btn-cancel-nueva')?.addEventListener('click', () => {
      this._formPanel = null;
      this._render();
      this._bindEvents();
    });
    this.container.querySelector('#btn-cancel-nc')?.addEventListener('click', () => {
      this._formPanel = null;
      this._ncGarantia = null;
      this._render();
      this._bindEvents();
    });

    // Nueva form: show saldo on product select
    const gnProducto = this.container.querySelector('#gn-producto');
    const gnSaldoInfo = this.container.querySelector('#gn-saldo-info');
    if (gnProducto && this._filtroBusqueda) {
      const scanQuery = this._filtroBusqueda.trim().toLowerCase();
      const productMatch = this._products.find((p) => {
        const fields = [
          p?.sku,
          p?.ref_proveedor,
          p?.barcode,
          p?.codigo_barras,
          p?.code128,
          p?.ean,
          p?.upc,
        ].map((v) => String(v ?? '').trim().toLowerCase()).filter(Boolean);
        return fields.includes(scanQuery);
      });
      if (productMatch?.id) {
        gnProducto.value = String(productMatch.id);
      }
    }
    gnProducto?.addEventListener('change', async () => {
      const pid = gnProducto.value;
      if (!pid || !gnSaldoInfo) return;
      try {
        const saldo = await getSaldoByProduct(pid, BODEGA_CENTRAL_ID);
        gnSaldoInfo.textContent = `Saldo disponible en Bodega Central: ${saldo} unidades`;
        gnSaldoInfo.style.display = 'block';
        gnSaldoInfo.style.color = saldo > 0 ? '#059669' : '#dc2626';
      } catch { gnSaldoInfo.style.display = 'none'; }
    });

    // Nueva form submit
    this.container.querySelector('#gar-nueva-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSubmitNueva();
    });

    // NC form submit
    this.container.querySelector('#gar-nc-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleSubmitNC();
    });

    this._bindRowEvents();
  }

  _bindRowEvents() {
    this.container.querySelectorAll('.gar-row').forEach((row) => {
      row.addEventListener('click', (ev) => {
        if (ev.target.closest('.gar-btn-transicion') || ev.target.closest('.gar-btn-nc')) return;
        const id = row.dataset.id;
        const g = this._garantias.find((x) => x.id === id);
        if (!g) return;
        this._selectedId = id;
        this._refreshRows();
        this._renderDetailPanel(g);
      });
    });

    this.container.querySelectorAll('.gar-btn-transicion').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const panel = this.container.querySelector('#gar-detail-panel');
        await this._handleTransicion(btn.dataset.id, btn.dataset.estado, panel);
      });
    });

    // NC button per row
    this.container.querySelectorAll('.gar-btn-nc').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.id;
        const g = this._garantias.find((x) => x.id === id);
        if (!g) return;
        this._ncGarantia = g;
        this._formPanel = 'nc';
        this._render();
        this._bindEvents();
        // Scroll to panel
        this.container.querySelector('#gar-inline-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  _listenDomain() {
    this._unsub = eventBus.on(Events.GARANTIA_CREADA, async () => {
      this._garantias = await getGarantias();
      this._render();
      this._bindEvents();
    });
  }
}

function _badgeBg(estado) {
  const map = {
    RECIBIDA: '#fef9c3', EN_REVISION: '#dbeafe', ENVIADA_PROVEEDOR: '#fce7f3',
    APROBADA: '#dcfce7', RECHAZADA: '#fee2e2', CERRADA: '#f3f4f6',
  };
  return map[estado] ?? '#f3f4f6';
}

function _badgeFg(estado) {
  const map = {
    RECIBIDA: '#854d0e', EN_REVISION: '#1e40af', ENVIADA_PROVEEDOR: '#9d174d',
    APROBADA: '#166534', RECHAZADA: '#991b1b', CERRADA: '#6b7280',
  };
  return map[estado] ?? '#374151';
}

function navigate(view, options = {}) { window.__erp_navigate?.(view, options); }
