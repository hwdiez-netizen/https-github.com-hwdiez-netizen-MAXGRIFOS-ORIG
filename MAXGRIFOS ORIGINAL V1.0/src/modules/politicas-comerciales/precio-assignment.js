import { confirmDialog } from '../../utils/confirm-dialog.js';

function getFeedback() {
  return window.__mg_feedback ?? {
    warn: (message) => console.warn(message),
    success: (message) => console.info(message),
    error: (message) => console.error(message),
  };
}

/**
 * renderPrecioAssignment
 * @param {HTMLElement} container
 * @param {Object} options
 */
export async function renderPrecioAssignment(container, options = {}) {
  const {
    queryService,
    handlers,
    productQuery,
    listaId = null,
    onSaved = null,
    onCancel = null,
  } = options;

  if (!queryService || !handlers || !productQuery) {
    getFeedback().error('Dependencias requeridas (queryService, handlers, productQuery) no encontradas.');
    return;
  }

  container.replaceChildren();

  const mainContainer = document.createElement('div');
  mainContainer.className = 'precio-assignment-container mg-premium-flow module-politicas';

  const headerSection = document.createElement('div');
  headerSection.className = 'header-section';
  headerSection.style.marginBottom = '2rem';

  const btnBack = document.createElement('button');
  btnBack.type = 'button';
  btnBack.className = 'btn-back';
  btnBack.id = 'btn-back';
  btnBack.textContent = '← Volver';

  const title = document.createElement('h2');
  title.style.marginTop = '1rem';
  title.textContent = 'Asignación de Precios por Producto';

  headerSection.appendChild(btnBack);
  headerSection.appendChild(title);

  const selectionSection = document.createElement('div');
  selectionSection.className = 'selection-section mg-card';
  selectionSection.style.marginBottom = '1.5rem';
  selectionSection.style.padding = '1.5rem';

  const fieldGroup = document.createElement('div');
  fieldGroup.className = 'field-group';

  const selectLabel = document.createElement('label');
  selectLabel.htmlFor = 'select-lista';
  selectLabel.textContent = 'Lista de Precios Primaria';

  const selectLista = document.createElement('select');
  selectLista.id = 'select-lista';
  selectLista.name = 'lista_id';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Seleccione una lista activa';
  selectLista.appendChild(defaultOption);

  fieldGroup.appendChild(selectLabel);
  fieldGroup.appendChild(selectLista);
  selectionSection.appendChild(fieldGroup);

  const productsSection = document.createElement('div');
  productsSection.className = 'products-section mg-card';

  const tableResponsive = document.createElement('div');
  tableResponsive.className = 'table-responsive';

  const table = document.createElement('table');
  table.className = 'mg-table';
  table.id = 'table-products';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const createHeaderCell = (text, width = null) => {
    const th = document.createElement('th');
    th.textContent = text;
    if (width) th.style.width = width;
    return th;
  };

  headerRow.appendChild(createHeaderCell('Producto / SKU'));
  headerRow.appendChild(createHeaderCell('Costo', '120px'));
  headerRow.appendChild(createHeaderCell('Precio Venta', '150px'));
  headerRow.appendChild(createHeaderCell('Margen', '100px'));

  thead.appendChild(headerRow);

  const tbodyProducts = document.createElement('tbody');
  tbodyProducts.id = 'tbody-products';

  const loadingRow = document.createElement('tr');
  const loadingCell = document.createElement('td');
  loadingCell.colSpan = 4;
  loadingCell.className = 'text-center';
  loadingCell.style.padding = '2rem';
  loadingCell.textContent = 'Cargando productos...';
  loadingRow.appendChild(loadingCell);
  tbodyProducts.appendChild(loadingRow);

  table.appendChild(thead);
  table.appendChild(tbodyProducts);
  tableResponsive.appendChild(table);
  productsSection.appendChild(tableResponsive);

  const actionsSection = document.createElement('div');
  actionsSection.className = 'actions-section';
  actionsSection.style.marginTop = '2rem';
  actionsSection.style.display = 'flex';
  actionsSection.style.gap = '1rem';

  const btnSave = document.createElement('button');
  btnSave.type = 'button';
  btnSave.className = 'btn-primary';
  btnSave.id = 'btn-save-prices';
  btnSave.style.flex = '1';
  btnSave.textContent = 'Guardar Precios';

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button';
  btnCancel.className = 'btn-cancel';
  btnCancel.id = 'btn-cancel-prices';
  btnCancel.style.flex = '1';
  btnCancel.textContent = 'Cancelar';

  actionsSection.appendChild(btnSave);
  actionsSection.appendChild(btnCancel);

  mainContainer.appendChild(headerSection);
  mainContainer.appendChild(selectionSection);
  mainContainer.appendChild(productsSection);
  mainContainer.appendChild(actionsSection);

  container.appendChild(mainContainer);

  const renderTableMessage = (message, className = 'text-center') => {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = className;
    td.style.padding = '2rem';
    td.textContent = message;
    tr.appendChild(td);
    tbodyProducts.replaceChildren(tr);
  };

  try {
    const listas = await queryService.getListasPrecios();
    const activas = (listas || []).filter((l) => l.estado === 'activa');

    if (activas.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No hay listas activas';
      option.disabled = true;
      selectLista.appendChild(option);
      getFeedback().warn('No hay listas de precios activas para asignar precios.');
    } else {
      activas.forEach((l) => {
        const option = document.createElement('option');
        option.value = l.id;
        option.textContent = `${l.nombre} (${l.moneda})`;
        if (listaId && l.id === listaId) option.selected = true;
        selectLista.appendChild(option);
      });
    }
  } catch (err) {
    getFeedback().error('Error al cargar listas de precios.');
  }

  let products = [];

  try {
    let result;

    if (typeof productQuery.getProductos === 'function') {
      result = await productQuery.getProductos();
    } else if (typeof productQuery.getAllProducts === 'function') {
      result = await productQuery.getAllProducts();
    } else {
      getFeedback().error('productQuery compatible requerido para cargar productos.');
      return;
    }

    products = Array.isArray(result) ? result : (result?.items ?? []);

    if (products.length === 0) {
      renderTableMessage('No se encontraron productos activos.');
    } else {
      renderRows(products);
    }
  } catch (err) {
    getFeedback().error('Falla al cargar productos para asignación.');
    renderTableMessage(`Error: ${err.message}`, 'text-center text-error');
  }

  function renderRows(items) {
    tbodyProducts.replaceChildren();

    items.forEach((p) => {
      const tr = document.createElement('tr');
      tr.dataset.productId = p.id;

      const tdInfo = document.createElement('td');

      const divName = document.createElement('div');
      divName.style.fontWeight = '600';
      divName.textContent = p.nombre || 'Sin nombre';

      const divSku = document.createElement('div');
      divSku.style.fontSize = '0.75rem';
      divSku.style.color = '#6b7280';
      divSku.textContent = p.sku || 'SKU: —';

      tdInfo.appendChild(divName);
      tdInfo.appendChild(divSku);

      const tdCosto = document.createElement('td');
      const costoVal = Number(p.costo_vigente_real || p.costo || 0);

      const inputCosto = document.createElement('input');
      inputCosto.type = 'number';
      inputCosto.className = 'mg-input-compact';
      inputCosto.value = costoVal || '';
      inputCosto.step = '0.01';
      tdCosto.appendChild(inputCosto);

      const tdPrecio = document.createElement('td');

      const inputPrecio = document.createElement('input');
      inputPrecio.type = 'number';
      inputPrecio.className = 'mg-input-compact';
      inputPrecio.step = '0.01';
      tdPrecio.appendChild(inputPrecio);

      const tdMargen = document.createElement('td');

      const spanMargen = document.createElement('span');
      spanMargen.className = 'margen-preview';
      spanMargen.textContent = '—';
      tdMargen.appendChild(spanMargen);

      const updateMargin = () => {
        const cost = Number(inputCosto.value) || 0;
        const price = Number(inputPrecio.value) || 0;

        if (price > 0) {
          if (cost > 0) {
            const margin = ((price - cost) / price) * 100;
            if (price <= cost) {
              spanMargen.textContent = 'Inválido';
              spanMargen.style.color = '#ef4444';
            } else {
              spanMargen.textContent = `${margin.toFixed(2)}%`;
              spanMargen.style.color = margin < 10 ? '#f59e0b' : '#10b981';
            }
          } else {
            spanMargen.textContent = '100.00%';
            spanMargen.style.color = '#10b981';
          }
        } else {
          spanMargen.textContent = '—';
          spanMargen.style.color = '';
        }
      };

      inputCosto.addEventListener('input', updateMargin);
      inputPrecio.addEventListener('input', updateMargin);

      tr.appendChild(tdInfo);
      tr.appendChild(tdCosto);
      tr.appendChild(tdPrecio);
      tr.appendChild(tdMargen);

      tbodyProducts.appendChild(tr);
    });
  }

  btnBack.addEventListener('click', () => {
    if (onCancel) onCancel();
  });

  btnCancel.addEventListener('click', async () => {
    const confirmed = await confirmDialog('¿Cancelar asignación?\nSe perderán los precios ingresados.');
    if (confirmed && onCancel) onCancel();
  });

  btnSave.addEventListener('click', async () => {
    const lista_id = selectLista.value;

    if (!lista_id) {
      getFeedback().warn('Debe seleccionar una lista de precios activa.');
      return;
    }

    const items = [];
    const rows = tbodyProducts.querySelectorAll('tr[data-product-id]');

    let hasInvalid = false;

    rows.forEach((row) => {
      const productId = row.dataset.productId;
      const costInput = row.cells[1].querySelector('input');
      const priceInput = row.cells[2].querySelector('input');

      const precio_venta = Number(priceInput.value) || 0;
      const costo = Number(costInput.value) || 0;

      if (precio_venta > 0) {
        if (costo > 0 && precio_venta <= costo) {
          hasInvalid = true;
        }

        items.push({
          lista_id,
          product_id: productId,
          precio_venta,
          costo,
          estado: 'activo',
          identity_key: `PRECIO:${lista_id}:${productId}`,
          _idempotency_key: `PRECIO:${lista_id}:${productId}:UPSERT`,
        });
      }
    });

    if (hasInvalid) {
      getFeedback().warn('Existen productos con precio menor o igual al costo.');
      return;
    }

    if (items.length === 0) {
      getFeedback().warn('Debe ingresar al menos un precio de venta válido.');
      return;
    }

    btnSave.disabled = true;
    btnSave.textContent = 'Guardando...';

    try {
      if (handlers.savePrecioItems) {
        const batchIdentity = items
          .map((item) => item.identity_key)
          .sort()
          .join('|');

        const batchIdempotencyKey = `SAVE:ITEMS:${lista_id}:${batchIdentity}`;

        await handlers.savePrecioItems({
          lista_id,
          items,
          _idempotency_key: batchIdempotencyKey,
        });
      } else {
        for (const item of items) {
          await handlers.assignPrecioItem(item);
        }
      }

      getFeedback().success('Precios asignados correctamente.');
      if (onSaved) onSaved();
    } catch (err) {
      getFeedback().error(err.message || 'Error al guardar asignación de precios.');
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = 'Guardar Precios';
    }
  });
}