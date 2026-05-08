import { confirmDialog } from '../../utils/confirm-dialog.js';

function getFeedback() {
  return window.__mg_feedback ?? {
    warn: (message) => console.warn(message),
    success: (message) => console.info(message),
    error: (message) => console.error(message),
  };
}

/**
 * renderListaPreciosDetail
 * @param {HTMLElement} container
 * @param {Object} lista
 * @param {Object} options
 */
export function renderListaPreciosDetail(container, lista, options = {}) {
  const { handlers = {}, onEdit = null, onBack = null } = options;

  container.replaceChildren();

  if (!lista) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-state';
    errorDiv.textContent = 'No se especificó la lista de precios.';
    container.appendChild(errorDiv);
    return;
  }

  const detailContainer = document.createElement('div');
  detailContainer.className = 'detail-container mg-premium-flow module-politicas';

  const btnBack = document.createElement('button');
  btnBack.type = 'button';
  btnBack.className = 'btn-back';
  btnBack.id = 'btn-back';
  btnBack.textContent = '← Volver';

  const detailHeader = document.createElement('div');
  detailHeader.className = 'detail-header';
  detailHeader.style.display = 'flex';
  detailHeader.style.justifyContent = 'space-between';
  detailHeader.style.alignItems = 'flex-start';
  detailHeader.style.marginBottom = '2rem';

  const headerInfo = document.createElement('div');

  const detailNombre = document.createElement('h2');
  detailNombre.id = 'detail-nombre';
  detailNombre.textContent = lista.nombre || 'Sin nombre';

  const badgeContainer = document.createElement('div');
  badgeContainer.className = 'badge-container';
  badgeContainer.id = 'detail-estado-badge';

  const badge = document.createElement('span');
  badge.className = `badge ${lista.estado === 'activa' ? 'badge-success' : 'badge-neutral'}`;
  badge.textContent = (lista.estado || 'borrador').toUpperCase();

  badgeContainer.appendChild(badge);
  headerInfo.appendChild(detailNombre);
  headerInfo.appendChild(badgeContainer);

  const detailActions = document.createElement('div');
  detailActions.className = 'detail-actions';
  detailActions.style.display = 'flex';
  detailActions.style.gap = '0.5rem';

  const btnEdit = document.createElement('button');
  btnEdit.type = 'button';
  btnEdit.className = 'btn-secondary';
  btnEdit.id = 'btn-edit';
  btnEdit.textContent = 'Editar';

  detailActions.appendChild(btnEdit);

  detailHeader.appendChild(headerInfo);
  detailHeader.appendChild(detailActions);

  const detailGrid = document.createElement('div');
  detailGrid.className = 'detail-grid';
  detailGrid.style.display = 'grid';
  detailGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
  detailGrid.style.gap = '1.5rem';
  detailGrid.style.marginBottom = '2rem';

  const createInfoBlock = ({ labelText, valueText, valueId = null, valueStyle = null }) => {
    const block = document.createElement('div');
    block.className = 'info-block';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = labelText;

    const value = document.createElement('span');
    value.className = 'value';
    if (valueId) value.id = valueId;
    value.textContent = valueText;

    if (valueStyle) {
      Object.entries(valueStyle).forEach(([key, val]) => {
        value.style[key] = val;
      });
    }

    block.appendChild(label);
    block.appendChild(value);
    return block;
  };

  const vigenciaText = (lista.vigencia_desde || lista.vigencia_hasta)
    ? `${lista.vigencia_desde || '...'} a ${lista.vigencia_hasta || '...'}`
    : 'No definida';

  detailGrid.appendChild(createInfoBlock({
    labelText: 'Forma de Pago',
    valueText: lista.forma_pago || '—',
    valueId: 'detail-pago',
  }));

  detailGrid.appendChild(createInfoBlock({
    labelText: 'Moneda',
    valueText: lista.moneda || '—',
    valueId: 'detail-moneda',
  }));

  detailGrid.appendChild(createInfoBlock({
    labelText: 'Vigencia',
    valueText: vigenciaText,
    valueId: 'detail-vigencia',
  }));

  detailGrid.appendChild(createInfoBlock({
    labelText: 'Identity Key',
    valueText: lista.identity_key || '—',
    valueId: 'detail-ik',
    valueStyle: {
      fontSize: '0.75rem',
      color: '#6b7280',
      wordBreak: 'break-all',
    },
  }));

  const lifecycleActions = document.createElement('div');
  lifecycleActions.className = 'lifecycle-actions';
  lifecycleActions.style.borderTop = '1px solid #e5e7eb';
  lifecycleActions.style.paddingTop = '1.5rem';
  lifecycleActions.style.display = 'flex';
  lifecycleActions.style.gap = '1rem';
  lifecycleActions.style.flexWrap = 'wrap';

  const btnActivate = document.createElement('button');
  btnActivate.type = 'button';
  btnActivate.className = 'btn-outline btn-success';
  btnActivate.id = 'btn-activate';
  btnActivate.textContent = 'Activar';

  const btnSuspend = document.createElement('button');
  btnSuspend.type = 'button';
  btnSuspend.className = 'btn-outline btn-warning';
  btnSuspend.id = 'btn-suspend';
  btnSuspend.textContent = 'Suspender';

  const btnCancelLista = document.createElement('button');
  btnCancelLista.type = 'button';
  btnCancelLista.className = 'btn-outline btn-error';
  btnCancelLista.id = 'btn-cancel-lista';
  btnCancelLista.textContent = 'Cancelar Lista';

  lifecycleActions.appendChild(btnActivate);
  lifecycleActions.appendChild(btnSuspend);
  lifecycleActions.appendChild(btnCancelLista);

  detailContainer.appendChild(btnBack);
  detailContainer.appendChild(detailHeader);
  detailContainer.appendChild(detailGrid);
  detailContainer.appendChild(lifecycleActions);

  container.appendChild(detailContainer);

  btnBack.addEventListener('click', () => {
    if (onBack) onBack();
  });

  btnEdit.addEventListener('click', () => {
    if (onEdit) onEdit(lista);
  });

  const runAction = async (actionName, handlerName, successMsg, confirmMsg) => {
    if (!handlers[handlerName]) {
      getFeedback().warn(`Acción ${actionName} no disponible: handler faltante.`);
      return;
    }

    const confirmed = await confirmDialog(confirmMsg);
    if (!confirmed) return;

    try {
      await handlers[handlerName](lista.id);
      getFeedback().success(successMsg);
      if (onBack) onBack();
    } catch (err) {
      getFeedback().error(err.message || `Error al ${actionName} la lista.`);
    }
  };

  btnActivate.addEventListener('click', () => {
    runAction(
      'activar',
      'activateListaPrecios',
      'Lista de precios activada.',
      '¿Confirmar activación de la lista?'
    );
  });

  btnSuspend.addEventListener('click', () => {
    runAction(
      'suspender',
      'suspendListaPrecios',
      'Lista de precios suspendida.',
      '¿Desea suspender esta lista temporalmente?'
    );
  });

  btnCancelLista.addEventListener('click', () => {
    runAction(
      'cancelar',
      'cancelListaPrecios',
      'Lista de precios cancelada.',
      '¿ESTÁ SEGURO DE CANCELAR LA LISTA?\nEsta acción no se puede deshacer.'
    );
  });
}