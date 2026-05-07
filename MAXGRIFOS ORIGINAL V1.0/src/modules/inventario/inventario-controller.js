import {
  handleIniciarInventarioGeneral,
  handleSnapshotInicialInventario,
  handleCargarProductos,
  handleRegistrarConteo,
  handleRegistrarCostoFisico,
  handleConciliarItem,
  handleCerrarSesion,
  handleAbandonarSesion,
  handleGetSessionItems,
  handleAgregarProductoNuevoAInventario,
  handleCierreAtomicoInventario,
  handleRetryPartialClose,
  handleAcquireItemLock,
  handleReleaseItemLock,
  handleRegistrarConteoMultiuser,
  handleGetSessionDashboard,
  handleGetItemLedger,
} from '../auditoria/handlers/index.js';
import { getBodegas } from '../kardex/bodega-store.js';
import { eventBus, Events } from '../../events/domain-events.js';
import { generateSKU } from '../maestro-productos/sku-engine.js';
import { getDeviceId, getDeviceLabel } from '../../utils/device-identity.js';
import {
  handleInitCausalesPreset,
  handleGetCausalesActivas,
  handleGetAllCausales,
  handleAddCausal,
  handleToggleCausal,
  handleResetCausalesPreset,
} from './causales-handlers.js';

const SS_INV_SCAN_STATE = 'inventario_scan_state';
const SS_INV_SCAN_CODE = 'inventario_scanned_code';

// â”€â”€ F4: Estado inteligente (incluye estados multiusuario) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function _getItemEstado(item) {
  if (item.conflict_detected) return 'conflicto';
  if (item.reconciled) return 'conciliado';
  if (item.qty_fisica === null) {
    if (item.item_locked_by && item.lock_expires_at && new Date(item.lock_expires_at) > new Date()) {
      return 'en_conteo';
    }
    return 'pendiente';
  }
  if (item.qty_sistema === 0 && Number(item.qty_fisica) > 0) return 'nuevo';
  if (Number(item.qty_fisica) !== Number(item.qty_sistema)) return 'diferencia';
  return 'contado';
}

const ESTADO_CFG = {
  pendiente:   { label: 'Pendiente',   cls: 'estado-inv-pendiente' },
  en_conteo:   { label: 'En conteo',   cls: 'estado-inv-en-conteo' },
  contado:     { label: 'Contado',     cls: 'estado-inv-contado' },
  diferencia:  { label: 'Diferencia',  cls: 'estado-inv-diferencia' },
  nuevo:       { label: 'Nuevo',       cls: 'estado-inv-nuevo' },
  conciliado:  { label: 'Conciliado',  cls: 'estado-inv-conciliado' },
  conflicto:   { label: 'Conflicto',   cls: 'estado-inv-conflicto' },
};

function _estadoBadge(item) {
  const e = _getItemEstado(item);
  const cfg = ESTADO_CFG[e] ?? ESTADO_CFG.pendiente;
  return `<span class="inv-estado-badge ${cfg.cls}">${cfg.label}</span>`;
}

