import { getBodegasConSistema, createBodegaSatelite, updateBodegaSatelite, deactivateBodegaSatelite } from '../modules/kardex/bodega-store.js';
import { eventBus, Events } from '../events/domain-events.js';

export class BodegaManager {
  constructor(container) {
    this.container = container;
    this._bodegas  = [];
    this._unsubs   = [];
  }

  async mount() {
    this._bodegas = await getBodegasConSistema();
    this._render();
    this._unsubs.push(
      eventBus.on(Events.BODEGA_CREATED, async () => { this._bodegas = await getBodegasConSistema(); this._render(); }),
      eventBus.on(Events.BODEGA_UPDATED, async () => { this._bodegas = await getBodegasConSistema(); this._render(); }),
    );
  }

  unmount() { this._unsubs.forEach((fn) => fn()); }

  _render() {
    this.container.innerHTML = `
      <div class="list-container">
        <h2>Gestión de Bodegas</h2>

        <div class="bodega-nueva-section" style="margin-bottom:20px">
          <h3 style="font-size:15px;margin-bottom:10px">➕ Nueva bodega satélite</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input type="text" id="bod-nombre" class="search-input" placeholder="NOMBRE BODEGA" style="flex:1;min-width:140px" autocapitalize="characters">
            <input type="text" id="bod-desc" class="search-input" placeholder="Descripción (opcional)" style="flex:1;min-width:140px">
            <button class="btn-primary" id="btn-crear-bodega" style="flex:0 0 auto">Crear</button>
          </div>
          <div id="bod-error" class="form-error hidden" style="margin-top:6px"></div>
        </div>

        <div id="bodega-list">
          ${this._bodegas.map((b) => this._cardHtml(b)).join('')}
        </div>
      </div>`;

    this._bindEvents();
  }

  _cardHtml(b) {
    const tipoBadge = {
      central:   '<span class="bod-badge bod-central">CENTRAL</span>',
      transit:   '<span class="bod-badge bod-transit">TRÁNSITO</span>',
      satellite: '<span class="bod-badge bod-satellite">SATÉLITE</span>',
      system:    '<span class="bod-badge bod-system">SISTEMA</span>',
    }[b.tipo] ?? '';

    return `
      <div class="product-card bodega-card">
        <div class="product-card-header">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="product-nombre">📦 ${b.nombre}</span>
            ${tipoBadge}
          </div>
          ${!b.configurable ? '<span style="font-size:11px;color:var(--text-secondary)">🔒 Sistema</span>' : ''}
        </div>
        ${b.descripcion ? `<div class="product-meta"><span>${b.descripcion}</span></div>` : ''}
        <div class="card-actions">
          <button class="btn-action bod-btn-inventario" data-id="${b.id}">📋 Ver Inventario</button>
          ${b.configurable ? `
            <button class="btn-action btn-edit bod-btn-edit" data-id="${b.id}"
              data-nombre="${b.nombre}" data-desc="${b.descripcion ?? ''}">✏️ Editar</button>
            <button class="btn-action btn-deactivate bod-btn-deact" data-id="${b.id}">⛔ Desactivar</button>
          ` : ''}
        </div>
      </div>`;
  }

  _bindEvents() {
    this.container.querySelectorAll('.bod-btn-inventario').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bodega = this._bodegas.find((b) => b.id === btn.dataset.id);
        if (bodega) navigate('bodega-detail', { bodega });
      });
    });

    const nomInput = this.container.querySelector('#bod-nombre');
    nomInput?.addEventListener('input', () => {
      const pos = nomInput.selectionStart;
      nomInput.value = nomInput.value.toUpperCase();
      try { nomInput.setSelectionRange(pos, pos); } catch { /* noop */ }
    });

    this.container.querySelector('#btn-crear-bodega')?.addEventListener('click', async () => {
      const errorEl = this.container.querySelector('#bod-error');
      const nombre  = nomInput?.value.trim();
      const desc    = this.container.querySelector('#bod-desc')?.value.trim();
      errorEl.classList.add('hidden');

      if (!nombre) { errorEl.textContent = 'El nombre es obligatorio.'; errorEl.classList.remove('hidden'); return; }
      if (this._bodegas.some((b) => b.nombre === nombre)) { errorEl.textContent = 'Ya existe una bodega con ese nombre.'; errorEl.classList.remove('hidden'); return; }

      await createBodegaSatelite({ nombre, descripcion: desc });
      if (nomInput) nomInput.value = '';
    });

    this.container.querySelectorAll('.bod-btn-edit').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nuevoNombre = prompt('Nuevo nombre para la bodega:', btn.dataset.nombre);
        if (!nuevoNombre?.trim()) return;
        const nuevaDesc   = prompt('Nueva descripción:', btn.dataset.desc) ?? btn.dataset.desc;
        await updateBodegaSatelite(btn.dataset.id, { nombre: nuevoNombre.trim(), descripcion: nuevaDesc });
      });
    });

    this.container.querySelectorAll('.bod-btn-deact').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Desactivar esta bodega? El stock existente se conserva.')) return;
        await deactivateBodegaSatelite(btn.dataset.id);
        this._bodegas = await getBodegasConSistema();
        this._render();
      });
    });
  }
}

function navigate(view, opts = {}) { window.__erp_navigate?.(view, opts); }
