function getFeedback() {
  return window.__mg_feedback ?? {
    warn: (message) => console.warn(message),
    success: (message) => console.info(message),
    error: (message) => console.error(message),
  };
}

/**
 * renderListaPreciosList
 * @param {HTMLElement} container 
 * @param {Object} options 
 */
export async function renderListaPreciosList(container, options = {}) {
  const { 
    queryService, 
    handlers, 
    onEdit, 
    onView, 
    onCreate 
  } = options;

  if (!queryService) {
    getFeedback().error('queryService es requerido para el listado de políticas comerciales.');
    return;
  }

  container.replaceChildren();

  const listContainer = document.createElement('div');
  listContainer.className = 'list-container mg-premium-flow module-politicas';

  const listHeader = document.createElement('div');
  listHeader.className = 'list-header';
  listHeader.style.display = 'flex';
  listHeader.style.justifyContent = 'space-between';
  listHeader.style.alignItems = 'center';
  listHeader.style.marginBottom = '2rem';

  const h2 = document.createElement('h2');
  h2.textContent = 'Listas de Precios';

  const btnCreate = document.createElement('button');
  btnCreate.type = 'button';
  btnCreate.className = 'btn-primary';
  btnCreate.id = 'btn-create';
  btnCreate.textContent = 'Nueva Lista';

  listHeader.appendChild(h2);
  listHeader.appendChild(btnCreate);

  const listContent = document.createElement('div');
  listContent.id = 'list-content';
  listContent.className = 'mg-grid-layout';

  const loadingState = document.createElement('div');
  loadingState.className = 'loading-state';
  loadingState.textContent = 'Cargando listas...';
  listContent.appendChild(loadingState);

  listContainer.appendChild(listHeader);
  listContainer.appendChild(listContent);

  container.appendChild(listContainer);

  btnCreate.addEventListener('click', () => {
    if (onCreate) onCreate();
  });

  try {
    const listas = await queryService.getListasPrecios();

    if (!listas || listas.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.style.gridColumn = '1/-1';
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.padding = '4rem 2rem';
      emptyDiv.style.background = '#f9fafb';
      emptyDiv.style.borderRadius = '1rem';
      
      const p = document.createElement('p');
      p.textContent = 'No hay listas de precios registradas.';
      emptyDiv.appendChild(p);

      listContent.replaceChildren(emptyDiv);
      return;
    }

    listContent.replaceChildren();
    listas.forEach(lista => {
      const card = document.createElement('div');
      card.className = 'mg-card lista-precios-card';
      card.dataset.id = lista.id;
      
      const badgeClass = lista.estado === 'activa' ? 'badge-success' : 'badge-neutral';
      
      const title = document.createElement('h3');
      title.textContent = lista.nombre || 'Sin nombre';
      
      const details = document.createElement('div');
      details.className = 'card-details';

      const createDetailRow = (label, value, isBadge = false) => {
        const row = document.createElement('div');
        row.className = 'detail-row';
        
        const labelSpan = document.createElement('span');
        labelSpan.className = 'label';
        labelSpan.textContent = label;
        
        const valueSpan = document.createElement('span');
        valueSpan.className = isBadge ? `badge ${badgeClass}` : 'value';
        valueSpan.textContent = value;
        
        row.appendChild(labelSpan);
        row.appendChild(valueSpan);
        return row;
      };

      details.appendChild(createDetailRow('Pago:', lista.forma_pago || '—'));
      details.appendChild(createDetailRow('Moneda:', lista.moneda || '—'));
      details.appendChild(createDetailRow('Estado:', lista.estado || 'borrador', true));

      card.appendChild(title);
      card.appendChild(details);

      const actionsOverlay = document.createElement('div');
      actionsOverlay.className = 'card-actions-overlay hidden';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-secondary btn-sm';
      editBtn.textContent = 'Editar';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onEdit) onEdit(lista);
      });
      actionsOverlay.appendChild(editBtn);
      card.appendChild(actionsOverlay);

      let tapCount = 0;
      let tapTimer = null;

      card.addEventListener('click', () => {
        tapCount += 1;

        if (tapCount === 1) {
          tapTimer = setTimeout(() => {
            if (tapCount === 1 && onView) onView(lista);
            tapCount = 0;
          }, 300);
          return;
        }

        if (tapCount === 2) {
          clearTimeout(tapTimer);
          tapCount = 0;
          actionsOverlay.classList.remove('hidden');

          container.querySelectorAll('.card-actions-overlay').forEach((ov) => {
            if (ov !== actionsOverlay) ov.classList.add('hidden');
          });
        }
      });

      listContent.appendChild(card);
    });

  } catch (err) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-state';
    errorDiv.textContent = `Error: ${err.message || 'Falla al cargar listado'}`;
    listContent.replaceChildren(errorDiv);
    getFeedback().error('Falla al cargar listado de políticas comerciales.');
  }
}
