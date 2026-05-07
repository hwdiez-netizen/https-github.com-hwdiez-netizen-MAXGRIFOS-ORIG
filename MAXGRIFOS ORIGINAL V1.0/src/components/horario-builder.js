/**
 * HorarioBuilder — selector visual asistido de horarios de atención.
 * TimePicker usa <select> nativos: en iOS/Android abre el carrusel del sistema,
 * permite elegir cualquier hora (1-12), minuto (00-59) y AM/PM libremente.
 * Formato: LUN-VIE 9:00AM-1:00PM - 2:00PM-5:50PM | SAB 9:00AM-2:00PM
 */

const DAYS    = ['LUN','MAR','MIE','JUE','VIE','SAB','DOM'];
const HOURS   = Array.from({length:12}, (_,i) => String(i+1));
const MINUTES = Array.from({length:60}, (_,i) => String(i).padStart(2,'0'));

/* ── Helpers ─────────────────────────────────────────────────────────── */

function to12h(t24) {
  if (!t24) return '';
  const [h, m] = t24.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')}${ap}`;
}

function to24h(t12) {
  const rx = String(t12).match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!rx) return '';
  let [,h,m,ap] = rx;
  h = parseInt(h);
  if (ap.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (ap.toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2,'0')}:${m}`;
}

function compressDays(days) {
  if (!days?.length) return '';
  const sorted = [...days].sort((a,b) => DAYS.indexOf(a) - DAYS.indexOf(b));
  if (sorted.length === 1) return sorted[0];
  const idx = sorted.map(d => DAYS.indexOf(d));
  return idx.every((v,i) => i===0 || v===idx[i-1]+1)
    ? `${sorted[0]}-${sorted[sorted.length-1]}`
    : sorted.join(', ');
}

function parseDays(str) {
  str = str.trim();
  if (str.includes('-')) {
    const p = str.split('-');
    if (p.length===2 && DAYS.includes(p[0]) && DAYS.includes(p[1])) {
      const s=DAYS.indexOf(p[0]), e=DAYS.indexOf(p[1]);
      if (s<=e) return DAYS.slice(s,e+1);
    }
  }
  if (str.includes(',')) return str.split(',').map(d=>d.trim()).filter(d=>DAYS.includes(d));
  return DAYS.includes(str) ? [str] : [];
}

function formatGroup(g) {
  const dayStr = compressDays(g.days);
  const slots  = g.slots.filter(s => s.from && s.to);
  if (!dayStr || !slots.length) return '';
  return `${dayStr} ${slots.map(s=>`${to12h(s.from)}-${to12h(s.to)}`).join(' - ')}`;
}

function parseHorario(str) {
  if (!str) return [];
  return str.split(' | ').map(part => {
    const sp = part.search(/\s/);
    if (sp===-1) return null;
    const days  = parseDays(part.slice(0,sp));
    const slots = part.slice(sp+1).split(' - ').map(s => {
      const dash = s.indexOf('-');
      if (dash===-1) return null;
      return { from: to24h(s.slice(0,dash)), to: to24h(s.slice(dash+1)) };
    }).filter(Boolean);
    return (days.length && slots.length) ? {days, slots} : null;
  }).filter(Boolean);
}

function emptyGroup() {
  return { days:[], slots:[{from:'09:00', to:'13:00'}] };
}

/* ── TimePicker — selectores nativos ─────────────────────────────────── */

class TimePicker {
  constructor(container, time24 = '09:00') {
    this._el = container;
    this._h  = '9';
    this._m  = '00';
    this._ap = 'AM';
    this._parse(time24);
  }

  _parse(t24) {
    const [hRaw, mRaw] = (t24||'09:00').split(':').map(Number);
    const h = isNaN(hRaw) ? 9  : hRaw;
    const m = isNaN(mRaw) ? 0  : mRaw;
    this._ap = h < 12 ? 'AM' : 'PM';
    this._h  = String(h % 12 || 12);
    this._m  = String(m).padStart(2,'0');
  }

  getValue() {
    let h = parseInt(this._h);
    if (this._ap === 'PM' && h !== 12) h += 12;
    if (this._ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${this._m}`;
  }

  render() {
    const hOpts = HOURS.map(h =>
      `<option value="${h}" ${this._h===h?'selected':''}>${h}</option>`).join('');

    const mOpts = MINUTES.map(m =>
      `<option value="${m}" ${this._m===m?'selected':''}>${m}</option>`).join('');

    this._el.innerHTML = `
      <div class="tps-wrap">
        <select class="tps-sel tps-h" aria-label="Hora">${hOpts}</select>
        <span class="tps-colon">:</span>
        <select class="tps-sel tps-m" aria-label="Minutos">${mOpts}</select>
        <select class="tps-sel tps-ap" aria-label="AM o PM">
          <option value="AM" ${this._ap==='AM'?'selected':''}>AM</option>
          <option value="PM" ${this._ap==='PM'?'selected':''}>PM</option>
        </select>
      </div>`;

    this._el.querySelector('.tps-h') .addEventListener('change', e => { this._h  = e.target.value; this._fire(); });
    this._el.querySelector('.tps-m') .addEventListener('change', e => { this._m  = e.target.value; this._fire(); });
    this._el.querySelector('.tps-ap').addEventListener('change', e => { this._ap = e.target.value; this._fire(); });
  }

  _fire() {
    this._el.dispatchEvent(new Event('time-change', {bubbles:true}));
  }
}

/* ── HorarioBuilder ──────────────────────────────────────────────────── */

