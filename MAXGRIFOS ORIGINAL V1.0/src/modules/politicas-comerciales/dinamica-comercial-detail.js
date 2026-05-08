import { confirmDialog } from '../../utils/confirm-dialog.js';

function getFeedback() {
  return window.__mg_feedback ?? {
    warn: (message) => console.warn(message),
    success: (message) => console.info(message),
    error: (message) => console.error(message),
  };
}

/**
 * renderDinamicaComercialDetail
 * @param {HTMLElement} container 
 * @param {Object} dinamica 
 * @param {Object} options 
 */
export function renderDinamicaComercialDetail(container, dinamica, options = {}) {
  const { handlers = {}, onEdit = null, onBack = null } = options;

  if (!dinamica) {
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-state';
    errorMsg.textContent = 'No se especificó la dinámica comercial.';
    container.replaceChildren(errorMsg);
    return;
  }

  const fragment = document.createDocumentFragment();
  const mainDiv = document.createElement('div');
  mainDiv.className = 'detail-container mg-premium-flow module-politicas';

  const btnBack = document.createElement('button');
  btnBack.type = 'button';
  btnBack.className = 'btn-back';
  btnBack.id = 'btn-back';
  btnBack.textContent = '← Volver';
  btnBack.addEventListener('click', () => {
    if (onBack) onBack();
  });
  mainDiv.appendChild(btnBack);

  const header = document.createElement('div');
  header.className = 'detail-header';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'flex-start';
  header.style.marginBottom = '2rem';

  const infoTitle = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.id = 'detail-nombre';
  h2.textContent = dinamica.nombre || 'Sin nombre';
  infoTitle.appendChild(h2);

  const badgeContainer = document.createElement('div');
  badgeContainer.className = 'badge-container';
  badgeContainer.id = 'detail-estado-badge';
  const badge = document.createElement('span');
  const badgeType = dinamica.estado === 'activa' ? 'badge-success' : 'badge-neutral';
  badge.className = `badge ${badgeType}`;
  badge.textContent = (dinamica.estado || 'borrador').toUpperCase();
  badgeContainer.appendChild(badge);
  infoTitle.appendChild(badgeContainer);

  header.appendChild(infoTitle);

  const detailActions = document.createElement('div');
  detailActions.className = 'detail-actions';
  const btnEdit = document.createElement('button');
  btnEdit.type = 'button';
  btnEdit.className = 'btn-secondary';
  btnEdit.id = 'btn-edit';
  btnEdit.textContent = 'Editar';
  btnEdit.addEventListener('click', () => {
    if (onEdit) onEdit(dinamica);
  });
  detailActions.appendChild(btnEdit);
  header.appendChild(detailActions);

  mainDiv.appendChild(header);

  const detailGrid = document.createElement('div');
  detailGrid.className = 'detail-grid';
  detailGrid.style.display = 'grid';
  detailGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
  detailGrid.style.gap = '1.5rem';
  detailGrid.style.marginBottom = '2rem';

  const createInfoBlock = (label, value, id) => {
    const block = document.createElement('div');
    block.className = 'info-block';
    const lblSpan = document.createElement('span');
    lblSpan.className = 'label';
    lblSpan.textContent = label;
    const valSpan = document.createElement('span');
    valSpan.className = 'value';
    valSpan.id = id;
    valSpan.textContent = value;
    block.appendChild(lblSpan);
    block.appendChild(valSpan);
    return block;
  };

  const montos = [];
  if (dinamica.valor !== null && dinamica.valor !== undefined) montos.push(`$${dinamica.valor}`);
  if (dinamica.porcentaje !== null && dinamica.porcentaje !== undefined) montos.push(`${dinamica.porcentaje}%`);
  const montoText = montos.length > 0 ? montos.join(' + ') : '—';

  const vigenciaText = (dinamica.vigencia_desde || dinamica.vigencia_hasta) 
    ? `${dinamica.vigencia_desde || '...'} a ${dinamica.vigencia_hasta || '...'}`
    : 'No definida';

  detailGrid.appendChild(createInfoBlock('Tipo', (dinamica.tipo || '—').toUpperCase(), 'detail-tipo'));
  detailGrid.appendChild(createInfoBlock('Forma de Pago', dinamica.forma_pago || 'GLOBAL', 'detail-pago'));
  detailGrid.appendChild(createInfoBlock('Valor / %', montoText, 'detail-monto'));
  detailGrid.appendChild(createInfoBlock('Vigencia', vigenciaText, 'detail-vigencia'));

  mainDiv.appendChild(detailGrid);

  const metadataSec = document.createElement('div');
  metadataSec.className = 'metadata-section';
  metadataSec.style.marginBottom = '2rem';
  const metaBlock = createInfoBlock('Identity Key', dinamica.identity_key || '—', 'detail-ik');
  metaBlock.querySelector('.value').style.fontSize = '0.75rem';
  metaBlock.querySelector('.value').style.color = '#6b7280';
  metadataSec.appendChild(metaBlock);
  mainDiv.appendChild(metadataSec);

  const lifecycleActions = document.createElement('div');
  lifecycleActions.className = 'lifecycle-actions';
  lifecycleActions.style.borderTop = '1px solid #e5e7eb';
  lifecycleActions.style.paddingTop = '1.5rem';
  lifecycleActions.style.display = 'flex';
  lifecycleActions.style.gap = '1rem';
  lifecycleActions.style.flexWrap = 'wrap';

  const performAction = async (actionLabel, handlerName, successMsg, confirmMsg) => {
    if (!handlers[handlerName]) {
      getFeedback().warn(`Acción ${actionLabel} no disponible.`);
      return;
    }
    const confirmed = await confirmDialog(confirmMsg);
    if (!confirmed) return;
    try {
      await handlers[handlerName](dinamica.id);
      getFeedback().success(successMsg);
      if (onBack) onBack();
    } catch (err) {
      getFeedback().error(err.message || `Error al ${actionLabel} la dinámica.`);
    }
  };

  const btnActivate = document.createElement('button');
  btnActivate.type = 'button';
  btnActivate.className = 'btn-outline btn-success';
  btnActivate.id = 'btn-activate';
  btnActivate.textContent = 'Activar';
  btnActivate.addEventListener('click', () => {
    performAction('activar', 'activateDinamicaComercial', 'Dinámica comercial activada.', '¿Confirmar activación de esta dinámica?');
  });

  const btnSuspend = document.createElement('button');
  btnSuspend.type = 'button';
  btnSuspend.className = 'btn-outline btn-warning';
  btnSuspend.id = 'btn-suspend';
  btnSuspend.textContent = 'Suspender';
  btnSuspend.addEventListener('click', () => {
    performAction('suspender', 'suspendDinamicaComercial', 'Dinámica comercial suspendida.', '¿Desea suspender esta dinámica temporalmente?');
  });

  lifecycleActions.appendChild(btnActivate);
  lifecycleActions.appendChild(btnSuspend);
  mainDiv.appendChild(lifecycleActions);

  fragment.appendChild(mainDiv);
  container.replaceChildren(fragment);
}
