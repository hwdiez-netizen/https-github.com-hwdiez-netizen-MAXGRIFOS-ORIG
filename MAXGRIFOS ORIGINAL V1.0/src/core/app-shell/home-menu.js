import { MG_ROUTES } from '../router/route-registry.js';
import { eventBus } from '../event-bus/event-bus.js';

export const homeMenu = {
  render() {
    const container = document.createElement('div');
    container.className = 'mg-premium-home mg-fade-in';

    container.innerHTML = `
      <!-- Header Area (Outside Hero) -->
      <div class="mg-main-header">
        <div class="mg-logo-wrap">
          <svg viewBox="0 0 100 100" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 80 V20 L50 50 L80 20 V80" stroke="#3b82f6" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>
          </svg>
          <div class="mg-logo-text">
            <h1 class="mg-logo-title">MAXGRIFOS</h1>
            <p class="mg-logo-subtitle">ERP • CRM • WMS</p>
          </div>
        </div>
        <div class="mg-badge-conectado">
          <span class="mg-pulse-dot"></span>
          Conectado
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 2px; opacity: 0.7"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
        </div>
      </div>

      <!-- Hero Soft Premium -->
      <div class="mg-hero-premium">
        <div class="mg-hero-content">
          <p class="mg-greeting-small">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px; color:#3b82f6;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
            ¡Buen día!
          </p>
          <h2 class="mg-greeting-main">Bienvenido, <span style="color:#3b82f6">VDEV</span></h2>
          <p class="mg-greeting-desc">Todo tu negocio, en un solo lugar.</p>
        </div>
        <div class="mg-hero-illustration">
          <svg viewBox="0 0 120 100" width="100%" height="100%">
            <!-- 3D-like cubes abstraction -->
            <polygon points="60,20 80,30 80,50 60,60 40,50 40,30" fill="#bfdbfe" opacity="0.8"/>
            <polygon points="60,20 80,30 60,40 40,30" fill="#eff6ff"/>
            <polygon points="40,30 60,40 60,60 40,50" fill="#93c5fd"/>
            
            <polygon points="85,35 105,45 105,65 85,75 65,65 65,45" fill="#60a5fa" opacity="0.9"/>
            <polygon points="85,35 105,45 85,55 65,45" fill="#93c5fd"/>
            <polygon points="65,45 85,55 85,75 65,65" fill="#3b82f6"/>
            
            <path d="M20,70 L100,70 L110,85 L10,85 Z" fill="#ffffff" opacity="0.6"/>
            <path d="M30,55 L50,65 L70,45 L90,60" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <!-- KPIs Compactos -->
      <div class="mg-kpi-compact">
        <div class="mg-kpi-item">
          <div class="mg-kpi-icon" style="color: #3b82f6;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </div>
          <div class="mg-kpi-text">
            <span class="mg-kpi-val">33</span>
            <span class="mg-kpi-lbl">Productos</span>
          </div>
        </div>
        <div class="mg-kpi-item">
          <div class="mg-kpi-icon" style="color: #10b981;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <div class="mg-kpi-text">
            <span class="mg-kpi-val">6</span>
            <span class="mg-kpi-lbl">Clientes</span>
          </div>
        </div>
        <div class="mg-kpi-item">
          <div class="mg-kpi-icon" style="color: #f59e0b;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          </div>
          <div class="mg-kpi-text">
            <span class="mg-kpi-val">2</span>
            <span class="mg-kpi-lbl">Pedidos</span>
          </div>
        </div>
        <div class="mg-kpi-item mg-kpi-alert">
          <div class="mg-kpi-icon" style="color: #8b5cf6;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </div>
          <div class="mg-kpi-text">
            <span class="mg-kpi-val">3</span>
            <span class="mg-kpi-lbl">Stock crítico</span>
          </div>
        </div>
      </div>

      <!-- Módulos Principales -->
      <div class="mg-modules-section">
        <div class="mg-section-title">
          <h3>Módulos principales</h3>
          <button class="mg-btn-ver-todos">Ver todos <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:middle"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
        </div>
        
        <div class="mg-premium-grid">
          ${this.createCard('Cartera', 'Gestión de cartera y cuentas por cobrar', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>', '/cartera', '#60a5fa', '#3b82f6')}
          ${this.createCard('Egresos', 'Control de gastos y desembolsos', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>', '/egresos', '#fb7185', '#ef4444')}
          ${this.createCard('Tesorería', 'Flujo de caja y movimientos', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="18" height="8" rx="1"></rect><path d="M3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v4"></path><line x1="8" y1="12" x2="8" y2="20"></line><line x1="16" y1="12" x2="16" y2="20"></line><line x1="12" y1="12" x2="12" y2="20"></line></svg>', '/tesoreria', '#2dd4bf', '#0ea5e9')}
          ${this.createCard('Clientes', 'Administración de clientes y contactos', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>', '/clientes', '#4ade80', '#22c55e')}
          ${this.createCard('Ventas', 'Órdenes, facturación y procesos de venta', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>', '/ventas', '#a78bfa', '#8b5cf6')}
          ${this.createCard('Precios', 'Listas de precios y políticas comerciales', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>', '/precios', '#fbbf24', '#f59e0b')}
          ${this.createCard('Proveedores', 'Gestión de proveedores y abastecimiento', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>', '/proveedores', '#fcd34d', '#f59e0b')}
          ${this.createCard('Kardex', 'Movimientos y control de inventario', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>', '/kardex', '#2dd4bf', '#0f766e')}
          ${this.createCard('Pedidos', 'Órdenes de clientes en tránsito', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>', '/pedidos', '#818cf8', '#4f46e5')}
          ${this.createCard('Garantías', 'Cobertura y soporte técnico', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>', '/garantias', '#a3e635', '#65a30d')}
        </div>
      </div>
      
      <!-- Nav Bottom Reserve Space -->
      <div style="height: 90px; width: 100%;"></div>

      <!-- Nav Bottom Premium -->
      <div class="mg-nav-premium">
        <div class="mg-nav-bwrap">
            <button class="mg-nav-btn active" data-route="/">
              <span class="mg-nav-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="none"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
              </span>
              <span class="mg-nav-text">Inicio</span>
              <span class="mg-nav-dot"></span>
            </button>
            <button class="mg-nav-btn" data-route="/facturacion">
              <span class="mg-nav-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              </span>
              <span class="mg-nav-text">Factura</span>
            </button>

            <button class="mg-nav-btn" data-route="/productos">
              <span class="mg-nav-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              </span>
              <span class="mg-nav-text">Productos</span>
            </button>
            <button class="mg-nav-btn" data-route="/escaner">
              <span class="mg-nav-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path><rect x="7" y="7" width="10" height="10" rx="1"></rect></svg>
              </span>
              <span class="mg-nav-text">Escanear</span>
            </button>
            <button class="mg-nav-btn" data-route="/configuracion">
              <span class="mg-nav-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
              </span>
              <span class="mg-nav-text">Más</span>
            </button>
        </div>
      </div>
    `;

    // Attach minimal click handlers
    const cards = container.querySelectorAll('.mg-card-premium');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const route = card.getAttribute('data-route');
        if (route) {
          window.dispatchEvent(new CustomEvent('mg:navigate', { detail: { path: route } }));
        }
      });
    });

    const bNavItems = container.querySelectorAll('.mg-nav-btn');
    bNavItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const route = btn.getAttribute('data-route');
        if (route) {
          window.dispatchEvent(new CustomEvent('mg:navigate', { detail: { path: route } }));
        }
      });
    });

    return container;
  },

  createCard(title, desc, emoji, route, c1, c2) {
    return `
      <div class="mg-card-premium" data-route="${route}">
        <div class="mg-card-icon-wrap" style="background: linear-gradient(135deg, ${c1}, ${c2})">
          ${emoji}
        </div>
        <div class="mg-card-info">
          <h4 class="mg-card-title">${title}</h4>
          <p class="mg-card-desc">${desc}</p>
          <div class="mg-card-bottom">
            <span class="mg-badge-activo">ACTIVO</span>
          </div>
        </div>
        <div class="mg-card-arrow">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
      </div>
    `;
  }
};

