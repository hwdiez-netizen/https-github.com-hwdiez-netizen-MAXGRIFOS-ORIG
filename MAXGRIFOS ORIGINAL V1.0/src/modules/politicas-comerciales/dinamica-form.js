import {
  crearDinamica, actualizarDinamica, activarDinamica, desactivarDinamica,
  ponerDinamicaEnStandby, reanudarDinamica, cancelarDinamica,
  getDinamicaCompleta,
} from './dinamica-store.js';

export class DinamicaForm {
  constructor(container) {
    this._container = container;
    this._dinamica = null;
    this._dirty = false;
  }

  setEditDinamica(dinamica) { this._dinamica = dinamica; }

  async canUnmount() {
    if (!this._dirty) return true;
    return confirm('Hay cambios sin guardar. ¿Desea salir de todas formas?');
  }

  async mount() {
    if (this._dinamica) {
      const completa = await getDinamicaCompleta(this._dinamica.id);
      if (completa) this._dinamica = completa.dinamica;
    }
    this._render();
  }

  unmount() {
    this._container.innerHTML = '';
  }

  _render() {
    const isNew = !this._dinamica;
    const ep = this._dinamica?.estado_proceso ?? 'creacion';
    const cancelada = ep === 'cancelada';
    const d = this._dinamica;

    const epLabels = {
      creacion: 'Creación', edicion: 'Edición', standby: 'Standby',
      activa: 'Activa', inactiva: 'Inactiva', cancelada: 'Cancelada',
    };

    this._container.innerHTML = `
      <div class="form-container">
        <button class="btn-back" id="btn-back">← Volver</button>
        <div class="form-mode-badge ${isNew ? 'form-mode-v5' : 'form-mode-edit'}">
          ${isNew ? 'Nueva Dinámica Comercial' : `Dinámica — ${epLabels[ep] ?? ep}`}
        </div>

        <div class="field-group">
          <label class="field-label">Nombre *</label>
          <input class="field-input" id="inp-nombre" type="text" maxlength="120"
            value="${d?.nombre ?? ''}" ${cancelada ? 'disabled' : ''}
            placeholder="Ej: Promoción Julio 2026" />
        </div>

        <div class="form-row">
          <div class="field-group" style="flex:1">
            <label class="field-label">Fecha inicio</label>
            <input class="field-input" id="inp-inicio" type="date"
              value="${d?.fecha_inicio ?? ''}" ${cancelada ? 'disabled' : ''} />
          </div>
          <div class="field-group" style="flex:1">
            <label class="field-label">Fecha fin</label>
            <input class="field-input" id="inp-fin" type="date"
              value="${d?.fecha_fin ?? ''}" ${cancelada ? 'disabled' : ''} />
          </div>
        </div>

        <div class="field-group">
          <label class="field-label">Condiciones / descripción</label>
          <textarea class="field-input" id="inp-condiciones" rows="4"
            maxlength="600" ${cancelada ? 'disabled' : ''}
            placeholder="Descripción de reglas, descuentos aplicables, exclusiones…">${d?.condiciones ?? ''}</textarea>
        </div>

        <div class="feedback hidden" id="fb"></div>

        <div class="politicas-action-bar">
          ${!cancelada ? `<button class="btn-primary" id="btn-guardar">Guardar</button>` : ''}
          ${d && ['creacion', 'edicion', 'standby', 'inactiva'].includes(ep)
            ? `<button class="btn-action btn-activate" id="btn-activar" style="padding:12px 18px">Activar</button>` : ''}
          ${ep === 'activa'
            ? `<button class="btn-action btn-deactivate" id="btn-desactivar" style="padding:12px 18px">Desactivar</button>` : ''}
          ${d && ['creacion', 'edicion', 'activa', 'inactiva'].includes(ep)
            ? `<button class="btn-action" id="btn-standby" style="padding:12px 18px">Standby</button>` : ''}
          ${ep === 'standby'
            ? `<button class="btn-action btn-activate" id="btn-reanudar" style="padding:12px 18px">Reanudar</button>` : ''}
          ${d && !cancelada
            ? `<button class="btn-abandon" id="btn-cancelar" style="margin-top:0">Cancelar proceso</button>` : ''}
        </div>
      </div>`;

    this._container.querySelector('#btn-back')
      .addEventListener('click', () => window.__erp_navigate('dinamicas'));

    const inp = (id) => this._container.querySelector(`#${id}`);

    ['inp-nombre', 'inp-inicio', 'inp-fin', 'inp-condiciones'].forEach((id) => {
      inp(id)?.addEventListener('input', () => { this._dirty = true; });
    });

    inp('btn-guardar')?.addEventListener('click', () => this._guardar());
    inp('btn-activar')?.addEventListener('click', () => this._activar());
    inp('btn-desactivar')?.addEventListener('click', () => this._desactivar());
    inp('btn-standby')?.addEventListener('click', () => this._standby());
    inp('btn-reanudar')?.addEventListener('click', () => this._reanudar());
    inp('btn-cancelar')?.addEventListener('click', () => this._cancelar());
  }

