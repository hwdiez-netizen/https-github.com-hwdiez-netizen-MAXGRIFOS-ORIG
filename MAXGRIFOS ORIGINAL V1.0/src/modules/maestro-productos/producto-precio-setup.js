import { getAllListasPrecios, guardarPrecioItems, getListaCompleta } from '../politicas-comerciales/lista-precios-store.js';

function parseCopAmount(str) {
  return parseInt(String(str).replace(/\D/g, ''), 10) || 0;
}

function formatCopAmount(value) {
  const n = Math.round(Number(value)) || 0;
  return new Intl.NumberFormat('es-CO').format(n);
}

function margenPct(costo, precio) {
  if (!costo || !precio || precio <= costo) return null;
  return ((1 - costo / precio) * 100).toFixed(1);
}

const FORMA_PAGO_LABELS = {
  CONTADO:         'Contado',
  CONTADO_B2B:     'Contado B2B',
  CREDITO_15:      'Crédito 15 días',
  CREDITO_30:      'Crédito 30 días',
  CREDITO_45:      'Crédito 45 días',
  B2C_REDES:       'B2C Redes',
  B2C_PROYECTO:    'B2C Proyecto',
  B2C_CONSTRUCTOR: 'B2C Constructor',
};

export class ProductoPrecioSetup {
  constructor(container) {
    this._container = container;
    this._product = null;
    this._listas = [];
    this._existingPrices = {};
  }

  setProduct(product) {
    this._product = product;
  }

  async mount() {
    this._container.innerHTML = '<div class="loading">Cargando listas de precios...</div>';

    const allListas = await getAllListasPrecios();
    this._listas = allListas.filter((l) => l.estado_proceso === 'activa');

    for (const lista of this._listas) {
      try {
        const completa = await getListaCompleta(lista.id);
        if (completa) {
          const item = completa.items.find((i) => i.product_id === this._product?.id);
          if (item) this._existingPrices[lista.id] = item.precio_venta;
        }
      } catch { /* no-op */ }
    }

    this._render();
  }

  _render() {
    const p = this._product;
    const costo = Number(p?.costo ?? 0);

    const listasHtml = this._listas.length === 0
      ? `<div class="empty-state">
           <p>No hay listas de precios activas.</p>
           <p style="font-size:13px;color:#9ca3af">
             Activa una lista en Políticas Comerciales para asignar precios.
           </p>
         </div>`
      : this._listas.map((lista) => {
          const existing = this._existingPrices[lista.id] ?? 0;
          const m = margenPct(costo, existing);
          const fp = lista.forma_pago ?? lista.tipo_cliente ?? '';
          const fpLabel = FORMA_PAGO_LABELS[fp] ?? fp;
          const badgeBg    = m ? '#dcfce7' : '#f3f4f6';
          const badgeColor = m ? '#15803d' : '#9ca3af';
          return `
            <div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                <div>
                  <div style="font-weight:700;font-size:14px;color:#1e293b">${lista.nombre}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:2px">${fpLabel}</div>
                </div>
                <div class="precio-margen-badge" data-lista="${lista.id}"
                  style="font-size:13px;font-weight:800;padding:4px 12px;border-radius:20px;
                         background:${badgeBg};color:${badgeColor};white-space:nowrap">
                  ${m ? `${m}%` : '—'}
                </div>
              </div>
              <div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center">
                <span style="font-size:13px;color:#374151;font-weight:600">Precio venta:</span>
                <input type="text" inputmode="numeric"
                  class="precio-setup-input field-input"
                  data-lista="${lista.id}"
                  data-costo="${costo}"
                  value="${existing > 0 ? formatCopAmount(existing) : ''}"
                  placeholder="0"
                  style="padding:8px 12px;font-size:15px;font-weight:600;text-align:right" />
              </div>
            </div>`;
        }).join('');

    this._container.innerHTML = `
      <div class="form-container">
        <h2 style="margin-bottom:4px">Configurar Precios</h2>
        <div style="font-size:12px;color:#6b7280;margin-bottom:16px">
          ${p?.sku ?? '—'} · ${p?.nombre ?? ''}
        </div>

        <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;
                    padding:14px 16px;margin-bottom:20px">
          <div style="font-size:11px;font-weight:700;color:#1e40af;
                      text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">
            Costo Unitario · Referencia de Auditoría
          </div>
          <div style="font-size:24px;font-weight:800;color:#1e3a8a">
            $ ${costo > 0 ? formatCopAmount(costo) : '—'}
          </div>
          ${costo <= 0
            ? '<div style="font-size:12px;color:#dc2626;margin-top:4px">⚠️ Sin costo definido — edita el producto para calcular márgenes.</div>'
            : ''}
        </div>

        ${listasHtml}

        <div id="setup-feedback" class="feedback hidden"></div>

        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn-secondary" id="btn-omitir" style="flex:1">Omitir</button>
          <button class="btn-primary" id="btn-guardar-precios" style="flex:2">
            💾 Guardar Precios
          </button>
        </div>
      </div>`;

    this._bindEvents();
  }

