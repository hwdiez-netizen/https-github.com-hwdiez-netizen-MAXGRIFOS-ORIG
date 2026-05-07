import './styles/main.css';
import { initDB } from './db/local-db.js';
import { eventBus, Events } from './events/domain-events.js';
import { registerStockGuardImpl } from './services/stock-guard.js';
import { initProductKardexListener } from './modules/maestro-productos/product-kardex-listener.js';
import { runtimeGuard } from './modules/observability/runtime-guard.js';
import { FlowContainer } from './nis/flow-container.js';
import { isSkuV5Format } from './modules/maestro-productos/sku-engine.js';
import { ProductList } from './modules/maestro-productos/product-list.js';
import { ProductForm } from './modules/maestro-productos/product-form.js';
import { ProductDetail } from './modules/maestro-productos/product-detail.js';
import { ScannerController } from './scanner/scanner-controller.js';
import { OfflineIndicator } from './components/offline-indicator.js';
import { GlobalConsistencyReconciler } from './modules/hardening/consistency-reconciler.js';
import { EventObservabilityRuntime } from './modules/observability/event-observability.js';
import { rbacAuditLog } from './modules/pedidos/handlers/audit-rbac.js';
import { AuditoriaController } from './modules/auditoria/auditoria-controller.js';
import { processSyncQueue, getProducts } from './modules/maestro-productos/product-store.js';
import {
  handleAbandonarSesion,
  handleBootstrapInventarioSessionV2,
  handleGetRecoverySessionsSanitized,
  handleResumeIgnoredSession,
  handleSetSessionIgnored,
} from './modules/auditoria/handlers/index.js';
import { HomeMenu, renderProveedoresSubMenu, renderVentasSubMenu } from './components/home-menu.js';
import { ClienteList } from './modules/clientes/cliente-list.js';
import { ClienteForm } from './modules/clientes/cliente-form.js';
import { ClienteDetail } from './modules/clientes/cliente-detail.js';
import { processSyncQueueClientes, getClienteById } from './modules/clientes/cliente-store.js';
import { KardexList } from './modules/kardex/kardex-list.js';
import { KardexForm } from './modules/kardex/kardex-form.js';
import { KardexConciliacion } from './modules/kardex/kardex-conciliacion.js';
import { processSyncQueueKardex, liberarStockPorDocumento, getSaldoByProduct } from './modules/kardex/kardex-store.js';
import { seedBodegas, BODEGA_PEDIDOS_ID } from './modules/kardex/bodega-store.js';
import { BodegaManager } from './components/bodega-manager.js';
import { BodegaDetail } from './components/bodega-detail.js';
import { PedidoList } from './modules/pedidos/pedido-list.js';
import { PedidoForm } from './modules/pedidos/pedido-form.js';
import { PedidoDetail } from './modules/pedidos/pedido-detail.js';
import { PickingForm } from './modules/pedidos/picking-form.js';
import { PackingForm } from './modules/pedidos/packing-form.js';
import { processSyncQueuePedidos } from './modules/pedidos/pedido-store.js';
import { FacturaList } from './modules/facturacion/factura-list.js';
import { processSyncQueueDocumentos } from './modules/facturacion/factura-store.js';
import { renderConfiguracionComprobantes } from './modules/facturacion/configuracion-form.js';
import { seedClienteMostrador } from './modules/clientes/cliente-store.js';
import { seedConfigComprobantes } from './modules/kardex/config-store.js';
import { JornadaBanner } from './components/jornada-banner.js';
import { ListaPreciosList } from './modules/politicas-comerciales/lista-precios-list.js';
import { ListaPreciosForm } from './modules/politicas-comerciales/lista-precios-form.js';
import { TrazabilidadList } from './modules/trazabilidad/trazabilidad-list.js';
import { RbacAuditExport } from './modules/trazabilidad/rbac-audit-export.js';
import { ProductoPrecioSetup } from './modules/maestro-productos/producto-precio-setup.js';
import { DinamicaList } from './modules/politicas-comerciales/dinamica-list.js';
import { DinamicaForm } from './modules/politicas-comerciales/dinamica-form.js';
import { processSyncQueueListasPrecios } from './modules/politicas-comerciales/lista-precios-store.js';
import { processSyncQueueDinamicas } from './modules/politicas-comerciales/dinamica-store.js';
import { iniciarPoliticasSaga } from './modules/politicas-comerciales/politicas-saga.js';
import { getLista, getDinamica, exportAllData, createUpdateSafetyBackup } from './db/local-db.js';
// â”€â”€ OVERLAY v13 — Constitución V1.3 Â§4 (imports aditivos, legacy intacto) â”€â”€â”€â”€
import { initPersistentEventBus } from './events/persistent-event-bus.js';
import { initKardexDomainListeners } from './modules/kardex/kardex-domain-listeners.js';
import { reconcileOutbox, startOutboxReconcilerLoop } from './utils/outbox-reconciler.js';
import { initAuditHelpers } from './utils/audit-helpers.js';
import { ProveedorList } from './modules/proveedores/proveedor-list.js';
import { ProveedorForm } from './modules/proveedores/proveedor-form.js';
import { CompraList }    from './modules/compras/compra-list.js';
import { CompraForm }    from './modules/compras/compra-form.js';
import { initCompraKardexListener } from './modules/compras/compra-kardex-listener.js';
import { GarantiaList }    from './modules/garantias/garantia-list.js';
import { initGarantiaStore } from './modules/garantias/garantia-store.js';
import { VentasResumen } from './modules/ventas/ventas-resumen.js';
import { InventarioController } from './modules/inventario/inventario-controller.js';
import { HistorialInventarioController } from './modules/inventario/historial-inventario-controller.js';

let currentComponent = null;
let _pendingAuditProduct = null;
let _jornadaBanner = null;
let _consistencyReconciler = null;
let _observabilityRuntime = null;
let _currentViewName = 'home';
let _navSwipeCleanup = null;
let _pedidosNisSwipeCleanup = null;
let _pedidosNisObserverCleanup = null;
let _listasNisSwipeCleanup = null;
let _listasNisObserverCleanup = null;
let _productosNisSwipeCleanup = null;
let _escanerNisSwipeCleanup = null;
let _auditoriaNisSwipeCleanup = null;

let _audioCtx = null;
function _warmAudio() {
  if (_audioCtx) return;
  try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* noop */ }
}

function playBeep() {
  try {
    if (!_audioCtx) return;
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    const osc  = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.15);
    osc.start(_audioCtx.currentTime);
    osc.stop(_audioCtx.currentTime + 0.15);
  } catch { /* noop */ }
}

function showUnregisteredDialog(code, mainContent) {
  return new Promise((resolve) => {
    mainContent.innerHTML = `
      <div class="scan-unreg-overlay">
        <div class="scan-unreg-card">
          <div class="scan-unreg-icon">⚠️</div>
          <h3>Producto no registrado</h3>
          <div class="scan-unreg-code">${code}</div>
          <p>Este código no está en el sistema.<br>¿Desea registrarlo ahora?</p>
          <div class="scan-unreg-actions">
            <button class="btn-primary" id="btn-unreg-yes">✅ Sí, registrar</button>
            <button class="btn-secondary" id="btn-unreg-no">No, volver</button>
          </div>
        </div>
      </div>`;
    mainContent.querySelector('#btn-unreg-yes').addEventListener('click', () => resolve(true));
    mainContent.querySelector('#btn-unreg-no').addEventListener('click', () => resolve(false));
  });
}

const VIEW_MODULE = {
  home:            'home',
  lista:           'productos',
  nuevo:           'productos',
  detail:          'productos',
  clientes:        'clientes',
  'cliente-form':  'clientes',
  'cliente-detail':'clientes',
  kardex:          'kardex',
  'kardex-form':   'kardex',
  'kardex-conciliacion': 'kardex',
  bodegas:         'kardex',
  'bodega-detail': 'kardex',
  pedidos:         'pedidos',
  'pedido-form':   'pedidos',
  'pedido-detail': 'pedidos',
  'picking-form':  'pedidos',
  'packing-form':  'pedidos',
  facturacion:     'facturacion',
  configuracion:   'facturacion',
  escaner:         'escaner',
  auditoria:       'auditoria',
  'inventario-general':   'inventario',
  'historial-inventario': 'inventario',
  trazabilidad:              'trazabilidad',
  'auditoria-rbac':          'trazabilidad',
  'producto-precio-setup':   'productos',
  'ventas-resumen':          'home',
  proveedores:               'proveedores',
  'proveedores-lista':       'proveedores',
  'proveedor-form':          'proveedores',
  compras:                   'proveedores',
  'compra-form':             'proveedores',
  politicas:            'politicas',
  'lista-precios-form': 'politicas',
  dinamicas:            'politicas',
  'dinamica-form':      'politicas',
  garantias:            'garantias',
  'ventas-resumen':     'ventas',
};

