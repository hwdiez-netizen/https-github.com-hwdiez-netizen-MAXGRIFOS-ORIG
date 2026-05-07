/**
 * App Shell - Contenedor maestro V2 Visual Premium
 */
import './app-shell.css';
import './home-menu.css';
import { router } from '../router/router.js';
import { nisController } from '../nis/nis-controller.js';
import { eventBus } from '../event-bus/event-bus.js';
import { CORE_EVENTS } from '../event-bus/event-types.js';
import { eventBus as domainEventBus, Events } from '../../events/domain-events.js';
import { homeMenu } from './home-menu.js';
import { createModulePlaceholder } from './module-placeholder.js';
import { createPreviewBanner } from './preview-banner.js';
import { MG_ROUTES } from '../router/route-registry.js';
import { ProductList } from '../../modules/maestro-productos/product-list.js';
import { ProductForm } from '../../modules/maestro-productos/product-form.js';
import { ProductDetail } from '../../modules/maestro-productos/product-detail.js';
import { ClienteList } from '../../modules/clientes/cliente-list.js';
import { ClienteForm } from '../../modules/clientes/cliente-form.js';
import { ClienteDetail } from '../../modules/clientes/cliente-detail.js';

export class AppShell {
  constructor() {
    this.root = null;
    this.mainContent = null;
    this.toastTimer = null;
    this.currentLegacyComponent = null;
    this.previousLegacyNavigate = null;

    this._editClienteSubscribed = false;
    this._editClienteUnsubscribe = null;

    this._editProductSubscribed = false;
    this._editProductUnsubscribe = null;
  }

  async init() {
    console.info('[V2 AppShell] Initializing Premium UX...');
    
    // Create Root
    const appRoot = document.getElementById('app') || document.body;
    this.root = document.createElement('div');
    this.root.id = 'mg-app-root';
    this.root.className = 'mg-app-shell mg-smartphone-shell'; // Added smartphone-shell class
    
    if (appRoot.id === 'app') {
      appRoot.innerHTML = '';
      appRoot.appendChild(this.root);
    } else {
      // Safely append without wiping body (prevents breaking AI Studio preview if no #app exists)
      const existing = document.getElementById('mg-app-root');
      if (existing) existing.remove();
      document.body.appendChild(this.root);
    }

    this.renderShell(this.root);
    
    // 1. Inicializar NIS (Gestos)
    nisController.init();
    
    window.addEventListener('nis:blocked', (e) => {
      this.showNisToast(e.detail?.message || 'Finaliza, guarda o cancela el proceso antes de salir.');
    });

    window.addEventListener('nis:gesture', (e) => {
      const { gesture, direction } = e.detail || {};
      if (gesture === 'swipe' && direction === 'right') {
        const currentPath = window.location.hash.replace('#', '') || '/';
        if (currentPath !== '/') {
          this.navigateTo('/');
        }
      }
    });

    window.addEventListener('nis:doubletap', () => {
      this.showNisToast('Vista rápida disponible próximamente.');
    });

    // 3. Navigation Events
    window.addEventListener('mg:navigate', (e) => {
      this.navigateTo(e.detail.path);
    });

    if (!this._editClienteSubscribed) {
      this._editClienteUnsubscribe = domainEventBus.on(Events.EDIT_CLIENTE, async (cliente) => {
        await this.mountClientesLegacy('form', { cliente });
      });
      this._editClienteSubscribed = true;
    }

    if (!this._editProductSubscribed) {
      this._editProductUnsubscribe = domainEventBus.on(Events.EDIT_PRODUCT, async (product) => {
        await this.mountProductosLegacy('nuevo', { editProduct: product });
      });
      this._editProductSubscribed = true;
    }

    // 4. Initial load
    const initialPath = window.location.hash.replace('#', '') || '/';
    this.navigateTo(initialPath);

    eventBus.publish({ type: CORE_EVENTS.APP_READY });
  }

