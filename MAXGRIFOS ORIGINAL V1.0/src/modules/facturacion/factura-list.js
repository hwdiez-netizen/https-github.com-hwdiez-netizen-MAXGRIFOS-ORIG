import { handleGetDocumentos, handleAnularDocumento, handleRegistrarReimpresion } from './comprobantes-handlers.js';
// No local-db import
import { generarYDescargarPDF } from './pdf-generator.js';
import { eventBus, Events } from '../../events/domain-events.js';

function fmtDate(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

const SNAPSHOT_ENFORCED_AT_ISO = '2026-04-29T00:00:00.000Z';

function _cantidadDocumentoItem(item) {
  const cantidad = Number(item?.cantidad ?? item?.cantidad_picking ?? item?.cantidad_pedida ?? 0);
  return Number.isFinite(cantidad) ? cantidad : 0;
}

function _normalizarSnapshot(items = []) {
  return items
    .map((item) => {
      const cantidad = _cantidadDocumentoItem(item);
      const precioUnitario = Number(item?.precio_unitario ?? 0);
      return {
        item_id: item.item_id ?? item.id ?? null,
        product_id: item.product_id,
        product_sku: item.product_sku,
        product_name: item.product_name,
        cantidad,
        precio_unitario: precioUnitario,
        subtotal: Number(item?.subtotal ?? (cantidad * precioUnitario)),
        status: item?.status ?? 'active',
      };
    })
    .filter((item) => item.product_id && item.status !== 'inactive' && item.cantidad > 0);
}

function _isLegacyDocWithoutSnapshot(doc) {
  if (Array.isArray(doc?.items_snapshot) && doc.items_snapshot.length > 0) return false;
  const emittedAt = Date.parse(doc?.emitido_at ?? '');
  const cutoff = Date.parse(SNAPSHOT_ENFORCED_AT_ISO);
  if (Number.isNaN(emittedAt) || Number.isNaN(cutoff)) return false;
  return emittedAt < cutoff;
}

export class FacturaList {
  constructor(container) {
    this.container = container;
    this._docs = [];
    this._tab = 'emitido';
    this._query = '';
    this._unsubs = [];

    this._detailDoc = null;
    this._detailItems = null;
    this._detailNavIds = [];
    this._detailIndex = -1;

    this._touchStartX = null;
    this._touchStartY = null;
  }

  async mount() {
    this.container.innerHTML = `<div class="loading">Cargando documentos...</div>`;
    this._docs = await handleGetDocumentos();
    this._render();
    this._subscribeEvents();
  }

  unmount() {
    this._unsubs.forEach((fn) => fn());
  }

  _subscribeEvents() {
    const reload = async () => {
      this._docs = await handleGetDocumentos();
      if (this._detailDoc) {
        const updated = this._docs.find((d) => d.id === this._detailDoc.id);
        if (!updated) {
          this._closeDetail();
          return;
        }
        this._detailDoc = updated;
      }
      this._render();
    };

    this._unsubs.push(
      eventBus.on(Events.FACTURA_EMITIDA, reload),
      eventBus.on(Events.REMISION_EMITIDA, reload),
    );
  }

  _filtered() {
    const q = this._query.toLowerCase();
    return this._docs.filter((d) => {
      if (d.estado !== this._tab) return false;
      if (!q) return true;
      return (
        (d.consecutivo ?? '').toLowerCase().includes(q) ||
        (d.cliente_nombre ?? '').toLowerCase().includes(q)
      );
    });
  }

  _render() {
    const emitidos = this._docs.filter((d) => d.estado === 'emitido').length;
    const anulados = this._docs.filter((d) => d.estado === 'anulado').length;
    const list = this._filtered();

    this.container.innerHTML = `
      <div class="list-container">
        <div class="list-header">
          <h2>Facturacion</h2>
          <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">
            <span class="product-count">${emitidos} emitidos · ${anulados} anulados</span>
            <button type="button" class="btn-secondary" id="btn-fac-config" style="width:auto;padding:8px 12px">
              Configuracion
            </button>
          </div>
        </div>

        <input type="search" class="search-input" id="fac-search"
          placeholder="Buscar por consecutivo o cliente..."
          value="${this._query}" autocomplete="off">

        <div class="sub-tabs" style="margin-top:12px">
          <button class="sub-tab ${this._tab === 'emitido' ? 'active' : ''}" data-tab="emitido">
            Emitidos (${emitidos})
          </button>
          <button class="sub-tab ${this._tab === 'anulado' ? 'active' : ''}" data-tab="anulado">
            Anulados (${anulados})
          </button>
        </div>

        <div id="fac-list-body" style="margin-top:14px">
          ${list.length === 0 ? this._emptyState() : list.map((d, idx) => this._cardHtml(d, idx)).join('')}
        </div>
      </div>
      ${this._detailDoc ? this._detailFullscreenHtml() : ''}`;

    this._bindEvents();
  }

  _cardHtml(d, idx) {
    const isFac = d.tipo === 'FAC';
    const sync = d.sync_status === 'synced' ? '🟢' : d.sync_status === 'error' ? '🔴' : '🟡';
    const tipoCls = isFac ? 'doc-badge-fac' : 'doc-badge-rem';

    return `
      <div class="product-card doc-card-item" data-id="${d.id}" data-idx="${idx}" role="button" tabindex="0">
        <div class="product-card-header">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="doc-tipo-badge ${tipoCls}">${isFac ? '🧾 FACTURA' : '📋 REMISION'}</span>
            <span class="product-nombre">${d.consecutivo}</span>
            ${d.reimpresiones > 0 ? `<span class="doc-reimpresion-badge">COPIA ×${d.reimpresiones}</span>` : ''}
          </div>
          <span class="product-sync">${sync}</span>
        </div>

        <div class="product-meta">
          <span>👤 ${d.cliente_nombre}</span>
          <span>💰 $${Number(d.total ?? 0).toLocaleString('es-CO')}</span>
          <span>${fmtDate(d.emitido_at)}</span>
        </div>

        <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">
          Toca para ver en pantalla completa (solo lectura)
        </div>

        <div class="card-actions">
          <button class="btn-action btn-edit doc-btn-pdf" data-id="${d.id}" data-reprint="false">
            📄 Descargar PDF
          </button>
          ${d.estado === 'emitido' && d.reimpresiones > 0
            ? `<button class="btn-action doc-btn-pdf" data-id="${d.id}" data-reprint="true">🖨️ Reimprimir (COPIA)</button>`
            : ''}
        </div>
      </div>`;
  }

  _emptyState() {
    return `<div class="empty-state">
      <div style="font-size:40px;margin-bottom:12px">🧾</div>
      <p>${this._query ? 'Sin resultados.' : 'No hay documentos emitidos aun.'}</p>
    </div>`;
  }

  _detailFullscreenHtml() {
    const d = this._detailDoc;
    const items = this._detailItems;
    if (!d) return '';

    const total = Number(d.total ?? 0);
    const tipoTxt = d.tipo === 'FAC' ? 'Factura' : 'Remision';
    const estadoTxt = String(d.estado ?? '').toUpperCase();
    const pos = this._detailIndex >= 0 ? this._detailIndex + 1 : 1;
    const count = this._detailNavIds.length || 1;
    const canPrev = this._detailIndex > 0;
    const canNext = this._detailIndex >= 0 && this._detailIndex < this._detailNavIds.length - 1;

    return `
      <div id="doc-detail-overlay"
           style="position:fixed;inset:0;background:#f8fafc;z-index:9999;display:flex;flex-direction:column;">

        <div style="position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;z-index:2;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <button class="btn-secondary" id="btn-close-doc-detail" type="button">← Cerrar</button>
            <div style="font-size:12px;color:#6b7280">${pos} / ${count}</div>
          </div>
          <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div>
              <h3 style="margin:0">${tipoTxt} ${d.consecutivo}</h3>
              <div style="font-size:12px;color:#6b7280">${estadoTxt} · ${fmtDate(d.emitido_at)}</div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn-secondary" id="btn-doc-prev" type="button" ${canPrev ? '' : 'disabled'}>←</button>
              <button class="btn-secondary" id="btn-doc-next" type="button" ${canNext ? '' : 'disabled'}>→</button>
            </div>
          </div>
        </div>

        <div id="doc-fullscreen-body" style="flex:1;overflow:auto;padding:12px;">
          <div class="product-detail-card" style="margin-bottom:12px;">
            <div class="detail-row"><span class="detail-label">Cliente</span><span class="detail-value">${d.cliente_nombre ?? '—'}</span></div>
            ${d.cliente_nit ? `<div class="detail-row"><span class="detail-label">NIT</span><span class="detail-value">${d.cliente_nit}</span></div>` : ''}
            <div class="detail-row"><span class="detail-label">Pedido</span><span class="detail-value">${d.pedido_id ?? '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Reimpresiones</span><span class="detail-value">${Number(d.reimpresiones ?? 0)}</span></div>
            ${d.motivo_anulacion ? `<div class="detail-row"><span class="detail-label">Motivo anulacion</span><span class="detail-value">${d.motivo_anulacion}</span></div>` : ''}
          </div>

          ${items === null
            ? `<div class="loading">Cargando detalle...</div>`
            : `<table class="ped-table" style="margin-bottom:12px;">
                <thead><tr><th>SKU</th><th>Descripcion</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
                <tbody>
                  ${items.map((it) => `
                    <tr>
                      <td class="ped-sku">${it.product_sku ?? '—'}</td>
                      <td>${it.product_name ?? '—'}</td>
                      <td>${Number(it.cantidad ?? it.cantidad_picking ?? 0)}</td>
                      <td>$${Number(it.precio_unitario ?? 0).toLocaleString('es-CO')}</td>
                      <td>$${Number(it.subtotal ?? ((it.cantidad ?? it.cantidad_picking ?? 0) * (it.precio_unitario ?? 0))).toLocaleString('es-CO')}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" style="text-align:right;font-weight:600">Total:</td>
                    <td style="font-weight:700;color:var(--primary)">$${total.toLocaleString('es-CO')}</td>
                  </tr>
                </tfoot>
              </table>`}

          <div style="font-size:12px;color:#6b7280;padding:4px 0 10px;">
            Vista solo lectura. Desliza con el dedo de derecha a izquierda para ir a la siguiente factura.
          </div>
        </div>
      </div>`;
  }

  async _resolverItemsDocumento(doc) {
    const snapshotItems = _normalizarSnapshot(doc?.items_snapshot ?? []);
    if (snapshotItems.length > 0) return snapshotItems;

    if (_isLegacyDocWithoutSnapshot(doc)) {
      console.warn('[Facturacion][FacturaList] Documento legacy sin items_snapshot; se muestra snapshot vacío para evitar acceso directo a local-db.', {
        documento_id: doc?.id,
        pedido_id: doc?.pedido_id,
        tipo: doc?.tipo,
      });
      return [];
    }

    console.warn('[FacturaList] Documento emitido sin snapshot valido', {
      documento_id: doc?.id ?? null,
      pedido_id: doc?.pedido_id ?? null,
    });
    return [];
  }

  async _openDetail(docId, navIds = null) {
    const doc = this._docs.find((d) => d.id === docId);
    if (!doc) return;

    const ids = Array.isArray(navIds) && navIds.length > 0
      ? navIds
      : this._filtered().map((d) => d.id);

    this._detailNavIds = ids;
    this._detailIndex = this._detailNavIds.indexOf(docId);
    if (this._detailIndex < 0) {
      this._detailNavIds = [docId];
      this._detailIndex = 0;
    }

    this._detailDoc = doc;
    this._detailItems = null;
    this._render();

    this._detailItems = await this._resolverItemsDocumento(doc);
    this._render();
  }

  async _goDetail(step) {
    if (this._detailIndex < 0) return;

    const nextIndex = this._detailIndex + step;
    if (nextIndex < 0 || nextIndex >= this._detailNavIds.length) return;

    const nextId = this._detailNavIds[nextIndex];
    const nextDoc = this._docs.find((d) => d.id === nextId);
    if (!nextDoc) return;

    this._detailIndex = nextIndex;
    this._detailDoc = nextDoc;
    this._detailItems = null;
    this._render();

    this._detailItems = await this._resolverItemsDocumento(nextDoc);
    this._render();
  }

  _closeDetail() {
    this._detailDoc = null;
    this._detailItems = null;
    this._detailNavIds = [];
    this._detailIndex = -1;
    this._touchStartX = null;
    this._touchStartY = null;
    this._render();
  }

  _bindEvents() {
    this.container.querySelector('#btn-fac-config')?.addEventListener('click', () => {
      window.__erp_navigate?.('configuracion');
    });

    this.container.querySelector('#fac-search')?.addEventListener('input', (e) => {
      this._query = e.target.value;
      this._render();
    });

    this.container.querySelectorAll('.sub-tab').forEach((b) => {
      b.addEventListener('click', () => {
        this._tab = b.dataset.tab;
        this._render();
      });
    });

    const navIds = this._filtered().map((d) => d.id);
    this.container.querySelectorAll('.doc-card-item').forEach((card) => {
      const open = () => this._openDetail(card.dataset.id, navIds);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    this.container.querySelectorAll('.doc-btn-pdf').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const esReprint = btn.dataset.reprint === 'true';
        const doc = this._docs.find((d) => d.id === id);
        if (!doc) return;

        const items = await this._resolverItemsDocumento(doc);
        btn.textContent = 'Generando...';
        await generarYDescargarPDF(doc, items, esReprint);
        btn.textContent = esReprint ? '🖨️ Reimprimir (COPIA)' : '📄 Descargar PDF';

        if (esReprint) {
          this._docs = await handleGetDocumentos();
          this._render();
        }
      });
    });

    this.container.querySelector('#btn-close-doc-detail')?.addEventListener('click', () => this._closeDetail());
    this.container.querySelector('#btn-doc-prev')?.addEventListener('click', () => this._goDetail(-1));
    this.container.querySelector('#btn-doc-next')?.addEventListener('click', () => this._goDetail(1));

    const swipeArea = this.container.querySelector('#doc-fullscreen-body');
    swipeArea?.addEventListener('touchstart', (e) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      this._touchStartX = t.clientX;
      this._touchStartY = t.clientY;
    }, { passive: true });

    swipeArea?.addEventListener('touchend', (e) => {
      const t = e.changedTouches?.[0];
      if (!t || this._touchStartX === null || this._touchStartY === null) return;

      const dx = t.clientX - this._touchStartX;
      const dy = t.clientY - this._touchStartY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      this._touchStartX = null;
      this._touchStartY = null;

      if (absX < 50 || absX <= absY) return;
      if (dx < 0) {
        this._goDetail(1);
      } else {
        this._goDetail(-1);
      }
    }, { passive: true });
  }
}