const MODULE_ROOT_VIEW = {
  productos: 'lista',
  clientes: 'clientes',
  kardex: 'kardex',
  pedidos: 'pedidos',
  facturacion: 'facturacion',
  proveedores: 'proveedores',
  politicas: 'politicas',
  garantias: 'garantias',
  ventas: 'ventas',
  auditoria: 'auditoria',
  inventario: 'inventario-general',
  trazabilidad: 'trazabilidad',
  escaner: 'escaner',
  home: 'home',
};

const VIEW_BACK_TARGET = {
  clientes: 'home',
  ventas: 'home',
  proveedores: 'home',
  kardex: 'home',
  garantias: 'home',
  facturacion: 'home',
  'proveedores-lista': 'proveedores',
  'ventas-resumen': 'ventas',
  detail: 'lista',
  nuevo: 'lista',
  'producto-precio-setup': 'lista',
  'cliente-form': 'clientes',
  'cliente-detail': 'clientes',
  'kardex-form': 'kardex',
  'kardex-conciliacion': 'kardex',
  bodegas: 'kardex',
  'bodega-detail': 'bodegas',
  'pedido-form': 'pedidos',
  'pedido-detail': 'pedidos',
  'picking-form': 'pedido-detail',
  'packing-form': 'pedido-detail',
  configuracion: 'facturacion',
  'proveedor-form': 'proveedores',
  compras: 'proveedores',
  'compra-form': 'compras',
  'lista-precios-form': 'politicas',
  dinamicas: 'politicas',
  'dinamica-form': 'dinamicas',
  'auditoria-rbac': 'trazabilidad',
  'historial-inventario': 'auditoria',
};

const PEDIDOS_NIS_VIEWS = ['pedidos', 'pedido-form', 'pedido-detail', 'picking-form', 'packing-form'];
const LISTAS_NIS_VIEWS = ['politicas', 'lista-precios-form'];
const PRODUCTOS_NIS_VIEWS = ['lista', 'detail', 'nuevo', 'producto-precio-setup'];
const ESCANER_NIS_VIEWS = ['escaner'];
const AUDITORIA_NIS_VIEWS = ['auditoria', 'inventario-general', 'historial-inventario'];

function _isPedidosNisView(viewName) {
  return PEDIDOS_NIS_VIEWS.includes(viewName);
}

function _isListasNisView(viewName) {
  return LISTAS_NIS_VIEWS.includes(viewName);
}

function _isProductosNisView(viewName) {
  return PRODUCTOS_NIS_VIEWS.includes(viewName);
}

function _isEscanerNisView(viewName) {
  return ESCANER_NIS_VIEWS.includes(viewName);
}

function _isAuditoriaNisView(viewName) {
  return AUDITORIA_NIS_VIEWS.includes(viewName);
}

function _getPedidosNisStepIndex(viewName) {
  const map = {
    pedidos: 0,
    'pedido-form': 1,
    'pedido-detail': 2,
    'picking-form': 3,
    'packing-form': 4,
  };
  return map[viewName] ?? 0;
}

function _resolvePedidosNisSwipeTarget(viewName, options = {}, direction = 'left') {
  const pedidoId = options?.pedidoId ?? null;
  if (direction === 'left') {
    if (viewName === 'pedidos') return { view: 'pedido-form', options: {} };
    if (viewName === 'pedido-form') return pedidoId ? { view: 'pedido-detail', options: { pedidoId } } : null;
    if (viewName === 'pedido-detail') return pedidoId ? { view: 'picking-form', options: { pedidoId } } : null;
    if (viewName === 'picking-form') return pedidoId ? { view: 'packing-form', options: { pedidoId } } : null;
    return null;
  }

  if (viewName === 'packing-form') return pedidoId ? { view: 'picking-form', options: { pedidoId } } : null;
  if (viewName === 'picking-form') return pedidoId ? { view: 'pedido-detail', options: { pedidoId } } : null;
  if (viewName === 'pedido-detail') return { view: 'pedidos', options: {} };
  if (viewName === 'pedido-form') return { view: 'pedidos', options: {} };
  if (viewName === 'pedidos') return { view: 'ventas', options: {} };
  return null;
}

function _showPedidosUnsavedToast(mainContent, message = 'Finaliza, guarda o cancela el proceso antes de salir.') {
  const prev = mainContent.querySelector('#nis-pedidos-unsaved-toast');
  if (prev) prev.remove();
  const toast = document.createElement('div');
  toast.id = 'nis-pedidos-unsaved-toast';
  toast.className = 'nis-unsaved-toast';
  toast.textContent = message;
  mainContent.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2200);
}

function _ensurePedidosNisOverlay(mainContent, viewName, options = {}) {
  _pedidosNisSwipeCleanup?.();
  _pedidosNisSwipeCleanup = null;

  if (!_isPedidosNisView(viewName)) {
    delete mainContent.dataset.nisPedidos;
    return;
  }

  mainContent.dataset.nisPedidos = '1';
  const existing = mainContent.querySelector('#nis-pedidos-overlay');
  if (existing) existing.remove();

  let x0 = 0;
  let y0 = 0;
  const threshold = 50;
  const verticalTolerance = 44;
  const onStart = (ev) => {
    const touch = ev.touches?.[0];
    if (!touch) return;
    x0 = touch.clientX;
    y0 = touch.clientY;
  };
  const onEnd = (ev) => {
    const touch = ev.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - x0;
    const dy = touch.clientY - y0;
    if (Math.abs(dy) > verticalTolerance) return;
    if (Math.abs(dx) <= threshold) return;

    if (dx > 0) {
      const componentName = currentComponent?.constructor?.name ?? '';
      const isDirtyPedidoForm = componentName === 'PedidoForm' && currentComponent?._saved !== true;
      const isActivePickingPacking = viewName === 'picking-form' || viewName === 'packing-form';
      const isActivePedidoDetail = componentName === 'PedidoDetail'
        && !['anulado', 'cancelado', 'pod'].includes(currentComponent?._data?.pedido?.estado ?? '');
      if (isDirtyPedidoForm || isActivePickingPacking || isActivePedidoDetail) {
        _showPedidosUnsavedToast(mainContent);
        return;
      }
    }

    const target = dx < 0
      ? _resolvePedidosNisSwipeTarget(viewName, options, 'left')
      : _resolvePedidosNisSwipeTarget(viewName, options, 'right');
    if (!target) return;
    navigate(target.view, target.options);
  };

  mainContent.addEventListener('touchstart', onStart, { passive: true });
  mainContent.addEventListener('touchend', onEnd, { passive: true });
  _pedidosNisSwipeCleanup = () => {
    mainContent.removeEventListener('touchstart', onStart);
    mainContent.removeEventListener('touchend', onEnd);
  };
}

function _schedulePedidosNisOverlayReinject(mainContent, viewName, options = {}) {
  _pedidosNisObserverCleanup?.();
  _pedidosNisObserverCleanup = null;
  _ensurePedidosNisOverlay(mainContent, viewName, options);
  if (!_isPedidosNisView(viewName)) return;
  // PedidoList/PedidoForm renderizan asíncronamente y pueden reemplazar el HTML
  // después de la primera inyección. Reinyectamos de forma determinista y reversible.
  setTimeout(() => _ensurePedidosNisOverlay(mainContent, viewName, options), 0);
  setTimeout(() => _ensurePedidosNisOverlay(mainContent, viewName, options), 120);
  const observer = new MutationObserver(() => {
    if (!mainContent.isConnected) return;
    if (!mainContent.querySelector('#nis-pedidos-overlay')) {
      _ensurePedidosNisOverlay(mainContent, viewName, options);
    }
  });
  observer.observe(mainContent, { childList: true, subtree: false });
  const stop = () => observer.disconnect();
  _pedidosNisObserverCleanup = stop;
  setTimeout(() => {
    stop();
    if (_pedidosNisObserverCleanup === stop) _pedidosNisObserverCleanup = null;
  }, 2000);
}

function _getListasNisStepIndex(viewName) {
  const map = {
    politicas: 0,
    'lista-precios-form': 1,
  };
  return map[viewName] ?? 0;
}

