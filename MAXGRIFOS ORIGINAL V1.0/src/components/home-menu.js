import { eventBus } from '../events/domain-events.js';

const MODULES = [
  {
    view: 'cartera',
    name: 'CARTERA',
    color: '#1E88E5',
    icon: `<rect x="3" y="14" width="38" height="25" rx="3"/><path d="M3 20h38"/><path d="M3 14l7-9h24l7 9"/><rect x="28" y="25" width="10" height="8" rx="2"/>`,
  },
  {
    view: 'egresos',
    name: 'EGRESOS',
    color: '#E53935',
    icon: `<path d="M9 5h17l8 8v24a2 2 0 01-2 2H9a2 2 0 01-2-2V7a2 2 0 012-2z"/><path d="M26 5v8h8"/><line x1="22" y1="15" x2="22" y2="30"/><polyline points="15,23 22,30 29,23"/>`,
  },
  {
    view: 'tesoreria',
    name: 'TESORERÍA',
    color: '#00ACC1',
    icon: `<line x1="3" y1="41" x2="41" y2="41"/><rect x="7" y="21" width="30" height="20"/><polygon points="22,5 41,17 3,17"/><line x1="3" y1="17" x2="41" y2="17"/><line x1="13" y1="21" x2="13" y2="41"/><line x1="22" y1="21" x2="22" y2="41"/><line x1="31" y1="21" x2="31" y2="41"/>`,
  },
  {
    view: 'clientes',
    name: 'CLIENTES',
    color: '#43A047',
    icon: `<circle cx="16" cy="13" r="7"/><path d="M2 40c0-8 6.3-14 14-14s14 6 14 14"/><circle cx="33" cy="15" r="5.5"/><path d="M34 30c3.5.8 6 4 6.5 8"/>`,
  },
  {
    view: 'ventas',
    name: 'VENTAS',
    color: '#8E24AA',
    icon: `<path d="M3 5h5.5l5.5 22h20L40 13H14"/><circle cx="17" cy="37.5" r="3.5"/><circle cx="35" cy="37.5" r="3.5"/>`,
  },
  {
    view: 'politicas',
    name: 'PRECIOS',
    color: '#FB8C00',
    icon: `<path d="M6 6h15l17 17-15 15L6 21V6z"/><circle cx="15" cy="15" r="2.5"/>`,
  },
  {
    view: 'proveedores',
    name: 'PROVEEDORES',
    color: '#FFB300',
    icon: `<rect x="2" y="12" width="22" height="22" rx="2"/><path d="M24 18h8l8 12v8H24V18z"/><circle cx="9" cy="36" r="3.5"/><circle cx="33.5" cy="36" r="3.5"/>`,
  },
  {
    view: 'kardex',
    name: 'KARDEX',
    color: '#00897B',
    icon: `<rect x="6" y="17" width="32" height="23" rx="3"/><rect x="4" y="10" width="36" height="9" rx="2"/><line x1="22" y1="10" x2="22" y2="40"/><path d="M13 10C13 5 18.5 5 22 8.5C25.5 5 31 5 31 10"/>`,
  },
  {
    view: 'pedidos',
    name: 'PEDIDOS',
    color: '#E91E63',
    icon: `<rect x="9" y="7" width="26" height="34" rx="3"/><path d="M16 7V5a6 6 0 0112 0v2H16z"/><circle cx="22" cy="27" r="8"/><path d="M18.5 27l2.5 2.5 5.5-5.5"/>`,
  },
  {
    view: 'garantias',
    name: 'GARANTÍAS',
    color: '#0891B2',
    icon: `<path d="M22 4L8 10v10c0 9 6 16 14 18 8-2 14-9 14-18V10L22 4z"/><path d="M16 22l4 4 8-8"/>`,
  },
];

