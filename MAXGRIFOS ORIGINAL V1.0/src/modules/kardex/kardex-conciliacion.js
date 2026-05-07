import { getMovimientos } from './kardex-store.js';
import { getBodegasConSistema, BODEGA_CENTRAL_ID, BODEGA_PEDIDOS_ID, BODEGA_GARANTIAS_ID, BODEGA_DESACTIVADOS_ID } from './bodega-store.js';
import { getProducts } from '../maestro-productos/product-store.js';
import { eventBus, Events } from '../../events/domain-events.js';

function fmtNum(n) { return Number(n).toLocaleString('es-CO'); }
function fmtCop(n) { return `$${Number(n).toLocaleString('es-CO')}`; }
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

const ESTADO_LABELS = {
  conciliado:      { label: 'Conciliado',       cls: 'kdx-con-badge-ok',      icon: '✅' },
  inconsistente:   { label: 'Inconsistente',    cls: 'kdx-con-badge-warn',    icon: '⚠️' },
  sync_pendiente:  { label: 'Sync pendiente',   cls: 'kdx-con-badge-pending', icon: '🟡' },
  sync_error:      { label: 'Error sync',       cls: 'kdx-con-badge-error',   icon: '🔴' },
};

function _estadoBadge(estado) {
  const e = ESTADO_LABELS[estado] ?? ESTADO_LABELS.conciliado;
  return `<span class="kdx-con-badge ${e.cls}">${e.icon} ${e.label}</span>`;
}

export class KardexConciliacion {
  constructor(container) {
    this.container = container;
    this._rows = [];
    this._bodegas = [];
    this._satelites = [];
    this._filtro = {
      q: '',
      categoria: '',
      subcategoria: '',
      estado: '',
      fechaDesde: '',
      fechaHasta: '',
    };
    this._valorTotal = 0;
    this._unsubStock = null;
  }

  async mount() {
    this.container.innerHTML = `<div class="loading">Calculando conciliación…</div>`;
    await this._cargar();
    this._render();
    this._unsubStock = eventBus.on(Events.STOCK_MOVED, async () => {
      await this._cargar();
      this._render();
    });
  }

  unmount() {
    this._unsubStock?.();
  }

  // ── Carga y agregación (lectura pura) ──────────────────────
  async _cargar() {
    const [movimientos, bodegas, productos] = await Promise.all([
      getMovimientos(),
      getBodegasConSistema(),
      getProducts().catch(() => []),
    ]);

    this._bodegas = bodegas;
    this._satelites = bodegas.filter((b) => b.tipo === 'satellite' && b.status === 'active');

    // Mapa de producto desde catálogo
    const prodMap = new Map((productos ?? []).map((p) => [p.id, p]));

    // Agrupar movimientos por product_id
    const byProduct = new Map();
    for (const m of movimientos) {
      if (!m.product_id) continue;
      if (!byProduct.has(m.product_id)) byProduct.set(m.product_id, []);
      byProduct.get(m.product_id).push(m);
    }

    const rows = [];
    for (const [productId, movs] of byProduct) {
      const prod = prodMap.get(productId);
      const sku  = movs[0]?.product_sku ?? prod?.sku ?? productId;
      const nombre = movs[0]?.product_name ?? prod?.nombre ?? '—';

      // Saldos por bodega
      const saldoBodega = new Map();
      for (const m of movs) {
        const bid = m.bodega_id ?? BODEGA_CENTRAL_ID;
        saldoBodega.set(bid, (saldoBodega.get(bid) ?? 0) + (m.delta ?? 0));
      }

      const stockCentral  = saldoBodega.get(BODEGA_CENTRAL_ID) ?? 0;
      const stockPedidos  = saldoBodega.get(BODEGA_PEDIDOS_ID) ?? 0;
      const stockGarantias = saldoBodega.get(BODEGA_GARANTIAS_ID) ?? 0;
      const stockSatelites = this._satelites.reduce((acc, b) => acc + (saldoBodega.get(b.id) ?? 0), 0);
      // Total empresa = todo excepto BODEGA_DESACTIVADOS
      const stockTotal = Array.from(saldoBodega.entries())
        .filter(([bid]) => bid !== BODEGA_DESACTIVADOS_ID)
        .reduce((acc, [, v]) => acc + v, 0);

      // Costo unitario: último ENTRADA_COMPRA con costo, o producto.costo
      const entradas = movs
        .filter((m) => m.tipo === 'ENTRADA_COMPRA' && m.costo_unitario > 0)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const costoUnitario = Number(entradas[0]?.costo_unitario ?? prod?.costo ?? 0);
      const valorTotal = costoUnitario > 0 && stockTotal > 0 ? costoUnitario * stockTotal : 0;

      // Sync status
      const hasSyncError   = movs.some((m) => m.sync_status === 'error');
      const hasSyncPending = movs.some((m) => m.sync_status === 'pending');

      // Inconsistencias
      const inconsistencias = _detectarInconsistencias(movs, saldoBodega, this._satelites);

      // Estado final
      let estado = 'conciliado';
      if (hasSyncError)             estado = 'sync_error';
      else if (inconsistencias.length > 0) estado = 'inconsistente';
      else if (hasSyncPending)      estado = 'sync_pendiente';

      // Categoría / subcategoría desde SKU
      const skuParts = sku.split('-');
      const categoria    = skuParts[0] ?? '';
      const subcategoria = skuParts[1] ?? '';

      // Metadata para filtros
      const referencias   = [...new Set(movs.map((m) => m.referencia).filter(Boolean))];
      const pedidoIds     = [...new Set(movs.map((m) => m.pedido_id).filter(Boolean))];
      const clienteIds    = [...new Set(movs.map((m) => m.cliente_id).filter(Boolean))];
      const fechaUltMov   = movs[0]?.created_at ?? '';

      rows.push({
        productId, sku, nombre, categoria, subcategoria,
        stockCentral, stockPedidos, stockGarantias, stockSatelites, stockTotal,
        costoUnitario, valorTotal,
        estado, inconsistencias,
        hasSyncError, hasSyncPending,
        referencias, pedidoIds, clienteIds, fechaUltMov,
        movCount: movs.length,
      });
    }

    rows.sort((a, b) => a.sku.localeCompare(b.sku));
    this._rows = rows;
    this._valorTotal = rows.reduce((acc, r) => acc + r.valorTotal, 0);
  }