function _resolveListasNisSwipeTarget(viewName, direction = 'left') {
  if (direction === 'left') {
    if (viewName === 'politicas') return { view: 'lista-precios-form', options: {} };
    return null;
  }
  if (viewName === 'politicas') return { view: 'home', options: {} };
  if (viewName === 'lista-precios-form') return { view: 'politicas', options: {} };
  return null;
}

function _showListasUnsavedToast(mainContent, message = 'Finaliza o guarda la lista antes de salir.') {
  const prev = mainContent.querySelector('#nis-listas-unsaved-toast');
  if (prev) prev.remove();
  const toast = document.createElement('div');
  toast.id = 'nis-listas-unsaved-toast';
  toast.className = 'nis-unsaved-toast';
  toast.textContent = message;
  mainContent.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2200);
}

function _ensureListasNisOverlay(mainContent, viewName) {
  _listasNisSwipeCleanup?.();
  _listasNisSwipeCleanup = null;

  if (!_isListasNisView(viewName)) {
    delete mainContent.dataset.nisListasPrecios;
    return;
  }

  mainContent.dataset.nisListasPrecios = '1';
  const existing = mainContent.querySelector('#nis-listas-overlay');
  if (existing) existing.remove();

  let x0 = 0;
  let y0 = 0;
  const threshold = 50;
  const verticalTolerance = 44;
  const onStart = (ev) => {
    const touch = ev.touches?.[0];
    if (!touch) return;
    x0 = touch.clientX;
    y0 = touch.clientY;
  };
  const onEnd = (ev) => {
    const touch = ev.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - x0;
    const dy = touch.clientY - y0;
    if (Math.abs(dy) > verticalTolerance) return;
    if (Math.abs(dx) <= threshold) return;
    if (dx > 0 && viewName === 'lista-precios-form') {
      const hasUnsaved = currentComponent?.constructor?.name === 'ListaPreciosForm'
        && currentComponent?._dirty === true;
      if (hasUnsaved) {
        _showListasUnsavedToast(mainContent);
        return;
      }
    }

    const target = dx < 0
      ? _resolveListasNisSwipeTarget(viewName, 'left')
      : _resolveListasNisSwipeTarget(viewName, 'right');
    if (!target) return;
    navigate(target.view, target.options);
  };

  mainContent.addEventListener('touchstart', onStart, { passive: true });
  mainContent.addEventListener('touchend', onEnd, { passive: true });
  _listasNisSwipeCleanup = () => {
    mainContent.removeEventListener('touchstart', onStart);
    mainContent.removeEventListener('touchend', onEnd);
  };
}

function _showEscanerUnsavedToast(mainContent, message = 'Finaliza o cancela el escaneo antes de salir.') {
  const prev = mainContent.querySelector('#nis-escaner-unsaved-toast');
  if (prev) prev.remove();
  const toast = document.createElement('div');
  toast.id = 'nis-escaner-unsaved-toast';
  toast.className = 'nis-unsaved-toast';
  toast.textContent = message;
  mainContent.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 2200);
}

function _resolveEscanerSwipeBackTarget() {
  // Check for any pending scan context and clean it up on abort
  if (sessionStorage.getItem('garantias_pending_scan')) {
    sessionStorage.removeItem('garantias_pending_scan');
    return { view: 'garantias', options: {} };
  }
  if (sessionStorage.getItem('audit_pending_scan')) {
    sessionStorage.removeItem('audit_pending_scan');
    return { view: 'auditoria', options: {} };
  }
  if (sessionStorage.getItem('inventario_pending_scan')) {
    sessionStorage.removeItem('inventario_pending_scan');
    return { view: 'inventario-general', options: {} };
  }
  if (sessionStorage.getItem('kardex_pending_scan')) {
    sessionStorage.removeItem('kardex_pending_scan');
    return { view: 'kardex-form', options: {} };
  }
  if (sessionStorage.getItem('pedido_scan_item')) {
    sessionStorage.removeItem('pedido_scan_item');
    return { view: 'pedido-form', options: {} };
  }
  const pickingPedidoId = sessionStorage.getItem('picking_pending_scan');
  if (pickingPedidoId) {
    sessionStorage.removeItem('picking_pending_scan');
    return { view: 'picking-form', options: { pedidoId: pickingPedidoId } };
  }
  return { view: 'home', options: {} };
}

function _ensureEscanerNisOverlay(mainContent, viewName) {
  _escanerNisSwipeCleanup?.();
  _escanerNisSwipeCleanup = null;

  if (!_isEscanerNisView(viewName)) {
    delete mainContent.dataset.nisEscaner;
    return;
  }

  mainContent.dataset.nisEscaner = '1';

  let x0 = 0;
  let y0 = 0;
  const threshold = 50;
  const verticalTolerance = 44;

  const onStart = (ev) => {
    const touch = ev.touches?.[0];
    if (!touch) return;
    x0 = touch.clientX;
    y0 = touch.clientY;
  };

  const onEnd = (ev) => {
    const touch = ev.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - x0;
    const dy = touch.clientY - y0;
    if (Math.abs(dy) > verticalTolerance) return;
    if (Math.abs(dx) <= threshold) return;

    if (dx > 0) {
      if (currentComponent?._scanning === true) {
        _showEscanerUnsavedToast(mainContent);
        return;
      }
      const target = _resolveEscanerSwipeBackTarget();
      navigate(target.view, target.options);
      return;
    }
    // swipe left: no-op — no sub-views in ESCANEAR
  };

  mainContent.addEventListener('touchstart', onStart, { passive: true });
  mainContent.addEventListener('touchend', onEnd, { passive: true });
  _escanerNisSwipeCleanup = () => {
    mainContent.removeEventListener('touchstart', onStart);
    mainContent.removeEventListener('touchend', onEnd);
  };
}

function _ensureAuditoriaNisOverlay(mainContent, viewName) {
  _auditoriaNisSwipeCleanup?.();
  _auditoriaNisSwipeCleanup = null;

  if (!_isAuditoriaNisView(viewName)) {
    delete mainContent.dataset.nisAuditoria;
    return;
  }

  mainContent.dataset.nisAuditoria = '1';
  // NIS UX: hide manual back controls and use gesture/contextual navigation.
  const hideBackButtons = () => {
    mainContent.querySelectorAll('.btn-back').forEach((btn) => {
      btn.style.display = 'none';
    });
  };
  hideBackButtons();

  let x0 = 0;
  let y0 = 0;
  const threshold = 56;
  const verticalTolerance = 44;

  const onStart = (ev) => {
    const touch = ev.touches?.[0];
    if (!touch) return;
    x0 = touch.clientX;
    y0 = touch.clientY;
  };

  const onEnd = (ev) => {
    const touch = ev.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - x0;
    const dy = touch.clientY - y0;
    if (Math.abs(dy) > verticalTolerance) return;
    if (Math.abs(dx) <= threshold) return;

    // Right swipe => contextual back only.
    if (dx > 0) {
      // Root auditoría screen should return to home/menu.
      if (
        viewName === 'auditoria' &&
        mainContent.querySelector('#btn-back-sel') &&
        !mainContent.querySelector('#btn-back-items') &&
        !mainContent.querySelector('#btn-back-count') &&
        !mainContent.querySelector('#btn-back-recon')
      ) {
        navigate('home');
        return;
      }

      const backSelectors = [
        '#btn-back-recon',
        '#btn-back-count',
        '#btn-back-items',
        '#btn-back-bodegas',
        '#btn-back-scope',
        '#btn-back-sel',
      ];
      for (const sel of backSelectors) {
        const btn = mainContent.querySelector(sel);
        if (btn) {
          btn.click();
          return;
        }
      }
      if (viewName === 'historial-inventario') {
        navigate('auditoria');
        return;
      }
      navigate('home');
      return;
    }

    // Left swipe => internal non-transactional navigation only.
    const reconBtn = mainContent.querySelector('#btn-go-recon');
    if (reconBtn && !reconBtn.disabled) {
      reconBtn.click();
    }
  };

  mainContent.addEventListener('touchstart', onStart, { passive: true });
  mainContent.addEventListener('touchend', onEnd, { passive: true });

  const observer = new MutationObserver(() => {
    if (!mainContent.isConnected) return;
    hideBackButtons();
  });
  observer.observe(mainContent, { childList: true, subtree: true });

  _auditoriaNisSwipeCleanup = () => {
    mainContent.removeEventListener('touchstart', onStart);
    mainContent.removeEventListener('touchend', onEnd);
    observer.disconnect();
  };
}