  _bindEvents() {
    this._container.querySelectorAll('.precio-setup-input').forEach((input) => {
      const update = () => {
        const raw = parseCopAmount(input.value);
        const costo = Number(input.dataset.costo ?? 0);
        const listaId = input.dataset.lista;
        const pos = input.selectionStart;
        input.value = raw > 0 ? formatCopAmount(raw) : '';
        try { input.setSelectionRange(pos, pos); } catch (_) { /* readonly */ }

        const badge = this._container.querySelector(`.precio-margen-badge[data-lista="${listaId}"]`);
        if (!badge) return;
        const m = margenPct(costo, raw);
        if (m !== null) {
          badge.textContent = `${m}%`;
          badge.style.background = '#dcfce7';
          badge.style.color = '#15803d';
        } else if (raw > 0 && costo > 0 && raw <= costo) {
          badge.textContent = '≤0%';
          badge.style.background = '#fee2e2';
          badge.style.color = '#dc2626';
        } else {
          badge.textContent = '—';
          badge.style.background = '#f3f4f6';
          badge.style.color = '#9ca3af';
        }
      };
      input.addEventListener('input', update);
      input.addEventListener('blur', update);
    });

    this._container.querySelector('#btn-omitir')?.addEventListener('click', () => {
      window.__erp_navigate?.('lista');
    });

    this._container.querySelector('#btn-guardar-precios')?.addEventListener('click', () => {
      this._guardar();
    });
  }

  async _guardar() {
    const btn = this._container.querySelector('#btn-guardar-precios');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    try {
      let savedCount = 0;
      for (const lista of this._listas) {
        const input = this._container.querySelector(`.precio-setup-input[data-lista="${lista.id}"]`);
        if (!input) continue;
        const precio = parseCopAmount(input.value);
        if (precio > 0) {
          // Load ALL existing active items to avoid wiping them (guardarPrecioItems
          // marks orphans inactive — passing only 1 item would deactivate all others).
          const completa = await getListaCompleta(lista.id);
          const previos = (completa?.items ?? [])
            .filter((i) => i.product_id !== this._product.id)
            .map((i) => ({
              product_id:   i.product_id,
              product_sku:  i.product_sku,
              product_name: i.product_name,
              precio_venta: i.precio_venta,
            }));
          previos.push({
            product_id:   this._product.id,
            product_sku:  this._product.sku ?? '',
            product_name: this._product.nombre ?? '',
            precio_venta: precio,
          });
          await guardarPrecioItems(lista.id, previos);
          savedCount++;
        }
      }

      const fb = this._container.querySelector('#setup-feedback');
      if (fb) {
        fb.textContent = savedCount > 0
          ? `✅ Precios guardados en ${savedCount} lista(s).`
          : '⚠️ No se ingresó ningún precio. Puedes configurarlos después desde Políticas.';
        fb.className = `feedback ${savedCount > 0 ? 'success' : 'error'}`;
      }
      setTimeout(() => window.__erp_navigate?.('lista'), 1200);
    } catch (err) {
      const fb = this._container.querySelector('#setup-feedback');
      if (fb) {
        fb.textContent = `Error: ${err.message}`;
        fb.className = 'feedback error';
      }
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Precios'; }
    }
  }

  unmount() {}
}