  _collect() {
    return {
      nombre: this._container.querySelector('#inp-nombre')?.value.trim() ?? '',
      fecha_inicio: this._container.querySelector('#inp-inicio')?.value || null,
      fecha_fin: this._container.querySelector('#inp-fin')?.value || null,
      condiciones: this._container.querySelector('#inp-condiciones')?.value.trim() ?? '',
    };
  }

  _showFb(msg, type = 'success') {
    const fb = this._container.querySelector('#fb');
    if (!fb) return;
    fb.textContent = msg;
    fb.className = `feedback ${type}`;
    setTimeout(() => { fb.className = 'feedback hidden'; }, 3000);
  }

  async _guardar() {
    const data = this._collect();
    if (!data.nombre) { this._showFb('El nombre es obligatorio.', 'error'); return; }
    try {
      if (!this._dinamica) {
        this._dinamica = await crearDinamica(data);
      } else {
        this._dinamica = await actualizarDinamica(this._dinamica.id, data);
      }
      this._dirty = false;
      this._showFb('Guardado correctamente.');
      this._render();
    } catch (e) { this._showFb(e.message, 'error'); }
  }

  async _activar() {
    if (!this._dinamica) { await this._guardar(); if (!this._dinamica) return; }
    try {
      this._dinamica = await activarDinamica(this._dinamica.id);
      this._dirty = false;
      this._showFb('Dinámica activada.');
      this._render();
    } catch (e) { this._showFb(e.message, 'error'); }
  }

  async _desactivar() {
    if (!this._dinamica) return;
    try {
      this._dinamica = await desactivarDinamica(this._dinamica.id);
      this._dirty = false;
      this._showFb('Dinámica desactivada.');
      this._render();
    } catch (e) { this._showFb(e.message, 'error'); }
  }

  async _standby() {
    if (!this._dinamica) { await this._guardar(); if (!this._dinamica) return; }
    const motivo = prompt('Motivo del standby (opcional):') ?? '';
    try {
      this._dinamica = await ponerDinamicaEnStandby(this._dinamica.id, motivo);
      this._dirty = false;
      this._showFb('Dinámica en standby.');
      this._render();
    } catch (e) { this._showFb(e.message, 'error'); }
  }

  async _reanudar() {
    if (!this._dinamica) return;
    try {
      this._dinamica = await reanudarDinamica(this._dinamica.id);
      this._dirty = false;
      this._showFb('Proceso reanudado.');
      this._render();
    } catch (e) { this._showFb(e.message, 'error'); }
  }

  async _cancelar() {
    if (!this._dinamica) return;
    const motivo = prompt('Motivo de cancelación (opcional):') ?? '';
    if (!confirm('¿Cancelar esta dinámica? Operación irreversible (baja lógica).')) return;
    try {
      this._dinamica = await cancelarDinamica(this._dinamica.id, motivo);
      this._dirty = false;
      this._showFb('Dinámica cancelada.');
      this._render();
    } catch (e) { this._showFb(e.message, 'error'); }
  }
}
