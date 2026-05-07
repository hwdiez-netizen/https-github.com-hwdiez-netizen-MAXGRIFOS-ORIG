import {
  handleStartSesion,
  handleCargarProductos,
  handleAgregarItem,
  handleRegistrarConteo,
  handleConciliarItem,
  handleCerrarSesion,
  handleAbandonarSesion,
  handleGetSessionItems,
} from './handlers/index.js';
import { getBodegas } from '../kardex/bodega-store.js';
import { getAuditSession } from '../../db/local-db.js';
import { eventBus, Events } from '../../events/domain-events.js';

const CAUSALES = [
  'SIN DIFERENCIA',
  'MERMA / DETERIORO',
  'ROBO / HURTO',
  'VENTA NO REGISTRADA',
  'DEVOLUCION NO REGISTRADA',
  'ERROR CONTEO ANTERIOR',
  'TRANSFERENCIA NO REGISTRADA',
  'AJUSTE INICIAL',
  'OTRO',
];

const SS_STATE = 'audit_nav_state';
const SS_CODE  = 'audit_scanned_code';

export class AuditoriaController {
  constructor(container) {
    this.container = container;
    this._session = null;
    this._items = [];
    this._availableProducts = [];
    this._selectedIds = new Set();
    this._singleProduct = null;
    this._unsubs = [];
  }

  async mount(options = {}) {
    if (options.singleProduct) {
      this._singleProduct = options.singleProduct;
      await this._startSingleProductAudit();
      return;
    }

    if (options.resumeSession) {
      await this._resumeSession(options.resumeSession);
      return;
    }

    // Check if returning from scanner scan
    const savedState = sessionStorage.getItem(SS_STATE);
    const scannedCode = sessionStorage.getItem(SS_CODE);
    if (savedState && scannedCode) {
      await this._restoreFromScan(JSON.parse(savedState), scannedCode);
      return;
    }

    this._renderSelection();
  }

  // Called by navigate() before switching away — returns false to cancel
  canUnmount() {
    if (this._session && this._session.status === 'in_progress') {
      return confirm(
        'Hay un proceso activo.\n¿Salir de todas formas? Al regresar podrás retomar donde lo dejaste.'
      );
    }
    return true;
  }

  unmount() {
    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
  }

  // ── Private: resume existing session ───────────────────
  async _resumeSession(session) {
    this._session = session;
    this._items = await handleGetSessionItems(session.id);
    const allCounted = this._items.length > 0 && this._items.every((i) => i.qty_fisica !== null);
    if (allCounted) {
      this._renderReconciliation();
    } else {
      this._renderCounting();
    }
  }

  async _restoreFromScan(state, code) {
    sessionStorage.removeItem(SS_STATE);
    sessionStorage.removeItem(SS_CODE);

    // Reload the session and available products
    this._session = await getAuditSession(state.sessionId);
    this._availableProducts = await handleCargarProductos(state.scope);
    this._selectedIds = new Set(state.selectedIds);

    // Auto-match scanned code to a product
    const match = this._availableProducts.find(
      (p) => p.sku === code || p.ref_proveedor === code
    );
    if (match) this._selectedIds.add(match.id);

    this._renderAuditoriaItemSelection(match ? match.nombre : null);
  }

  async _startSingleProductAudit() {
    const p = this._singleProduct;
    this._session = await handleStartSesion('auditoria', p.status);
    this._items = [await handleAgregarItem(this._session.id, p)];
    this._renderCounting();
  }