  // ── Filtrado ────────────────────────────────────────────────
  _filtrados() {
    const { q, categoria, subcategoria, estado, fechaDesde, fechaHasta } = this._filtro;
    const ql = q.toLowerCase();
    return this._rows.filter((r) => {
      if (ql && !(r.sku.toLowerCase().includes(ql) || r.nombre.toLowerCase().includes(ql))) return false;
      if (categoria    && r.categoria !== categoria) return false;
      if (subcategoria && r.subcategoria !== subcategoria) return false;
      if (estado       && r.estado !== estado) return false;
      if (fechaDesde   && r.fechaUltMov && r.fechaUltMov < fechaDesde) return false;
      if (fechaHasta   && r.fechaUltMov && r.fechaUltMov > fechaHasta + 'T23:59:59') return false;
      return true;
    });
  }

  // ── Render principal ─────────────────────────────────────────
  _render() {
    const total       = this._rows.length;
    const inconsCount = this._rows.filter((r) => r.estado === 'inconsistente').length;
    const errorCount  = this._rows.filter((r) => r.estado === 'sync_error').length;
    const pendCount   = this._rows.filter((r) => r.estado === 'sync_pendiente').length;

    const cats = [...new Set(this._rows.map((r) => r.categoria).filter(Boolean))].sort();
    const subs = [...new Set(
      this._rows
        .filter((r) => !this._filtro.categoria || r.categoria === this._filtro.categoria)
        .map((r) => r.subcategoria)
        .filter(Boolean)
    )].sort();

    const lista = this._filtrados();

    this.container.innerHTML = `
      <div class="list-container">
        <div class="list-header" style="flex-direction:column;align-items:flex-start;gap:6px">
          <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
            <h2 style="margin:0">📊 Conciliación Kardex</h2>
          </div>
          <div class="kdx-con-summary">
            <span class="kdx-con-sumitem">📦 <strong>${total}</strong> SKUs</span>
            ${inconsCount > 0 ? `<span class="kdx-con-sumitem kdx-con-sum-warn">⚠️ <strong>${inconsCount}</strong> inconsistencias</span>` : ''}
            ${errorCount  > 0 ? `<span class="kdx-con-sumitem kdx-con-sum-error">🔴 <strong>${errorCount}</strong> errores sync</span>` : ''}
            ${pendCount   > 0 ? `<span class="kdx-con-sumitem kdx-con-sum-pending">🟡 <strong>${pendCount}</strong> sync pendiente</span>` : ''}
            <span class="kdx-con-sumitem kdx-con-sum-valor">💰 Total: <strong>${fmtCop(this._valorTotal)}</strong></span>
          </div>
        </div>

        <!-- Filtros -->
        <div class="kdx-con-filters">
          <input type="search" id="kdx-con-q" class="search-input"
            placeholder="Buscar por SKU o nombre…" value="${this._filtro.q}" autocomplete="off">

          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
            <select id="kdx-con-cat" class="search-input" style="flex:1;min-width:100px">
              <option value="">Todas las categorías</option>
              ${cats.map((c) => `<option value="${c}" ${this._filtro.categoria===c?'selected':''}>${c}</option>`).join('')}
            </select>
            <select id="kdx-con-sub" class="search-input" style="flex:1;min-width:100px">
              <option value="">Todas las subcategorías</option>
              ${subs.map((s) => `<option value="${s}" ${this._filtro.subcategoria===s?'selected':''}>${s}</option>`).join('')}
            </select>
            <select id="kdx-con-estado" class="search-input" style="flex:1;min-width:120px">
              <option value="">Todos los estados</option>
              <option value="conciliado"     ${this._filtro.estado==='conciliado'?'selected':''}>✅ Conciliado</option>
              <option value="inconsistente"  ${this._filtro.estado==='inconsistente'?'selected':''}>⚠️ Inconsistente</option>
              <option value="sync_pendiente" ${this._filtro.estado==='sync_pendiente'?'selected':''}>🟡 Sync pendiente</option>
              <option value="sync_error"     ${this._filtro.estado==='sync_error'?'selected':''}>🔴 Error sync</option>
            </select>
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
            <div style="display:flex;align-items:center;gap:4px;flex:1">
              <label style="font-size:12px;white-space:nowrap;color:#6B7280">Desde:</label>
              <input type="date" id="kdx-con-desde" class="search-input"
                value="${this._filtro.fechaDesde}" style="flex:1;padding:6px 8px;font-size:13px">
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex:1">
              <label style="font-size:12px;white-space:nowrap;color:#6B7280">Hasta:</label>
              <input type="date" id="kdx-con-hasta" class="search-input"
                value="${this._filtro.fechaHasta}" style="flex:1;padding:6px 8px;font-size:13px">
            </div>
          </div>
        </div>

        <!-- Indicador de resultados -->
        <div style="font-size:12px;color:#6B7280;margin:8px 0">
          Mostrando ${lista.length} de ${total} SKUs
        </div>

        <!-- Lista -->
        <div id="kdx-con-body">
          ${lista.length === 0 ? this._emptyState() : lista.map((r) => this._rowHtml(r)).join('')}
        </div>

        <!-- Total pie -->
        ${lista.length > 0 ? `
          <div class="kdx-con-footer">
            <span>Valor total inventario (filtrado)</span>
            <strong>${fmtCop(lista.reduce((acc, r) => acc + r.valorTotal, 0))}</strong>
          </div>` : ''}
      </div>`;

    this._bindEvents();
  }

