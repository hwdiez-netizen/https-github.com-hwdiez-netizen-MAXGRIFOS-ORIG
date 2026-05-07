import {
  handleGetComprobantesConfig,
  handleSaveComprobanteConfig,
} from './comprobantes-handlers.js';

function _renderRows(configs) {
  return ['FAC', 'REM'].map((tipo) => {
    const cfg = configs.find((x) => x.tipo === tipo) ?? { tipo, prefijo: tipo, numero_inicial: 1 };
    const label = tipo === 'FAC' ? 'Factura de Venta' : 'Remisi�n';
    return `
      <div class="config-row" data-tipo="${tipo}" style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin-bottom:10px">
        <h3 style="margin:0 0 8px 0">${label} (${tipo})</h3>
        <div class="field-group">
          <label for="prefijo-${tipo}">Prefijo</label>
          <input id="prefijo-${tipo}" name="prefijo-${tipo}" value="${cfg.prefijo ?? tipo}" maxlength="8" required>
        </div>
        <div class="field-group">
          <label for="numero-${tipo}">Consecutivo Inicial</label>
          <input id="numero-${tipo}" name="numero-${tipo}" type="number" min="1" value="${Number(cfg.numero_inicial ?? 1)}" required>
        </div>
        <button type="button" class="btn-primary" data-save-tipo="${tipo}" style="margin-top:6px">Guardar ${tipo}</button>
      </div>`;
  }).join('');
}

export async function renderConfiguracionComprobantes(container) {
  const configs = await handleGetComprobantesConfig();
  container.innerHTML = `
    <div class="config-comprobantes-container">
      <h2>Configuraci�n de Comprobantes</h2>
      <p class="config-comprobantes-desc">
        Configure series independientes para Factura de Venta y Remisi�n con prefijos y consecutivos separados.
      </p>
      <div id="cfg-feedback" style="min-height:24px;font-weight:600"></div>
      ${_renderRows(configs)}
    </div>
  `;

  const feedback = container.querySelector('#cfg-feedback');
  const saveButtons = container.querySelectorAll('[data-save-tipo]');

  saveButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tipo = btn.getAttribute('data-save-tipo');
      const prefijo = container.querySelector(`#prefijo-${tipo}`)?.value ?? '';
      const numero = Number(container.querySelector(`#numero-${tipo}`)?.value ?? 0);

      try {
        const result = await handleSaveComprobanteConfig({
          tipo,
          prefijo,
          numero_inicial: numero,
        });
        feedback.style.color = '#166534';
        feedback.textContent = result._idempotent_noop
          ? `Sin cambios en ${tipo} (idempotente).`
          : `Configuraci�n ${tipo} guardada: ${result.prefijo}-${new Date().getFullYear()}-NNNN`;
      } catch (error) {
        feedback.style.color = '#991b1b';
        feedback.textContent = `Error: ${error.message}`;
      }
    });
  });
}