function _showProductosUnsavedToast(mainContent, message = 'Finaliza, guarda o cancela el producto antes de salir.') {
  const prev = mainContent.querySelector('#nis-productos-unsaved-toast');
  if (prev) prev.remove();
  const toast = document.createElement('div');
  toast.id = 'nis-productos-unsaved-toast';
  toast.className = 'nis-unsaved-toast';
  toast.textContent = message;
  mainContent.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 2200);
}

function _ensureProductosNisOverlay(mainContent, viewName, options = {}) {
  _productosNisSwipeCleanup?.();
  _productosNisSwipeCleanup = null;

  if (!_isProductosNisView(viewName)) {
    delete mainContent.dataset.nisProductos;
    return;
  }

  mainContent.dataset.nisProductos = '1';

  let x0 = 0;
  let y0 = 0;
  let capturedSlideIndex = 0;
  const threshold = 50;
  const verticalTolerance = 44;

  const onStart = (ev) => {
    const touch = ev.touches?.[0];
    if (!touch) return;
    x0 = touch.clientX;
    y0 = touch.clientY;
    capturedSlideIndex = currentComponent?._currentIndex ?? 0;
  };

  const onEnd = (ev) => {
    const touch = ev.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - x0;
    const dy = touch.clientY - y0;
    if (Math.abs(dy) > verticalTolerance) return;
    if (Math.abs(dx) <= threshold) return;

    if (dx > 0) {
      if (viewName === 'lista') { navigate('home'); return; }
      if (viewName === 'detail') return; // ProductDetail.bindSwipeRightToBack handles this
      if (viewName === 'nuevo') {
        if (capturedSlideIndex !== 0) return; // FlowContainer handles internal slide navigation
        const nombre = mainContent.querySelector('#nombre')?.value?.trim();
        const refProv = mainContent.querySelector('#ref-proveedor')?.value?.trim();
        if (nombre || refProv) { _showProductosUnsavedToast(mainContent); return; }
        navigate('lista');
        return;
      }
      if (viewName === 'producto-precio-setup') { navigate('lista'); return; }
    }
    // swipe left: no-op at module level — inner handlers (bindSwipeLeftOnCatalog) manage detail opening
  };

  mainContent.addEventListener('touchstart', onStart, { passive: true });
  mainContent.addEventListener('touchend', onEnd, { passive: true });
  _productosNisSwipeCleanup = () => {
    mainContent.removeEventListener('touchstart', onStart);
    mainContent.removeEventListener('touchend', onEnd);
  };
}

function _scheduleListasNisOverlayReinject(mainContent, viewName) {
  _listasNisObserverCleanup?.();
  _listasNisObserverCleanup = null;
  _ensureListasNisOverlay(mainContent, viewName);
  if (!_isListasNisView(viewName)) return;
  setTimeout(() => _ensureListasNisOverlay(mainContent, viewName), 0);
  setTimeout(() => _ensureListasNisOverlay(mainContent, viewName), 120);
  const observer = new MutationObserver(() => {
    if (!mainContent.isConnected) return;
    if (mainContent.dataset.nisListasPrecios !== '1') {
      _ensureListasNisOverlay(mainContent, viewName);
    }
  });
  observer.observe(mainContent, { childList: true, subtree: false });
  const stop = () => observer.disconnect();
  _listasNisObserverCleanup = stop;
  setTimeout(() => {
    stop();
    if (_listasNisObserverCleanup === stop) _listasNisObserverCleanup = null;
  }, 2000);
}

function _resolveBackTarget(viewName, options = {}) {
  if (viewName === 'picking-form' || viewName === 'packing-form') {
    return options?.pedidoId ? { view: 'pedido-detail', options: { pedidoId: options.pedidoId } } : { view: 'pedidos', options: {} };
  }
  if (viewName === 'pedido-detail') {
    return { view: 'pedidos', options: {} };
  }
  const fixed = VIEW_BACK_TARGET[viewName];
  if (fixed) return { view: fixed, options: {} };
  const moduleName = VIEW_MODULE[viewName] ?? viewName;
  const root = MODULE_ROOT_VIEW[moduleName];
  if (root && root !== viewName) return { view: root, options: {} };
  return null;
}

function _normalizeNavigationUi(mainContent, viewName) {
  const backButtons = mainContent.querySelectorAll('.btn-back');
  backButtons.forEach((btn) => {
    btn.dataset.navRole = 'back';
    btn.setAttribute('aria-label', 'Volver');
    btn.textContent = '← Volver';
  });

  mainContent.querySelectorAll('.vsub-back').forEach((btn) => {
    btn.dataset.navRole = 'menu';
    btn.setAttribute('aria-label', 'Menú');
    const icon = btn.querySelector('.vsub-back-icon');
    if (icon) icon.textContent = '←';
    const text = btn.querySelector('.vsub-back-text');
    if (text) text.textContent = 'Menú';
  });

  mainContent.querySelectorAll('#btn-cancel, .btn-abandon').forEach((btn) => {
    btn.dataset.navRole = 'safe-exit';
    if (btn.classList.contains('btn-abandon')) return;
    if (btn.textContent?.trim().toLowerCase().includes('cancel')) {
      btn.textContent = 'Salir seguro';
    }
  });

  _standardizeCriticalActionButtons(mainContent);
  _ensureEnterpriseNavControls(mainContent, viewName);
  mainContent.dataset.nisScreen = viewName;
}

function _standardizeCriticalActionButtons(mainContent) {
  const rules = [
    { pattern: /(guardar|save|crear producto|registrar)/i, label: 'Guardar' },
    { pattern: /(editar|edit)/i, label: 'Editar' },
    { pattern: /(cancelar|cancel|omitir)/i, label: 'Cancelar' },
    { pattern: /(eliminar|delete)/i, label: 'Eliminar' },
    { pattern: /(confirmar|finalizar|procesando|iniciar picking|emitir y descargar|continuar pedido)/i, label: 'Confirmar' },
    { pattern: /(crear|nuevo|\+ nueva|\+ nuevo)/i, label: 'Crear' },
    { pattern: /(buscar|consultar|actualizar|scan|escanear)/i, label: 'Buscar' },
    { pattern: /(entrar|ingresar|ir a|ver lista|ver inventario)/i, label: 'Entrar' },
  ];

  mainContent.querySelectorAll('button').forEach((btn) => {
    const txt = String(btn.textContent ?? '').trim();
    if (!txt) return;
    for (const rule of rules) {
      if (!rule.pattern.test(txt)) continue;
      btn.dataset.actionLabel = rule.label.toLowerCase();
      btn.setAttribute('aria-label', rule.label);
      btn.classList.add('nis-action-normalized');
      if (rule.label === 'Cancelar') btn.classList.add('nis-action-cancel');
      if (rule.label === 'Eliminar') btn.classList.add('nis-action-delete');
      if (rule.label === 'Confirmar') btn.classList.add('nis-action-confirm');
      if (rule.label === 'Entrar') btn.classList.add('nis-action-enter');
      break;
    }
  });

  mainContent.querySelectorAll('.nav-btn, [data-view]').forEach((entryBtn) => {
    if (!entryBtn.getAttribute('aria-label')) {
      const label = String(entryBtn.textContent ?? '').trim() || 'Entrar';
      entryBtn.setAttribute('aria-label', `Entrar a ${label}`);
    }
    entryBtn.dataset.actionLabel = entryBtn.dataset.actionLabel || 'entrar';
    entryBtn.classList.add('nis-action-enter');
  });
}

function _ensureEnterpriseNavControls(mainContent, viewName) {
  // UX-G1: barra global artificial desactivada para experiencia native-app.
  const existing = mainContent.querySelector('#nis-enterprise-nav');
  if (existing) existing.remove();
  return;

  // Legacy reference (kept intentionally unreachable for reversible rollout).
  // eslint-disable-next-line no-unreachable
  const back = _resolveBackTarget(viewName) ?? { view: 'home', options: {} };
  // eslint-disable-next-line no-unreachable
  const existingLegacy = mainContent.querySelector('#nis-enterprise-nav');
  // eslint-disable-next-line no-unreachable
  if (existingLegacy) existingLegacy.remove();

  // eslint-disable-next-line no-unreachable
  const bar = document.createElement('div');
  bar.id = 'nis-enterprise-nav';
  bar.className = 'nis-enterprise-nav';
  bar.innerHTML = `
    <button type="button" class="btn-secondary nis-nav-btn" data-nav="back">Retroceder</button>
    <button type="button" class="btn-secondary nis-nav-btn" data-nav="home">Inicio</button>
    <button type="button" class="btn-secondary nis-nav-btn" data-nav="menu">Menú</button>
    <button type="button" class="btn-secondary nis-nav-btn" data-nav="safe-exit">Salir seguro</button>`;

  bar.querySelector('[data-nav="back"]')?.addEventListener('click', () => navigate(back.view, back.options));
  bar.querySelector('[data-nav="home"]')?.addEventListener('click', () => navigate('home'));
  bar.querySelector('[data-nav="menu"]')?.addEventListener('click', () => navigate('home'));
  bar.querySelector('[data-nav="safe-exit"]')?.addEventListener('click', async () => {
    if (currentComponent?.canUnmount) {
      const canExit = await currentComponent.canUnmount();
      if (!canExit) return;
    }
    navigate('home');
  });

  mainContent.prepend(bar);
}