const VENTAS_ITEMS = [
  {
    view: 'pedidos',
    name: 'PEDIDOS',
    color: '#8E24AA',
    active: true,
    icon: `<rect x="9" y="7" width="26" height="34" rx="3"/><path d="M16 7V5a6 6 0 0112 0v2H16z"/><circle cx="22" cy="27" r="8"/><path d="M18.5 27l2.5 2.5 5.5-5.5"/>`,
  },
  {
    view: 'recaudos',
    name: 'RECAUDOS',
    color: '#9E9E9E',
    active: false,
    icon: `<rect x="4" y="10" width="36" height="26" rx="3"/><path d="M4 17h36"/><circle cx="22" cy="29" r="5"/><path d="M20 29l1.5 1.5 3-3"/>`,
  },
  {
    view: 'ventas-resumen',
    name: 'RESUMEN VENTAS',
    color: '#1E88E5',
    active: true,
    icon: `<polyline points="4,36 14,22 22,28 32,12 40,18"/><rect x="4" y="38" width="36" height="2"/><circle cx="14" cy="22" r="2.5"/><circle cx="22" cy="28" r="2.5"/><circle cx="32" cy="12" r="2.5"/>`,
  },
  {
    view: 'fulfillment',
    name: 'FULFILLMENT',
    color: '#9E9E9E',
    active: false,
    icon: `<rect x="6" y="18" width="32" height="22" rx="2"/><path d="M14 18v-4a8 8 0 0116 0v4"/><path d="M16 30l4 4 8-8"/>`,
  },
  {
    view: 'kpi-comerciales',
    name: "KPI'S COMERCIALES",
    color: '#9E9E9E',
    active: false,
    icon: `<rect x="6" y="28" width="8" height="12"/><rect x="18" y="18" width="8" height="22"/><rect x="30" y="8" width="8" height="32"/><path d="M6 24l10-10 8 6 12-14"/>`,
  },
];

function _gov(extra = {}) {
  const ts = new Date().toISOString();
  const baseKey =
    extra.idempotency_key ??
    extra.key ??
    `${extra.entity ?? 'HOME'}:${extra.entity_id ?? 'GEN'}`;

  return {
    id: crypto.randomUUID(),
    created_at: ts,
    updated_at: ts,
    created_by: 'home-dashboard',
    updated_by: 'home-dashboard',
    version: 1,
    status: 'active',
    sync_status: navigator.onLine ? 'online' : 'offline',
    idempotency_key: baseKey,
    ...extra,
  };
}

const PROVEEDORES_ITEMS = [
  {
    view: 'proveedores-lista',
    name: 'PROVEEDORES',
    color: '#FFB300',
    icon: `<rect x="2" y="12" width="22" height="22" rx="2"/><path d="M24 18h8l8 12v8H24V18z"/><circle cx="9" cy="36" r="3.5"/><circle cx="33.5" cy="36" r="3.5"/>`,
  },
  {
    view: 'compras',
    name: 'COMPRAS',
    color: '#E65100',
    icon: `<path d="M9 5h17l8 8v24a2 2 0 01-2 2H9a2 2 0 01-2-2V7a2 2 0 012-2z"/><path d="M26 5v8h8"/><line x1="13" y1="19" x2="31" y2="19"/><line x1="13" y1="26" x2="22" y2="26"/>`,
  },
];

export function renderProveedoresSubMenu() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  document.querySelectorAll('.nav-btn').forEach((btn) =>
    btn.classList.toggle('active', btn.dataset.module === 'proveedores'));

  mainContent.innerHTML = `
    <div class="vsub-wrap">
      <div class="vsub-header">
        <button class="vsub-back" id="vsub-back-prov" aria-label="Volver al inicio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
        </button>
        <span class="vsub-title">PROVEEDORES</span>
      </div>
      <div class="vsub-grid">
        ${PROVEEDORES_ITEMS.map((item) => `
          <div class="vsub-card" data-view="${item.view}" role="button" tabindex="0" aria-label="${item.name}">
            <div class="vsub-icon">
              <svg viewBox="0 0 44 44" fill="none" stroke="${item.color}" stroke-width="2.2"
                   stroke-linecap="round" stroke-linejoin="round" width="48" height="48"
                   style="filter:drop-shadow(0 0 6px ${item.color}55)">
                ${item.icon}
              </svg>
            </div>
            <div class="vsub-label">${item.name}</div>
          </div>`).join('')}
      </div>
    </div>`;

  mainContent.querySelector('#vsub-back-prov')?.addEventListener('click', () => {
    window.__erp_navigate?.('home');
  });

  mainContent.querySelectorAll('.vsub-card[data-view]').forEach((card) => {
    const handler = () => window.__erp_navigate?.(card.dataset.view);
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    });
  });
}