function _fmtCop(val) {
  const n = Number(val ?? 0);
  if (!Number.isFinite(n) || n === 0) return 'â€”';
  return n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export class InventarioController {
  constructor(container) {
    this.container = container;
    this._session = null;
    this._items = [];
    this._unsubs = [];
    this._searchQuery = '';
    this._bodegas = [];
    this._pendingScanCode = '';
    this._causales = [];
    this._reconFilter = '';
    this._deviceId = getDeviceId();
    this._deviceLabel = getDeviceLabel();
    this._activeLockItemId = null;
    this._uiSanitizerObserver = null;
  }

  async mount(options = {}) {
    this._startUiMojibakeSanitizer();
    handleInitCausalesPreset();
    this._causales = handleGetCausalesActivas();
    if (options.resumeSession) {
      await this._resumeSession(options.resumeSession);
      return;
    }

    const savedState = sessionStorage.getItem(SS_INV_SCAN_STATE);
    const scannedCode = sessionStorage.getItem(SS_INV_SCAN_CODE);
    if (savedState && scannedCode) {
      await this._restoreFromScan(savedState, scannedCode);
      return;
    }
    this._renderScopeSetup();
  }

  canUnmount() {
    if (
      this._session
      && ['active', 'closing', 'partial_close', 'failed', 'ignored', 'in_progress'].includes(this._session.status)
    ) {
      return confirm(
        'Hay un inventario activo.\nÂ¿Salir? Al regresar podrÃ¡s retomar donde lo dejaste.'
      );
    }
    return true;
  }

  unmount() {
    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
    if (this._uiSanitizerObserver) {
      this._uiSanitizerObserver.disconnect();
      this._uiSanitizerObserver = null;
    }
  }

  _normalizeUiText(text) {
    if (typeof text !== 'string' || text.length === 0) return text;
    let out = text;
    const replacements = [
      ['â†', '←'],
      ['â†’', '→'],
      ['â†“', '↓'],
      ['â€”', '—'],
      ['Â·', '·'],
      ['â€¦', '…'],
      ['Â¿', '¿'],
      ['Ã¡', 'á'],
      ['Ã©', 'é'],
      ['Ã­', 'í'],
      ['Ã³', 'ó'],
      ['Ãº', 'ú'],
      ['Ã', 'Á'],
      ['Ã‰', 'É'],
      ['Ã', 'Í'],
      ['Ã“', 'Ó'],
      ['Ãš', 'Ú'],
      ['Ã±', 'ñ'],
      ['Ã‘', 'Ñ'],
      ['Ã¼', 'ü'],
      ['Ãœ', 'Ü'],
      ['âœ…', '✅'],
      ['â³', '⏳'],
      ['âš ï¸', '⚠️'],
      ['âš™ï¸', '⚙️'],
      ['âš–ï¸', '⚖️'],
      ['âš¡', '⚡'],
      ['â›”', '⛔'],
      ['ðŸ“¦', '📦'],
      ['ðŸŸ¢', '🟢'],
      ['ðŸ”´', '🔴'],
      ['ðŸ”„', '🔄'],
      ['ðŸ”’', '🔒'],
      ['ðŸ”', '🔍'],
      ['ðŸ’¡', '💡'],
      ['ðŸ“·', '📷'],
      ['ðŸ—‘ï¸', '🗑️'],
      ['ðŸ’¾', '💾'],
      ['ðŸ“‹', '📋'],
      ['ðŸ­', '🏭'],
      ['âž•', '➕'],
      ['âœ•', '✕'],
      ['âœ“', '✓'],
      ['âœï¸', '✏️'],
      ['â†º', '↺'],
    ];

    for (const [from, to] of replacements) {
      if (out.includes(from)) out = out.split(from).join(to);
    }
    return out;
  }

  _sanitizeNode(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const fixed = this._normalizeUiText(node.nodeValue);
      if (fixed !== node.nodeValue) node.nodeValue = fixed;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    ['placeholder', 'title', 'aria-label'].forEach((attr) => {
      if (!node.hasAttribute?.(attr)) return;
      const current = node.getAttribute(attr);
      const fixed = this._normalizeUiText(current);
      if (fixed !== current) node.setAttribute(attr, fixed);
    });

    node.childNodes.forEach((child) => this._sanitizeNode(child));
  }

  _startUiMojibakeSanitizer() {
    if (this._uiSanitizerObserver) return;
    this._sanitizeNode(this.container);
    this._uiSanitizerObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'characterData') {
          this._sanitizeNode(m.target);
          continue;
        }
        if (m.type === 'attributes') {
          this._sanitizeNode(m.target);
          continue;
        }
        if (m.type === 'childList') {
          m.addedNodes.forEach((n) => this._sanitizeNode(n));
        }
      }
    });
    this._uiSanitizerObserver.observe(this.container, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    });
  }

  async _resumeSession(session) {
    this._session = session;
    this._items = await handleGetSessionItems(session.id);
    if (['partial_close', 'failed', 'closing'].includes(session.status)) {
      this._renderReconciliation();
      return;
    }
    const allCounted = this._items.length > 0 && this._items.every((i) => i.qty_fisica !== null);
    if (allCounted) {
      this._renderReconciliation();
    } else {
      this._renderCounting();
    }
  }

  // â”€â”€ F4: items filtrados por bÃºsqueda â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async _restoreFromScan(savedStateJson, code) {
    let state = null;
    try {
      state = JSON.parse(savedStateJson);
    } catch {
      // noop
    }

    sessionStorage.removeItem(SS_INV_SCAN_STATE);
    sessionStorage.removeItem(SS_INV_SCAN_CODE);
    sessionStorage.removeItem('inventario_pending_scan');

    const session = state?.session;
    if (!session?.id) {
      this._renderScopeSetup();
      return;
    }

    this._searchQuery = String(state?.searchQuery ?? '').trim();
    await this._resumeSession(session);
    this._applyScannedCode(String(code ?? '').trim());
  }

  _findItemByScanCode(code) {
    if (!code) return null;
    return this._items.find(
      (i) =>
        (i.code128 && i.code128 === code) ||
        i.sku === code ||
        i.sku.endsWith(code.slice(-4))
    ) ?? null;
  }

  _applyScannedCode(code) {
    if (!code) return;

    eventBus.emit(Events.INVENTARIO_SCAN_RETURNED, {
      session_id: this._session?.id ?? null,
      code,
    });

    const item = this._findItemByScanCode(code);
    if (item) {
      this._pendingScanCode = '';
      this._searchQuery = '';
      this._refreshCountList();
      this._openFicha(item.id);
      eventBus.emit(Events.INVENTARIO_SCAN_MATCHED, {
        session_id: this._session?.id ?? null,
        item_id: item.id,
        code,
      });
      return;
    }

    this._pendingScanCode = code;
    this._searchQuery = code;
    this._refreshCountList();
    eventBus.emit(Events.INVENTARIO_SCAN_UNMATCHED, {
      session_id: this._session?.id ?? null,
      code,
    });
    alert(
      `No hubo coincidencia para ${code}.\n\nPuedes buscar manualmente o usar "Crear producto nuevo".`
    );
  }

  _startContextualScan() {
    if (!this._session?.id) return;
    sessionStorage.setItem(SS_INV_SCAN_STATE, JSON.stringify({
      session: this._session,
      searchQuery: this._searchQuery,
    }));
    sessionStorage.setItem('inventario_pending_scan', '1');
    eventBus.emit(Events.INVENTARIO_SCAN_REQUESTED, {
      session_id: this._session.id,
      search_query: this._searchQuery,
    });
    window.__erp_navigate?.('escaner');
  }

  _filteredItems() {
    const q = this._searchQuery.toLowerCase().trim();
    if (!q) return this._items;
    return this._items.filter((item) =>
      (item.nombre ?? '').toLowerCase().includes(q) ||
      (item.sku ?? '').toLowerCase().includes(q) ||
      (item.ref_proveedor ?? '').toLowerCase().includes(q) ||
      (item.code128 ?? '').toLowerCase().includes(q)
    );
  }

  // â”€â”€ F4: nombres de bodegas de la sesiÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  _bodegasLabel(session) {
    if (!session || !Array.isArray(session.bodega_ids)) return 'â€”';
    return session.bodega_ids.map((bid) => {
      const b = this._bodegas.find((x) => x.id === bid);
      return b ? b.nombre : bid;
    }).join(', ');
  }

  // Fase 0: SelecciÃ³n de alcance
  _renderScopeSetup() {
    this.container.innerHTML = `
      <div class="audit-container">
        <button type="button" class="btn-back" id="btn-back-scope" hidden>← Volver</button>
        <h2>📦 Inventario General</h2>
        <p class="audit-hint">Selecciona el alcance del inventario:</p>
        <div class="audit-scope-group">
          <label class="audit-scope-label"><input type="radio" name="scope-inv" value="active" checked> 🟢 Activos</label>
          <label class="audit-scope-label"><input type="radio" name="scope-inv" value="inactive"> 🔴 Inactivos</label>
          <label class="audit-scope-label"><input type="radio" name="scope-inv" value="both"> ⚡ Ambos</label>
        </div>
        <div class="audit-footer">
          <button class="btn-primary" id="btn-continue-scope">Seleccionar Bodegas →</button>
        </div>
      </div>`;

    this.container.querySelector('#btn-back-scope').addEventListener('click', () => {
      document.querySelector('[data-view="auditoria"]')?.click();
    });

    this.container.querySelector('#btn-continue-scope').addEventListener('click', async () => {
      const scope = this.container.querySelector('input[name="scope-inv"]:checked').value;
      await this._renderBodegaSetup(scope);
    });
  }

  // Fase 1: Seleccion de bodegas
  async _renderBodegaSetup(scope) {
    this._bodegas = await getBodegas();
    const seleccionables = this._bodegas.filter(
      (b) => b.tipo === 'central' || b.tipo === 'satellite'
    );

    this.container.innerHTML = `
      <div class="audit-container">
        <button type="button" class="btn-back" id="btn-back-bodegas" hidden>← Volver</button>
        <div class="audit-header">
          <h2>📦 Inventario General</h2>
          <span class="audit-badge">SELECCIONAR BODEGAS</span>
        </div>
        <p class="audit-hint">Selecciona las bodegas que incluirá este inventario. <strong>Bodega Central</strong> está seleccionada por defecto.</p>
        <div id="invgen-bodega-list">
          ${seleccionables.map((b) => `
            <label class="audit-product-row">
              <input type="checkbox" class="invgen-bodega-chk" value="${b.id}"
                ${b.tipo === 'central' ? 'checked' : ''}>
              <div class="audit-product-info">
                <div class="audit-product-name">${b.nombre}</div>
                <div class="audit-product-meta">${b.tipo === 'central' ? '🏭 Principal' : '📦 Satélite'} · ${b.descripcion ?? ''}</div>
              </div>
            </label>`).join('')}
        </div>
        <div class="audit-footer">
          <button class="btn-primary" id="btn-iniciar-invgen">Iniciar Inventario →</button>
        </div>
      </div>`;

    this.container.querySelector('#btn-back-bodegas').addEventListener('click', () => {
      this._renderScopeSetup();
    });

    this.container.querySelector('#btn-iniciar-invgen').addEventListener('click', async () => {
      const bodegaIds = [
        ...this.container.querySelectorAll('.invgen-bodega-chk:checked'),
      ].map((cb) => cb.value);

      if (!bodegaIds.length) {
        alert('Selecciona al menos una bodega para continuar.');
        return;
      }

      try {
        this._session = await handleIniciarInventarioGeneral(scope, bodegaIds);
        const products = await handleCargarProductos(scope);
        this._items = await handleSnapshotInicialInventario(this._session, products);
        this._searchQuery = '';
        this._renderCounting();
      } catch (err) {
        alert(`Error al iniciar Inventario General:\n${err.message}`);
      }
    });
  }

  // F4: Indicadores de progreso (3 contadores)
  _updateIndicadores() {
    const total      = this._items.length;
    const now        = new Date();
    const contados   = this._items.filter((i) => !i.conflict_detected && i.qty_fisica !== null && !i.reconciled).length;
    const pendientes = this._items.filter((i) => !i.conflict_detected && i.qty_fisica === null && !(i.item_locked_by && new Date(i.lock_expires_at ?? 0) > now)).length;
    const en_conteo  = this._items.filter((i) => !i.conflict_detected && i.qty_fisica === null && i.item_locked_by && new Date(i.lock_expires_at ?? 0) > now).length;
    const diferencias = this._items.filter(
      (i) => !i.conflict_detected && i.qty_fisica !== null && !i.reconciled && Number(i.qty_fisica) !== Number(i.qty_sistema)
    ).length;
    const conflictos = this._items.filter((i) => i.conflict_detected).length;
    const avance     = total ? Math.round(((total - pendientes - en_conteo) / total) * 100) : 0;

    const indBar = this.container.querySelector('#invgen-indicadores');
    if (indBar) {
      indBar.innerHTML = `
        <span class="invgen-ind contados">âœ… ${contados} contados</span>
        <span class="invgen-ind pendientes">â³ ${pendientes} pendientes</span>
        ${en_conteo > 0 ? `<span class="invgen-ind en-conteo">ðŸ”„ ${en_conteo} en conteo</span>` : ''}
        <span class="invgen-ind diferencias">âš ï¸ ${diferencias} diferencias</span>
        ${conflictos > 0 ? `<span class="invgen-ind conflictos" style="color:#EF4444">ðŸ”´ ${conflictos} conflictos</span>` : ''}`;
    }
    const fill = this.container.querySelector('#prog-fill');
    const txt  = this.container.querySelector('#prog-text');
    if (fill) fill.style.width = `${avance}%`;
    if (txt)  txt.textContent = `${contados + diferencias} / ${total} contados (${avance}%)`;

    const btn = this.container.querySelector('#btn-go-recon');
    if (btn) btn.disabled = (contados + diferencias) === 0;
  }

  // Fase 2: Conteo fÃ­sico (F4 completo)
  _renderCounting() {
    const filtered = this._filteredItems();

    this.container.innerHTML = `
      <div class="audit-container">
        <button type="button" class="btn-back" id="btn-back-count" hidden>← Volver</button>
        <div class="audit-header">
          <h2>📦 Conteo Físico</h2>
          <span class="audit-badge">INVENTARIO GENERAL</span>
        </div>

        <div class="invgen-search-bar">
          <input type="search" id="invgen-search" placeholder="Buscar por descripción, SKU, cód. proveedor o Code128…"
            value="${this._searchQuery}" autocomplete="off" inputmode="search">
          <button type="button" class="btn-secondary invgen-scan-btn" id="btn-scan-inv">📷 Escanear Code128</button>
        </div>

        <div id="invgen-indicadores" class="invgen-indicadores-bar"></div>

        <div class="audit-progress">
          <span id="prog-text">0 / ${this._items.length} contados</span>
          <div class="audit-progress-bar">
            <div class="audit-progress-fill" id="prog-fill" style="width:0%"></div>
          </div>
        </div>

        <p class="audit-hint">💡 Toca un producto o escanea Code128 para ver la ficha completa y registrar el conteo.</p>

        <div id="count-list">
          ${filtered.length === 0
            ? `<div class="empty-state"><p>${this._searchQuery ? '🔍 Sin resultados para la búsqueda.' : '⚠️ Sin productos en el inventario.'}</p></div>`
            : filtered.map((item) => `
              <div class="audit-count-row invgen-row-selectable ${item.qty_fisica !== null ? 'audit-row-counted' : ''}"
                   id="cr-${item.id}" data-id="${item.id}">
                <div class="audit-count-info">
                  <div class="audit-count-name">${item.nombre}</div>
                  <div class="audit-count-meta">${item.sku}${item.ref_proveedor ? ' · ' + item.ref_proveedor : ''} · Sistema: <strong>${item.qty_sistema}</strong> ${item.uom}</div>
                </div>
                <div class="invgen-row-right">
                  ${_estadoBadge(item)}
                  ${item.qty_fisica !== null
                    ? `<span class="invgen-qty-display">${item.qty_fisica} ${item.uom}</span>`
                    : ''}
                </div>
              </div>`).join('')}
        </div>

        <div class="audit-footer">
          <button class="btn-primary" id="btn-go-recon" disabled>Ir a Conciliación →</button>
          <button class="btn-secondary invgen-btn-nuevo-producto" id="btn-crear-producto-nuevo">➕ Crear producto nuevo</button>
          <button class="btn-abandon" id="btn-abandon-count">🗑️ Abandonar y cerrar esta sesión</button>
        </div>
      </div>

      <!-- F4: Ficha completa overlay -->
      <div class="invgen-ficha-overlay" id="invgen-ficha" style="display:none">
        <div class="invgen-ficha-card">
          <div class="invgen-ficha-header">
            <h3 id="ficha-titulo">Ficha de Producto</h3>
            <button class="invgen-ficha-close" id="btn-ficha-close">✕</button>
          </div>
          <div class="invgen-ficha-body" id="ficha-body"></div>
          <div class="invgen-ficha-edit" id="ficha-edit"></div>
        </div>
      </div>

      <!-- F5: Overlay crear producto nuevo -->
      <div class="invgen-ficha-overlay" id="invgen-nuevo-producto" style="display:none">
        <div class="invgen-ficha-card invgen-nuevo-producto-card">
          <div class="invgen-ficha-header">
            <h3>➕ Nuevo Producto</h3>
            <button class="invgen-ficha-close" id="btn-nuevo-prod-close">✕</button>
          </div>
          <div class="invgen-nuevo-prod-body">
            <p class="audit-hint">Usa el motor de codificación de Productos.<br>Al guardar regresarás al inventario activo.</p>
            <div class="field-group">
              <label for="np-nombre">Descripción del producto</label>
              <input type="text" id="np-nombre" placeholder="EJ: DUCHA LLUVIA CROMADA 8 PULGADAS"
                autocomplete="off" autocapitalize="characters" inputmode="text">
            </div>
            <div class="field-group">
              <label for="np-ref">Código proveedor</label>
              <input type="text" id="np-ref" placeholder="EJ: 16160615"
                autocomplete="off" autocapitalize="characters" inputmode="text">
            </div>
            <div class="field-group">
              <label for="np-uom">Unidad de medida</label>
              <select id="np-uom">
                <option value="UND">Unidad (UND)</option>
                <option value="PAR">Par (PAR)</option>
                <option value="CAJ">Caja (CAJ)</option>
                <option value="KIT">Kit (KIT)</option>
                <option value="MTR">Metro (MTR)</option>
                <option value="BLS">Bolsa (BLS)</option>
              </select>
            </div>
            <div class="invgen-sku-preview" id="np-sku-preview">
              <span class="invgen-sku-label">SKU GENERADO</span>
              <span class="invgen-sku-code" id="np-sku-code">—</span>
              <span class="invgen-sku-meta" id="np-sku-meta"></span>
            </div>
            <div id="np-dup-alert" class="sku-alert hidden"></div>
            <div class="ficha-edit-actions" style="margin-top:16px">
              <button class="btn-primary" id="btn-nuevo-prod-save">✓ Guardar y regresar al inventario</button>
              <button class="btn-secondary" id="btn-nuevo-prod-cancel">Cancelar</button>
            </div>
            <p class="audit-hint" style="margin-top:8px">Producto nuevo entra en bodega satélite temporal. <strong>Kardex oficial intacto.</strong></p>
          </div>
        </div>
      </div>`;

    this._updateIndicadores();

    // Búsqueda
    const searchInput = this.container.querySelector('#invgen-search');
    searchInput.addEventListener('input', () => {
      this._searchQuery = searchInput.value;
      this._refreshCountList();
    });

    // Click en fila → ficha
    this.container.querySelectorAll('.invgen-row-selectable').forEach((row) => {
      row.addEventListener('click', () => this._openFicha(row.dataset.id));
    });

    // Cerrar ficha
    this.container.querySelector('#btn-ficha-close').addEventListener('click', () => {
      this._closeFicha();
    });
    this.container.querySelector('#invgen-ficha').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this._closeFicha();
    });

    this.container.querySelector('#btn-back-count').addEventListener('click', () => {
      if (confirm('¿Volver? El progreso del conteo se conserva y podrás retomarlo.')) {
        this._renderScopeSetup();
      }
    });

    this.container.querySelector('#btn-go-recon').addEventListener('click', () =>
      this._renderReconciliation()
    );
    this.container.querySelector('#btn-abandon-count').addEventListener('click', () =>
      this._abandon()
    );
    this.container.querySelector('#btn-crear-producto-nuevo').addEventListener('click', () =>
      this._openCrearProductoOverlay()
    );
    this.container.querySelector('#btn-scan-inv')?.addEventListener('click', () => {
      this._startContextualScan();
    });

    // Scanner Code128 → abrir ficha del producto encontrado
    this._unsubs.push(eventBus.on(Events.BARCODE_SCANNED, ({ payload }) => {
      const item = this._findItemByScanCode(payload.code);
      if (item) {
        const fichaOverlay = this.container.querySelector('#invgen-ficha');
        if (fichaOverlay) fichaOverlay.style.display = 'flex';
        this._openFicha(item.id);
      }
    }));
  }

  // F4: Refresca solo la lista de conteo (sin destruir el overlay)
  _refreshCountList() {
    const filtered = this._filteredItems();
    const listEl = this.container.querySelector('#count-list');
    if (!listEl) return;
    listEl.innerHTML = filtered.length === 0
      ? `<div class="empty-state"><p>${this._searchQuery ? '🔍 Sin resultados para la búsqueda.' : '⚠️ Sin productos en el inventario.'}</p></div>`
      : filtered.map((item) => `
          <div class="audit-count-row invgen-row-selectable ${item.qty_fisica !== null ? 'audit-row-counted' : ''}"
               id="cr-${item.id}" data-id="${item.id}">
            <div class="audit-count-info">
              <div class="audit-count-name">${item.nombre}</div>
              <div class="audit-count-meta">${item.sku}${item.ref_proveedor ? ' · ' + item.ref_proveedor : ''} · Sistema: <strong>${item.qty_sistema}</strong> ${item.uom}</div>
            </div>
            <div class="invgen-row-right">
              ${_estadoBadge(item)}
              ${item.qty_fisica !== null
                ? `<span class="invgen-qty-display">${item.qty_fisica} ${item.uom}</span>`
                : ''}
            </div>
          </div>`).join('');

    listEl.querySelectorAll('.invgen-row-selectable').forEach((row) => {
      row.addEventListener('click', () => this._openFicha(row.dataset.id));
    });
  }

  // F4: Abre ficha completa del producto (con lock multiusuario + ledger)
  async _openFicha(itemId) {
    let item = this._items.find((i) => i.id === itemId);
    if (!item) return;

    // Intentar adquirir lock (solo si no estÃ¡ ya contado ni conciliado)
    let lockWarning = '';
    if (item.qty_fisica === null && !item.reconciled && !item.conflict_detected) {
      try {
        const lockResult = await handleAcquireItemLock(item, this._deviceId, this._deviceLabel);
        if (lockResult.ok && lockResult.item) {
          const idx = this._items.findIndex((i) => i.id === itemId);
          this._items[idx] = lockResult.item;
          item = lockResult.item;
          this._activeLockItemId = itemId;
        } else if (!lockResult.ok) {
          const expAt = lockResult.lock_expires_at ? new Date(lockResult.lock_expires_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
          lockWarning = `<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:13px">ðŸ”’ En conteo por <strong>${lockResult.locked_by ?? 'otro dispositivo'}</strong>${expAt ? ` â€” libera a las ${expAt}` : ''}. Puedes ver pero no confirmar.</div>`;
        }
      } catch {
        // lock no crÃ­tico: continuar sin lock
      }
    }

    const estado = _getItemEstado(item);
    const estadoCfg = ESTADO_CFG[estado] ?? ESTADO_CFG.pendiente;
    const bodegasLabel = this._bodegasLabel(this._session);

    const fichaBody = this.container.querySelector('#ficha-body');
    const fichaEdit = this.container.querySelector('#ficha-edit');
    const fichaTitulo = this.container.querySelector('#ficha-titulo');

    if (fichaTitulo) fichaTitulo.textContent = item.nombre;

    const lastEditRow = item.last_edit_at
      ? `<div class="ficha-row"><span class="ficha-label">Ãšltimo registro</span><span class="ficha-val" style="font-size:12px">${item.last_edit_label ?? 'local'} · ${new Date(item.last_edit_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span></div>`
      : '';

    const conflictRow = item.conflict_detected
      ? `<div style="background:#FEE2E2;border:1px solid #EF4444;border-radius:6px;padding:8px 12px;margin:4px 0;font-size:12px;color:#991B1B">âš ï¸ ${item.conflict_detail ?? 'Conflicto detectado'}</div>`
      : '';

    if (fichaBody) {
      fichaBody.innerHTML = `
        ${conflictRow}
        <div class="ficha-grid">
          <div class="ficha-row"><span class="ficha-label">DescripciÃ³n</span><span class="ficha-val">${item.nombre}</span></div>
          <div class="ficha-row"><span class="ficha-label">SKU</span><span class="ficha-val mono">${item.sku}</span></div>
          <div class="ficha-row"><span class="ficha-label">Code128</span><span class="ficha-val mono">${item.code128 ?? 'â€”'}</span></div>
          <div class="ficha-row"><span class="ficha-label">CÃ³d. Proveedor</span><span class="ficha-val">${item.ref_proveedor ?? 'â€”'}</span></div>
          <div class="ficha-row"><span class="ficha-label">Bodega origen</span><span class="ficha-val">${bodegasLabel}</span></div>
          <div class="ficha-row"><span class="ficha-label">Cant. sistema</span><span class="ficha-val"><strong>${item.qty_sistema}</strong> ${item.uom}</span></div>
          <div class="ficha-row"><span class="ficha-label">Costo sistema</span><span class="ficha-val">$${_fmtCop(item.costo_sistema)}</span></div>
          <div class="ficha-row"><span class="ficha-label">Estado</span><span class="ficha-val"><span class="inv-estado-badge ${estadoCfg.cls}">${estadoCfg.label}</span></span></div>
          ${lastEditRow}
        </div>`;
    }

    if (fichaEdit) {
      const isLocked = lockWarning !== '';
      const qtyVal   = item.qty_fisica !== null ? item.qty_fisica : '';
      const costoVal = item.costo_fisico != null ? item.costo_fisico : '';
      fichaEdit.innerHTML = `
        ${lockWarning}
        <div class="ficha-edit-row">
          <label class="ficha-edit-label">Cantidad fÃ­sica
            <input type="number" id="ficha-qty" class="ficha-edit-input"
              min="0" step="1" inputmode="numeric" placeholder="0"
              value="${qtyVal}" ${isLocked ? 'disabled' : ''}>
          </label>
          <label class="ficha-edit-label">Costo fÃ­sico (COP)
            <input type="number" id="ficha-costo" class="ficha-edit-input"
              min="0" step="1" inputmode="numeric" placeholder="Opcional"
              value="${costoVal}">
          </label>
        </div>
        <div class="ficha-edit-actions">
          <button class="btn-primary" id="btn-ficha-confirm" data-id="${item.id}" ${isLocked ? 'disabled' : ''}>âœ“ Confirmar</button>
          <button class="btn-secondary" id="btn-ficha-edit-only" data-id="${item.id}">âœï¸ Solo editar costo</button>
          <button class="btn-secondary" id="btn-ficha-ledger" data-id="${item.id}" style="font-size:11px">ðŸ“‹ Historial</button>
        </div>
        <p class="audit-hint" style="margin-top:8px">El costo fÃ­sico se registra solo en la sesiÃ³n. <strong>No afecta el Kardex oficial.</strong></p>`;

      this.container.querySelector('#btn-ficha-confirm').addEventListener('click', () =>
        this._confirmFicha(item.id)
      );
      this.container.querySelector('#btn-ficha-edit-only').addEventListener('click', () =>
        this._saveCostoFisicoOnly(item.id)
      );
      this.container.querySelector('#btn-ficha-ledger')?.addEventListener('click', () =>
        this._openItemLedger(item.id)
      );

      const qtyInput = fichaEdit.querySelector('#ficha-qty');
      qtyInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._confirmFicha(item.id);
      });
      if (!isLocked) qtyInput?.focus();
    }

    const overlay = this.container.querySelector('#invgen-ficha');
    if (overlay) overlay.style.display = 'flex';
  }

  _closeFicha() {
    const overlay = this.container.querySelector('#invgen-ficha');
    if (overlay) overlay.style.display = 'none';
    if (this._activeLockItemId) {
      const item = this._items.find((i) => i.id === this._activeLockItemId);
      if (item && item.qty_fisica === null) {
        handleReleaseItemLock(item, this._deviceId).then((released) => {
          if (released) {
            const idx = this._items.findIndex((i) => i.id === this._activeLockItemId);
            if (idx !== -1) this._items[idx] = released;
          }
        }).catch(() => {});
      }
      this._activeLockItemId = null;
    }
  }

  // F4: Confirma conteo y costo fÃ­sico desde ficha (multiusuario con ledger)
  async _confirmFicha(itemId) {
    const qtyInput   = this.container.querySelector('#ficha-qty');
    const costoInput = this.container.querySelector('#ficha-costo');
    const qty = parseInt(qtyInput?.value ?? '', 10);

    if (isNaN(qty) || qty < 0) {
      qtyInput?.classList.add('field-error');
      return;
    }
    qtyInput?.classList.remove('field-error');

    const idx = this._items.findIndex((i) => i.id === itemId);
    if (idx === -1) return;
    const item = this._items[idx];

    if (!confirm(`Â¿Confirmar conteo?\n\n${item.nombre}\nCantidad fÃ­sica: ${qty} ${item.uom}`)) return;

    let updated;
    try {
      updated = await handleRegistrarConteoMultiuser(item, qty, this._deviceId, this._deviceLabel);
    } catch (err) {
      // Conflicto detectado: recargar Ã­tem del store para mostrar estado real
      const reloaded = await handleGetSessionItems(this._session.id);
      reloaded.forEach((ri) => {
        const i = this._items.findIndex((x) => x.id === ri.id);
        if (i !== -1) this._items[i] = ri;
      });
      this._refreshCountList();
      this._updateIndicadores();
      alert(`âš ï¸ ${err.message}\n\nEl Ã­tem quedÃ³ marcado como Conflicto. Recarga para ver el estado actual.`);
      this._closeFicha();
      return;
    }

    const costoRaw = costoInput?.value?.trim();
    if (costoRaw !== '' && costoRaw !== undefined) {
      const costo = Number(costoRaw);
      if (Number.isFinite(costo) && costo >= 0) {
        updated = await handleRegistrarCostoFisico(updated, costo);
      }
    }

    this._activeLockItemId = null;
    this._items[idx] = updated;
    this._closeFicha();
    this._refreshCountList();
    this._updateIndicadores();
  }

  // F4: Guarda solo el costo fÃ­sico (sin cambiar qty_fisica)
  async _saveCostoFisicoOnly(itemId) {
    const costoInput = this.container.querySelector('#ficha-costo');
    const costoRaw = costoInput?.value?.trim();
    if (!costoRaw) { this._closeFicha(); return; }
    const costo = Number(costoRaw);
    if (!Number.isFinite(costo) || costo < 0) {
      costoInput?.classList.add('field-error');
      return;
    }
    costoInput?.classList.remove('field-error');

    const idx = this._items.findIndex((i) => i.id === itemId);
    if (idx === -1) return;
    this._items[idx] = await handleRegistrarCostoFisico(this._items[idx], costo);
    this._closeFicha();
    this._refreshCountList();
  }

  // Legacy: confirmar conteo por input inline (mantenido para compatibilidad)
  async _confirmCount(itemId) {
    const inp = this.container.querySelector(`input[data-id="${itemId}"]`);
    const qty = parseInt(inp?.value ?? '', 10);
    if (isNaN(qty) || qty < 0) { inp?.classList.add('field-error'); return; }
    inp?.classList.remove('field-error');
    const item = this._items.find((i) => i.id === itemId);
    if (!confirm(`Â¿Confirmar conteo?\n\n${item.nombre}\nCantidad fÃ­sica: ${qty} ${item.uom}`)) return;
    const idx = this._items.findIndex((i) => i.id === itemId);
    this._items[idx] = await handleRegistrarConteo(this._items[idx], qty);
    this._refreshCountList();
    this._updateIndicadores();
  }

  // Fase 3: ConciliaciÃ³n â€” chips de causales desde catÃ¡logo dinÃ¡mico
  _causalChips(name, selectedValue) {
    const causales = this._causales.length > 0 ? this._causales : handleGetCausalesActivas();
    return `<div class="causal-chips">
      ${causales.map((c) => `
        <label class="causal-chip${selectedValue === c.nombre ? ' selected' : ''}">
          <input type="radio" name="${name}" value="${c.nombre}"${selectedValue === c.nombre ? ' checked' : ''}>
          <span>${c.nombre}${c.dian ? ' <span class="causal-dian-badge">DIAN</span>' : ''}</span>
        </label>`).join('')}
    </div>`;
  }

  _reconFilteredDiff() {
    const withDiff = this._items.filter((i) => i.qty_fisica !== null && i.diferencia !== 0);
    if (this._reconFilter === 'sin_causal') return withDiff.filter((i) => !i.reconciled);
    if (this._reconFilter === 'conciliados') return withDiff.filter((i) => i.reconciled);
    return withDiff;
  }

  _renderReconciliation() {
    const withDiff   = this._items.filter((i) => i.qty_fisica !== null && i.diferencia !== 0);
    const noDiff     = this._items.filter((i) => i.qty_fisica !== null && i.diferencia === 0);
    const notCounted = this._items.filter((i) => i.qty_fisica === null);
    const sinCausal  = withDiff.filter((i) => !i.reconciled).length;
    const conCausal  = withDiff.filter((i) => i.reconciled).length;
    const displayed  = this._reconFilteredDiff();

    this.container.innerHTML = `
      <div class="audit-container">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn-back" id="btn-back-recon" hidden>← Volver al conteo</button>
          <button class="btn-secondary" id="btn-admin-causales" style="font-size:12px;padding:5px 10px">âš™ï¸ Gestionar Causales</button>
        </div>
        <div class="audit-header">
          <h2>âš–ï¸ ConciliaciÃ³n</h2>
          <span class="audit-badge">${withDiff.length} diferencias</span>
        </div>

        ${withDiff.length ? `
        <!-- F7: Filtros de conciliaciÃ³n -->
        <div class="recon-filter-bar" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn-recon-filter${this._reconFilter === '' ? ' active' : ''}" data-filter="">Todos (${withDiff.length})</button>
          <button class="btn-recon-filter${this._reconFilter === 'sin_causal' ? ' active' : ''}" data-filter="sin_causal">âš ï¸ Sin causal (${sinCausal})</button>
          <button class="btn-recon-filter${this._reconFilter === 'conciliados' ? ' active' : ''}" data-filter="conciliados">âœ… Conciliados (${conCausal})</button>
        </div>

        <div class="audit-batch-bar">
          <label class="audit-scope-label"><input type="checkbox" id="chk-all"> Seleccionar todos</label>
          <button class="btn-secondary" id="btn-batch">Aplicar causal a seleccionados â†“</button>
        </div>
        <div class="causal-chips-batch-wrap">
          <p class="audit-hint">Causal para aplicar en lote:</p>
          ${this._causalChips('batch-causal')}
        </div>
        <div id="recon-list">
          ${displayed.length === 0
            ? `<div class="empty-state"><p>Sin Ã­tems para este filtro.</p></div>`
            : displayed.map((item) => `
            <div class="audit-recon-row${item.reconciled ? ' recon-row-done' : ''}" id="rr-${item.id}">
              <div class="recon-check-col">
                <input type="checkbox" class="recon-chk" data-id="${item.id}"${item.reconciled ? ' disabled' : ''}>
              </div>
              <div class="recon-info">
                <div class="recon-name">${item.nombre}</div>
                <div class="recon-numbers">
                  <span class="recon-sys">Sistema: ${item.qty_sistema}</span>
                  <span class="recon-phy">FÃ­sico: ${item.qty_fisica}</span>
                  <span class="recon-diff ${item.diferencia < 0 ? 'diff-neg' : 'diff-pos'}">
                    ${item.diferencia > 0 ? '+' : ''}${item.diferencia}
                  </span>
                  ${item.costo_fisico != null ? `<span class="recon-costo-fis">Costo fÃ­sico: $${_fmtCop(item.costo_fisico)}</span>` : ''}
                </div>
                ${item.reconciled
                  ? `<div class="recon-causal-saved">âœ… Causal: <strong>${item.causal}</strong>
                     <span class="recon-meta">${item.causal_applied_by === 'batch' ? '(lote)' : '(individual)'}
                     · ${item.causal_usuario ?? 'local'}
                     · ${item.causal_timestamp ? new Date(item.causal_timestamp).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span></div>
                     <button class="btn-edit-recon" data-id="${item.id}">âœï¸ Corregir</button>`
                  : `<p class="audit-hint">Selecciona la causal:</p>
                     ${this._causalChips(`causal-${item.id}`, item.causal)}
                     <button class="btn-audit-save" data-id="${item.id}">ðŸ’¾ Guardar</button>`}
              </div>
            </div>`).join('')}
        </div>
        ` : '<div class="empty-state"><p>âœ… Sin diferencias â€” todos los conteos coinciden.</p></div>'}

        <div class="audit-summary-bar">
          ${noDiff.length     ? `<span>âœ… ${noDiff.length} sin diferencia</span>` : ''}
          ${notCounted.length ? `<span>âš ï¸ ${notCounted.length} no contados</span>` : ''}
        </div>
        <div class="audit-footer">
          <button class="btn-primary" id="btn-finish">ðŸ”’ Cierre Definitivo al Kardex</button>
          <button class="btn-abandon" id="btn-abandon-recon">🗑️ Abandonar y cerrar esta sesión</button>
        </div>
      </div>

      <!-- F6: Overlay doble confirmaciÃ³n cierre atÃ³mico -->
      <div class="invgen-ficha-overlay" id="invgen-f6-overlay" style="display:none">
        <div class="invgen-ficha-card f6-confirm-card">
          <div class="invgen-ficha-header">
            <h3>ðŸ”’ Cierre Definitivo al Kardex</h3>
            <button class="invgen-ficha-close" id="btn-f6-cancel">âœ•</button>
          </div>
          <div class="invgen-ficha-body" id="f6-overlay-body"></div>
          <div class="f6-overlay-actions">
            <button class="btn-f6-step1" id="btn-f6-confirm1">Confirmar â€” revisar resumen â†’</button>
            <button class="btn-f6-step2 hidden" id="btn-f6-confirm2">âš ï¸ CONFIRMAR CIERRE DEFINITIVO</button>
            <button class="btn-secondary" id="btn-f6-cancel2">Cancelar</button>
          </div>
        </div>
      </div>

      <!-- F6: Loading overlay -->
      <div class="invgen-ficha-overlay f6-loading-overlay" id="invgen-f6-loading" style="display:none">
        <div class="f6-loading-card">
          <div class="f6-loading-spinner"></div>
          <p>Aplicando cierre al Kardex oficialâ€¦</p>
          <p class="audit-hint">No cierres esta pantalla.</p>
        </div>
      </div>

      <!-- F7: Overlay administraciÃ³n de causales -->
      <div class="invgen-ficha-overlay" id="invgen-causales-overlay" style="display:none">
        <div class="invgen-ficha-card" style="max-width:480px;width:100%">
          <div class="invgen-ficha-header">
            <h3>âš™ï¸ Gestionar Causales de Ajuste</h3>
            <button class="invgen-ficha-close" id="btn-causales-close">âœ•</button>
          </div>
          <div class="invgen-ficha-body" id="causales-admin-body" style="padding:12px"></div>
        </div>
      </div>`;

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

    this.container.querySelectorAll('.btn-edit-recon').forEach((btn) =>
      btn.addEventListener('click', () => this._editOne(btn.dataset.id))
    );

    const batchBtn = this.container.querySelector('#btn-batch');
    if (batchBtn) batchBtn.addEventListener('click', () => this._batchApply());

    const chkAll = this.container.querySelector('#chk-all');
    if (chkAll) chkAll.addEventListener('change', () => {
      this.container.querySelectorAll('.recon-chk:not(:disabled)').forEach((c) => (c.checked = chkAll.checked));
    });

    // F7: filtros de conciliaciÃ³n
    this.container.querySelectorAll('.btn-recon-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._reconFilter = btn.dataset.filter;
        this._renderReconciliation();
      });
    });

    // F7: admin causales overlay
    const adminBtn = this.container.querySelector('#btn-admin-causales');
    if (adminBtn) adminBtn.addEventListener('click', () => this._openCausalesAdmin());

    const causalesOverlay = this.container.querySelector('#invgen-causales-overlay');
    if (causalesOverlay) {
      this.container.querySelector('#btn-causales-close')?.addEventListener('click', () => {
        causalesOverlay.style.display = 'none';
      });
      causalesOverlay.addEventListener('click', (e) => {
        if (e.target === causalesOverlay) causalesOverlay.style.display = 'none';
      });
    }

    this.container.querySelector('#btn-back-recon').addEventListener('click', () => {
      if (confirm('Â¿Volver al conteo? Las causales ya guardadas se conservan.')) {
        this._renderCounting();
      }
    });

    this.container.querySelector('#btn-finish').addEventListener('click', () => this._finish());
    this.container.querySelector('#btn-abandon-recon').addEventListener('click', () =>
      this._abandon()
    );
  }

  // â”€â”€ F7: Overlay administraciÃ³n catÃ¡logo causales â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  _openCausalesAdmin() {
    const overlay = this.container.querySelector('#invgen-causales-overlay');
    const body = this.container.querySelector('#causales-admin-body');
    if (!overlay || !body) return;
    this._renderCausalesAdminBody(body);
    overlay.style.display = 'flex';
  }

  _renderCausalesAdminBody(body) {
    const all = handleGetAllCausales();
    body.innerHTML = `
      <p class="audit-hint" style="margin-bottom:10px">
        CatÃ¡logo configurable Colombia/DIAN. Las causales del sistema no se pueden eliminar.
        <span class="causal-dian-badge">DIAN</span> = aplica para declaraciÃ³n tributaria.
      </p>
      <div id="causales-list-admin">
        ${all.map((c) => `
          <div class="causales-admin-row" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #F3F4F6">
            <span style="flex:1;font-size:13px;${!c.activo ? 'opacity:0.45;text-decoration:line-through' : ''}">
              ${c.nombre}
              ${c.dian ? '<span class="causal-dian-badge">DIAN</span>' : ''}
              ${c.sistema ? '<span style="font-size:10px;color:#6B7280">(sistema)</span>' : ''}
            </span>
            <button class="btn-secondary" style="font-size:11px;padding:3px 8px"
              data-toggle-causal="${c.id}" ${c.id === 'c_sin_diferencia' ? 'disabled title="Obligatoria"' : ''}>
              ${c.activo ? 'Desactivar' : 'Activar'}
            </button>
          </div>`).join('')}
      </div>
      <div style="margin-top:14px;padding-top:10px;border-top:1px solid #E5E7EB">
        <p class="audit-hint" style="margin-bottom:6px">âž• Agregar nueva causal:</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <input type="text" id="nueva-causal-nombre" class="ficha-edit-input"
            placeholder="Nombre de la causal" style="flex:2;min-width:120px"
            autocapitalize="characters" autocomplete="off" maxlength="60">
          <input type="text" id="nueva-causal-desc" class="ficha-edit-input"
            placeholder="DescripciÃ³n (opcional)" style="flex:3;min-width:140px" maxlength="120">
          <button class="btn-primary" id="btn-agregar-causal" style="font-size:12px;padding:6px 12px">Agregar</button>
        </div>
        <div id="nueva-causal-error" style="color:#EF4444;font-size:12px;margin-top:4px;display:none"></div>
      </div>
      <div style="margin-top:10px">
        <button class="btn-secondary" id="btn-reset-causales" style="font-size:11px;color:#6B7280">
          â†º Restaurar preset DIAN
        </button>
      </div>`;

    body.querySelectorAll('[data-toggle-causal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          handleToggleCausal(btn.dataset.toggleCausal);
          this._causales = handleGetCausalesActivas();
          this._renderCausalesAdminBody(body);
        } catch (err) {
          alert(err.message);
        }
      });
    });

    const nombreInput = body.querySelector('#nueva-causal-nombre');
    const descInput   = body.querySelector('#nueva-causal-desc');
    const errEl       = body.querySelector('#nueva-causal-error');

    const toUpper = (inp) => {
      const p = inp.selectionStart;
      inp.value = inp.value.toUpperCase();
      try { inp.setSelectionRange(p, p); } catch { /* noop */ }
    };
    nombreInput?.addEventListener('input', () => toUpper(nombreInput));

    body.querySelector('#btn-agregar-causal')?.addEventListener('click', () => {
      errEl.style.display = 'none';
      try {
        handleAddCausal({ nombre: nombreInput.value, descripcion: descInput?.value });
        this._causales = handleGetCausalesActivas();
        this._renderCausalesAdminBody(body);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    });

    body.querySelector('#btn-reset-causales')?.addEventListener('click', () => {
      if (confirm('Â¿Restaurar el catÃ¡logo al preset DIAN original? Se perderÃ¡n las causales personalizadas.')) {
        handleResetCausalesPreset();
        this._causales = handleGetCausalesActivas();
        this._renderCausalesAdminBody(body);
      }
    });
  }

  async _doSave(itemId, causal, appliedMode = 'individual') {
    const idx = this._items.findIndex((i) => i.id === itemId);
    const meta = { applied_mode: appliedMode, usuario: 'local' };
    this._items[idx] = await handleConciliarItem(this._items[idx], causal, meta);
    const row = this.container.querySelector(`#rr-${itemId}`);
    if (!row) return;
    row.classList.add('recon-row-done');
    const saveBtn = row.querySelector('.btn-audit-save');
    if (saveBtn) {
      saveBtn.textContent = 'âœ… Guardado';
      saveBtn.disabled = true;
    }
    const item = this._items[idx];
    const reconInfo = row.querySelector('.recon-info');
    if (reconInfo) {
      const metaStr = `${appliedMode === 'batch' ? '(lote)' : '(individual)'} · ${item.causal_usuario ?? 'local'} · ${item.causal_timestamp ? new Date(item.causal_timestamp).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : ''}`;
      let causalDiv = row.querySelector('.recon-causal-saved');
      if (!causalDiv) {
        causalDiv = document.createElement('div');
        causalDiv.className = 'recon-causal-saved';
        saveBtn?.insertAdjacentElement('afterend', causalDiv);
      }
      causalDiv.innerHTML = `âœ… Causal: <strong>${causal}</strong> <span class="recon-meta">${metaStr}</span>`;
    }
    if (!row.querySelector('.btn-edit-recon')) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit-recon';
      editBtn.dataset.id = itemId;
      editBtn.textContent = 'âœï¸ Corregir';
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
    if (!confirm(`Â¿Guardar conciliaciÃ³n?\n\n${item.nombre}\nCausal: ${causal}`)) return;
    await this._doSave(itemId, causal, 'individual');
  }

  _editOne(itemId) {
    const row = this.container.querySelector(`#rr-${itemId}`);
    if (!row) return;
    row.classList.remove('recon-row-done');
    const saveBtn = row.querySelector('.btn-audit-save');
    if (saveBtn) { saveBtn.textContent = 'ðŸ’¾ Guardar'; saveBtn.disabled = false; }
    row.querySelector('.btn-edit-recon')?.remove();
    const idx = this._items.findIndex((i) => i.id === itemId);
    this._items[idx] = { ...this._items[idx], reconciled: false, causal: null };
  }

  async _batchApply() {
    const causal = this.container.querySelector('input[name="batch-causal"]:checked')?.value;
    if (!causal) return;
    const ids = [...this.container.querySelectorAll('.recon-chk:checked:not(:disabled)')].map((c) => c.dataset.id);
    if (!ids.length) return;
    if (!confirm(`Â¿Aplicar causal "${causal}" a ${ids.length} Ã­tem(s) seleccionado(s)?`)) return;
    for (const id of ids) {
      const radio = this.container.querySelector(`input[name="causal-${id}"][value="${causal}"]`);
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
      await this._doSave(id, causal, 'batch');
    }
  }

  async _abandon() {
    if (!confirm(
      'Â¿Abandonar y cerrar esta sesiÃ³n de Inventario General?\n\nSe descartarÃ¡ todo el progreso no guardado. Esta acciÃ³n no puede deshacerse.'
    )) return;
    if (this._session) await handleAbandonarSesion(this._session);
    this._session = null;
    this._items = [];
    this.unmount();
    document.querySelector('[data-view="lista"]')?.click();
  }

  async _finish() {
    const autoMeta = { applied_mode: 'auto', usuario: 'sistema' };

    // F6 GATE: Auto-conciliar Ã­tems sin diferencia
    const noDiff = this._items.filter((i) => i.qty_fisica !== null && i.diferencia === 0 && !i.reconciled);
    for (const item of noDiff) {
      const idx = this._items.findIndex((j) => j.id === item.id);
      this._items[idx] = await handleConciliarItem(this._items[idx], 'SIN DIFERENCIA', autoMeta);
    }

    // F6 BLOCK: Verificar diferencias sin causal â€” bloquea cierre (F7 requerido)
    const sinCausal = this._items.filter(
      (i) => i.qty_fisica !== null && Number(i.diferencia) !== 0 && !i.reconciled
    );
    if (sinCausal.length > 0) {
      const nombres = sinCausal.slice(0, 3).map((i) => i.nombre ?? i.sku).join('\nâ€¢ ');
      alert(
        `â›” Cierre bloqueado\n\n${sinCausal.length} Ã­tem(s) con diferencia sin causal:\nâ€¢ ${nombres}${sinCausal.length > 3 ? '\nâ€¦y otros' : ''}\n\nAsigna una causal a cada Ã­tem antes de cerrar.`
      );
      return;
    }

    // F6 WARN: Ãtems no contados
    const sinContar = this._items.filter((i) => i.qty_fisica === null);
    if (sinContar.length > 0) {
      if (!confirm(
        `âš ï¸ ${sinContar.length} Ã­tem(s) no fueron contados.\n\nSe registrarÃ¡n con cantidad fÃ­sica = 0.\nÂ¿Continuar de todas formas?`
      )) return;
      for (const item of sinContar) {
        const idx = this._items.findIndex((j) => j.id === item.id);
        let updated = await handleRegistrarConteo(this._items[idx], 0);
        this._items[idx] = await handleConciliarItem(updated, 'SIN DIFERENCIA', autoMeta);
      }
    }

    // F6 DOUBLE-CONFIRM: Abrir overlay
    this._openF6ConfirmOverlay();
  }

  _openF6ConfirmOverlay() {
    const ajustes   = this._items.filter((i) => Number(i.diferencia) !== 0);
    const conCosto  = this._items.filter((i) => i.costo_fisico != null && i.costo_fisico > 0 && i.costo_fisico !== i.costo_sistema);
    const nuevos    = this._items.filter((i) => i.es_producto_nuevo);
    const overlay   = this.container.querySelector('#invgen-f6-overlay');
    const body      = this.container.querySelector('#f6-overlay-body');
    if (!overlay || !body) return;

    body.innerHTML = `
      <p class="f6-warning">âš ï¸ Esta acciÃ³n actualizarÃ¡ el Kardex oficial de manera permanente e irreversible.</p>
      <div class="f6-summary-grid">
        <div class="f6-stat"><span class="f6-stat-num">${this._items.length}</span><span class="f6-stat-label">Ãtems totales</span></div>
        <div class="f6-stat"><span class="f6-stat-num">${ajustes.length}</span><span class="f6-stat-label">Ajustes Kardex</span></div>
        <div class="f6-stat"><span class="f6-stat-num">${conCosto.length}</span><span class="f6-stat-label">Costos a actualizar</span></div>
        <div class="f6-stat"><span class="f6-stat-num">${nuevos.length}</span><span class="f6-stat-label">Productos nuevos</span></div>
      </div>
      ${ajustes.length > 0 ? `
      <div class="f6-diff-list">
        <p class="f6-diff-title">Ajustes al Kardex:</p>
        ${ajustes.slice(0, 6).map((i) => `
          <div class="f6-diff-row">
            <span class="f6-diff-name">${i.nombre}</span>
            <span class="f6-diff-nums">
              <span class="recon-sys">${i.qty_sistema}</span>
              <span class="f6-arrow">â†’</span>
              <span class="recon-phy">${i.qty_fisica}</span>
              <span class="${Number(i.diferencia) > 0 ? 'diff-pos' : 'diff-neg'}">(${Number(i.diferencia) > 0 ? '+' : ''}${i.diferencia})</span>
            </span>
            <span class="f6-diff-causal">${i.causal ?? ''}</span>
          </div>`).join('')}
        ${ajustes.length > 6 ? `<p class="audit-hint f6-more">â€¦y ${ajustes.length - 6} Ã­tem(s) mÃ¡s sin diferencia</p>` : ''}
      </div>` : '<p class="audit-hint" style="text-align:center">âœ… Sin diferencias en esta sesiÃ³n.</p>'}
      <div class="f6-commit-notice">
        <p>Al confirmar definitivamente:</p>
        <ul>
          <li>Kardex oficial se actualizarÃ¡ con ${ajustes.length} ajuste(s)</li>
          ${conCosto.length > 0 ? `<li>Se actualizarÃ¡n ${conCosto.length} costo(s) unitario(s)</li>` : ''}
          <li>Bodega satÃ©lite quedarÃ¡ cerrada/solo lectura</li>
          <li>SesiÃ³n quedarÃ¡ cerrada/solo lectura</li>
          <li>Esta acciÃ³n <strong>NO puede deshacerse</strong></li>
        </ul>
      </div>`;

    const btn1    = overlay.querySelector('#btn-f6-confirm1');
    const btn2    = overlay.querySelector('#btn-f6-confirm2');
    const cancel  = overlay.querySelector('#btn-f6-cancel');
    const cancel2 = overlay.querySelector('#btn-f6-cancel2');

    if (btn1) { btn1.classList.remove('hidden'); btn1.disabled = false; }
    if (btn2) btn2.classList.add('hidden');

    overlay.style.display = 'flex';

    const closeOverlay = () => { overlay.style.display = 'none'; };

    btn1?.addEventListener('click', () => {
      btn1.classList.add('hidden');
      btn2?.classList.remove('hidden');
    }, { once: true });

    btn2?.addEventListener('click', () => {
      closeOverlay();
      this._executeF6Close();
    }, { once: true });

    cancel?.addEventListener('click', closeOverlay, { once: true });
    cancel2?.addEventListener('click', closeOverlay, { once: true });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    }, { once: true });
  }

  async _executeF6Close() {
    const loadingOverlay = this.container.querySelector('#invgen-f6-loading');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    try {
      const result = await handleCierreAtomicoInventario(this._session, this._items);
      this._session = result.session;
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      if (result.final_status === 'partial_close' || result.final_status === 'failed') {
        this._openCloseRecoveryPanel(result);
        return;
      }
      this._renderDone(result.session, result.adjustments_count);
    } catch (err) {
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      alert(`Error en cierre atÃ³mico:\n${err.message}\n\nPuedes reintentar. El sistema no duplica movimientos.`);
    }
  }

  _openCloseRecoveryPanel(result) {
    const isPartial = result.final_status === 'partial_close';
    const title = isPartial ? 'Cierre parcial detectado' : 'Cierre fallido';
    const msg = isPartial
      ? 'Kardex quedó aplicado, pero faltan etapas para cierre total. Debes reintentar.'
      : 'El pipeline de cierre falló. Revisa y reintenta para normalizar la sesión.';
    const pending = Array.isArray(result.pending_actions) && result.pending_actions.length > 0
      ? result.pending_actions.join(', ')
      : 'retry_close';

    const overlay = document.createElement('div');
    overlay.className = 'invgen-ficha-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
      <div class="invgen-ficha-card" style="max-width:520px;width:94%;max-height:85vh;overflow:auto">
        <div class="invgen-ficha-header">
          <h3 style="font-size:16px">${isPartial ? '🟠' : '🔴'} ${title}</h3>
          <button class="invgen-ficha-close" id="btn-close-retry-panel">✕</button>
        </div>
        <div style="padding:14px">
          <p style="font-size:13px;color:#374151;line-height:1.5;margin:0 0 10px">${msg}</p>
          <p style="font-size:12px;color:#6b7280;margin:0 0 12px"><strong>Pendiente:</strong> ${pending}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-primary" id="btn-retry-close-now" style="flex:1 1 220px">🔁 Reintentar ahora</button>
            <button class="btn-secondary" id="btn-retry-later" style="flex:1 1 180px">Continuar luego</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const closePanel = () => overlay.remove();
    overlay.querySelector('#btn-close-retry-panel')?.addEventListener('click', closePanel, { once: true });
    overlay.querySelector('#btn-retry-later')?.addEventListener('click', () => {
      closePanel();
      this._renderReconciliation();
    }, { once: true });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePanel();
    }, { once: true });

    overlay.querySelector('#btn-retry-close-now')?.addEventListener('click', async () => {
      const retryBtn = overlay.querySelector('#btn-retry-close-now');
      if (retryBtn) {
        retryBtn.disabled = true;
        retryBtn.textContent = 'Reintentando...';
      }
      try {
        const retried = await handleRetryPartialClose(this._session, this._items);
        this._session = retried.session;
        closePanel();
        if (retried.final_status === 'committed') {
          this._renderDone(retried.session, retried.adjustments_count);
          return;
        }
        this._openCloseRecoveryPanel(retried);
      } catch (err) {
        if (retryBtn) {
          retryBtn.disabled = false;
          retryBtn.textContent = '🔁 Reintentar ahora';
        }
        alert(`No se pudo reintentar el cierre:\n${err.message}`);
      }
    }, { once: true });
  }

  // â”€â”€ F5: Overlay crear producto nuevo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _openCrearProductoOverlay() {
    const overlay = this.container.querySelector('#invgen-nuevo-producto');
    if (!overlay) return;

    // Limpiar inputs
    const npNombre = overlay.querySelector('#np-nombre');
    const npRef    = overlay.querySelector('#np-ref');
    const npUom    = overlay.querySelector('#np-uom');
    if (npNombre) { npNombre.value = ''; }
    if (npRef)    { npRef.value = this._pendingScanCode || ''; }
    if (npUom)    { npUom.value = 'UND'; }
    const skuCode = overlay.querySelector('#np-sku-code');
    const skuMeta = overlay.querySelector('#np-sku-meta');
    const dupAlert = overlay.querySelector('#np-dup-alert');
    if (skuCode) skuCode.textContent = 'â€”';
    if (skuMeta) skuMeta.textContent = '';
    if (dupAlert) { dupAlert.className = 'sku-alert hidden'; dupAlert.textContent = ''; }

    overlay.style.display = 'flex';

    // Cerrar overlay
    overlay.querySelector('#btn-nuevo-prod-close').addEventListener('click', () => {
      overlay.style.display = 'none';
    }, { once: true });
    overlay.querySelector('#btn-nuevo-prod-cancel').addEventListener('click', () => {
      overlay.style.display = 'none';
    }, { once: true });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    }, { once: true });

    // Live SKU preview
    const updatePreview = () => {
      const nombre = (npNombre?.value ?? '').toUpperCase().trim();
      const ref    = (npRef?.value ?? '').toUpperCase().trim();
      if (!nombre && !ref) {
        if (skuCode) skuCode.textContent = 'â€”';
        if (skuMeta) skuMeta.textContent = '';
        return;
      }
      const result = generateSKU(nombre || 'PRODUCTO', ref || '0000');
      if (skuCode) skuCode.textContent = result.sku;
      if (skuMeta) skuMeta.textContent = `${result.cat} / ${result.sub} / ${result.atr}`;
    };

    const toUpper = (input) => {
      const pos = input.selectionStart;
      input.value = input.value.toUpperCase();
      try { input.setSelectionRange(pos, pos); } catch { /* not text */ }
    };

    npNombre?.addEventListener('input', () => { toUpper(npNombre); updatePreview(); });
    npRef?.addEventListener('input', ()    => { toUpper(npRef); updatePreview(); });
    updatePreview();

    // Guardar
    const saveBtn = overlay.querySelector('#btn-nuevo-prod-save');
    saveBtn?.addEventListener('click', () => this._saveProductoNuevo(overlay), { once: true });

    npNombre?.focus();
  }

  async _saveProductoNuevo(overlay) {
    const nombre = (overlay.querySelector('#np-nombre')?.value ?? '').trim();
    const ref    = (overlay.querySelector('#np-ref')?.value ?? '').trim();
    const uom    = overlay.querySelector('#np-uom')?.value ?? 'UND';
    const dupAlert = overlay.querySelector('#np-dup-alert');

    if (!nombre || !ref) {
      if (dupAlert) {
        dupAlert.className = 'sku-alert visible';
        dupAlert.textContent = 'âš ï¸ DescripciÃ³n y cÃ³digo de proveedor son obligatorios';
      }
      // Re-bind save button
      const saveBtn = overlay.querySelector('#btn-nuevo-prod-save');
      saveBtn?.addEventListener('click', () => this._saveProductoNuevo(overlay), { once: true });
      return;
    }

    const result = generateSKU(nombre, ref);
    const productData = {
      nombre,
      ref_proveedor: ref,
      uom,
      sku: result.sku,
      categoria: result.cat,
      subcategoria: result.sub,
      atributo: result.atr,
    };

    if (!confirm(
      `Â¿Guardar nuevo producto y regresar al inventario?\n\nSKU: ${result.sku}\n${nombre}`
    )) {
      const saveBtn = overlay.querySelector('#btn-nuevo-prod-save');
      saveBtn?.addEventListener('click', () => this._saveProductoNuevo(overlay), { once: true });
      return;
    }

    const saveBtn = overlay.querySelector('#btn-nuevo-prod-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardandoâ€¦'; }

    try {
      const newItem = await handleAgregarProductoNuevoAInventario(this._session, productData);
      this._items.push(newItem);
      this._pendingScanCode = '';
      overlay.style.display = 'none';
      this._refreshCountList();
      this._updateIndicadores();
    } catch (err) {
      if (dupAlert) {
        dupAlert.className = 'sku-alert visible';
        dupAlert.textContent = `Error: ${err.message}`;
      }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'âœ“ Guardar y regresar al inventario'; }
      saveBtn?.addEventListener('click', () => this._saveProductoNuevo(overlay), { once: true });
    }
  }

  // Fase 4 / F6: Completado
  _renderDone(session, adjustmentsCount = 0) {
    const counted       = this._items.filter((i) => i.qty_fisica !== null).length;
    const diffs         = this._items.filter((i) => Number(i.diferencia) !== 0).length;
    const reconciled    = this._items.filter((i) => i.reconciled).length;
    const conCostoFisico = this._items.filter((i) => i.costo_fisico != null).length;
    const cierreReal = session.status === 'committed';
    const kardexActualizado = session.kardex_committed === true;

    this.container.innerHTML = `
      <div class="audit-container">
        <div class="audit-done">
          <div class="audit-done-icon">${cierreReal ? 'ðŸ”’' : 'âœ…'}</div>
          <h2>${cierreReal ? 'Inventario Cerrado â€” Comprometido' : 'Inventario General Completado'}</h2>
          <div class="audit-done-stats">
            <div class="stat-item"><span class="stat-num">${counted}</span><span class="stat-label">Contados</span></div>
            <div class="stat-item"><span class="stat-num">${diffs}</span><span class="stat-label">Diferencias</span></div>
            <div class="stat-item"><span class="stat-num">${reconciled}</span><span class="stat-label">Conciliados</span></div>
            ${kardexActualizado ? `<div class="stat-item"><span class="stat-num">${adjustmentsCount}</span><span class="stat-label">Ajustes Kardex</span></div>` : ''}
            ${conCostoFisico > 0 ? `<div class="stat-item"><span class="stat-num">${conCostoFisico}</span><span class="stat-label">Con costo fÃ­sico</span></div>` : ''}
          </div>
          ${cierreReal
            ? `<p class="audit-done-note f6-done-note">
                âœ… Kardex oficial actualizado con ${adjustmentsCount} ajuste(s).<br>
                ðŸ”’ Bodega satÃ©lite cerrada â€” solo lectura.<br>
                ðŸ”’ SesiÃ³n cerrada â€” solo lectura.
              </p>`
            : `<p class="audit-done-note">Los conteos han sido registrados en la sesiÃ³n de inventario.<br>Los ajustes al Kardex oficial se realizarÃ¡n en la conciliaciÃ³n final (F6).</p>`
          }
          <button class="btn-primary" id="btn-invgen-exit">Ir a Productos</button>
        </div>
      </div>`;

    this.container.querySelector('#btn-invgen-exit').addEventListener('click', () => {
      document.querySelector('[data-view="lista"]')?.click();
    });
  }

  // â”€â”€ MULTIUSUARIO: Overlay ledger de cambios por Ã­tem â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async _openItemLedger(itemId) {
    let entries = [];
    try {
      entries = await handleGetItemLedger(itemId);
    } catch {
      alert('No se pudo cargar el historial del Ã­tem.');
      return;
    }

    const item = this._items.find((i) => i.id === itemId);
    const nombre = item?.nombre ?? 'Ãtem';

    const content = entries.length === 0
      ? '<p class="audit-hint" style="text-align:center;padding:16px">Sin registros en el ledger para este Ã­tem.</p>'
      : entries.map((e) => {
          const ts = e.timestamp ? new Date(e.timestamp).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '';
          const actionLabel = { count: 'Conteo', cost: 'Costo', reconcile: 'ConciliaciÃ³n', conflict: 'Conflicto', lock: 'Lock', unlock: 'Unlock' }[e.action] ?? e.action;
          const qtyInfo = (e.qty_before !== undefined && e.qty_before !== null) || (e.qty_after !== undefined && e.qty_after !== null)
            ? ` ${e.qty_before ?? 'â€”'} â†’ ${e.qty_after ?? 'â€”'}`
            : '';
          return `<div style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-size:12px">
            <span style="font-weight:600;color:${e.action === 'conflict' ? '#EF4444' : '#374151'}">${actionLabel}</span>
            <span style="color:#6B7280;margin-left:8px">${e.device_label ?? e.device_id?.slice(0,8) ?? 'local'}</span>
            <span style="color:#9CA3AF;margin-left:8px">${ts}</span>
            ${qtyInfo ? `<span style="margin-left:8px;color:#1D4ED8">qty${qtyInfo}</span>` : ''}
          </div>`;
        }).join('');

    const overlay = document.createElement('div');
    overlay.className = 'invgen-ficha-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `
      <div class="invgen-ficha-card" style="max-width:420px;width:92%;max-height:80vh;overflow:auto">
        <div class="invgen-ficha-header">
          <h3 style="font-size:14px">ðŸ“‹ Ledger: ${nombre}</h3>
          <button class="invgen-ficha-close" id="btn-ledger-close">âœ•</button>
        </div>
        <div style="padding:12px">${content}</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#btn-ledger-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }
}

