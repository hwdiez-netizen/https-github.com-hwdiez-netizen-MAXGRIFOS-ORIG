import {
  handleGetComprobantesConfig,
  handleSaveComprobanteConfig,
} from './comprobantes-handlers.js';

async function setupConfigPanel(container) {
  const btnConfig = container.querySelector('#btn-config-billing');
  const panel = container.querySelector('#config-panel');

  btnConfig.addEventListener('click', async () => {
    const tipoActivo = container.querySelector('.bg-blue-600').dataset.type;
    const configs = await handleGetComprobantesConfig();
    const config = configs.find((cfg) => cfg.tipo === tipoActivo);

    panel.innerHTML = `
      <div class="bg-white w-full rounded-t-2xl p-6 shadow-2xl">
        <div class="w-12 h-1 bg-gray-300 rounded mx-auto mb-4"></div>
        <h3 class="text-lg font-bold mb-4">CONFIGURAR: ${config.descripcion}</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-bold text-gray-700">PREFIJO</label>
            <input type="text" id="cfg-prefijo" value="${config.prefijo}" class="w-full border p-3 rounded-lg uppercase">
          </div>
          <div>
            <label class="block text-sm font-bold text-gray-700">SIGUIENTE NÚMERO</label>
            <input type="number" id="cfg-inicio" value="${config.numero_inicial}" class="w-full border p-3 rounded-lg">
          </div>
          <div id="cfg-feedback" style="min-height:24px;font-size:.875rem;font-weight:600;text-align:center;padding:4px 0"></div>
          <button id="btn-save-config" class="w-full bg-black text-white py-4 rounded-xl font-bold">
            GUARDAR CAMBIOS
          </button>
          <button id="btn-close-config" class="w-full text-gray-500 py-2">CANCELAR</button>
        </div>
      </div>
    `;
    panel.classList.remove('hidden');

    const btnSave = panel.querySelector('#btn-save-config');
    btnSave.onclick = async () => {
      const newPrefijo = panel.querySelector('#cfg-prefijo').value.trim().toUpperCase();
      const newInicio = parseInt(panel.querySelector('#cfg-inicio').value);

      const feedback = panel.querySelector('#cfg-feedback');
      if (!newPrefijo || isNaN(newInicio)) {
        feedback.style.color = '#b91c1c';
        feedback.textContent = '❌ Completa todos los campos correctamente.';
        return;
      }

      config.prefijo = newPrefijo;
      config.numero_inicial = newInicio;
      await handleSaveComprobanteConfig(config);
      feedback.style.color = '#15803d';
      feedback.textContent = '✅ Configuración actualizada';
      setTimeout(() => panel.classList.add('hidden'), 1200);
    };

    panel.querySelector('#btn-close-config').onclick = () => panel.classList.add('hidden');
  });
}