export class HorarioBuilder {
  constructor(container, initialValue = '') {
    this.container = container;
    this._groups   = parseHorario(initialValue);
    if (!this._groups.length) this._groups = [emptyGroup()];
    this._pickers  = {};
  }

  getValue() {
    for (const [key, picker] of Object.entries(this._pickers)) {
      const [gi, si, field] = key.split('-');
      if (this._groups[gi]?.slots[si]) {
        this._groups[gi].slots[si][field] = picker.getValue();
      }
    }
    return this._groups.map(formatGroup).filter(Boolean).join(' | ');
  }

  render() {
    this.container.innerHTML = `
      <div class="horario-builder">
        <div class="horario-builder-label">
          Horarios de Atención
          <span class="sku-locked-badge">Asistido</span>
        </div>
        <div id="hb-groups"></div>
        <button type="button" class="btn-add-horario-group" id="hb-add-group">
          + Agregar otro grupo de días
        </button>
        <div class="horario-preview" id="hb-preview"></div>
      </div>`;

    this._renderGroups();
    this.container.querySelector('#hb-add-group')
      ?.addEventListener('click', () => {
        this._groups.push(emptyGroup());
        this._renderGroups();
        this._updatePreview();
      });
    this._updatePreview();
  }

  _renderGroups() {
    this._pickers = {};
    const wrap = this.container.querySelector('#hb-groups');
    if (!wrap) return;
    wrap.innerHTML = this._groups.map((g,gi) => this._groupHtml(g,gi)).join('');
    this._mountPickers();
    this._bindGroupEvents();
  }

  _groupHtml(group, gi) {
    return `
      <div class="horario-group" data-gi="${gi}">
        <div class="horario-group-header">
          <span class="horario-group-label">Grupo ${gi+1} — Días</span>
          ${this._groups.length > 1
            ? `<button type="button" class="btn-remove-group" data-gi="${gi}">🗑 Quitar</button>`
            : ''}
        </div>
        <div class="horario-days-row">
          ${DAYS.map(d=>`
            <button type="button" class="day-chip ${group.days.includes(d)?'day-chip-on':''}"
              data-gi="${gi}" data-day="${d}">${d}</button>`).join('')}
        </div>
        <div class="horario-slots-wrap">
          ${group.slots.map((_,si) => this._slotHtml(gi, si, group.slots.length)).join('')}
        </div>
        <button type="button" class="btn-add-slot" data-gi="${gi}">+ Agregar turno</button>
      </div>`;
  }

  _slotHtml(gi, si, total) {
    return `
      <div class="horario-slot">
        <div class="horario-slot-header">
          <span class="horario-slot-num">Turno ${si+1}</span>
          ${total > 1
            ? `<button type="button" class="btn-remove-slot" data-gi="${gi}" data-si="${si}">× Quitar turno</button>`
            : ''}
        </div>
        <div class="horario-drums-row">
          <div class="horario-drum-block">
            <span class="drum-label">Inicio</span>
            <div id="tp-${gi}-${si}-from"></div>
          </div>
          <span class="horario-arrow-big">→</span>
          <div class="horario-drum-block">
            <span class="drum-label">Fin</span>
            <div id="tp-${gi}-${si}-to"></div>
          </div>
        </div>
      </div>`;
  }

  _mountPickers() {
    this._groups.forEach((group, gi) => {
      group.slots.forEach((slot, si) => {
        ['from','to'].forEach(field => {
          const el = this.container.querySelector(`#tp-${gi}-${si}-${field}`);
          if (!el) return;
          const t = new TimePicker(el, slot[field] || (field==='from'?'09:00':'13:00'));
          t.render();
          this._pickers[`${gi}-${si}-${field}`] = t;
          el.addEventListener('time-change', () => this._updatePreview());
        });
      });
    });
  }

  _bindGroupEvents() {
    this.container.querySelectorAll('.day-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const gi=+btn.dataset.gi, day=btn.dataset.day, g=this._groups[gi];
        g.days = g.days.includes(day) ? g.days.filter(d=>d!==day) : [...g.days, day];
        btn.classList.toggle('day-chip-on', g.days.includes(day));
        this._updatePreview();
      });
    });

    this.container.querySelectorAll('.btn-add-slot').forEach(btn => {
      btn.addEventListener('click', () => {
        const gi=+btn.dataset.gi;
        this._groups[gi].slots.push({from:'14:00', to:'18:00'});
        this._renderGroups(); this._updatePreview();
      });
    });

    this.container.querySelectorAll('.btn-remove-slot').forEach(btn => {
      btn.addEventListener('click', () => {
        const gi=+btn.dataset.gi, si=+btn.dataset.si;
        this._groups[gi].slots.splice(si,1);
        this._renderGroups(); this._updatePreview();
      });
    });

    this.container.querySelectorAll('.btn-remove-group').forEach(btn => {
      btn.addEventListener('click', () => {
        this._groups.splice(+btn.dataset.gi,1);
        this._renderGroups(); this._updatePreview();
      });
    });
  }

  _updatePreview() {
    const el = this.container.querySelector('#hb-preview');
    if (!el) return;
    const val = this.getValue();
    if (val) {
      el.className = 'horario-preview horario-preview-filled';
      el.innerHTML = `<span class="horario-preview-label">Resultado</span>
                      <span class="horario-preview-text">${val}</span>`;
    } else {
      el.className = 'horario-preview horario-preview-empty';
      el.innerHTML = `<span class="horario-preview-label">Resultado</span>
                      <span class="horario-preview-hint">Selecciona días y configura los horarios</span>`;
    }
  }
}