  renderShell(root) {
    const header = document.createElement('header');
    header.className = 'mg-header';
    header.innerHTML = `
      <div class="mg-header-left">
        <div class="mg-logo">MAXGRIFOS</div>
      </div>
      <div class="mg-header-right">
        <div class="mg-status-dot mg-status-online" title="Sincronizado"></div>
        <div id="mg-user-status" class="mg-badge-demo">LECTURA</div>
      </div>
    `;

    const main = document.createElement('main');
    main.className = 'mg-main-content';
    main.id = 'mg-main-body';
    this.mainContent = main;

    const nav = document.createElement('nav');
    nav.className = 'mg-nav-bottom';
    nav.innerHTML = `
      <div class="mg-nav-item active" data-path="/"><i>🏠</i><span>Inicio</span></div>
      <div class="mg-nav-item" data-path="/productos"><i>📦</i><span>Productos</span></div>
      <div class="mg-nav-item" data-path="/scanner"><i>🔍</i><span>Escanear</span></div>
      <div class="mg-nav-item" data-path="/ventas"><i>🛒</i><span>Ventas</span></div>
    `;

    nav.querySelectorAll('.mg-nav-item').forEach(item => {
      item.addEventListener('click', () => this.navigateTo(item.dataset.path));
    });

    root.appendChild(createPreviewBanner());
    root.appendChild(header);
    root.appendChild(main);
    root.appendChild(nav);
  }

  unmountCurrentLegacyComponent() {
    try {
      if (this.currentLegacyComponent) {
        if (typeof this.currentLegacyComponent.canUnmount === 'function' && !this.currentLegacyComponent.canUnmount()) {
          return false;
        }
        if (typeof this.currentLegacyComponent.unmount === 'function') {
          this.currentLegacyComponent.unmount();
        }
        this.currentLegacyComponent = null;
      }
      return true;
    } catch (err) {
      console.error('[V2 AppShell][Legacy] Error unmounting component:', err);
      return false;
    }
  }

  installClientesNavigateShim() {
    if (!this.previousLegacyNavigate) {
      this.previousLegacyNavigate = window.__erp_navigate || null;
    }

    window.__erp_navigate = async (viewName, options = {}) => {
      const productosViews = ['lista', 'nuevo', 'detail'];
      const clientesViews = ['clientes', 'cliente-list', 'cliente-form', 'cliente-detail'];

      if (productosViews.includes(viewName)) {
        await this.mountProductosLegacy(viewName, options);
      } else if (clientesViews.includes(viewName)) {
        if (viewName === 'clientes' || viewName === 'cliente-list') {
          await this.mountClientesLegacy('lista', options);
        } else if (viewName === 'cliente-form') {
          await this.mountClientesLegacy('form', options);
        } else if (viewName === 'cliente-detail') {
          await this.mountClientesLegacy('detail', options);
        }
      } else {
        console.warn('[V2 AppShell][Clientes] Navegación bloqueada fuera de scope:', viewName);
        if (typeof this.showNisToast === 'function') {
          this.showNisToast('Vista no conectada en esta microfase.');
        } else {
          console.warn('Vista no conectada en esta microfase.');
        }
      }
    };
  }

  async mountClientesLegacy(viewName = 'lista', options = {}) {
    if (!this.mainContent) return false;

    this.installClientesNavigateShim();

    if (!this.unmountCurrentLegacyComponent()) {
      return false;
    }

    this.mainContent.innerHTML = '';
    let component;

    try {
      if (viewName === 'lista') {
        component = new ClienteList(this.mainContent);
      } else if (viewName === 'form') {
        component = new ClienteForm(this.mainContent);
        if (options.cliente && typeof component.setEditCliente === 'function') {
          component.setEditCliente(options.cliente);
        } else if (options.editCliente && typeof component.setEditCliente === 'function') {
          component.setEditCliente(options.editCliente);
        }
      } else if (viewName === 'detail') {
        if (!options.cliente) {
          if (typeof this.showNisToast === 'function') {
            this.showNisToast('Cliente no disponible para detalle.');
          }
          return false;
        }
        component = new ClienteDetail(this.mainContent, options.cliente);
      } else {
        if (typeof this.showNisToast === 'function') {
          this.showNisToast('Vista de Clientes no conectada.');
        }
        return false;
      }

      this.currentLegacyComponent = component;
      if (typeof component.mount === 'function') {
        await component.mount();
      }
      return true;
    } catch (err) {
      console.error('[V2 AppShell][Clientes] Error mounting legacy view:', err);
      this.currentLegacyComponent = null;
      throw err;
    }
  }

