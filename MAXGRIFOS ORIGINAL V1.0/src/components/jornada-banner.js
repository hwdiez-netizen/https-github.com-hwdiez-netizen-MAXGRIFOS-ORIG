import { getPedidosActivos } from '../modules/pedidos/pedido-store.js';

const SESSION_KEY = 'jornada_banner_dismissed';

export class JornadaBanner {
  constructor(container) {
    this.container = container;
    this._interval = null;
  }

  mount() {
    this._check();
    // Re-check every 30 minutes
    this._interval = setInterval(() => this._check(), 30 * 60 * 1000);
  }

  unmount() {
    clearInterval(this._interval);
    this._interval = null;
  }

  async _check() {
    const dismissedAt = sessionStorage.getItem(SESSION_KEY);
    if (dismissedAt) return;

    const activos = await getPedidosActivos();
    if (activos.length === 0) {
      this._hide();
      return;
    }

    const hora = new Date().getHours();
    // Mostrar siempre cuando hay procesos inconclusos (banner informativo en todo momento)
    this._show(activos);
  }

  _show(activos) {
    const count    = activos.length;
    const resumen  = activos.slice(0, 3).map((p) => `${p.consecutivo} (${p.estado})`).join(', ');
    const ellipsis = count > 3 ? ` +${count - 3} más` : '';

    this.container.innerHTML = `
      <div class="jornada-banner" id="jornada-banner-inner" role="alert">
        <div class="jornada-banner-content">
          <span class="jornada-banner-icon">⏳</span>
          <div>
            <strong>${count} proceso${count > 1 ? 's' : ''} inconcluso${count > 1 ? 's' : ''}:</strong>
            <span class="jornada-banner-detail">${resumen}${ellipsis}</span>
          </div>
        </div>
        <div class="jornada-banner-actions">
          <button class="jornada-btn-ver" id="jornada-btn-ver">Ver pedidos</button>
          <button class="jornada-btn-close" id="jornada-btn-close" aria-label="Cerrar">✕</button>
        </div>
      </div>`;

    this.container.querySelector('#jornada-btn-ver')?.addEventListener('click', () => {
      window.__erp_navigate?.('pedidos');
    });

    this.container.querySelector('#jornada-btn-close')?.addEventListener('click', () => {
      sessionStorage.setItem(SESSION_KEY, new Date().toISOString());
      this._hide();
    });
  }

  _hide() {
    this.container.innerHTML = '';
  }
}
