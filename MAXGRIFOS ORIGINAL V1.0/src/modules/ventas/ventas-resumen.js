import { handleQueryVentasResumen } from './ventas-handlers.js';

const FORMA_PAGO_LABELS = {
  CONTADO:         'Contado',
  CONTADO_B2B:     'Contado B2B',
  CREDITO_15:      'Crédito 15 días',
  CREDITO_30:      'Crédito 30 días',
  CREDITO_45:      'Crédito 45 días',
  B2C_REDES:       'B2C Redes Sociales',
  B2C_CONSTRUCTOR: 'B2C Constructores',
};

function _fpLabel(fp) {
  return FORMA_PAGO_LABELS[fp] ?? fp;
}

function _cop(n) {
  return Number(n ?? 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

function _pct(n) {
  return `${Number(n ?? 0).toFixed(1)}%`;
}

export class VentasResumen {
  constructor(container) {
    this._container = container;
    this._resultado = null;
    this._vista = 'cliente';
    this._periodo = 'mes';
    this._fechaInicio = '';
    this._fechaFin = '';
    this._clienteId = '';
    this._formaPago = '';
    this._loading = false;
  }

  mount() {
    this._render();
    this._bindEvents();
    this._cargar();
  }

  unmount() {}

  _render() {
    this._container.innerHTML = `
      <div class="vres-wrap" data-nis-module="ventas-resumen">
        <div class="vres-header">
          <button class="vsub-back" id="vres-back" aria-label="Volver al inicio">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
              <polyline points="15,18 9,12 15,6"/>
            </svg>
          </button>
          <span class="vsub-title">RESUMEN VENTAS</span>
        </div>

        <div class="vres-filters">
          <div class="vres-periodo-row" role="group" aria-label="Periodo">
            ${['semana','mes','trimestre','semestre','rango'].map((p) => `
              <button class="vres-periodo-btn${p === this._periodo ? ' active' : ''}" data-periodo="${p}">
                ${p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : p === 'trimestre' ? 'Trimestre' : p === 'semestre' ? 'Semestre' : 'Rango'}
              </button>`).join('')}
          </div>
          <div class="vres-rango-row${this._periodo !== 'rango' ? ' hidden' : ''}" id="vres-rango-row">
            <div class="vres-field">
              <label class="vres-label">Desde</label>
              <input type="date" class="vres-input" id="vres-fecha-inicio" value="${this._fechaInicio}">
            </div>
            <div class="vres-field">
              <label class="vres-label">Hasta</label>
              <input type="date" class="vres-input" id="vres-fecha-fin" value="${this._fechaFin}">
            </div>
          </div>
          <div class="vres-seg-row">
            <div class="vres-field vres-field-grow">
              <label class="vres-label">Cliente</label>
              <select class="vres-input" id="vres-seg-cliente">
                <option value="">Todos</option>
              </select>
            </div>
            <div class="vres-field vres-field-grow">
              <label class="vres-label">Forma de pago</label>
              <select class="vres-input" id="vres-seg-fp">
                <option value="">Todos</option>
                ${Object.entries(FORMA_PAGO_LABELS).map(([k, v]) => `<option value="${k}"${this._formaPago === k ? ' selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="vres-seg-row">
            <div class="vres-field vres-field-grow">
              <label class="vres-label vres-disabled-label">Vendedor</label>
              <select class="vres-input" disabled>
                <option>Próximamente</option>
              </select>
            </div>
            <div class="vres-field vres-field-narrow">
              <button class="btn-primary vres-btn-buscar" id="vres-btn-buscar">Buscar</button>
            </div>
          </div>
        </div>

        <div id="vres-body">
          <div class="vres-loading">Cargando...</div>
        </div>
      </div>`;
  }

  _bindEvents() {
    const c = this._container;

    c.querySelector('#vres-back')?.addEventListener('click', () => {
      window.__erp_navigate?.('home');
    });

    c.querySelectorAll('.vres-periodo-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._periodo = btn.dataset.periodo;
        c.querySelectorAll('.vres-periodo-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const rangoRow = c.querySelector('#vres-rango-row');
        if (rangoRow) rangoRow.classList.toggle('hidden', this._periodo !== 'rango');
        if (this._periodo !== 'rango') this._cargar();
      });
    });

    c.querySelector('#vres-btn-buscar')?.addEventListener('click', () => {
      this._fechaInicio = c.querySelector('#vres-fecha-inicio')?.value ?? '';
      this._fechaFin = c.querySelector('#vres-fecha-fin')?.value ?? '';
      this._clienteId = c.querySelector('#vres-seg-cliente')?.value ?? '';
      this._formaPago = c.querySelector('#vres-seg-fp')?.value ?? '';
      this._cargar();
    });
  }

  async _cargar() {
    if (this._loading) return;
    this._loading = true;
    const body = this._container.querySelector('#vres-body');
    if (body) body.innerHTML = '<div class="vres-loading">Consultando ventas...</div>';

    try {
      const params = { periodo: this._periodo };
      if (this._periodo === 'rango') {
        params.fecha_inicio = this._fechaInicio;
        params.fecha_fin = this._fechaFin;
      }
      if (this._clienteId) params.cliente_id = this._clienteId;
      if (this._formaPago) params.forma_pago = this._formaPago;

      this._resultado = await handleQueryVentasResumen(params);
      this._poblarClientes(this._resultado.clientes_activos);
      this._renderResultado();
    } catch (err) {
      const body2 = this._container.querySelector('#vres-body');
      if (body2) {
        body2.innerHTML = `<div class="vres-error">Error al consultar: ${err?.message ?? err}</div>`;
      }
    } finally {
      this._loading = false;
    }
  }

  _poblarClientes(clientes) {
    const sel = this._container.querySelector('#vres-seg-cliente');
    if (!sel) return;
    const current = sel.value || this._clienteId;
    sel.innerHTML = '<option value="">Todos</option>' +
      clientes.map((c) => `<option value="${c.id}"${c.id === current ? ' selected' : ''}>${c.razon_social}</option>`).join('');
  }

  _renderResultado() {
    const r = this._resultado;
    if (!r) return;
    const body = this._container.querySelector('#vres-body');
    if (!body) return;

    const fechaLabel = r.desde === r.hasta
      ? r.desde
      : `${r.desde} → ${r.hasta}`;

    body.innerHTML = `
      <div class="vres-kpi-row">
        <div class="vres-kpi-card">
          <div class="vres-kpi-val">${_cop(r.total_bruto)}</div>
          <div class="vres-kpi-label">Ventas brutas</div>
        </div>
        <div class="vres-kpi-card">
          <div class="vres-kpi-val">${r.total_documentos}</div>
          <div class="vres-kpi-label">Documentos</div>
        </div>
        <div class="vres-kpi-period">
          <span class="vres-period-badge">${fechaLabel}</span>
        </div>
      </div>

      <div class="vres-tabs" role="tablist">
        <button class="vres-tab${this._vista === 'cliente' ? ' active' : ''}" data-vista="cliente" role="tab">Por Cliente</button>
        <button class="vres-tab${this._vista === 'producto' ? ' active' : ''}" data-vista="producto" role="tab">Por Producto</button>
        <button class="vres-tab${this._vista === 'forma_pago' ? ' active' : ''}" data-vista="forma_pago" role="tab">Por Forma Pago</button>
      </div>

      <div id="vres-tabla-wrap">
        ${this._renderTabla()}
      </div>`;

    body.querySelectorAll('.vres-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this._vista = tab.dataset.vista;
        body.querySelectorAll('.vres-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const wrap = body.querySelector('#vres-tabla-wrap');
        if (wrap) wrap.innerHTML = this._renderTabla();
      });
    });
  }

  _renderTabla() {
    if (!this._resultado) return '';
    if (this._vista === 'cliente') return this._renderTablaCliente();
    if (this._vista === 'producto') return this._renderTablaProducto();
    if (this._vista === 'forma_pago') return this._renderTablaFormaPago();
    return '';
  }

  _renderTablaCliente() {
    const rows = this._resultado.vista_cliente;
    if (!rows.length) return '<div class="vres-empty">Sin ventas en el período.</div>';

    const filas = rows.map((r) => {
      const productosUnicos = [...new Map(r.items.map((i) => [i.product_id, i])).values()];
      const nombresProductos = productosUnicos.map((i) => i.product_name).join(', ');
      const skus = productosUnicos.map((i) => i.product_sku).join(', ');
      const cantidadTotal = r.items.reduce((s, i) => s + i.cantidad, 0);
      return `
        <tr>
          <td class="vres-td">${r.cliente_nombre}</td>
          <td class="vres-td vres-td-center">${r.documentos}</td>
          <td class="vres-td vres-td-small">${nombresProductos || '—'}</td>
          <td class="vres-td vres-td-small">${skus || '—'}</td>
          <td class="vres-td vres-td-center">${cantidadTotal}</td>
          <td class="vres-td vres-td-right">${_cop(r.total)}</td>
        </tr>`;
    }).join('');

    return `
      <div class="vres-table-wrap">
        <table class="vres-table">
          <thead>
            <tr>
              <th class="vres-th">Cliente</th>
              <th class="vres-th vres-td-center">Docs</th>
              <th class="vres-th">Productos</th>
              <th class="vres-th">SKU</th>
              <th class="vres-th vres-td-center">Cant.</th>
              <th class="vres-th vres-td-right">Total</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
  }

  _renderTablaProducto() {
    const rows = this._resultado.vista_producto;
    if (!rows.length) return '<div class="vres-empty">Sin ventas en el período.</div>';

    const filas = rows.map((r) => `
      <tr>
        <td class="vres-td">${r.product_name}</td>
        <td class="vres-td vres-td-small">${r.product_sku}</td>
        <td class="vres-td vres-td-center">${r.cantidad_total}</td>
        <td class="vres-td vres-td-right">${_cop(r.precio_promedio)}</td>
        <td class="vres-td vres-td-right">${_cop(r.total)}</td>
      </tr>`).join('');

    return `
      <div class="vres-table-wrap">
        <table class="vres-table">
          <thead>
            <tr>
              <th class="vres-th">Descripción</th>
              <th class="vres-th">SKU</th>
              <th class="vres-th vres-td-center">Cant. total</th>
              <th class="vres-th vres-td-right">Precio prom.</th>
              <th class="vres-th vres-td-right">Total</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
  }

  _renderTablaFormaPago() {
    const rows = this._resultado.vista_forma_pago;
    if (!rows.length) return '<div class="vres-empty">Sin ventas en el período.</div>';

    const filas = rows.map((r) => `
      <tr>
        <td class="vres-td">${_fpLabel(r.forma_pago)}</td>
        <td class="vres-td vres-td-center">${r.documentos}</td>
        <td class="vres-td vres-td-right">${_cop(r.total)}</td>
        <td class="vres-td vres-td-right">${_pct(r.participacion)}</td>
      </tr>`).join('');

    return `
      <div class="vres-table-wrap">
        <table class="vres-table">
          <thead>
            <tr>
              <th class="vres-th">Forma de pago</th>
              <th class="vres-th vres-td-center">Docs</th>
              <th class="vres-th vres-td-right">Total</th>
              <th class="vres-th vres-td-right">Participación</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
  }
}