  // ── Phase 0: Type + scope selection ────────────────────
  _renderSelection() {
    this.container.innerHTML = `
      <div class="audit-container">
        <button type="button" class="btn-back" id="btn-back-sel" hidden>← Volver</button>
        <h2>📋 Auditoría e Inventario</h2>

        <div class="audit-option-card">
          <div class="audit-option-header">
            <span class="audit-option-icon">🔍</span>
            <div>
              <div class="audit-option-title">AUDITORÍA</div>
              <div class="audit-option-desc">Verificación de ítems seleccionados</div>
            </div>
          </div>
          <div class="audit-scope-group">
            <label class="audit-scope-label"><input type="radio" name="scope-a" value="active" checked> 🟢 Activos</label>
            <label class="audit-scope-label"><input type="radio" name="scope-a" value="inactive"> 🔴 Inactivos</label>
            <label class="audit-scope-label"><input type="radio" name="scope-a" value="both"> ⚡ Ambos</label>
          </div>
          <button class="btn-primary" id="btn-start-auditoria">Iniciar Auditoría</button>
        </div>

        <div class="audit-option-card">
          <div class="audit-option-header">
            <span class="audit-option-icon">📦</span>
            <div>
              <div class="audit-option-title">INVENTARIO GENERAL</div>
              <div class="audit-option-desc">Conteo completo multi-bodega con scanner Code128</div>
            </div>
          </div>
          <button class="btn-primary" id="btn-start-inventario">Ir a Inventario General →</button>
        </div>

        <div class="audit-option-card" style="border:1px solid #E5E7EB;background:#F9FAFB">
          <div class="audit-option-header">
            <span class="audit-option-icon">📜</span>
            <div>
              <div class="audit-option-title">HISTORIAL FORENSE</div>
              <div class="audit-option-desc">Consulta sesiones cerradas — solo lectura</div>
            </div>
          </div>
          <button class="btn-secondary" id="btn-go-historial" style="margin-top:8px">Ver Historial →</button>
        </div>
      </div>`;

    this.container.querySelector('#btn-back-sel').addEventListener('click', () => {
      document.querySelector('[data-view="lista"]')?.click();
    });

    this.container.querySelector('#btn-start-auditoria').addEventListener('click', async () => {
      const scope = this.container.querySelector('input[name="scope-a"]:checked').value;
      this._availableProducts = await handleCargarProductos(scope);
      this._session = await handleStartSesion('auditoria', scope);
      this._renderAuditoriaItemSelection();
    });

    this.container.querySelector('#btn-start-inventario').addEventListener('click', () => {
      window.__erp_navigate?.('inventario-general');
    });

    this.container.querySelector('#btn-go-historial').addEventListener('click', () => {
      window.__erp_navigate?.('historial-inventario');
    });
  }

