/**
 * Router visual base - Gestión de navegación V2
 */
import { MG_ROUTES } from './route-registry.js';
import { eventBus } from '../event-bus/event-bus.js';
import { CORE_EVENTS } from '../event-bus/event-types.js';

class Router {
  constructor() {
    this.currentPath = window.location.pathname;
  }

  init() {
    window.addEventListener('popstate', () => {
      this.handleRouteChange(window.location.pathname);
    });
    this.handleRouteChange(this.currentPath);
  }

  navigate(path) {
    if (this.currentPath === path) return;
    window.history.pushState({}, '', path);
    this.handleRouteChange(path);
  }

  handleRouteChange(path) {
    this.currentPath = path;
    
    // Buscar ruta en el registro oficial
    let route = MG_ROUTES.find(r => r.path === path);
    
    // PC-9: Registro dinámico de módulo para Políticas Comerciales
    if (!route && (path === '/politicas-comerciales' || path === '/politicas' || path === '/precios')) {
      route = { 
        path, 
        view: 'politicas', 
        label: 'Políticas Comerciales',
        status: 'ACTIVE'
      };
    }

    route = route || MG_ROUTES[0];
    
    eventBus.publish({
      type: CORE_EVENTS.NAVIGATION_CHANGED,
      payload: { path, route }
    });
    
    console.debug(`[Router] Navigated to: ${path}`);
  }
}

export const router = new Router();
export default router;
