/**
 * F8 — Ledger Forense e Historial de Inventario General
 * Solo lectura: sesiones cerradas, snapshot pre/post, trazabilidad ítem por ítem.
 * Prohibido modificar, reabrir o editar sesiones cerradas.
 */

import {
  handleGetHistorialInventarios,
  handleGetHistorialItemsReadOnly,
} from '../auditoria/handlers/index.js';
import { getBodegas } from '../kardex/bodega-store.js';

function _fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

function _fmtCop(val) {
  const n = Number(val ?? 0);
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _statusBadge(session) {
  const MAP = {
    active:        { label: 'Activa',                cls: 'hist-badge-active' },
    ignored:       { label: 'Ignorada',              cls: 'hist-badge-ignored' },
    abandoned:     { label: 'Abandonada',            cls: 'hist-badge-abandoned' },
    closing:       { label: 'Cerrando',              cls: 'hist-badge-closing' },
    partial_close: { label: 'Cierre parcial',        cls: 'hist-badge-partial' },
    committed:     { label: 'Committed',             cls: 'hist-badge-committed' },
    failed:        { label: 'Cierre fallido',        cls: 'hist-badge-failed' },
    closed:        { label: 'Cerrado (legacy)',      cls: 'hist-badge-committed' },
    completed:     { label: 'Completado (legacy)',   cls: 'hist-badge-committed' },
    in_progress:   { label: 'En progreso (legacy)',  cls: 'hist-badge-active' },
  };
  const cfg = MAP[session.status] ?? { label: session.status, cls: '' };
  return `<span class="hist-status-badge ${cfg.cls}">${cfg.label}</span>`;
}

function _sessionTypeLabel(session) {
  if (session.es_inventario_general) return 'Inventario General';
  if (session.type === 'inventario') return 'Inventario';
  return 'Auditoría';
}

export class HistorialInventarioController {
  constructor(container) {
    this.container = container;
    this._sessions = [];
    this._bodegas  = [];
    // filtros activos
    this._filtros = { texto: '', estado: '', desde: '', hasta: '' };
  }

  async mount() {
    this.container.innerHTML = `
      <div class="audit-container">
        <button type="button" class="btn-back" id="btn-hist-back">← Volver</button>
        <div class="audit-header">
          <h2>📜 Historial Forense</h2>
          <span class="audit-badge hist-readonly-badge">🔒 SOLO LECTURA</span>
        </div>
        <p class="audit-hint">Consulta de inventarios cerrados. Sin posibilidad de edición ni reapertura.</p>
        <div id="hist-loading" style="padding:32px;text-align:center;color:#6B7280">Cargando historial…</div>
        <div id="hist-content" style="display:none"></div>
      </div>

      <!-- F8: Overlay detalle sesión histórica -->
      <div class="invgen-ficha-overlay" id="hist-detail-overlay" style="display:none">
        <div class="invgen-ficha-card hist-detail-card">
          <div class="invgen-ficha-header">
            <h3 id="hist-detail-title">Detalle de Sesión</h3>
            <button class="invgen-ficha-close" id="btn-hist-detail-close">✕</button>
          </div>
          <div class="invgen-ficha-body hist-detail-body" id="hist-detail-body" style="padding:12px;overflow-y:auto;max-height:75vh"></div>
        </div>
      </div>`;

    this.container.querySelector('#btn-hist-back').addEventListener('click', () => {
      document.querySelector('[data-view="auditoria"]')?.click();
    });

    this.container.querySelector('#btn-hist-detail-close').addEventListener('click', () => {
      this._closeDetailOverlay();
    });
    this.container.querySelector('#hist-detail-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this._closeDetailOverlay();
    });

    try {
      [this._sessions, this._bodegas] = await Promise.all([
        handleGetHistorialInventarios(),
        getBodegas(),
      ]);
    } catch (err) {
      this.container.querySelector('#hist-loading').textContent = `Error al cargar historial: ${err.message}`;
      return;
    }

    this.container.querySelector('#hist-loading').style.display = 'none';
    const content = this.container.querySelector('#hist-content');
    content.style.display = '';
    this._renderContent(content);
  }

  unmount() {}

  _bodegaNombre(bid) {
    const b = this._bodegas.find((x) => x.id === bid);
    return b ? b.nombre : bid;
  }

  _bodegasLabel(session) {
    if (!Array.isArray(session.bodega_ids) || session.bodega_ids.length === 0) return '—';
    return session.bodega_ids.map((bid) => this._bodegaNombre(bid)).join(', ');
  }

  _filteredSessions() {
    const { texto, estado, desde, hasta } = this._filtros;
    return this._sessions.filter((s) => {
      if (estado && s.status !== estado) return false;
      if (desde) {
        const d = new Date(s.started_at ?? '');
        if (isNaN(d) || d < new Date(desde)) return false;
      }
      if (hasta) {
        const d = new Date(s.started_at ?? '');
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        if (isNaN(d) || d > h) return false;
      }
      if (texto) {
        const q = texto.toLowerCase();
        const bodegasStr = (s.bodega_ids ?? []).map((b) => this._bodegaNombre(b)).join(' ').toLowerCase();
        const hayMatch =
          (s.id ?? '').toLowerCase().includes(q) ||
          (s.scope ?? '').toLowerCase().includes(q) ||
          bodegasStr.includes(q) ||
          _fmtDate(s.started_at).toLowerCase().includes(q) ||
          _sessionTypeLabel(s).toLowerCase().includes(q);
        if (!hayMatch) return false;
      }
      return true;
    });
  }

  _renderContent(container) {
    container.innerHTML = `
      <!-- Filtros -->
      <div class="hist-filtros-bar">
        <input type="search" id="hist-filter-texto" class="ficha-edit-input"
          placeholder="Buscar por ID, tipo, bodega, fecha…"
          value="${this._filtros.texto}" style="flex:2;min-width:140px">
        <select id="hist-filter-estado" class="ficha-edit-input" style="flex:1;min-width:110px">
          <option value="">Todos los estados</option>
          <option value="committed"     ${this._filtros.estado === 'committed'     ? 'selected' : ''}>Committed</option>
          <option value="partial_close" ${this._filtros.estado === 'partial_close' ? 'selected' : ''}>Partial close</option>
          <option value="failed"        ${this._filtros.estado === 'failed'        ? 'selected' : ''}>Failed</option>
          <option value="abandoned"     ${this._filtros.estado === 'abandoned'     ? 'selected' : ''}>Abandonada</option>
          <option value="ignored"       ${this._filtros.estado === 'ignored'       ? 'selected' : ''}>Ignorada</option>
          <option value="closed"        ${this._filtros.estado === 'closed'        ? 'selected' : ''}>Closed (legacy)</option>
          <option value="completed"     ${this._filtros.estado === 'completed'     ? 'selected' : ''}>Completed (legacy)</option>
        </select>
        <input type="date" id="hist-filter-desde" class="ficha-edit-input"
          value="${this._filtros.desde}" style="flex:1;min-width:120px" title="Desde fecha">
        <input type="date" id="hist-filter-hasta" class="ficha-edit-input"
          value="${this._filtros.hasta}" style="flex:1;min-width:120px" title="Hasta fecha">
      </div>

      <!-- Lista de sesiones -->
      <div id="hist-session-list"></div>`;

    // Bind filtros
    container.querySelector('#hist-filter-texto').addEventListener('input', (e) => {
      this._filtros.texto = e.target.value;
      this._refreshList(container.querySelector('#hist-session-list'));
    });
    container.querySelector('#hist-filter-estado').addEventListener('change', (e) => {
      this._filtros.estado = e.target.value;
      this._refreshList(container.querySelector('#hist-session-list'));
    });
    container.querySelector('#hist-filter-desde').addEventListener('change', (e) => {
      this._filtros.desde = e.target.value;
      this._refreshList(container.querySelector('#hist-session-list'));
    });
    container.querySelector('#hist-filter-hasta').addEventListener('change', (e) => {
      this._filtros.hasta = e.target.value;
      this._refreshList(container.querySelector('#hist-session-list'));
    });

    this._refreshList(container.querySelector('#hist-session-list'));
  }

  _refreshList(listEl) {
    if (!listEl) return;
    const sessions = this._filteredSessions();

    if (sessions.length === 0) {
      listEl.innerHTML = `<div class="empty-state">
        <p>${this._sessions.length === 0
          ? '📭 Sin historial — aún no hay sesiones cerradas.'
          : '🔍 Sin resultados para los filtros aplicados.'}</p>
      </div>`;
      return;
    }

    listEl.innerHTML = `
      <p class="audit-hint" style="margin:8px 0">${sessions.length} sesión(es) encontrada(s)</p>
      ${sessions.map((s) => `
        <div class="hist-session-row" data-session-id="${s.id}" role="button" tabindex="0"
          style="cursor:pointer">
          <div class="hist-session-row-left">
            <div class="hist-session-type">${_sessionTypeLabel(s)} ${_statusBadge(s)}</div>
            <div class="hist-session-meta">
              📅 Inicio: ${_fmtDate(s.started_at)}
              ${s.committed_at ? ` · 🔒 Cierre F6: ${_fmtDate(s.committed_at)}` : ''}
            </div>
            <div class="hist-session-meta">
              🏭 Bodegas: ${this._bodegasLabel(s)}
              ${s.adjustments_count != null ? ` · ⚖️ ${s.adjustments_count} ajuste(s)` : ''}
            </div>
          </div>
          <div class="hist-session-row-right">
            <button class="btn-secondary hist-btn-detail" data-session-id="${s.id}"
              style="font-size:12px;padding:5px 10px">Ver detalle →</button>
          </div>
        </div>`).join('')}`;

    listEl.querySelectorAll('.hist-btn-detail').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openDetail(btn.dataset.sessionId);
      });
    });
    listEl.querySelectorAll('.hist-session-row').forEach((row) => {
      row.addEventListener('click', () => this._openDetail(row.dataset.sessionId));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') this._openDetail(row.dataset.sessionId);
      });
    });
  }

  async _openDetail(sessionId) {
    const session = this._sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const overlay = this.container.querySelector('#hist-detail-overlay');
    const body    = this.container.querySelector('#hist-detail-body');
    const title   = this.container.querySelector('#hist-detail-title');

    title.textContent = `${_sessionTypeLabel(session)} — ${_fmtDate(session.started_at)}`;
    body.innerHTML = `<div style="padding:16px;text-align:center;color:#6B7280">Cargando ítems…</div>`;
    overlay.style.display = 'flex';

    let items = [];
    try {
      items = await handleGetHistorialItemsReadOnly(sessionId);
    } catch (err) {
      body.innerHTML = `<p style="color:#EF4444">Error al cargar ítems: ${err.message}</p>`;
      return;
    }

    this._renderDetailBody(body, session, items);
  }

  _renderDetailBody(body, session, items) {
    const snapshotPre  = Array.isArray(session.snapshot_pre)  ? session.snapshot_pre  : [];
    const snapshotPost = Array.isArray(session.snapshot_post) ? session.snapshot_post : [];
    const withDiff = items.filter((i) => Number(i.diferencia ?? 0) !== 0);
    const sinDiff  = items.filter((i) => Number(i.diferencia ?? 0) === 0);
    const op = session?.close_ledger?.subdomain_results ?? {};
    const pendingActions = Array.isArray(session?.close_ledger?.pending_actions)
      ? session.close_ledger.pending_actions
      : (Array.isArray(session?.pending_actions) ? session.pending_actions : []);

    const opRow = (label, key) => {
      const st = op?.[key]?.status ?? 'n/a';
      const errors = Array.isArray(op?.[key]?.errors) ? op[key].errors.length : 0;
      const doneAt = op?.[key]?.finished_at ? _fmtDate(op[key].finished_at) : '—';
      return `<div class="ficha-row"><span class="ficha-label">${label}</span><span class="ficha-val">${st}${errors > 0 ? ` · ${errors} error(es)` : ''} · ${doneAt}</span></div>`;
    };

    body.innerHTML = `
      <!-- Encabezado sesión -->
      <div class="hist-detail-header-grid">
        <div class="ficha-row"><span class="ficha-label">Estado</span><span class="ficha-val">${_statusBadge(session)}</span></div>
        <div class="ficha-row"><span class="ficha-label">Tipo</span><span class="ficha-val">${_sessionTypeLabel(session)}</span></div>
        <div class="ficha-row"><span class="ficha-label">Alcance</span><span class="ficha-val">${session.scope ?? '—'}</span></div>
        <div class="ficha-row"><span class="ficha-label">Bodegas</span><span class="ficha-val">${this._bodegasLabel(session)}</span></div>
        <div class="ficha-row"><span class="ficha-label">Inicio</span><span class="ficha-val">${_fmtDate(session.started_at)}</span></div>
        ${session.committed_at ? `<div class="ficha-row"><span class="ficha-label">Cierre F6</span><span class="ficha-val">${_fmtDate(session.committed_at)}</span></div>` : ''}
        ${session.completed_at && !session.committed_at ? `<div class="ficha-row"><span class="ficha-label">Completado</span><span class="ficha-val">${_fmtDate(session.completed_at)}</span></div>` : ''}
        ${session.adjustments_count != null ? `<div class="ficha-row"><span class="ficha-label">Ajustes Kardex</span><span class="ficha-val">${session.adjustments_count}</span></div>` : ''}
        <div class="ficha-row"><span class="ficha-label">Total ítems</span><span class="ficha-val">${items.length}</span></div>
        <div class="ficha-row"><span class="ficha-label">Con diferencia</span><span class="ficha-val">${withDiff.length}</span></div>
      </div>

      <div class="hist-readonly-notice">🔒 Registro forense en solo lectura. No se puede editar ni reabrir desde historial.</div>

      <div class="hist-snapshot-section">
        <h4 class="hist-section-title">🧭 Verdad operativa de cierre</h4>
        ${opRow('Kardex', 'kardex')}
        ${opRow('Costos', 'costos')}
        ${opRow('Snapshot', 'snapshot')}
        ${opRow('Historial', 'historial')}
        <div class="ficha-row"><span class="ficha-label">Acciones pendientes</span><span class="ficha-val">${pendingActions.length ? pendingActions.join(', ') : 'ninguna'}</span></div>
      </div>

      <!-- Snapshot Pre / Post -->
      ${(snapshotPre.length > 0 || snapshotPost.length > 0) ? `
      <div class="hist-snapshot-section">
        <h4 class="hist-section-title">📸 Snapshot Pre / Post Cierre</h4>
        <div class="hist-snapshot-grid">
          <div class="hist-snapshot-col">
            <div class="hist-snapshot-head">ANTES (sistema)</div>
            ${snapshotPre.length === 0
              ? '<p class="audit-hint">Sin datos pre-cierre</p>'
              : snapshotPre.map((row) => `
                <div class="hist-snap-row">
                  <span class="hist-snap-sku">${row.sku ?? '—'}</span>
                  <span class="hist-snap-qty">${row.qty ?? 0}</span>
                  <span class="hist-snap-costo">$${_fmtCop(row.costo)}</span>
                </div>`).join('')}
          </div>
          <div class="hist-snapshot-col">
            <div class="hist-snapshot-head">DESPUÉS (físico)</div>
            ${snapshotPost.length === 0
              ? '<p class="audit-hint">Sin datos post-cierre</p>'
              : snapshotPost.map((row) => `
                <div class="hist-snap-row">
                  <span class="hist-snap-sku">${row.sku ?? '—'}</span>
                  <span class="hist-snap-qty">${row.qty ?? 0}</span>
                  <span class="hist-snap-costo">$${_fmtCop(row.costo)}</span>
                </div>`).join('')}
          </div>
        </div>
      </div>` : ''}

      <!-- Trazabilidad ítem por ítem: ítems con diferencia -->
      ${withDiff.length > 0 ? `
      <div class="hist-items-section">
        <h4 class="hist-section-title">⚖️ Ítems con Diferencia (${withDiff.length})</h4>
        <div class="hist-items-table-wrap">
          <table class="hist-items-table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th>SKU</th>
                <th>Cant. sistema</th>
                <th>Cant. física</th>
                <th>Diferencia</th>
                <th>Costo sistema</th>
                <th>Costo físico</th>
                <th>Causal</th>
                <th>Modo</th>
                <th>Usuario</th>
                <th>Timestamp causal</th>
              </tr>
            </thead>
            <tbody>
              ${withDiff.map((i) => `
                <tr>
                  <td>${i.nombre ?? '—'}</td>
                  <td class="mono">${i.sku ?? '—'}</td>
                  <td>${i.qty_sistema ?? 0}</td>
                  <td>${i.qty_fisica ?? '—'}</td>
                  <td class="${Number(i.diferencia) > 0 ? 'diff-pos' : 'diff-neg'}">
                    ${Number(i.diferencia) > 0 ? '+' : ''}${i.diferencia ?? '—'}
                  </td>
                  <td>$${_fmtCop(i.costo_sistema)}</td>
                  <td>${i.costo_fisico != null ? '$' + _fmtCop(i.costo_fisico) : '—'}</td>
                  <td><strong>${i.causal ?? '—'}</strong></td>
                  <td>${i.causal_applied_by ?? '—'}</td>
                  <td>${i.causal_usuario ?? '—'}</td>
                  <td>${i.causal_timestamp ? _fmtDate(i.causal_timestamp) : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      <!-- Ítems sin diferencia -->
      ${sinDiff.length > 0 ? `
      <div class="hist-items-section">
        <h4 class="hist-section-title">✅ Ítems sin Diferencia (${sinDiff.length})</h4>
        <div class="hist-items-table-wrap">
          <table class="hist-items-table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th>SKU</th>
                <th>Cantidad sistema</th>
                <th>Cantidad física</th>
                <th>Costo sistema</th>
              </tr>
            </thead>
            <tbody>
              ${sinDiff.map((i) => `
                <tr>
                  <td>${i.nombre ?? '—'}</td>
                  <td class="mono">${i.sku ?? '—'}</td>
                  <td>${i.qty_sistema ?? 0}</td>
                  <td>${i.qty_fisica ?? '—'}</td>
                  <td>$${_fmtCop(i.costo_sistema)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      ${items.length === 0 ? '<p class="audit-hint" style="text-align:center">Sin ítems registrados en esta sesión.</p>' : ''}`;
  }

  _closeDetailOverlay() {
    const overlay = this.container.querySelector('#hist-detail-overlay');
    if (overlay) overlay.style.display = 'none';
  }
}