  // ── Phase 1: Item selection (Auditoría mode) ────────────
  _renderAuditoriaItemSelection(highlightName = null) {
    this.container.innerHTML = `
      <div class="audit-container">
        <button type="button" class="btn-back" id="btn-back-items" hidden>← Volver</button>
        <div class="audit-header">
          <h2>🔍 Seleccionar Ítems</h2>
          <span class="audit-badge">AUDITORÍA</span>
        </div>

        <div class="audit-search-bar">
          <input type="text" id="audit-search" class="field-input"
            placeholder="Buscar por nombre, SKU o código proveedor...">
          <button class="btn-scan-audit" id="btn-scan-sel" title="Escanear código de barras">📷</button>
        </div>

        ${highlightName ? `<div class="audit-scan-toast">✅ Añadido por escaneo: <strong>${highlightName}</strong></div>` : ''}

        <div class="audit-select-actions">
          <button class="btn-secondary" id="btn-toggle-all">Seleccionar todos</button>
          <button class="btn-primary" id="btn-confirm-sel">
            Continuar (<span id="sel-count">${this._selectedIds.size}</span>)
          </button>
        </div>

        <div id="audit-prod-list">
          ${this._availableProducts.map((p) => `
            <label class="audit-product-row" data-id="${p.id}"
              data-search="${p.nombre} ${p.sku} ${p.ref_proveedor ?? ''}">
              <input type="checkbox" class="audit-check" data-id="${p.id}"
                ${this._selectedIds.has(p.id) ? 'checked' : ''}>
              <div class="audit-product-info">
                <div class="audit-product-name">${p.nombre}</div>
                <div class="audit-product-meta">${p.sku} · 📦 ${p.cantidad ?? 0} ${p.uom}</div>
                <div class="audit-product-meta">📋 ${p.ref_proveedor ?? '—'}</div>
              </div>
            </label>`).join('')}
        </div>
      </div>`;

    this.container.querySelector('#btn-back-items').addEventListener('click', () => {
      if (confirm('¿Cancelar la selección de ítems y volver?')) {
        this._session = null;
        this._renderSelection();
      }
    });

    const updateCount = () => {
      this._selectedIds = new Set(
        [...this.container.querySelectorAll('.audit-check:checked')].map((c) => c.dataset.id)
      );
      this.container.querySelector('#sel-count').textContent = this._selectedIds.size;
    };

    this.container.querySelectorAll('.audit-check').forEach((cb) =>
      cb.addEventListener('change', updateCount)
    );

    this.container.querySelector('#audit-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      this.container.querySelectorAll('.audit-product-row').forEach((row) => {
        row.style.display = row.dataset.search.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    this.container.querySelector('#btn-toggle-all').addEventListener('click', () => {
      const checks = [...this.container.querySelectorAll('.audit-check')];
      const allChecked = checks.every((c) => c.checked);
      checks.forEach((c) => (c.checked = !allChecked));
      updateCount();
    });

    // Scan button: save state → navigate to scanner → on return, restore + auto-select
    this.container.querySelector('#btn-scan-sel').addEventListener('click', () => {
      updateCount();
      sessionStorage.setItem(SS_STATE, JSON.stringify({
        sessionId: this._session.id,
        scope: this._session.scope,
        selectedIds: [...this._selectedIds],
      }));
      sessionStorage.setItem('audit_pending_scan', '1');
      document.querySelector('[data-view="escaner"]')?.click();
    });

    this.container.querySelector('#btn-confirm-sel').addEventListener('click', async () => {
      updateCount();
      if (!this._selectedIds.size) return;
      const selected = this._availableProducts.filter((p) => this._selectedIds.has(p.id));
      for (const p of selected) this._items.push(await handleAgregarItem(this._session.id, p));
      this._renderCounting();
    });
  }

  // ── Phase 2: Counting ───────────────────────────────────
  _renderCounting() {
    const label = this._session.type === 'inventario' ? 'INVENTARIO GENERAL' : 'AUDITORÍA';
    this.container.innerHTML = `
      <div class="audit-container">
        <button type="button" class="btn-back" id="btn-back-count" hidden>← Volver</button>
        <div class="audit-header">
          <h2>📦 Conteo Físico</h2>
          <span class="audit-badge">${label}</span>
        </div>
        <p class="audit-hint">💡 Escanea el código de barras para localizar el ítem en la lista.</p>
        <div class="audit-progress">
          <span id="prog-text">0 / ${this._items.length} contados</span>
          <div class="audit-progress-bar">
            <div class="audit-progress-fill" id="prog-fill" style="width:0%"></div>
          </div>
        </div>
        <div id="count-list">
          ${this._items.map((item) => `
            <div class="audit-count-row ${item.qty_fisica !== null ? 'audit-row-counted' : ''}" id="cr-${item.id}">
              <div class="audit-count-info">
                <div class="audit-count-name">${item.nombre}</div>
                <div class="audit-count-meta">${item.sku} · Sistema: <strong>${item.qty_sistema}</strong> ${item.uom}</div>
              </div>
              <div class="audit-count-input-group">
                <input type="number" class="audit-qty-input" data-id="${item.id}"
                  placeholder="Cant." min="0" step="1" inputmode="numeric"
                  value="${item.qty_fisica !== null ? item.qty_fisica : ''}"
                  ${item.qty_fisica !== null ? 'disabled' : ''}>
                <button class="btn-audit-confirm" data-id="${item.id}"
                  ${item.qty_fisica !== null ? 'disabled' : ''}>
                  ${item.qty_fisica !== null ? '✅' : '✓'}
                </button>
              </div>
            </div>`).join('')}
        </div>
        <div class="audit-footer">
          <button class="btn-primary" id="btn-go-recon" disabled>Ir a Conciliación →</button>
          <button class="btn-abandon" id="btn-abandon-count">🗑️ Abandonar y cerrar esta sesión</button>
        </div>
      </div>`;

    this._updateProgress();

    this.container.querySelector('#btn-back-count').addEventListener('click', () => {
      if (confirm('¿Volver? El progreso del conteo se conserva y podrás retomarlo.')) {
        this._renderSelection();
      }
    });

    this.container.querySelectorAll('.btn-audit-confirm').forEach((btn) =>
      btn.addEventListener('click', () => this._confirmCount(btn.dataset.id))
    );
    this.container.querySelectorAll('.audit-qty-input').forEach((inp) =>
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._confirmCount(inp.dataset.id); })
    );
    this.container.querySelector('#btn-go-recon').addEventListener('click', () =>
      this._renderReconciliation()
    );
    this.container.querySelector('#btn-abandon-count').addEventListener('click', () =>
      this._abandon()
    );

