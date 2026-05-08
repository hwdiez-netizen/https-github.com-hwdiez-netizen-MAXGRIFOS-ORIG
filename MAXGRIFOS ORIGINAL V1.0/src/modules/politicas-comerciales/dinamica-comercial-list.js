function getFeedback() {
  return window.__mg_feedback ?? {
    warn: (message) => console.warn(message),
    success: (message) => console.info(message),
    error: (message) => console.error(message),
  };
}

/**
 * renderDinamicaComercialList
 * @param {HTMLElement} container 
 * @param {Object} options 
 */
export async function renderDinamicaComercialList(container, options = {}) {
  const { 
    queryService, 
    onEdit, 
    onView, 
    onCreate 
  } = options;

  if (!queryService) {
    getFeedback().error('queryService es requerido para el listado de dinámicas.');
    return;
  }

  const fragment = document.createDocumentFragment();
  const mainDiv = document.createElement('div');
  mainDiv.className = 'list-container mg-premium-flow module-politicas';

  const header = document.createElement('div');
  header.className = 'list-header';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '2rem';

  const h2 = document.createElement('h2');
  h2.textContent = 'Dinámicas Comerciales';
  header.appendChild(h2);

  const btnCreate = document.createElement('button');
  btnCreate.type = 'button';
  btnCreate.className = 'btn-primary';
  btnCreate.id = 'btn-create-dinamica';
  btnCreate.textContent = 'Nueva Dinámica';
  btnCreate.addEventListener('click', () => {
    if (onCreate) onCreate();
  });
  header.appendChild(btnCreate);

  mainDiv.appendChild(header);

  const grid = document.createElement('div');
  grid.id = 'dinamicas-grid';
  grid.className = 'mg-grid-layout';

  const loading = document.createElement('div');
  loading.className = 'loading-state';
  loading.textContent = 'Cargando dinámicas...';
  grid.appendChild(loading);

  mainDiv.appendChild(grid);
  fragment.appendChild(mainDiv);
  container.replaceChildren(fragment);

  try {
    const data = await queryService.getDinamicasComerciales();
    const list = Array.isArray(data) ? data : [];

    if (list.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.style.gridColumn = '1/-1';
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.padding = '4rem 2rem';
      emptyDiv.style.background = '#f9fafb';
      emptyDiv.style.borderRadius = '1rem';
      const p = document.createElement('p');
      p.textContent = 'No hay dinámicas comerciales registradas.';
      emptyDiv.appendChild(p);
      grid.replaceChildren(emptyDiv);
      return;
    }

    grid.textContent = '';
    list.forEach(dinamica => {
      const card = document.createElement('div');
      card.className = 'mg-card dinamica-card';
      card.dataset.id = dinamica.id;

      const title = document.createElement('h3');
      title.textContent = dinamica.nombre || 'Sin nombre';
      
      const details = document.createElement('div');
      details.className = 'card-details';

      const createRow = (label, value, extraClass = '') => {
        const row = document.createElement('div');
        row.className = 'detail-row';
        const lbl = document.createElement('span');
        lbl.className = 'label';
        lbl.textContent = label;
        const val = document.createElement('span');
        val.className = `value ${extraClass}`;
        val.textContent = value;
        row.appendChild(lbl);
        row.appendChild(val);
        return row;
      };

      const badgeClass = dinamica.estado === 'activa' ? 'badge-success' : 'badge-neutral';

      details.appendChild(createRow('Tipo:', dinamica.tipo || '—'));
      details.appendChild(createRow('Pago:', dinamica.forma_pago || 'Global'));
      details.appendChild(createRow('Estado:', dinamica.estado || 'borrador', `badge ${badgeClass}`));

      card.appendChild(title);
      card.appendChild(details);

      // Actions overlay
      const overlay = document.createElement('div');
      overlay.className = 'card-actions-overlay hidden';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-secondary btn-sm';
      editBtn.textContent = 'Editar';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onEdit) onEdit(dinamica);
      });
      overlay.appendChild(editBtn);
      card.appendChild(overlay);

      // NIS Double Tap Logic (No Date approach)
      let tapCount = 0;
      let tapTimer = null;

      card.addEventListener('click', () => {
        tapCount += 1;

        if (tapCount === 1) {
          tapTimer = setTimeout(() => {
            if (tapCount === 1 && onView) {
              onView(dinamica);
            }
            tapCount = 0;
          }, 300);
          return;
        }

        if (tapCount === 2) {
          clearTimeout(tapTimer);
          tapCount = 0;
          overlay.classList.remove('hidden');
          container.querySelectorAll('.card-actions-overlay').forEach(ov => {
            if (ov !== overlay) ov.classList.add('hidden');
          });
        }
      });

      grid.appendChild(card);
    });

  } catch (err) {
    const errDiv = document.createElement('div');
    errDiv.className = 'error-state';
    errDiv.textContent = `Error: ${err.message || 'Error al cargar dinámicas'}`;
    grid.replaceChildren(errDiv);
    getFeedback().error('Falla al cargar listado de dinámicas comerciales.');
  }
}
