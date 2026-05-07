// P16_EXPORT_AUDIT — Consulta y exportación de auditoría RBAC
// Query: rango de fechas, usuario, acción, resultado (ALLOW/DENY)
// Export: CSV y JSON via Blob + anchor download
import { getRbacAuditLog, getRbacAuditByRange } from '../../db/local-db.js';
import { PERMISOS } from '../pedidos/handlers/rbac.js';

const ACTIONS = Object.keys(PERMISOS);

function _fmtTs(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('es-CO'); } catch { return ts; }
}

function _escapeCsv(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function _downloadBlob(content, filename, type) {
  const blob = new Blob(['﻿' + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export class RbacAuditExport {
  constructor(container) {
    this._container = container;
    this._rows = [];
  }

  mount() {
    this._render();
  }

  unmount() {
    this._container.innerHTML = '';
  }

  _render() {
    const actionsOpts = ['TODAS', ...ACTIONS]
      .map((a) => `<option value="${a}">${a}</option>`).join('');

    this._container.innerHTML = `
      <div class="list-container">
        <div class="list-header">
          <h2 class="page-title">Exportar auditoría RBAC</h2>
        </div>

        <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
              <label class="field-label">Desde</label>
              <input type="datetime-local" id="rbac-from" class="field-input">
            </div>
            <div>
              <label class="field-label">Hasta</label>
              <input type="datetime-local" id="rbac-to" class="field-input">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
            <div>
              <label class="field-label">Usuario</label>
              <input type="text" id="rbac-user" class="field-input" placeholder="Todos">
            </div>
            <div>
              <label class="field-label">Acción</label>
              <select id="rbac-action" class="field-input">
                ${actionsOpts}
              </select>
            </div>
            <div>
              <label class="field-label">Resultado</label>
              <select id="rbac-result" class="field-input">
                <option value="TODOS">TODOS</option>
                <option value="ALLOW">ALLOW</option>
                <option value="DENY">DENY</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <button id="btn-rbac-query" class="btn-primary">Consultar</button>
            <button id="btn-rbac-csv"  class="btn-secondary" disabled>↓ CSV</button>
            <button id="btn-rbac-json" class="btn-secondary" disabled>↓ JSON</button>
          </div>
        </div>

        <div id="rbac-results">
          <div class="empty-state">Aplique filtros y presione Consultar.</div>
        </div>
      </div>`;

    this._container.querySelector('#btn-rbac-query')
      ?.addEventListener('click', () => this._query());
    this._container.querySelector('#btn-rbac-csv')
      ?.addEventListener('click', () => this._exportCsv());
    this._container.querySelector('#btn-rbac-json')
      ?.addEventListener('click', () => this._exportJson());
  }

  async _query() {
    const fromVal  = this._container.querySelector('#rbac-from')?.value ?? '';
    const toVal    = this._container.querySelector('#rbac-to')?.value ?? '';
    const userVal  = (this._container.querySelector('#rbac-user')?.value ?? '').trim().toLowerCase();
    const action   = this._container.querySelector('#rbac-action')?.value ?? 'TODAS';
    const result   = this._container.querySelector('#rbac-result')?.value ?? 'TODOS';

    const btnQuery = this._container.querySelector('#btn-rbac-query');
    if (btnQuery) { btnQuery.disabled = true; btnQuery.textContent = 'Consultando…'; }

    try {
      let rows;
      if (fromVal && toVal) {
        const fromISO = new Date(fromVal).toISOString();
        const toISO   = new Date(toVal).toISOString();
        rows = await getRbacAuditByRange(fromISO, toISO, 2000);
      } else {
        rows = await getRbacAuditLog(2000);
      }

      if (userVal)            rows = rows.filter((r) => (r.user ?? '').toLowerCase().includes(userVal));
      if (action !== 'TODAS') rows = rows.filter((r) => r.action === action);
      if (result !== 'TODOS') rows = rows.filter((r) => r.result === result);

      this._rows = rows;
      this._renderResults();
    } finally {
      if (btnQuery) { btnQuery.disabled = false; btnQuery.textContent = 'Consultar'; }
    }
  }

  _renderResults() {
    const el      = this._container.querySelector('#rbac-results');
    const csvBtn  = this._container.querySelector('#btn-rbac-csv');
    const jsonBtn = this._container.querySelector('#btn-rbac-json');
    if (!el) return;

    const hasRows = this._rows.length > 0;
    if (csvBtn)  csvBtn.disabled  = !hasRows;
    if (jsonBtn) jsonBtn.disabled = !hasRows;

    if (!hasRows) {
      el.innerHTML = '<div class="empty-state">Sin resultados para los filtros aplicados.</div>';
      return;
    }

    const preview = this._rows.slice(0, 500);

    el.innerHTML = `
      <div style="font-size:12px;color:#555;margin-bottom:8px">
        ${this._rows.length} registro(s) encontrados.
        ${this._rows.length > 500 ? ' Mostrando 500. Exportar incluye todos.' : ''}
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#e0e0e0">
              <th style="padding:6px 8px;text-align:left;white-space:nowrap">Fecha/Hora</th>
              <th style="padding:6px 8px;text-align:left">Usuario</th>
              <th style="padding:6px 8px;text-align:left">Rol</th>
              <th style="padding:6px 8px;text-align:left">Acción</th>
              <th style="padding:6px 8px;text-align:left">Resultado</th>
            </tr>
          </thead>
          <tbody>
            ${preview.map((r) => `
              <tr style="border-bottom:1px solid #eee">
                <td style="padding:5px 8px;white-space:nowrap">${_fmtTs(r.timestamp)}</td>
                <td style="padding:5px 8px">${r.user ?? '—'}</td>
                <td style="padding:5px 8px">${r.role ?? '—'}</td>
                <td style="padding:5px 8px;font-family:monospace;font-size:11px">${r.action}</td>
                <td style="padding:5px 8px">
                  <span style="font-weight:700;color:${r.result === 'DENY' ? '#d32f2f' : '#388e3c'}">
                    ${r.result}
                  </span>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  _exportCsv() {
    if (!this._rows.length) return;
    const header = 'id,user,role,action,result,timestamp\n';
    const body = this._rows
      .map((r) => [r.id, r.user, r.role, r.action, r.result, r.timestamp].map(_escapeCsv).join(','))
      .join('\n');
    const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    _downloadBlob(header + body, `rbac_audit_${ts}.csv`, 'text/csv;charset=utf-8;');
  }

  _exportJson() {
    if (!this._rows.length) return;
    const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    _downloadBlob(
      JSON.stringify(this._rows, null, 2),
      `rbac_audit_${ts}.json`,
      'application/json'
    );
  }
}