export function renderVentasSubMenu() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  document.querySelectorAll('.nav-btn').forEach((btn) =>
    btn.classList.toggle('active', btn.dataset.module === 'pedidos'));

  mainContent.innerHTML = `
    <div class="vsub-wrap">
      <div class="vsub-header">
        <button class="vsub-back" id="vsub-back" aria-label="Volver al inicio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
        </button>
        <span class="vsub-title">VENTAS</span>
      </div>
      <div class="vsub-grid">
        ${VENTAS_ITEMS.map((item) => `
          <div class="vsub-card${item.active ? '' : ' vsub-card--disabled'}"
               data-view="${item.view}"
               data-active="${item.active}"
               role="button" tabindex="${item.active ? '0' : '-1'}"
               aria-label="${item.name}${item.active ? '' : ' (próximamente)'}">
            <div class="vsub-icon">
              <svg viewBox="0 0 44 44" fill="none" stroke="${item.color}" stroke-width="2.2"
                   stroke-linecap="round" stroke-linejoin="round" width="48" height="48"
                   style="filter:drop-shadow(0 0 6px ${item.color}55)">
                ${item.icon}
              </svg>
            </div>
            <div class="vsub-label">${item.name}</div>
            ${item.active ? '' : '<div class="vsub-proximamente">Próximamente</div>'}
          </div>`).join('')}
      </div>
    </div>`;

  mainContent.querySelector('#vsub-back')?.addEventListener('click', () => {
    window.__erp_navigate?.('home');
  });

  mainContent.querySelectorAll('.vsub-card[data-active="true"]').forEach((card) => {
    const handler = () => {
      eventBus.emit('ModuleOpened', _gov({
        key: `MODULE_OPENED_${card.dataset.view}`,
        module: card.dataset.view,
        label: card.dataset.view,
        source: 'ventas-submenu',
      }));
      window.__erp_navigate?.(card.dataset.view);
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    });
  });
}

export class HomeMenu {
  constructor(container) {
    this.container = container;
  }

  mount() {
    this.container.innerHTML = `
      <div class="hmv2-wrap">
        <div class="hmv2-logo-wrap">
          <img src="/icons/MAXGRIFOS_192x192.png" alt="MaxGrifos" class="hmv2-logo">
        </div>
        <div class="hmv2-grid">
          ${MODULES.map((m) => `
            <div class="hmv2-card" data-view="${m.view}" role="button" tabindex="0" aria-label="${m.name}">
              <div class="hmv2-icon">
                <svg viewBox="0 0 44 44" fill="none" stroke="${m.color}" stroke-width="2.2"
                     stroke-linecap="round" stroke-linejoin="round" width="44" height="44"
                     style="filter:drop-shadow(0 0 5px ${m.color}55)">
                  ${m.icon}
                </svg>
              </div>
              <div class="hmv2-label">${m.name}</div>
            </div>`).join('')}
        </div>
      </div>`;

    // Trazabilidad §8 — HOME_VIEWED
    eventBus.emit('HomeViewed', _gov({ key: 'HOME_VIEWED' }));

    this.container.querySelectorAll('.hmv2-card[data-view]').forEach((card) => {
      const mod = MODULES.find((m) => m.view === card.dataset.view);
      const emitOpen = () => eventBus.emit('ModuleOpened', _gov({
        key: `MODULE_OPENED_${card.dataset.view}`,
        module: card.dataset.view,
        label: mod?.name ?? card.dataset.view,
      }));

      const handler = () => {
        emitOpen();
        if (card.dataset.view === 'ventas') {
          window.__erp_navigate?.('ventas');
        } else if (card.dataset.view === 'proveedores') {
          window.__erp_navigate?.('proveedores');
        } else {
          window.__erp_navigate?.(card.dataset.view);
        }
      };

      card.addEventListener('click', handler);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });
  }

  unmount() {}
}