  installProductosNavigateShim() {
    if (!this.previousLegacyNavigate) {
      this.previousLegacyNavigate = window.__erp_navigate || null;
    }
    
    window.__erp_navigate = async (viewName, options = {}) => {
      const productosViews = ['lista', 'nuevo', 'detail'];
      const clientesViews = ['clientes', 'cliente-list', 'cliente-form', 'cliente-detail'];

      if (productosViews.includes(viewName)) {
        await this.mountProductosLegacy(viewName, options);
      } else if (clientesViews.includes(viewName)) {
        if (viewName === 'clientes' || viewName === 'cliente-list') {
          await this.mountClientesLegacy('lista', options);
        } else if (viewName === 'cliente-form') {
          await this.mountClientesLegacy('form', options);
        } else if (viewName === 'cliente-detail') {
          await this.mountClientesLegacy('detail', options);
        }
      } else {
        console.warn('[V2 AppShell][Productos] Navegación bloqueada fuera de scope:', viewName);
        this.showNisToast('Vista no conectada en esta microfase.');
      }
    };
  }

  async mountProductosLegacy(viewName = 'lista', options = {}) {
    if (!this.mainContent) return false;
    
    this.installProductosNavigateShim();

    if (!this.unmountCurrentLegacyComponent()) {
      return false;
    }

    this.mainContent.innerHTML = '';
    let component;

    try {
      if (viewName === 'lista') {
        component = new ProductList(this.mainContent);
      } else if (viewName === 'nuevo') {
        component = new ProductForm(this.mainContent);
        if (options.prefillRef && typeof component.prefill === 'function') {
          component.prefill(options.prefillRef);
        }
        if (options.prefillSku && typeof component.prefillSku === 'function') {
          component.prefillSku(options.prefillSku);
        }
        if (options.editProduct && typeof component.setEditProduct === 'function') {
          component.setEditProduct(options.editProduct);
        }
      } else if (viewName === 'detail') {
        if (!options.product) {
          this.showNisToast('Producto no disponible para detalle.');
          return false;
        }
        component = new ProductDetail(this.mainContent, options.product);
      } else {
        this.showNisToast('Vista de Productos no conectada.');
        return false;
      }

      this.currentLegacyComponent = component;
      if (typeof component.mount === 'function') {
        await component.mount();
      }
      return true;
    } catch (err) {
      console.error('[V2 AppShell][Productos] Error mounting legacy view:', err);
      this.currentLegacyComponent = null;
      throw err;
    }
  }

  async navigateTo(path) {
    console.debug('[V2 AppShell] Navigating to:', path);
    
    window.location.hash = path;
    if (!this.mainContent) return;

    // Highlight Nav
    document.querySelectorAll('.mg-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.path === path);
    });

    if (path === '/productos') {
      try {
        const mounted = await this.mountProductosLegacy('lista');
        if (!mounted) return;
      } catch (err) {
        console.error('[V2 AppShell][Productos] Bridge failed, using fallback:', err);
        const module = MG_ROUTES.find(r => r.path === '/productos');
        if (module) {
          this.mainContent.innerHTML = '';
          this.mainContent.appendChild(createModulePlaceholder(module));
        }
      }
      eventBus.publish({ type: CORE_EVENTS.NAVIGATION_CHANGED, payload: { path } });
      return;
    }

    if (path === '/clientes') {
      try {
        const mounted = await this.mountClientesLegacy('lista');
        if (!mounted) return;
        eventBus.publish({ type: CORE_EVENTS.NAVIGATION_CHANGED, payload: { path } });
      } catch (err) {
        console.error('[V2 AppShell][Clientes] Bridge failed, using fallback:', err);
        const module = MG_ROUTES.find(r => r.path === '/clientes');
        if (module) {
          this.mainContent.innerHTML = '';
          this.mainContent.appendChild(createModulePlaceholder(module));
          eventBus.publish({ type: CORE_EVENTS.NAVIGATION_CHANGED, payload: { path } });
        }
      }
      return;
    }

    if (this.currentLegacyComponent) {
      if (!this.unmountCurrentLegacyComponent()) {
        return;
      }
    }

    this.mainContent.innerHTML = '';

    if (path === '/' || path === '') {
      this.mainContent.appendChild(homeMenu.render());
    } else {
      const module = MG_ROUTES.find(r => r.path === path);
      if (module) {
        this.mainContent.appendChild(createModulePlaceholder(module));
      }
    }

    eventBus.publish({ type: CORE_EVENTS.NAVIGATION_CHANGED, payload: { path } });
  }

  showNisToast(message) {
    if (!this.root) return;

    let toast = this.root.querySelector('.mg-nis-toast');

    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'mg-nis-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      this.root.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('is-visible');

    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2600);
  }
}

export const appShell = new AppShell();
export default appShell;