  _rowHtml(r) {
    const hayProblema = r.inconsistencias.length > 0 || r.hasSyncError;
    const borderColor = r.estado === 'sync_error' ? '#EF4444'
      : r.estado === 'inconsistente'  ? '#F59E0B'
      : r.estado === 'sync_pendiente' ? '#F59E0B'
      : '#10B981';

    const sateliteHtml = this._satelites.length > 0
      ? `<div class="kdx-con-cell"><span class="kdx-con-cell-lbl">Satélites</span><span class="kdx-con-cell-val ${r.stockSatelites < 0 ? 'kdx-neg' : ''}">${fmtNum(r.stockSatelites)}</span></div>`
      : '';

    return `
      <div class="kdx-con-card" style="border-left: 3px solid ${borderColor}">
        <div class="kdx-con-card-header">
          <div>
            <span class="kdx-con-sku">${r.sku}</span>
            <span class="kdx-con-nombre">${r.nombre}</span>
          </div>
          ${_estadoBadge(r.estado)}
        </div>

        <div class="kdx-con-grid">
          <div class="kdx-con-cell">
            <span class="kdx-con-cell-lbl">Central</span>
            <span class="kdx-con-cell-val ${r.stockCentral < 0 ? 'kdx-neg' : ''}">${fmtNum(r.stockCentral)}</span>
          </div>
          <div class="kdx-con-cell">
            <span class="kdx-con-cell-lbl">Pedidos</span>
            <span class="kdx-con-cell-val ${r.stockPedidos < 0 ? 'kdx-neg' : ''}">${fmtNum(r.stockPedidos)}</span>
          </div>
          <div class="kdx-con-cell">
            <span class="kdx-con-cell-lbl">Garantías</span>
            <span class="kdx-con-cell-val ${r.stockGarantias < 0 ? 'kdx-neg' : ''}">${fmtNum(r.stockGarantias)}</span>
          </div>
          ${sateliteHtml}
          <div class="kdx-con-cell kdx-con-cell-total">
            <span class="kdx-con-cell-lbl">Total empresa</span>
            <span class="kdx-con-cell-val ${r.stockTotal < 0 ? 'kdx-neg' : ''}">${fmtNum(r.stockTotal)}</span>
          </div>
          <div class="kdx-con-cell">
            <span class="kdx-con-cell-lbl">Costo unit.</span>
            <span class="kdx-con-cell-val">${r.costoUnitario > 0 ? fmtCop(r.costoUnitario) : '—'}</span>
          </div>
          <div class="kdx-con-cell kdx-con-cell-valor">
            <span class="kdx-con-cell-lbl">Valor en stock</span>
            <span class="kdx-con-cell-val">${r.valorTotal > 0 ? fmtCop(r.valorTotal) : '—'}</span>
          </div>
        </div>

        ${hayProblema ? `
          <div class="kdx-con-issues">
            ${r.inconsistencias.map((inc) => `<div class="kdx-con-issue">⚠️ ${inc}</div>`).join('')}
            ${r.hasSyncError ? `<div class="kdx-con-issue kdx-issue-error">🔴 Error de sincronización</div>` : ''}
          </div>` : ''}

        <div class="kdx-con-meta">
          <span>${r.movCount} movimientos</span>
          ${r.fechaUltMov ? `<span>Último: ${fmtDate(r.fechaUltMov)}</span>` : ''}
        </div>
      </div>`;
  }

