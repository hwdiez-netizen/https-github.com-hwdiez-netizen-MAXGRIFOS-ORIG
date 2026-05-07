/**
 * BirthdayPicker - selector de fecha de cumpleanos en espanol.
 * Dos selectores nativos (Dia / Mes). No incluye ano por privacidad.
 * Persistencia: MM-DD.
 * Compatibilidad legacy: tambien lee YYYY-MM-DD.
 */

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

function normalizePart(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? String(n).padStart(2, '0') : '';
}

export class BirthdayPicker {
  constructor(container, initialValue = '') {
    this.container = container;
    this._day = '';
    this._month = '';
    if (initialValue) this._parse(initialValue);
  }

  _parse(value) {
    const parts = String(value ?? '').trim().split('-').map((p) => p.trim());
    if (parts.length === 3) {
      // Legacy YYYY-MM-DD
      this._month = normalizePart(parts[1]);
      this._day = normalizePart(parts[2]);
      return;
    }
    if (parts.length === 2) {
      // Current MM-DD
      this._month = normalizePart(parts[0]);
      this._day = normalizePart(parts[1]);
    }
  }

  getValue() {
    if (!this._month || !this._day) return '';
    return `${this._month}-${this._day}`;
  }

  render() {
    const days = Array.from({ length: 31 }, (_, i) => i + 1);

    this.container.innerHTML = `
      <div class="bp-wrap">
        <div class="bp-hint-bar">
          <span class="bp-hint-icon">👉</span>
          <span>Toca cada campo y <strong>desliza</strong> para elegir dia y mes</span>
        </div>
        <div class="bp-selects bp-selects-no-year">
          <div class="bp-col">
            <span class="bp-col-label">Dia</span>
            <select class="bp-sel" id="bp-day">
              <option value="">-</option>
              ${days.map((d) => {
                const v = String(d).padStart(2, '0');
                return `<option value="${v}" ${this._day === v ? 'selected' : ''}>${d}</option>`;
              }).join('')}
            </select>
          </div>

          <div class="bp-col bp-col-wide">
            <span class="bp-col-label">Mes</span>
            <select class="bp-sel" id="bp-month">
              <option value="">-</option>
              ${MESES.map((m, i) => {
                const v = String(i + 1).padStart(2, '0');
                return `<option value="${v}" ${this._month === v ? 'selected' : ''}>${m}</option>`;
              }).join('')}
            </select>
          </div>
        </div>
        <div class="bp-preview" id="bp-preview"></div>
      </div>`;

    this._bindEvents();
    this._syncDays();
    this._updatePreview();
  }

  _bindEvents() {
    const dayEl = this.container.querySelector('#bp-day');
    const monthEl = this.container.querySelector('#bp-month');

    dayEl?.addEventListener('change', (e) => {
      this._day = e.target.value;
      this._syncDays();
      this._updatePreview();
    });

    monthEl?.addEventListener('change', (e) => {
      this._month = e.target.value;
      this._syncDays();
      this._updatePreview();
    });
  }

  _syncDays() {
    const dayEl = this.container.querySelector('#bp-day');
    if (!dayEl) return;

    const month = Number.parseInt(this._month, 10) || 1;
    // Use leap year 2000 so February accepts up to 29.
    const maxDays = new Date(2000, month, 0).getDate();
    const currentDay = Number.parseInt(this._day, 10) || 0;
    if (currentDay > maxDays) this._day = '';

    const options = Array.from({ length: maxDays }, (_, i) => i + 1)
      .map((d) => {
        const v = String(d).padStart(2, '0');
        return `<option value="${v}" ${this._day === v ? 'selected' : ''}>${d}</option>`;
      })
      .join('');

    dayEl.innerHTML = `<option value="">-</option>${options}`;
  }

  _updatePreview() {
    const previewEl = this.container.querySelector('#bp-preview');
    if (!previewEl) return;

    if (this._day && this._month) {
      const monthIdx = Number.parseInt(this._month, 10) - 1;
      const monthName = MESES_CORTOS[monthIdx] ?? this._month;
      previewEl.textContent = `${Number.parseInt(this._day, 10)} ${monthName}`;
      previewEl.className = 'bp-preview bp-ok';
      return;
    }

    previewEl.textContent = 'Selecciona dia y mes';
    previewEl.className = 'bp-preview bp-empty';
  }
}