function _attachModuleSwipeNavigation(mainContent, viewName, options = {}) {
  _navSwipeCleanup?.();
  _navSwipeCleanup = null;

  if (_isPedidosNisView(viewName) || _isListasNisView(viewName) || _isProductosNisView(viewName) || _isEscanerNisView(viewName) || _isAuditoriaNisView(viewName)) return;
  // Allow native swipe-back on Ventas Resumen even though the view marks a module container.
  if (mainContent.querySelector('[data-nis-module]') && viewName !== 'ventas-resumen') return;
  // Preserve native horizontal swipe inside Facturacion fullscreen document overlay.
  if (viewName === 'facturacion' && mainContent.querySelector('#doc-detail-overlay')) return;

  let x0 = 0;
  let y0 = 0;
  const threshold = 72;
  const verticalTolerance = 44;

  const onStart = (ev) => {
    const touch = ev.touches?.[0];
    if (!touch) return;
    x0 = touch.clientX;
    y0 = touch.clientY;
  };

  const onEnd = (ev) => {
    const touch = ev.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - x0;
    const dy = touch.clientY - y0;
    if (Math.abs(dy) > verticalTolerance) return;
    if (Math.abs(dx) < threshold) return;

    if (dx > 0) {
      const back = _resolveBackTarget(viewName, options);
      if (back) navigate(back.view, back.options);
      return;
    }

    if (dx < 0 && viewName !== 'home') {
      navigate('home');
    }
  };

  mainContent.addEventListener('touchstart', onStart, { passive: true });
  mainContent.addEventListener('touchend', onEnd, { passive: true });

  _navSwipeCleanup = () => {
    mainContent.removeEventListener('touchstart', onStart);
    mainContent.removeEventListener('touchend', onEnd);
  };
}

