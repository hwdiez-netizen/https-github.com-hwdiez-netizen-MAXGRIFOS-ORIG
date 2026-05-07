import {
  getAllListasPrecios, activarLista, suspenderLista, cancelarLista,
  getUltimoCambioTodasListas,
  FORMA_PAGO_LABELS,
} from './lista-precios-store.js';

function formatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export class ListaPreciosList {
  constructor(container) {
    this._container = container;
    this._fb = null;
  }

  async mount() {
    await this._render();
  }

  unmount() {
    this._container.innerHTML = '';
  }

  _showFb(msg, type = 'success') {
    if (!this._fb) return;
    this._fb.textContent = msg;
    this._fb.className = `feedback ${type}`;
    setTimeout(() => { if (this._fb) this._fb.className = 'feedback hidden'; }, 3500);
  }

  async _render() {
    const [all, trazabilidad] = await Promise.all([
      getAllListasPrecios(),
      getUltimoCambioTodasListas(),
    ]);

    const visibles = all.filter((l) => l.estado_proceso !== 'cancelada');

    this._container.innerHTML = `
      <div class="list-container">
        <div class="feedback hidden" id="list-fb"></div>

        <div class="list-header">
          <h2 class="page-title">Políticas Comerciales</h2>
        </div>

        <div class="politicas-module-tabs">
          <button class="politicas-module-tab active" data-view="lista-precios">Listas de Precios</button>
          <button class="politicas-module-tab" data-view="dinamicas">Dinámicas</button>
        </div>

        <div class="list-header" style="margin-top:16px">
          <span class="product-count">${visibles.length} lista(s)</span>
          <button class="btn-primary btn-nueva-lista" style="width:auto;padding:9px 18px;font-size:14px">+ Nueva Lista</button>
        </div>

        <div class="politicas-list-body">
          ${visibles.length === 0
            ? '<div class="empty-state">Sin listas de precios. Crea la primera con "+ Nueva Lista".</div>'
            : visibles.map((l) => this._renderCard(l)).join('')}
        </div>

        ${trazabilidad.length > 0 ? `
          <div style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px">
            <div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px">Últimos cambios registrados</div>
            ${trazabilidad.map((t) => {
              const lista = all.find((l) => l.id === t.lista_id);
              const nombre = lista?.nombre ?? t.lista_id;
              const fp = FORMA_PAGO_LABELS[lista?.forma_pago ?? ''] ?? lista?.forma_pago ?? '';
              const detalle = [
                t.precios_modificados > 0 ? `${t.precios_modificados} precio(s) modificado(s)` : '',
                ...(t.campos_modificados ?? []),
              ].filter(Boolean).join(', ') || 'sin detalle';
              return `<div style="font-size:13px;color:#374151;padding:4px 0;border-bottom:1px solid #f3f4f6">
                <strong>${nombre}</strong>${fp ? ` — ${fp}` : ''} &nbsp;·&nbsp; ${formatFecha(t.fecha)} &nbsp;·&nbsp; ${detalle}
              </div>`;
            }).join('')}
          </div>` : ''}
      </div>`;

    this._fb = this._container.querySelector('#list-fb');

    this._container.querySelector('.btn-nueva-lista')
      .addEventListener('click', () => window.__erp_navigate('lista-precios-form'));

    this._container.querySelector('[data-view="dinamicas"]')
      .addEventListener('click', () => window.__erp_navigate('dinamicas'));

    this._container.querySelectorAll('.btn-editar-lista').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.__erp_navigate('lista-precios-form', { listaId: btn.dataset.id });
      });
    });

    this._container.querySelectorAll('.btn-activar-lista').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await activarLista(btn.dataset.id);
          this._showFb('Lista activada exitosamente.');
          await this._render();
        } catch (e) {
          this._showFb(e.message, 'error');
          btn.disabled = false;
        }
      });
    });

    this._container.querySelectorAll('.btn-desactivar-lista').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Desactivar esta lista? Quedará INACTIVA y no resolverá precios en pedidos hasta que se reactive.')) return;
        btn.disabled = true;
        try {
          await suspenderLista(btn.dataset.id);
          this._showFb('Lista desactivada.');
          await this._render();
        } catch (e) {
          this._showFb(e.message, 'error');
          btn.disabled = false;
        }
      });
    });

    this._container.querySelectorAll('.btn-cancelar-lista').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Cancelar esta lista?\nNo se podrá reactivar. Los datos históricos se conservan.')) return;
        btn.disabled = true;
        try {
          await cancelarLista(btn.dataset.id);
          this._showFb('Lista cancelada.');
          await this._render();
        } catch (e) {
          this._showFb(e.message, 'error');
          btn.disabled = false;
        }
      });
    });
  }

  _renderCard(lista) {
    const fp = FORMA_PAGO_LABELS[lista.forma_pago ?? lista.tipo_cliente] ?? lista.forma_pago ?? lista.tipo_cliente ?? '—';
    const activa = lista.estado_proceso === 'activa';
    const badge = activa
      ? '<span style="background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px">🟢 ACTIVA</span>'
      : '<span style="background:#fee2e2;color:#dc2626;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px">🔴 INACTIVA</span>';

    return `
      <div class="politicas-card">
        <div class="politicas-card-header" style="display:flex;justify-content:space-between;align-items:center">
          <span class="tipo-cliente-badge">${fp}</span>
          ${badge}
        </div>
        <div class="politicas-card-nombre" style="margin:6px 0 2px">${lista.nombre}</div>
        ${lista.descripcion ? `<div class="politicas-card-desc" style="font-size:12px;color:#6b7280">${lista.descripcion}</div>` : ''}
        <div class="card-actions" style="margin-top:10px;display:flex;gap:8px">
          <button class="btn-action btn-edit btn-editar-lista" data-id="${lista.id}" style="flex:1">Editar</button>
          ${activa
            ? `<button class="btn-action btn-deactivate btn-desactivar-lista" data-id="${lista.id}" style="flex:1">Desactivar</button>`
            : `<button class="btn-action btn-activate btn-activar-lista" data-id="${lista.id}" style="flex:1">Activar</button>`}
          <button class="btn-action btn-cancelar-lista" data-id="${lista.id}"
            style="flex:1;background:#fff;border:1px solid #fca5a5;color:#dc2626">
            Cancelar
          </button>
        </div>
      </div>`;
  }
}