    // Scan to focus matching item in count list
    this._unsubs.push(eventBus.on(Events.BARCODE_SCANNED, ({ payload }) => {
      const item = this._items.find((i) => i.sku === payload.code || i.sku.endsWith(payload.code.slice(-4)));
      if (item) {
        const inp = this.container.querySelector(`input[data-id="${item.id}"]`);
        if (inp && !inp.disabled) {
          inp.focus();
          inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }));
  }

  async _confirmCount(itemId) {
    const inp = this.container.querySelector(`input[data-id="${itemId}"]`);
    const qty = parseInt(inp.value, 10);
    if (isNaN(qty) || qty < 0) { inp.classList.add('field-error'); return; }
    inp.classList.remove('field-error');
    const item = this._items.find((i) => i.id === itemId);
    if (!confirm(`¿Confirmar conteo?\n\n${item.nombre}\nCantidad física: ${qty} ${item.uom}`)) return;
    const idx = this._items.findIndex((i) => i.id === itemId);
    this._items[idx] = await handleRegistrarConteo(this._items[idx], qty);
    const row = this.container.querySelector(`#cr-${itemId}`);
    row?.classList.add('audit-row-counted');
    inp.disabled = true;
    const confirmBtn = this.container.querySelector(`button.btn-audit-confirm[data-id="${itemId}"]`);
    if (confirmBtn) { confirmBtn.textContent = '✅'; confirmBtn.disabled = true; }
    const group = row?.querySelector('.audit-count-input-group');
    if (group && !group.querySelector('.btn-edit-count')) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit-count';
      editBtn.dataset.id = itemId;
      editBtn.title = 'Corregir conteo';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', () => this._editCount(itemId));
      group.appendChild(editBtn);
    }
    this._updateProgress();
  }

  _editCount(itemId) {
    const row = this.container.querySelector(`#cr-${itemId}`);
    const inp = this.container.querySelector(`input[data-id="${itemId}"]`);
    const confirmBtn = this.container.querySelector(`button.btn-audit-confirm[data-id="${itemId}"]`);
    row?.classList.remove('audit-row-counted');
    inp.disabled = false;
    inp.focus();
    if (confirmBtn) { confirmBtn.textContent = '✓'; confirmBtn.disabled = false; }
    row?.querySelector('.btn-edit-count')?.remove();
    const idx = this._items.findIndex((i) => i.id === itemId);
    this._items[idx] = { ...this._items[idx], qty_fisica: null };
    this._updateProgress();
  }

  _updateProgress() {
    const counted = this._items.filter((i) => i.qty_fisica !== null).length;
    const total = this._items.length;
    const pct = total ? Math.round((counted / total) * 100) : 0;
    const txt = this.container.querySelector('#prog-text');
    const fill = this.container.querySelector('#prog-fill');
    const btn = this.container.querySelector('#btn-go-recon');
    if (txt) txt.textContent = `${counted} / ${total} contados`;
    if (fill) fill.style.width = `${pct}%`;
    if (btn) btn.disabled = counted === 0;
  }

  // ── Phase 3: Reconciliation ─────────────────────────────
  _causalChips(name) {
    return `<div class="causal-chips">
      ${CAUSALES.map((c) => `
        <label class="causal-chip">
          <input type="radio" name="${name}" value="${c}">
          <span>${c}</span>
        </label>`).join('')}
    </div>`;
  }