async function navigate(viewName, options = {}) {
  if (currentComponent?.canUnmount) {
    const canUnmountResult = await currentComponent.canUnmount();
    if (!canUnmountResult) return;
  }

  const navBtns     = document.querySelectorAll('.nav-btn');
  const mainContent = document.getElementById('main-content');
  const activeModule = VIEW_MODULE[viewName] ?? viewName;
  _currentViewName = viewName;

  navBtns.forEach((btn) =>
    btn.classList.toggle('active', btn.dataset.module === activeModule)
  );

  if (currentComponent?.unmount) currentComponent.unmount();
  mainContent.innerHTML = '';
  _productosNisSwipeCleanup?.();
  _productosNisSwipeCleanup = null;
  _escanerNisSwipeCleanup?.();
  _escanerNisSwipeCleanup = null;
  _auditoriaNisSwipeCleanup?.();
  _auditoriaNisSwipeCleanup = null;

  let component;

  if (viewName === 'home') {
    component = new HomeMenu(mainContent);
  } else if (viewName === 'ventas') {
    renderVentasSubMenu();
    currentComponent = null;
    _schedulePedidosNisOverlayReinject(mainContent, _currentViewName, options);
    _scheduleListasNisOverlayReinject(mainContent, _currentViewName);
    _ensureAuditoriaNisOverlay(mainContent, _currentViewName);
    _normalizeNavigationUi(mainContent, _currentViewName);
    _attachModuleSwipeNavigation(mainContent, _currentViewName, options);
    setTimeout(() => _normalizeNavigationUi(mainContent, _currentViewName), 0);
    return;
  } else if (viewName === 'proveedores') {
    renderProveedoresSubMenu();
    currentComponent = null;
    _schedulePedidosNisOverlayReinject(mainContent, _currentViewName, options);
    _scheduleListasNisOverlayReinject(mainContent, _currentViewName);
    _ensureAuditoriaNisOverlay(mainContent, _currentViewName);
    _normalizeNavigationUi(mainContent, _currentViewName);
    _attachModuleSwipeNavigation(mainContent, _currentViewName, options);
    setTimeout(() => _normalizeNavigationUi(mainContent, _currentViewName), 0);
    return;
  } else if (viewName === 'lista') {
    component = new ProductList(mainContent);
  } else if (viewName === 'nuevo') {
    // NIS Flow Â§10.5 — Productos (4-step intent: Datos â†’ SKU â†’ Validación â†’ Confirmación).
    // Slide 1: ProductForm (handles steps 1â€“3 internally; SKU is generated in real time).
    // Slide 2: Confirmation card shown automatically after ProductCreated is emitted.
    let _savedProduct = null;
    const resumeState = FlowContainer.resumeState('productos');

    const slides = [
      {
        step: 'form',
        label: 'Datos del Producto',
        mount: (container, api) => {
          const form = new ProductForm(container);
          if (options.prefillRef) form.prefill(options.prefillRef);
          if (options.prefillSku) form.prefillSku(options.prefillSku);
          if (options.editProduct) form.setEditProduct(options.editProduct);
          form.mount();

          // When the product is created, go to the pricing dashboard automatically.
          const unsub = eventBus.on(Events.PRODUCT_CREATED, ({ payload }) => {
            unsub();
            _savedProduct = payload;
            navigate('producto-precio-setup', { product: payload });
          });
          // Wrap canUnmount so FlowContainer can query the inner form.
          form._nisUnsub = unsub;
          return {
            unmount: () => { form.unmount?.(); try { unsub(); } catch { /* noop */ } },
            canUnmount: () => form.canUnmount?.() ?? true,
          };
        },
      },
      {
        step: 'confirmacion',
        label: 'Confirmación',
        mount: (container, api) => {
          const p = _savedProduct;
          container.innerHTML = `
            <div class="nis-confirmation-card">
              <div class="nis-confirmation-icon">✅</div>
              <h3 style="margin:0;color:#111827">Producto Guardado</h3>
              <div class="nis-confirmation-sku">${p?.sku ?? '—'}</div>
              <p class="nis-confirmation-name">${p?.nombre ?? ''}</p>
              <div class="nis-confirmation-actions">
                <button class="btn-primary" id="nis-btn-nuevo">+ Registrar otro</button>
                <button class="btn-secondary" id="nis-btn-lista">Ver lista de productos</button>
              </div>
            </div>`;
          container.querySelector('#nis-btn-nuevo')?.addEventListener('click', () => {
            api.save();
            navigate('nuevo');
          });
          container.querySelector('#nis-btn-lista')?.addEventListener('click', () => {
            api.save();
            navigate('lista');
          });
          return null; // stateless — no unmount needed
        },
      },
    ];

    const flow = new FlowContainer(mainContent, {
      module: 'productos',
      slides,
      eventBus,
      Events,
    });
    flow.mount(resumeState?.slideIndex ?? 0);
    component = flow;
  } else if (viewName === 'detail') {
    component = new ProductDetail(mainContent, options.product);
  } else if (viewName === 'escaner') {
    component = new ScannerController(mainContent);
  } else if (viewName === 'clientes') {
    component = new ClienteList(mainContent);
  } else if (viewName === 'cliente-form') {
    component = new ClienteForm(mainContent);
    if (options.editCliente) component.setEditCliente(options.editCliente);
  } else if (viewName === 'cliente-detail') {
    component = new ClienteDetail(mainContent, options.cliente);
  } else if (viewName === 'kardex') {
    component = new KardexList(mainContent);
  } else if (viewName === 'kardex-conciliacion') {
    component = new KardexConciliacion(mainContent);
  } else if (viewName === 'kardex-form') {
    component = new KardexForm(mainContent);
    if (options.prefillProduct) component.setPrefillProduct(options.prefillProduct);
  } else if (viewName === 'bodegas') {
    component = new BodegaManager(mainContent);
  } else if (viewName === 'bodega-detail') {
    component = new BodegaDetail(mainContent, options.bodega);
  } else if (viewName === 'pedidos') {
    component = new PedidoList(mainContent);
    if (options.prefillQuery) component.setPrefillQuery(options.prefillQuery);
  } else if (viewName === 'pedido-form') {
    component = new PedidoForm(mainContent, options.pedidoId ?? null, options.mode ?? 'create');
    if (options.prefillProduct) component.setPrefillProduct(options.prefillProduct);
    if (options.prefillClienteId) component.setPrefillClienteId(options.prefillClienteId);
  } else if (viewName === 'pedido-detail') {
    component = new PedidoDetail(mainContent, options.pedidoId);
  } else if (viewName === 'picking-form') {
    component = new PickingForm(mainContent, options.pedidoId);
  } else if (viewName === 'packing-form') {
    component = new PackingForm(mainContent, options.pedidoId);
  } else if (viewName === 'facturacion') {
    component = new FacturaList(mainContent);
  } else if (viewName === 'configuracion') {
    renderConfiguracionComprobantes(mainContent);
    currentComponent = null; // Función pura, no maneja unmount class
  } else if (viewName === 'producto-precio-setup') {
    component = new ProductoPrecioSetup(mainContent);
    if (options.product) component.setProduct(options.product);
  } else if (viewName === 'trazabilidad') {
    component = new TrazabilidadList(mainContent);
  } else if (viewName === 'auditoria-rbac') {
    component = new RbacAuditExport(mainContent);
  } else if (viewName === 'politicas') {
    component = new ListaPreciosList(mainContent);
  } else if (viewName === 'lista-precios-form') {
    component = new ListaPreciosForm(mainContent);
    if (options.listaId) {
      const lista = await getLista(options.listaId);
      if (lista) component.setEditLista(lista);
    }
  } else if (viewName === 'dinamicas') {
    component = new DinamicaList(mainContent);
  } else if (viewName === 'dinamica-form') {
    component = new DinamicaForm(mainContent);
    if (options.dinamicaId) {
      const din = await getDinamica(options.dinamicaId);
      if (din) component.setEditDinamica(din);
    }
  } else if (viewName === 'proveedores-lista') {
    component = new ProveedorList(mainContent);
  } else if (viewName === 'proveedor-form') {
    component = new ProveedorForm(mainContent);
    if (options.proveedor) component.setEditProveedor(options.proveedor);
  } else if (viewName === 'garantias') {
    component = new GarantiaList(mainContent);
  } else if (viewName === 'compras') {
    component = new CompraList(mainContent);
  } else if (viewName === 'compra-form') {
    component = new CompraForm(mainContent);
    if (options.compra) component.setCompra(options.compra);
  } else if (viewName === 'ventas-resumen') {
    component = new VentasResumen(mainContent);
  } else if (viewName === 'cartera' || viewName === 'egresos' || viewName === 'tesoreria') {
    const LABELS = { cartera: 'Cartera', egresos: 'Egresos', tesoreria: 'Tesorería' };
    mainContent.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;text-align:center;gap:16px">
        <div style="font-size:48px">🚧</div>
        <h2 style="margin:0;font-size:1.3rem;font-weight:700">${LABELS[viewName]}</h2>
        <p style="margin:0;color:#6b7280;font-size:0.95rem">Módulo en desarrollo.<br>Disponible en próxima versión.</p>
      </div>`;
    currentComponent = null;
  } else if (viewName === 'auditoria') {
    const auditOptions = _pendingAuditProduct
      ? { singleProduct: _pendingAuditProduct }
      : options.resumeSession
        ? { resumeSession: options.resumeSession }
        : {};
    _pendingAuditProduct = null;
    component = new AuditoriaController(mainContent);
    currentComponent = component;
    component.mount(auditOptions);
    _schedulePedidosNisOverlayReinject(mainContent, _currentViewName, options);
    _scheduleListasNisOverlayReinject(mainContent, _currentViewName);
    _ensureAuditoriaNisOverlay(mainContent, _currentViewName);
    _normalizeNavigationUi(mainContent, _currentViewName);
    _attachModuleSwipeNavigation(mainContent, _currentViewName, options);
    setTimeout(() => _normalizeNavigationUi(mainContent, _currentViewName), 0);
    return;
  } else if (viewName === 'inventario-general') {
    const invOptions = options.resumeSession ? { resumeSession: options.resumeSession } : {};
    component = new InventarioController(mainContent);
    currentComponent = component;
    component.mount(invOptions);
    _schedulePedidosNisOverlayReinject(mainContent, _currentViewName, options);
    _scheduleListasNisOverlayReinject(mainContent, _currentViewName);
    _ensureAuditoriaNisOverlay(mainContent, _currentViewName);
    _normalizeNavigationUi(mainContent, _currentViewName);
    _attachModuleSwipeNavigation(mainContent, _currentViewName, options);
    setTimeout(() => _normalizeNavigationUi(mainContent, _currentViewName), 0);
    return;
  } else if (viewName === 'historial-inventario') {
    component = new HistorialInventarioController(mainContent);
    currentComponent = component;
    component.mount();
    _schedulePedidosNisOverlayReinject(mainContent, _currentViewName, options);
    _scheduleListasNisOverlayReinject(mainContent, _currentViewName);
    _ensureAuditoriaNisOverlay(mainContent, _currentViewName);
    _normalizeNavigationUi(mainContent, _currentViewName);
    _attachModuleSwipeNavigation(mainContent, _currentViewName, options);
    setTimeout(() => _normalizeNavigationUi(mainContent, _currentViewName), 0);
    return;
  }

  currentComponent = component;
  component?.mount();
  _schedulePedidosNisOverlayReinject(mainContent, _currentViewName, options);
  _scheduleListasNisOverlayReinject(mainContent, _currentViewName);
  _ensureProductosNisOverlay(mainContent, _currentViewName, options);
  _ensureEscanerNisOverlay(mainContent, _currentViewName);
  _ensureAuditoriaNisOverlay(mainContent, _currentViewName);
  _normalizeNavigationUi(mainContent, _currentViewName);
  _attachModuleSwipeNavigation(mainContent, _currentViewName, options);
  setTimeout(() => _normalizeNavigationUi(mainContent, _currentViewName), 0);
}

function _showRecoveryDialog(session, typeLabel, mainContent) {
  return new Promise((resolve) => {
    const startedAt = new Date(session.started_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
    const status = session.recovery_status ?? session.status;
    const statusMap = {
      partial_close: {
        title: 'Cierre parcial detectado',
        body: 'El cierre quedó incompleto. Debes reintentar para completar costos/snapshot/historial.',
      },
      failed: {
        title: 'Cierre fallido detectado',
        body: 'La sesión quedó en estado de fallo. Revisa y reintenta el cierre de forma segura.',
      },
      closing: {
        title: 'Cierre en proceso pendiente',
        body: 'Se detectó una sesión en cierre. Reanúdala para completar el pipeline transaccional.',
      },
      active: {
        title: 'Sesión en progreso',
        body: 'Tienes una sesión activa pendiente de continuar.',
      },
      in_progress: {
        title: 'Sesión en progreso',
        body: 'Tienes una sesión activa pendiente de continuar.',
      },
    };
    const cfg = statusMap[status] ?? statusMap.active;
    const resumeLabel = ['partial_close', 'failed', 'closing'].includes(status)
      ? '🔁 Reanudar y reintentar cierre'
      : '▶️ Retomar donde lo dejé';
    mainContent.innerHTML = `
      <div class="scan-unreg-overlay">
        <div class="scan-unreg-card">
          <div class="scan-unreg-icon">📋</div>
          <h3>${cfg.title}</h3>
          <div class="scan-unreg-code">${typeLabel}</div>
          <p>Sesión de <strong>${typeLabel}</strong> abierta desde <strong>${startedAt}</strong>.<br>${cfg.body}<br>¿Qué deseas hacer?</p>
          <div class="scan-unreg-actions">
            <button class="btn-primary" id="btn-rec-resume">${resumeLabel}</button>
            <button class="btn-secondary" id="btn-rec-ignore">⏭️ Ignorar por ahora</button>
            <button class="btn-abandon" id="btn-rec-abandon">🗑️ Abandonar sesión</button>
          </div>
        </div>
      </div>`;
    mainContent.querySelector('#btn-rec-resume').addEventListener('click', () => resolve('resume'));
    mainContent.querySelector('#btn-rec-ignore').addEventListener('click', () => resolve('ignore'));
    mainContent.querySelector('#btn-rec-abandon').addEventListener('click', () => {
      if (confirm('¿Seguro que deseas abandonar esta sesión?\n\nEsta acción es irreversible.')) resolve('abandon');
    });
  });
}

function _showUpdateBanner() {
  if (document.getElementById('mgp-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'mgp-update-banner';
  banner.className = 'mgp-update-banner';
  banner.innerHTML = `
    <span class="mgp-banner-icon">🔄</span>
    <span class="mgp-banner-text">Nueva version disponible</span>
    <button class="mgp-banner-btn" id="mgp-btn-update">Actualizar App</button>
    <button class="mgp-banner-close" id="mgp-btn-update-close" aria-label="Cerrar">X</button>`;
  document.body.appendChild(banner);
  document.getElementById('mgp-btn-update').addEventListener('click', async () => {
    try {
      const backupOk = await createUpdateSafetyBackup();
      if (!backupOk) {
        alert('No se pudo crear backup automatico. Actualizacion bloqueada por seguridad.');
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => window.location.reload(), 400);
    } catch {
      alert('No se pudo verificar backup de seguridad. Actualizacion cancelada.');
    }
  });
  document.getElementById('mgp-btn-update-close').addEventListener('click', () => banner.remove());
}

function _showDbErrorBanner(detail) {
  if (document.getElementById('mgp-db-error-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'mgp-db-error-banner';
  banner.className = 'mgp-db-error-banner';
  banner.innerHTML = `
    <div class="mgp-db-error-header">⚠️ <strong>Error al actualizar base de datos</strong></div>
    <p class="mgp-db-error-msg">
      Version almacenada: ${detail?.storedVersion ?? '?'}.
      <strong>Tus datos estan intactos.</strong>
    </p>
    <p class="mgp-db-error-detail">${detail?.error ?? ''}</p>
    <p class="mgp-db-error-detail"><strong>Modo seguro activo:</strong> eliminacion de base local deshabilitada.</p>
    <div class="mgp-db-error-actions">
      <button class="mgp-db-btn-export" id="mgp-btn-export">⬇️ Exportar mis datos</button>
    </div>`;
  document.getElementById('app')?.insertBefore(banner, document.getElementById('main-content'));

  document.getElementById('mgp-btn-export').addEventListener('click', async () => {
    const btn = document.getElementById('mgp-btn-export');
    btn.disabled = true;
    btn.textContent = '⏳ Exportando...';
    try {
      await exportAllData();
      btn.textContent = '✅ Descarga iniciada';
    } catch {
      btn.textContent = '❌ Error';
      btn.disabled = false;
    }
  });

}

export async function initApp() {
  // Register cross-domain services before any store operations (P8 compliance).
  registerStockGuardImpl((productId) => getSaldoByProduct(productId, BODEGA_PEDIDOS_ID));
  initProductKardexListener();

  // P8 RUNTIME GUARD — detecta llamadas directas a store sin handler
  console.log('[P8_RUNTIME_GUARD] Inicializado — detectando acceso sin handler');
  window.__MAXGRIFOS_RUNTIME_GUARD_API__ = {
    getViolations: (n) => runtimeGuard.getViolations(n),
    getStats: () => runtimeGuard.getStats(),
    clear: () => runtimeGuard.clear(),
  };

  await initDB();

  // â”€â”€ OVERLAY v13 — F1R2-BLOCKER-002 FIX: initPersistentEventBus DESPUÃ‰S de initDB().
  // Garantiza que la DB esté lista antes de que el hook intente persistir eventos.
  // Eventos emitidos durante initDB() no tienen hook â†’ no se persisten (aceptable).
  initPersistentEventBus();
  initAuditHelpers();
  initKardexDomainListeners();
  initCompraKardexListener();
  initGarantiaStore();
  await reconcileOutbox();
  startOutboxReconcilerLoop();
  await seedBodegas();
  await seedClienteMostrador();
  await seedConfigComprobantes();

  // Procesar outbox pendiente de sesiones previas (offline â†’ startup con conexión).
  if (navigator.onLine) {
    processSyncQueue().catch(console.error);
    processSyncQueueClientes().catch(console.error);
    processSyncQueueKardex().catch(console.error);
    processSyncQueuePedidos().catch(console.error);
    processSyncQueueDocumentos().catch(console.error);
    processSyncQueueListasPrecios().catch(console.error);
    processSyncQueueDinamicas().catch(console.error);
  }

  // Jornada banner container
  let jornadaContainer = document.getElementById('jornada-banner-container');
  if (!jornadaContainer) {
    jornadaContainer = document.createElement('div');
    jornadaContainer.id = 'jornada-banner-container';
    document.getElementById('app')?.insertBefore(jornadaContainer, document.getElementById('main-content'));
  }
  _jornadaBanner = new JornadaBanner(jornadaContainer);
  _jornadaBanner.mount();

  const indicator = new OfflineIndicator(document.getElementById('offline-indicator'));
  indicator.mount();

  let pwaCta = document.getElementById('pwa-cta');
  if (!pwaCta) {
    pwaCta = document.createElement('div');
    pwaCta.id = 'pwa-cta';
    pwaCta.style.cssText = 'display:flex;gap:6px;align-items:center;margin-left:8px;flex-wrap:wrap';
    document.getElementById('offline-indicator')?.appendChild(pwaCta);
  }

  const renderPwaCta = (state = {}) => {
    const installVisible = Boolean(state.installAvailable);
    const updateVisible = Boolean(state.updateAvailable);
    if (!installVisible && !updateVisible) {
      pwaCta.innerHTML = '';
      return;
    }

    pwaCta.innerHTML = `
      ${installVisible ? '<button id="pwa-install-btn" style="background:#065f46;color:#fff;border:none;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer">Instalar App</button>' : ''}
      ${updateVisible ? '<button id="pwa-update-btn" style="background:#1a56db;color:#fff;border:none;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer">Actualizar App</button>' : ''}`;

    pwaCta.querySelector('#pwa-install-btn')?.addEventListener('click', () => {
      window.__MAXGRIFOS_PWA__?.promptInstall?.();
    });
    pwaCta.querySelector('#pwa-update-btn')?.addEventListener('click', async () => {
      const backupOk = await createUpdateSafetyBackup();
      if (!backupOk) {
        alert('No se pudo crear backup automatico. Actualizacion bloqueada por seguridad.');
        return;
      }
      window.__MAXGRIFOS_PWA__?.activateUpdate?.();
      setTimeout(() => window.location.reload(), 400);
    });
  };

  renderPwaCta(window.__MAXGRIFOS_PWA__?.getState?.() ?? {});
  window.__MAXGRIFOS_PWA__?.subscribe?.(renderPwaCta);

  if (!_observabilityRuntime) {
    _observabilityRuntime = new EventObservabilityRuntime({ maxRecentEvents: 300, publishThrottleMs: 250 });
    _observabilityRuntime.start();
    rbacAuditLog.connectTo(_observabilityRuntime);

    // UI: mostrar banner de alerta RBAC en tiempo real
    window.addEventListener('rbac-alert', (e) => {
      const a = e.detail;
      const label = a.type === 'CRITICAL_DENY'
        ? `⛔ Acceso crítico denegado — acción: ${a.action}`
        : `⚠️ Violaciones repetidas (${a.count}) — usuario: ${a.user ?? '?'}`;
      const banner = document.createElement('div');
      banner.setAttribute('role', 'alert');
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:9999;background:#b91c1c;color:#fff;' +
        'padding:10px 16px;font-size:13px;font-weight:600;text-align:center;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.35);';
      banner.textContent = label;
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 5000);
    });
  }

  if (!_consistencyReconciler) {
    _consistencyReconciler = new GlobalConsistencyReconciler({ debounceMs: 1200, maxIssues: 30 });
    _consistencyReconciler.start();
  }

  document.addEventListener('click', _warmAudio, { once: true });
  window.__erp_navigate = navigate;

  // Inject politicas nav button programmatically (index.html is frozen)
  const navEl = document.querySelector('nav') ?? document.querySelector('.nav');
  if (navEl && !navEl.querySelector('[data-view="politicas"]')) {
    const politicasBtn = document.createElement('button');
    politicasBtn.className = 'nav-btn';
    politicasBtn.dataset.view = 'politicas';
    politicasBtn.dataset.module = 'politicas';
    politicasBtn.innerHTML = '<span style="font-size:18px">💲</span><span>Precios</span>';
    navEl.appendChild(politicasBtn);
  }
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  iniciarPoliticasSaga();

  // â”€â”€ Scan routing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  eventBus.on(Events.BARCODE_SCANNED, async ({ payload }) => {
    const code = payload.code;

    // Garantías esperando scan de producto (Code 128)
    if (sessionStorage.getItem('garantias_pending_scan') === '1') {
      sessionStorage.removeItem('garantias_pending_scan');
      sessionStorage.setItem('garantias_scanned_code', code);
      playBeep();
      navigate('garantias');
      return;
    }

    // Auditoría esperando scan
    if (sessionStorage.getItem('audit_pending_scan') === '1') {
      sessionStorage.removeItem('audit_pending_scan');
      sessionStorage.setItem('audit_scanned_code', code);
      navigate('auditoria');
      return;
    }

    // Inventario General esperando scan de producto (Code 128)
    if (sessionStorage.getItem('inventario_pending_scan') === '1') {
      sessionStorage.removeItem('inventario_pending_scan');
      sessionStorage.setItem('inventario_scanned_code', code);
      playBeep();
      navigate('inventario-general');
      return;
    }

    // Inventario/Auditoría en vivo manejan el scan desde su propio controller.
    if (_currentViewName === 'inventario-general' || _currentViewName === 'auditoria') {
      return;
    }

    // Kardex esperando scan de producto (Code 128)
    if (sessionStorage.getItem('kardex_pending_scan') === '1') {
      sessionStorage.removeItem('kardex_pending_scan');
      const all   = await getProducts();
      const found = all.find((p) => p.sku === code || p.ref_proveedor === code);
      if (found) { playBeep(); navigate('kardex-form', { prefillProduct: found }); }
      else navigate('kardex-form');
      return;
    }

    // Pedido form esperando scan de ítem (Code 128)
    if (sessionStorage.getItem('pedido_scan_item') === '1') {
      sessionStorage.removeItem('pedido_scan_item');
      const all   = await getProducts();
      const found = all.find((p) => p.sku === code || p.ref_proveedor === code);
      if (found) { playBeep(); navigate('pedido-form', { prefillProduct: found }); }
      else navigate('pedido-form');
      return;
    }

    // Picking esperando scan de ítem (Code 128)
    const pickingPedidoId = sessionStorage.getItem('picking_pending_scan');
    if (pickingPedidoId) {
      sessionStorage.removeItem('picking_pending_scan');
      playBeep();
      navigate('picking-form', { pedidoId: pickingPedidoId });
      return;
    }

    // MGP QR â†’ pedido-detail
    if (code.startsWith('MGP:')) {
      const parts    = code.split(':');
      const pedidoId = parts[1];
      if (pedidoId) { playBeep(); navigate('pedido-detail', { pedidoId }); }
      else navigate('pedidos');
      return;
    }

    // MGC QR â†’ cliente-detail
    if (code.startsWith('MGC:')) {
      const parts    = code.split(':');
      const clienteId = parts[1];
      if (clienteId) {
        const cliente = await getClienteById(clienteId);
        if (cliente) { playBeep(); navigate('cliente-detail', { cliente }); return; }
      }
      navigate('clientes');
      return;
    }

    // Code 128 â†’ producto
    const all         = await getProducts();
    const mainContent = document.getElementById('main-content');
    if (isSkuV5Format(code)) {
      const existing = all.find((p) => p.sku === code);
      if (existing) { playBeep(); navigate('detail', { product: existing }); }
      else {
        const confirmed = await showUnregisteredDialog(code, mainContent);
        if (confirmed) navigate('nuevo', { prefillSku: code }); else navigate('lista');
      }
    } else {
      const byRef = all.find((p) => p.ref_proveedor === code);
      if (byRef) { playBeep(); navigate('detail', { product: byRef }); }
      else {
        const confirmed = await showUnregisteredDialog(code, mainContent);
        if (confirmed) navigate('nuevo', { prefillRef: code }); else navigate('lista');
      }
    }
  });

  eventBus.on(Events.EDIT_PRODUCT,  ({ payload }) => navigate('nuevo', { editProduct: payload }));
  eventBus.on(Events.EDIT_CLIENTE,  ({ payload }) => navigate('cliente-form', { editCliente: payload }));

  // Descarga de inventario al emitir documento (fase_3_kardex Â§2)
  // OVERLAY v13: cuando kardex_domain_listeners_enabled=true, este bloque queda
  // bloqueado y la responsabilidad pasa a kardex-domain-listeners.js.
  // La idempotencia por unique index en IDB garantiza que si ambos corren
  // (degradación de flag), el segundo intento es rechazado silenciosamente.
  if (!(window.__MAXGRIFOS_FLAGS__?.kardex_domain_listeners_enabled)) {
    const snapshotToItems = (documento) => {
      const snapshot = Array.isArray(documento?.items_snapshot) ? documento.items_snapshot : [];
      return snapshot
        .map((item) => ({
          id: item.item_id ?? null,
          product_id: item.product_id,
          product_sku: item.product_sku,
          product_name: item.product_name,
          cantidad_picking: Number(item.cantidad ?? 0),
          precio_unitario: Number(item.precio_unitario ?? 0),
          status: 'active',
        }))
        .filter((item) => item.product_id && Number(item.cantidad_picking ?? 0) > 0);
    };

    eventBus.on(Events.FACTURA_EMITIDA, ({ payload }) => {
      const { pedido, documento } = payload;
      const items = snapshotToItems(documento);
      if (items.length === 0) {
        console.warn('[App] Snapshot documental vacio en FacturaEmitida', {
          pedido_id: pedido?.id ?? null,
          documento_id: documento?.id ?? null,
        });
        return;
      }
      liberarStockPorDocumento({ pedido_id: pedido.id, items, documento_tipo: documento?.tipo ?? 'FAC' })
        .catch((err) => console.warn('[App] Error en descarga kardex por FacturaEmitida', err));
    });

    eventBus.on(Events.REMISION_EMITIDA, ({ payload }) => {
      const { pedido, documento } = payload;
      const items = snapshotToItems(documento);
      if (items.length === 0) {
        console.warn('[App] Snapshot documental vacio en RemisionEmitida', {
          pedido_id: pedido?.id ?? null,
          documento_id: documento?.id ?? null,
        });
        return;
      }
      liberarStockPorDocumento({ pedido_id: pedido.id, items, documento_tipo: documento?.tipo ?? 'REM' })
        .catch((err) => console.warn('[App] Error en descarga kardex por RemisionEmitida', err));
    });
  }
  eventBus.on(Events.AUDIT_SINGLE_PRODUCT, ({ payload }) => {
    _pendingAuditProduct = payload;
    document.querySelector('[data-view="auditoria"]')?.click();
  });

  window.addEventListener('online', () => {
    processSyncQueue().catch(console.error);
    processSyncQueueClientes().catch(console.error);
    processSyncQueueKardex().catch(console.error);
    processSyncQueuePedidos().catch(console.error);
    processSyncQueueDocumentos().catch(console.error);
    processSyncQueueListasPrecios().catch(console.error);
    processSyncQueueDinamicas().catch(console.error);
  });

  await handleBootstrapInventarioSessionV2();

  // Session recovery V2: only validated sessions (legacy-safe for auditoría clásica)
  const pending = await handleGetRecoverySessionsSanitized();
  if (pending.length > 0) {
    let session  = pending[0];
    const typeLabel = session.type === 'inventario' ? 'Inventario General' : 'Auditoría';
    const mainContent = document.getElementById('main-content');
    const choice   = await _showRecoveryDialog(session, typeLabel, mainContent);
    if (choice === 'resume') {
      if (session.status === 'ignored' || session.recovery_status === 'ignored') {
        session = await handleResumeIgnoredSession(session);
      }
      const targetView = session.type === 'inventario' ? 'inventario-general' : 'auditoria';
      navigate(targetView, { resumeSession: session });
      return;
    }
    if (choice === 'ignore' && (session.es_inventario_general || session.type === 'inventario')) {
      await handleSetSessionIgnored(session, 'ignored_by_user_from_recovery');
    }
    if (choice === 'abandon') {
      await handleAbandonarSesion(session);
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      if (reg.waiting && navigator.serviceWorker.controller) _showUpdateBanner();
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) _showUpdateBanner();
        });
      });
    }).catch(() => {});
  }
  window.addEventListener('db-upgrade-failed', (e) => _showDbErrorBanner(e.detail));
  window.addEventListener('db-post-upgrade-verification-failed', (e) => _showDbErrorBanner(e.detail));

  navigate('home');
}

