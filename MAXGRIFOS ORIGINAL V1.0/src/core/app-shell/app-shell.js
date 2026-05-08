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
import { createPreviewBanner } from './preview-banner.js';
import { MG_ROUTES } from '../router/route-registry.js';
import { ProductList } from '../../modules/maestro-productos/product-list.js';
import { ProductForm } from '../../modules/maestro-productos/product-form.js';
import { ProductDetail } from '../../modules/maestro-productos/product-detail.js';
import { ClienteList } from '../../modules/clientes/cliente-list.js';
import { ClienteForm } from '../../modules/clientes/cliente-form.js';
import { ClienteDetail } from '../../modules/clientes/cliente-detail.js';
import { renderPoliticasComercialesModule } from '../../modules/politicas-comerciales/index.js';
import * as productQuery from '../../modules/maestro-productos/product-query.js';
import { feedbackCenter } from '../feedback/feedback-center.js';
import '../feedback/feedback-center.css';

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
      appRoot.replaceChildren();
      appRoot.appendChild(this.root);
    } else {
      // Safely append without wiping body (prevents breaking AI Studio preview if no #app exists)
      const existing = document.getElementById('mg-app-root');
      if (existing) existing.remove();
      document.body.appendChild(this.root);
    }

    this.renderShell(this.root);
    
    // Mount feedback center
    feedbackCenter.mount(this.root);
    window.__mg_feedback = feedbackCenter;
    
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

    window.addEventListener('nis:doubletap', (e) => {
      const target = e.detail?.target || e.target;
      if (target?.closest?.('.product-card')) {
        return;
      }
      this.showNisToast('Doble toque reservado para edición en entidades compatibles.');
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
    
    const headerLeft = document.createElement('div');
    headerLeft.className = 'mg-header-left';

    const logo = document.createElement('div');
    logo.className = 'mg-logo';
    logo.textContent = 'MAXGRIFOS';
    headerLeft.appendChild(logo);

    const headerRight = document.createElement('div');
    headerRight.className = 'mg-header-right';

    const statusDot = document.createElement('div');
    statusDot.className = 'mg-status-dot mg-status-online';
    statusDot.title = 'Sincronizado';

    const userStatus = document.createElement('div');
    userStatus.id = 'mg-user-status';
    userStatus.className = 'mg-badge-demo';
    userStatus.textContent = 'LECTURA';

    headerRight.appendChild(statusDot);
    headerRight.appendChild(userStatus);

    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    const main = document.createElement('main');
    main.className = 'mg-main-content';
    main.id = 'mg-main-body';
    this.mainContent = main;

    const nav = document.createElement('nav');
    nav.className = 'mg-nav-premium';
    nav.id = 'mg-appshell-premium-nav';

    // SVG Helpers
    const createSvg = ({ viewBox = '0 0 24 24', fill = 'none', stroke = 'currentColor', strokeWidth = '2' }) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', viewBox);
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.setAttribute('fill', fill);
      svg.setAttribute('stroke', stroke);
      if (strokeWidth) svg.setAttribute('stroke-width', strokeWidth);
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      return svg;
    };

    const appendPath = (svg, d) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
      return path;
    };

    const appendLine = (svg, attrs) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      Object.entries(attrs).forEach(([key, value]) => line.setAttribute(key, value));
      svg.appendChild(line);
      return line;
    };

    const appendPolyline = (svg, points) => {
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', points);
      svg.appendChild(polyline);
      return polyline;
    };

    const appendRect = (svg, attrs) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      Object.entries(attrs).forEach(([key, value]) => rect.setAttribute(key, value));
      svg.appendChild(rect);
      return rect;
    };

    const appendCircle = (svg, attrs) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      Object.entries(attrs).forEach(([key, value]) => circle.setAttribute(key, value));
      svg.appendChild(circle);
      return circle;
    };

    const createNavIcon = (iconType) => {
      let svg;
      switch (iconType) {
        case 'home':
          svg = createSvg({ fill: 'currentColor', stroke: 'none' });
          appendPath(svg, 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z');
          break;
        case 'factura':
          svg = createSvg({ strokeWidth: '2' });
          appendPath(svg, 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
          appendPolyline(svg, '14 2 14 8 20 8');
          appendLine(svg, { x1: '16', y1: '13', x2: '8', y2: '13' });
          appendLine(svg, { x1: '16', y1: '17', x2: '8', y2: '17' });
          appendPolyline(svg, '10 9 9 9 8 9');
          break;
        case 'productos':
          svg = createSvg({ strokeWidth: '2' });
          appendPath(svg, 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z');
          appendPolyline(svg, '3.27 6.96 12 12.01 20.73 6.96');
          appendLine(svg, { x1: '12', y1: '22.08', x2: '12', y2: '12' });
          break;
        case 'politicas':
          svg = createSvg({ strokeWidth: '2' });
          appendPath(svg, 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z');
          appendLine(svg, { x1: '7', y1: '7', x2: '7.01', y2: '7' });
          break;
        case 'scanner':
          svg = createSvg({ strokeWidth: '2' });
          appendPath(svg, 'M3 7V5a2 2 0 0 1 2-2h2');
          appendPath(svg, 'M17 3h2a2 2 0 0 1 2 2v2');
          appendPath(svg, 'M21 17v2a2 2 0 0 1-2 2h-2');
          appendPath(svg, 'M7 21H5a2 2 0 0 1-2-2v-2');
          appendRect(svg, { x: '7', y: '7', width: '10', height: '10', rx: '1' });
          break;
        case 'mas':
          svg = createSvg({ strokeWidth: '2' });
          appendCircle(svg, { cx: '12', cy: '12', r: '1' });
          appendCircle(svg, { cx: '19', cy: '12', r: '1' });
          appendCircle(svg, { cx: '5', cy: '12', r: '1' });
          break;
        default:
          svg = createSvg({});
      }
      return svg;
    };

    const createNavButton = ({ path, label, iconType, active = false }) => {
      const button = document.createElement('button');
      button.className = active ? 'mg-nav-btn active' : 'mg-nav-btn';
      button.dataset.path = path;
      button.type = 'button';

      const icon = document.createElement('span');
      icon.className = 'mg-nav-icon';
      icon.appendChild(createNavIcon(iconType));

      const text = document.createElement('span');
      text.className = 'mg-nav-text';
      text.textContent = label;

      button.appendChild(icon);
      button.appendChild(text);

      if (active) {
        const dot = document.createElement('span');
        dot.className = 'mg-nav-dot';
        button.appendChild(dot);
      }

      button.addEventListener('click', () => this.navigateTo(button.dataset.path));
      return button;
    };

    const navWrap = document.createElement('div');
    navWrap.className = 'mg-nav-bwrap';
    
    navWrap.appendChild(createNavButton({ path: '/', label: 'Inicio', iconType: 'home', active: true }));
    navWrap.appendChild(createNavButton({ path: '/facturacion', label: 'Factura', iconType: 'factura' }));
    navWrap.appendChild(createNavButton({ path: '/productos', label: 'Productos', iconType: 'productos' }));
    navWrap.appendChild(createNavButton({ path: '/politicas-comerciales', label: 'Políticas', iconType: 'politicas' }));
    navWrap.appendChild(createNavButton({ path: '/scanner', label: 'Escanear', iconType: 'scanner' }));
    navWrap.appendChild(createNavButton({ path: '/configuracion', label: 'Más', iconType: 'mas' }));

    nav.appendChild(navWrap);

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
          this.showNisToast('Vista no habilitada en la versión validada actual.');
        } else {
          console.warn('Vista no habilitada en la versión validada actual.');
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

    this.mainContent.replaceChildren();
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
        this.showNisToast('Vista no habilitada en la versión validada actual.');
      }
    };
  }

  async mountProductosLegacy(viewName = 'lista', options = {}) {
    if (!this.mainContent) return false;
    
    this.installProductosNavigateShim();

    if (!this.unmountCurrentLegacyComponent()) {
      return false;
    }

    this.mainContent.replaceChildren();
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

  renderUnavailableModuleNotice(module) {
    const wrapper = document.createElement('section');
    wrapper.className = 'mg-module-unavailable mg-premium-flow';

    const title = document.createElement('h2');
    title.textContent = module?.label || 'Módulo no disponible';

    const message = document.createElement('p');
    message.textContent = 'Este módulo no está habilitado en la versión validada actual.';

    wrapper.appendChild(title);
    wrapper.appendChild(message);
    return wrapper;
  }

  async navigateTo(path) {
    console.debug('[V2 AppShell] Navigating to:', path);
    
    window.location.hash = path;
    if (!this.mainContent) return;

    const isHomeRoute = path === '/' || path === '';
    const appShellPremiumNav = this.root?.querySelector('#mg-appshell-premium-nav');
    if (appShellPremiumNav) {
      appShellPremiumNav.style.display = isHomeRoute ? 'none' : '';
    }

    // Highlight Premium Nav
    document.querySelectorAll('.mg-nav-btn').forEach(item => {
      item.classList.toggle('active', item.dataset.path === path);
    });

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
          this.mainContent.replaceChildren();
          this.mainContent.appendChild(this.renderUnavailableModuleNotice(module));
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
          this.mainContent.replaceChildren();
          this.mainContent.appendChild(this.renderUnavailableModuleNotice(module));
          eventBus.publish({ type: CORE_EVENTS.NAVIGATION_CHANGED, payload: { path } });
        }
      }
      return;
    }

    if (path === '/politicas-comerciales' || path === '/politicas' || path === '/precios') {
      this.mainContent.replaceChildren();
      try {
        await renderPoliticasComercialesModule(this.mainContent, {
          eventBus: domainEventBus,
          productQuery: productQuery
        });
      } catch (err) {
        console.error('[V2 AppShell][Politicas] Error rendering module:', err);
        window.__mg_feedback?.error('Error al cargar el módulo de Políticas Comerciales.');
      }
      eventBus.publish({ type: CORE_EVENTS.NAVIGATION_CHANGED, payload: { path } });
      return;
    }

    if (this.currentLegacyComponent) {
      if (!this.unmountCurrentLegacyComponent()) {
        return;
      }
    }

    this.mainContent.replaceChildren();

    if (path === '/' || path === '') {
      this.mainContent.appendChild(homeMenu.render());
    } else {
      const module = MG_ROUTES.find(r => r.path === path);
      if (module) {
        this.mainContent.appendChild(this.renderUnavailableModuleNotice(module));
      }
    }

    eventBus.publish({ type: CORE_EVENTS.NAVIGATION_CHANGED, payload: { path } });
  }

  showNisToast(message) {
    window.__mg_feedback?.warn(message);
  }
}

export const appShell = new AppShell();
export default appShell;