  _renderReconciliation() {
    const withDiff   = this._items.filter((i) => i.qty_fisica !== null && i.diferencia !== 0);
    const noDiff     = this._items.filter((i) => i.qty_fisica !== null && i.diferencia === 0);
    const notCounted = this._items.filter((i) => i.qty_fisica === null);

    this.container.innerHTML = `
      <div class="audit-container">
        <button type="button" class="btn-back" id="btn-back-recon" hidden>← Volver al conteo</button>
        <div class="audit-header">
          <h2>⚖️ Conciliación</h2>
          <span class="audit-badge">${withDiff.length} diferencias</span>
        </div>

        ${withDiff.length ? `
        <div class="audit-batch-bar">
          <label class="audit-scope-label"><input type="checkbox" id="chk-all"> Seleccionar todos</label>
          <button class="btn-secondary" id="btn-batch">Aplicar causal a seleccionados ↓</button>
        </div>
        <div class="causal-chips-batch-wrap">
          <p class="audit-hint">Causal para aplicar en lote:</p>
          ${this._causalChips('batch-causal')}
        </div>

        <div id="recon-list">
          ${withDiff.map((item) => `
            <div class="audit-recon-row" id="rr-${item.id}">
              <div class="recon-check-col">
                <input type="checkbox" class="recon-chk" data-id="${item.id}">
              </div>
              <div class="recon-info">
                <div class="recon-name">${item.nombre}</div>
                <div class="recon-numbers">
                  <span class="recon-sys">Sistema: ${item.qty_sistema}</span>
                  <span class="recon-phy">Físico: ${item.qty_fisica}</span>
                  <span class="recon-diff ${item.diferencia < 0 ? 'diff-neg' : 'diff-pos'}">
                    ${item.diferencia > 0 ? '+' : ''}${item.diferencia}
                  </span>
                </div>
                <p class="audit-hint">Selecciona la causal:</p>
                ${this._causalChips(`causal-${item.id}`)}
                <button class="btn-audit-save" data-id="${item.id}">💾 Guardar</button>
              </div>
            </div>`).join('')}
        </div>
        ` : '<div class="empty-state"><p>✅ Sin diferencias — todos los conteos coinciden.</p></div>'}

        <div class="audit-summary-bar">
          ${noDiff.length     ? `<span>✅ ${noDiff.length} sin diferencia</span>` : ''}
          ${notCounted.length ? `<span>⚠️ ${notCounted.length} no contados</span>` : ''}
        </div>
        <div class="audit-footer">
          <button class="btn-primary" id="btn-finish">✅ Finalizar y Guardar</button>
          <button class="btn-abandon" id="btn-abandon-recon">🗑️ Abandonar y cerrar esta sesión</button>
        </div>
      </div>`;

    // Highlight selected chip visually
    this.container.querySelectorAll('.causal-chip input[type=radio]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const group = radio.closest('.causal-chips');
        group.querySelectorAll('.causal-chip').forEach((ch) =>
          ch.classList.toggle('selected', ch.querySelector('input').value === radio.value)
        );
      });
    });

    this.container.querySelectorAll('.btn-audit-save').forEach((btn) =>
      btn.addEventListener('click', () => this._saveOne(btn.dataset.id))
    );

    const batchBtn = this.container.querySelector('#btn-batch');
    if (batchBtn) batchBtn.addEventListener('click', () => this._batchApply());

    const chkAll = this.container.querySelector('#chk-all');
    if (chkAll) chkAll.addEventListener('change', () => {
      this.container.querySelectorAll('.recon-chk').forEach((c) => (c.checked = chkAll.checked));
    });

    this.container.querySelector('#btn-back-recon').addEventListener('click', () => {
      if (confirm('¿Volver al conteo? Las causales ya guardadas se conservan.')) {
        this._renderCounting();
      }
    });

    this.container.querySelector('#btn-finish').addEventListener('click', () => this._finish());
    this.container.querySelector('#btn-abandon-recon').addEventListener('click', () =>
      this._abandon()
    );
  }

  async _doSave(itemId, causal) {
    const idx = this._items.findIndex((i) => i.id === itemId);
    this._items[idx] = await handleConciliarItem(this._items[idx], causal);
    const row = this.container.querySelector(`#rr-${itemId}`);
    if (!row) return;
    row.classList.add('recon-row-done');
    const saveBtn = row.querySelector('.btn-audit-save');
    if (saveBtn) { saveBtn.textContent = '✅ Guardado'; saveBtn.disabled = true; }
    if (!row.querySelector('.btn-edit-recon')) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit-recon';
      editBtn.dataset.id = itemId;
      editBtn.textContent = '✏️ Corregir';
      editBtn.addEventListener('click', () => this._editOne(itemId));
      saveBtn?.insertAdjacentElement('afterend', editBtn);
    }
  }

  async _saveOne(itemId) {
    const causal = this.container.querySelector(`input[name="causal-${itemId}"]:checked`)?.value;
    const chips = this.container.querySelector(`#rr-${itemId} .causal-chips`);
    if (!causal) { chips?.classList.add('chips-error'); return; }
    chips?.classList.remove('chips-error');
    const item = this._items.find((i) => i.id === itemId);
    if (!confirm(`¿Guardar conciliación?\n\n${item.nombre}\nCausal: ${causal}`)) return;
    await this._doSave(itemId, causal);
  }

  _editOne(itemId) {
    const row = this.container.querySelector(`#rr-${itemId}`);
    if (!row) return;
    row.classList.remove('recon-row-done');
    const saveBtn = row.querySelector('.btn-audit-save');
    if (saveBtn) { saveBtn.textContent = '💾 Guardar'; saveBtn.disabled = false; }
    row.querySelector('.btn-edit-recon')?.remove();
    const idx = this._items.findIndex((i) => i.id === itemId);
    this._items[idx] = { ...this._items[idx], reconciled: false, causal: null };
  }

  async _batchApply() {
    const causal = this.container.querySelector('input[name="batch-causal"]:checked')?.value;
    if (!causal) return;
    const ids = [...this.container.querySelectorAll('.recon-chk:checked')].map((c) => c.dataset.id);
    if (!ids.length) return;
    if (!confirm(`¿Aplicar causal "${causal}" a ${ids.length} ítem(s) seleccionado(s)?`)) return;
    for (const id of ids) {
      const radio = this.container.querySelector(`input[name="causal-${id}"][value="${causal}"]`);
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
      await this._doSave(id, causal);
    }
  }

  async _abandon() {
    const label = this._session?.type === 'inventario' ? 'Inventario General' : 'Auditoría';
    if (!confirm(
      `¿Abandonar y cerrar esta sesión de ${label}?\n\nSe descartará todo el progreso no guardado. Esta acción no puede deshacerse.`
    )) return;
    if (this._session) await handleAbandonarSesion(this._session);
    this._session = null;
    this._items = [];
    this.unmount();
    document.querySelector('[data-view="lista"]')?.click();
  }

  async _finish() {
    if (!confirm('¿Finalizar y guardar?\n\nEsta acción aplicará todos los ajustes de inventario y cerrará la sesión.')) return;
    const noDiff = this._items.filter((i) => i.qty_fisica !== null && i.diferencia === 0 && !i.reconciled);
    for (const item of noDiff) await handleConciliarItem(item, 'SIN DIFERENCIA');
    const session = await handleCerrarSesion(this._session);
    this._session = session;
    this._renderDone(session);
  }

  // ── Phase 4: Done ───────────────────────────────────────
  _renderDone(session) {
    const counted    = this._items.filter((i) => i.qty_fisica !== null).length;
    const diffs      = this._items.filter((i) => i.diferencia !== 0).length;
    const reconciled = this._items.filter((i) => i.reconciled).length;

    this.container.innerHTML = `
      <div class="audit-container">
        <div class="audit-done">
          <div class="audit-done-icon">✅</div>
          <h2>${session.type === 'inventario' ? 'Inventario' : 'Auditoría'} Completado</h2>
          <div class="audit-done-stats">
            <div class="stat-item"><span class="stat-num">${counted}</span><span class="stat-label">Contados</span></div>
            <div class="stat-item"><span class="stat-num">${diffs}</span><span class="stat-label">Diferencias</span></div>
            <div class="stat-item"><span class="stat-num">${reconciled}</span><span class="stat-label">Conciliados</span></div>
          </div>
          <p class="audit-done-note">Las cantidades del sistema han sido actualizadas con el conteo físico.</p>
          <button class="btn-primary" id="btn-audit-exit">Ir a Productos</button>
        </div>
      </div>`;

    this.container.querySelector('#btn-audit-exit').addEventListener('click', () => {
      document.querySelector('[data-view="lista"]')?.click();
    });
  }
}