  _emptyState() {
    return `<div class="empty-state">
      <div style="font-size:40px;margin-bottom:12px">📊</div>
      <p>${this._filtro.q || this._filtro.categoria || this._filtro.estado
        ? 'Sin resultados para los filtros aplicados.'
        : 'No hay movimientos de kardex registrados aún.'}</p>
    </div>`;
  }

  _bindEvents() {
    this.container.querySelector('#kdx-con-q')?.addEventListener('input', (e) => {
      this._filtro.q = e.target.value;
      this._renderBody();
    });

    this.container.querySelector('#kdx-con-cat')?.addEventListener('change', (e) => {
      this._filtro.categoria = e.target.value;
      this._filtro.subcategoria = '';
      this._render();
    });

    this.container.querySelector('#kdx-con-sub')?.addEventListener('change', (e) => {
      this._filtro.subcategoria = e.target.value;
      this._renderBody();
    });

    this.container.querySelector('#kdx-con-estado')?.addEventListener('change', (e) => {
      this._filtro.estado = e.target.value;
      this._renderBody();
    });

    this.container.querySelector('#kdx-con-desde')?.addEventListener('change', (e) => {
      this._filtro.fechaDesde = e.target.value;
      this._renderBody();
    });

    this.container.querySelector('#kdx-con-hasta')?.addEventListener('change', (e) => {
      this._filtro.fechaHasta = e.target.value;
      this._renderBody();
    });
  }

  _renderBody() {
    const lista = this._filtrados();
    const body = this.container.querySelector('#kdx-con-body');
    if (body) {
      body.innerHTML = lista.length === 0 ? this._emptyState() : lista.map((r) => this._rowHtml(r)).join('');
    }
    const footer = this.container.querySelector('.kdx-con-footer');
    if (footer) {
      footer.querySelector('strong').textContent = fmtCop(lista.reduce((acc, r) => acc + r.valorTotal, 0));
    }
    const countEl = this.container.querySelector('[style*="12px"][style*="6B7280"]');
    if (countEl) countEl.textContent = `Mostrando ${lista.length} de ${this._rows.length} SKUs`;
  }
}

// ── Detección de inconsistencias ─────────────────────────────
function _detectarInconsistencias(movs, saldoBodega, satelites) {
  const issues = [];

  // 1. Stock negativo en alguna bodega
  for (const [bid, saldo] of saldoBodega) {
    if (bid === BODEGA_DESACTIVADOS_ID) continue;
    if (saldo < 0) {
      issues.push(`Stock negativo en ${bid}: ${saldo} uds`);
    }
  }

  // 2. Movimientos internos incompletos (transferencias sin su contraparte)
  const byTransfer = new Map();
  for (const m of movs) {
    if (!m.transfer_id) continue;
    if (!byTransfer.has(m.transfer_id)) byTransfer.set(m.transfer_id, []);
    byTransfer.get(m.transfer_id).push(m.tipo);
  }

  const PAIRS = [
    ['RESERVA_OUT', 'RESERVA_IN'],
    ['REVERSION_OUT', 'REVERSION_IN'],
    ['DESACTIVACION_OUT', 'DESACTIVACION_IN'],
    ['REACTIVACION_OUT', 'REACTIVACION_IN'],
    ['GARANTIA_OUT', 'GARANTIA_IN'],
  ];

  for (const [tid, tipos] of byTransfer) {
    for (const [out, inn] of PAIRS) {
      const hasOut = tipos.includes(out);
      const hasIn  = tipos.includes(inn);
      if (hasOut && !hasIn) {
        issues.push(`Mov. interno incompleto: ${out} sin ${inn} (transfer: ${tid.slice(0, 12)}…)`);
      } else if (!hasOut && hasIn) {
        issues.push(`Mov. interno incompleto: ${inn} sin ${out} (transfer: ${tid.slice(0, 12)}…)`);
      }
    }
  }

  return issues;
}
