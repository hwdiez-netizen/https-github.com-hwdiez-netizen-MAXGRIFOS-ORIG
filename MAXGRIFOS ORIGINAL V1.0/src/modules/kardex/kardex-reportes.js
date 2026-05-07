import { getProducts } from '../maestro-productos/product-store.js';
import { getSaldosResumen } from './kardex-store.js';
import { BODEGA_DESACTIVADOS_ID } from './bodega-store.js';

function fmtNum(value) {
  return Number(value ?? 0).toLocaleString('es-CO');
}

function fmtMoney(value) {
  const amount = Number(value ?? 0);
  const normalized = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  return normalized.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export class KardexReportes {
  constructor(container) {
    this.container = container;
    this._loading = false;
  }

  async mount() {
    await this._render();
  }

  unmount() {}

  async _render() {
    this._loading = true;
    this.container.innerHTML = `
      <div class="list-container">
        <button type="button" class="btn-back" id="btn-back-kx-report"><- Kardex</button>
        <h2>Estatus General de Inventario</h2>
        <div class="loading">Consultando saldos y valorizacion...</div>
      </div>`;

    const [products, saldosTotales, saldosDesactivados] = await Promise.all([
      getProducts(),
      getSaldosResumen(),
      getSaldosResumen(BODEGA_DESACTIVADOS_ID),
    ]);

    const productById = new Map(products.map((p) => [p.id, p]));
    const activos = products.filter((p) => p.status === 'active');
    const inactivos = products.filter((p) => p.status !== 'active');

    let totalUnidadesActivas = 0;
    let totalValorizacionActiva = 0;

    const detalleActivos = activos
      .map((p) => {
        const saldoTotal = Number(saldosTotales.get(p.id) ?? 0);
        const saldoDesactivado = Number(saldosDesactivados.get(p.id) ?? 0);
        const saldoActivo = saldoTotal - saldoDesactivado;
        const costo = Number(p.costo ?? 0);
        const valorizacion = saldoActivo * costo;

        totalUnidadesActivas += saldoActivo;
        totalValorizacionActiva += valorizacion;

        return {
          ...p,
          saldoActivo,
          valorizacion,
          costo,
        };
      })
      .sort((a, b) => a.sku.localeCompare(b.sku));

    let unidadesDesactivadas = 0;
    let valorizacionDesactivada = 0;
    for (const [productId, saldo] of saldosDesactivados.entries()) {
      const cantidad = Number(saldo ?? 0);
      if (!Number.isFinite(cantidad)) continue;
      unidadesDesactivadas += cantidad;
      const costo = Number(productById.get(productId)?.costo ?? 0);
      valorizacionDesactivada += cantidad * costo;
    }

    const skusActivosConStock = detalleActivos.filter((d) => d.saldoActivo > 0).length;

    this.container.innerHTML = `
      <div class="list-container">
        <button type="button" class="btn-back" id="btn-back-kx-report"><- Kardex</button>
        <div class="list-header">
          <h2>Estatus General de Inventario</h2>
          <button class="btn-secondary" id="btn-refresh-reportes" style="width:auto;padding:8px 12px">Actualizar</button>
        </div>

        <div class="kx-report-grid">
          <div class="kx-report-card">
            <span class="kx-report-label">SKU activos</span>
            <strong>${fmtNum(activos.length)}</strong>
            <small>Con stock: ${fmtNum(skusActivosConStock)}</small>
          </div>
          <div class="kx-report-card">
            <span class="kx-report-label">SKU inactivos</span>
            <strong>${fmtNum(inactivos.length)}</strong>
            <small>Estado en maestro de productos</small>
          </div>
          <div class="kx-report-card">
            <span class="kx-report-label">Unidades activas</span>
            <strong>${fmtNum(totalUnidadesActivas)}</strong>
            <small>Disponible fuera de desactivados</small>
          </div>
          <div class="kx-report-card">
            <span class="kx-report-label">Valorizacion activa (costo)</span>
            <strong>${fmtMoney(totalValorizacionActiva)}</strong>
            <small>Costo total estimado</small>
          </div>
          <div class="kx-report-card">
            <span class="kx-report-label">Bodega desactivados</span>
            <strong>${fmtNum(unidadesDesactivadas)} uds</strong>
            <small>${fmtMoney(valorizacionDesactivada)}</small>
          </div>
        </div>

        <div class="kx-report-detail-header">
          <h3>Detalle de SKU Activos</h3>
          <span>${fmtNum(detalleActivos.length)} SKU</span>
        </div>

        <div id="kx-report-detail-list">
          ${detalleActivos.length === 0 ? this._empty() : detalleActivos.map((d) => this._detailCard(d)).join('')}
        </div>
      </div>`;

    this._loading = false;
    this._bindEvents();
  }

  _detailCard(item) {
    const estadoStock = item.saldoActivo > 0
      ? `<span class="badge badge-stock">Stock ${fmtNum(item.saldoActivo)}</span>`
      : `<span class="badge" style="background:#f3f4f6;color:#4b5563;border:1px solid #d1d5db">Sin stock</span>`;

    return `
      <div class="product-card">
        <div class="product-card-header">
          <span class="product-sku">${item.sku}</span>
          ${estadoStock}
        </div>
        <div class="product-nombre">${item.nombre ?? '-'}</div>
        <div class="product-meta">
          <span>Costo: ${fmtMoney(item.costo)}</span>
          <span>Valorizacion: ${fmtMoney(item.valorizacion)}</span>
          <span>UoM: ${item.uom ?? '-'}</span>
        </div>
      </div>`;
  }

  _empty() {
    return `
      <div class="empty-state">
        <div style="font-size:28px;margin-bottom:12px">KX</div>
        <p>No hay SKU activos para reportar.</p>
      </div>`;
  }

  _bindEvents() {
    this.container.querySelector('#btn-back-kx-report')?.addEventListener('click', () => navigate('kardex'));
    this.container.querySelector('#btn-refresh-reportes')?.addEventListener('click', async () => {
      if (this._loading) return;
      await this._render();
    });
  }
}

function navigate(view, options = {}) {
  window.__erp_navigate?.(view, options);
}
