// FASE 1.5 R8 — Dashboard de Trazabilidad consolidada
// Lee event_store (eventos persistentes) + pedido_saga_log (transiciones saga).
// NO escribe nada: vista de sólo lectura para control operativo.
// Visibilidad radical: la auditoría no se esconde.
import { getRecentEvents, getAllSagaLogs } from '../../db/local-db.js';

const MODULO_BY_TYPE = {
  PrecioItemChanged:        'Políticas',
  ListaPreciosCreada:       'Políticas',
  ListaPreciosActualizada:  'Políticas',
  ListaPreciosActivada:     'Políticas',
  ListaPreciosSuspendida:   'Políticas',
  ListaPreciosEnStandby:    'Políticas',
  ListaPreciosCancelada:    'Políticas',
  PedidoCreated:            'Pedidos',
  PedidoPicking:            'Pedidos',
  PedidoPacking:            'Pedidos',
  PedidoDespachado:         'Pedidos',
  PedidoPod:                'Pedidos',
  PedidoAnulado:            'Pedidos',
  FacturaEmitida:           'Facturación',
  RemisionEmitida:          'Facturación',
  StockReserved:            'Kardex',
  StockRevertido:           'Kardex',
  StockAdjusted:            'Kardex',
  ClienteCreado:            'Clientes',
  ProductoCreado:           'Productos',
  CostoProductoCambiado:    'Productos',
};

function _moduloOf(type) {
  return MODULO_BY_TYPE[type] ?? 'Otros';
}

function _fmtTs(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('es-CO'); } catch { return ts; }
}

function _payloadResumen(entry) {
  const p = entry.payload ?? {};
  if (entry.type === 'PrecioItemChanged') {
    const ant = p.valor_anterior == null ? 'N/A' : `$${Number(p.valor_anterior).toLocaleString('es-CO')}`;
    const nue = p.valor_nuevo == null ? 'N/A' : `$${Number(p.valor_nuevo).toLocaleString('es-CO')}`;
    return `SKU ${p.product_sku ?? p.product_id} — ${ant} → ${nue} [${p.motivo ?? ''}]`;
  }
  if (entry.type === 'CostoProductoCambiado') {
    const ant = p.costo_anterior == null ? 'N/A' : `$${Number(p.costo_anterior).toLocaleString('es-CO')}`;
    const nue = p.costo_nuevo == null ? 'N/A' : `$${Number(p.costo_nuevo).toLocaleString('es-CO')}`;
    const sku = p.product_sku ?? p.product_id ?? 'N/A';
    const src = p.origen ?? 'N/A';
    return `SKU ${sku} — ${ant} → ${nue} [${src}]`;
  }
  if (p.pedido?.consecutivo) return `Pedido ${p.pedido.consecutivo}`;
  if (p.documento?.consecutivo) return `Doc ${p.documento.consecutivo}`;
  if (p.lista?.nombre) return `Lista ${p.lista.nombre}`;
  if (p.product_sku) return `SKU ${p.product_sku}`;
  return '';
}

export class TrazabilidadList {
  constructor(container) {
    this._container = container;
    this._filterModulo = 'TODOS';
    this._modulos = ['TODOS'];
    this._rows = [];
  }

  async mount() {
    const [eventos, sagas] = await Promise.all([
      getRecentEvents(500).catch(() => []),
      getAllSagaLogs(500).catch(() => []),
    ]);

    const eventRows = (eventos ?? []).map((e) => ({
      ts: e.timestamp ?? e.created_at ?? '',
      modulo: _moduloOf(e.type),
      type: e.type,
      origin: 'event_store',
      detalle: _payloadResumen(e),
      raw: e,
    }));

    const sagaRows = (sagas ?? []).map((s) => ({
      ts: s.created_at ?? '',
      modulo: 'Pedidos',
      type: `saga:${s.evento ?? s.estado ?? 'STEP'}`,
      origin: 'saga_log',
      detalle: `Pedido ${s.pedido_id ?? ''} — ${JSON.stringify(s.detalle ?? {}).slice(0, 80)}`,
      raw: s,
    }));

    this._rows = [...eventRows, ...sagaRows]
      .filter((r) => r.ts)
      .sort((a, b) => (b.ts).localeCompare(a.ts));

    const modset = new Set(this._rows.map((r) => r.modulo));
    this._modulos = ['TODOS', ...Array.from(modset).sort()];

    this._render();
  }

  unmount() {
    this._container.innerHTML = '';
  }

  _render() {
    const filtered = this._filterModulo === 'TODOS'
      ? this._rows
      : this._rows.filter((r) => r.modulo === this._filterModulo);

    this._container.innerHTML = `
      <div class="list-container">
        <div class="list-header">
          <h2 class="page-title">Trazabilidad consolidada</h2>
        </div>
        <div style="margin:12px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label style="font-size:13px">Módulo:</label>
          <select id="traza-filter" class="field-input" style="width:auto;padding:6px 10px">
            ${this._modulos.map((m) => `<option value="${m}" ${this._filterModulo === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <span style="font-size:12px;color:#666">${filtered.length} de ${this._rows.length} eventos</span>
          <button id="btn-traza-refresh" class="btn-secondary" style="padding:6px 12px;font-size:13px;margin-left:auto">↻ Actualizar</button>
        </div>
        ${filtered.length === 0
          ? '<div class="empty-state">Sin eventos registrados aún</div>'
          : `<div class="traza-table" style="display:grid;grid-template-columns:160px 110px 200px 1fr;gap:6px;font-size:12px">
              <div style="font-weight:700">Fecha/Hora</div>
              <div style="font-weight:700">Módulo</div>
              <div style="font-weight:700">Tipo</div>
              <div style="font-weight:700">Detalle</div>
              ${filtered.slice(0, 200).map((r) => `
                <div>${_fmtTs(r.ts)}</div>
                <div><span class="tipo-cliente-badge">${r.modulo}</span></div>
                <div style="font-family:monospace;font-size:11px">${r.type}</div>
                <div>${r.detalle}</div>
              `).join('')}
            </div>`
        }
        ${this._rows.length > 200 ? `<div style="margin-top:10px;font-size:11px;color:#666">Mostrando primeros 200 de ${this._rows.length}. Filtre por módulo para refinar.</div>` : ''}
      </div>`;

    this._container.querySelector('#traza-filter')?.addEventListener('change', (e) => {
      this._filterModulo = e.target.value;
      this._render();
    });
    this._container.querySelector('#btn-traza-refresh')?.addEventListener('click', () => this.mount());
  }
}
