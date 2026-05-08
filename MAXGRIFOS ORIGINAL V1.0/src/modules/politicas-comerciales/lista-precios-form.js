import { confirmDialog } from '../../utils/confirm-dialog.js';

function getFeedback() {
  return window.__mg_feedback ?? {
    warn: (message) => console.warn(message),
    success: (message) => console.info(message),
    error: (message) => console.error(message),
  };
}

/**
 * renderListaPreciosForm
 * @param {HTMLElement} container 
 * @param {Object} options 
 */
export function renderListaPreciosForm(container, options = {}) {
  const { 
    mode = 'create', 
    lista = null, 
    handlers = {}, 
    onSaved = null, 
    onCancel = null 
  } = options;

  const isEdit = mode === 'edit' && !!lista;

  // Clear container safely
  container.replaceChildren();

  const formContainer = document.createElement('div');
  formContainer.className = 'form-container mg-mobile-form-safe mg-premium-flow module-politicas';

  const btnBack = document.createElement('button');
  btnBack.type = 'button';
  btnBack.className = 'btn-back';
  btnBack.id = 'btn-back';
  btnBack.textContent = '← Volver';

  const h2 = document.createElement('h2');
  h2.textContent = isEdit ? 'Editar Lista de Precios' : 'Nueva Lista de Precios';

  const form = document.createElement('form');
  form.id = 'lista-precios-form';
  form.noValidate = true;

  // Field Helpers
  const createFieldGroup = ({ labelText, input }) => {
    const group = document.createElement('div');
    group.className = 'field-group';

    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = labelText;

    group.appendChild(label);
    group.appendChild(input);
    return group;
  };

  const createInput = ({ id, name, type = 'text', required = false, autocomplete = null }) => {
    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.name = name;
    input.required = required;
    if (autocomplete) input.autocomplete = autocomplete;
    return input;
  };

  const createSelect = ({ id, name, required = false, options = [] }) => {
    const select = document.createElement('select');
    select.id = id;
    select.name = name;
    select.required = required;

    options.forEach(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });

    return select;
  };

  // Create Fields
  const nombreInput = createInput({
    id: 'nombre',
    name: 'nombre',
    autocomplete: 'off',
    required: true
  });
  const nombreGroup = createFieldGroup({ labelText: 'Nombre de la lista', input: nombreInput });

  const formaPagoSelect = createSelect({
    id: 'forma_pago',
    name: 'forma_pago',
    required: true,
    options: [
      { value: 'CONTADO', label: 'CONTADO' },
      { value: 'CREDITO', label: 'CREDITO' },
      { value: 'B2B', label: 'B2B' }
    ]
  });

  const monedaSelect = createSelect({
    id: 'moneda',
    name: 'moneda',
    required: true,
    options: [
      { value: 'COP', label: 'COP' },
      { value: 'USD', label: 'USD' }
    ]
  });

  const row1 = document.createElement('div');
  row1.className = 'form-row';
  const fpGroup = createFieldGroup({ labelText: 'Forma de Pago', input: formaPagoSelect });
  fpGroup.style.flex = '1';
  const mGroup = createFieldGroup({ labelText: 'Moneda', input: monedaSelect });
  mGroup.style.flex = '1';
  row1.appendChild(fpGroup);
  row1.appendChild(mGroup);

  const estadoSelect = createSelect({
    id: 'estado',
    name: 'estado',
    required: true,
    options: [
      { value: 'borrador', label: 'Borrador' },
      { value: 'activa', label: 'Activa' },
      { value: 'suspendida', label: 'Suspendida' },
      { value: 'cancelada', label: 'Cancelada' }
    ]
  });
  const estadoGroup = createFieldGroup({ labelText: 'Estado', input: estadoSelect });

  const desdeInput = createInput({ id: 'vigencia_desde', name: 'vigencia_desde', type: 'date' });
  const hastaInput = createInput({ id: 'vigencia_hasta', name: 'vigencia_hasta', type: 'date' });

  const row2 = document.createElement('div');
  row2.className = 'form-row';
  const dGroup = createFieldGroup({ labelText: 'Vigencia Desde', input: desdeInput });
  dGroup.style.flex = '1';
  const hGroup = createFieldGroup({ labelText: 'Vigencia Hasta', input: hastaInput });
  hGroup.style.flex = '1';
  row2.appendChild(dGroup);
  row2.appendChild(hGroup);

  // Form Actions
  const formActions = document.createElement('div');
  formActions.className = 'form-actions';
  formActions.style.marginTop = '2rem';
  formActions.style.display = 'flex';
  formActions.style.gap = '1rem';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn-primary';
  submitBtn.id = 'btn-submit';
  submitBtn.style.flex = '1';
  submitBtn.textContent = isEdit ? 'Actualizar Lista' : 'Guardar Lista';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-cancel';
  cancelBtn.id = 'btn-cancel';
  cancelBtn.style.flex = '1';
  cancelBtn.textContent = 'Cancelar';

  formActions.appendChild(submitBtn);
  formActions.appendChild(cancelBtn);

  // Assemble form
  form.appendChild(nombreGroup);
  form.appendChild(row1);
  form.appendChild(estadoGroup);
  form.appendChild(row2);
  form.appendChild(formActions);

  formContainer.appendChild(btnBack);
  formContainer.appendChild(h2);
  formContainer.appendChild(form);

  container.appendChild(formContainer);

  // Load existing data if edit
  if (isEdit) {
    nombreInput.value = lista.nombre ?? '';
    formaPagoSelect.value = lista.forma_pago ?? 'CONTADO';
    monedaSelect.value = lista.moneda ?? 'COP';
    estadoSelect.value = lista.estado ?? 'borrador';
    desdeInput.value = lista.vigencia_desde ?? '';
    hastaInput.value = lista.vigencia_hasta ?? '';
  }

  // Events
  btnBack.addEventListener('click', () => {
    if (onCancel) onCancel();
  });

  cancelBtn.addEventListener('click', async () => {
    const hasChanges = isEdit || nombreInput.value.trim() !== '';
    if (hasChanges) {
      const confirmed = await confirmDialog('¿Cancelar la edición?\nSe perderán los datos no guardados.');
      if (!confirmed) return;
    }
    if (onCancel) onCancel();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre = nombreInput.value.trim();
    const forma_pago = formaPagoSelect.value;
    const moneda = monedaSelect.value;
    const estado = estadoSelect.value;
    const vigencia_desde = desdeInput.value;
    const vigencia_hasta = hastaInput.value;

    if (!nombre) {
      getFeedback().warn('El nombre de la lista es requerido.');
      return;
    }

    const normalizedNombre = nombre.toUpperCase().replace(/\s+/g, '_');
    const identity_key = isEdit ? lista.identity_key : `LISTA:${normalizedNombre}:${forma_pago}:${moneda}`;
    const _idempotency_key = isEdit 
      ? `LISTA:${lista.id}:UPDATE` 
      : `LISTA:${identity_key}:CREATE`;

    const payload = {
      nombre,
      forma_pago,
      moneda,
      estado,
      vigencia_desde,
      vigencia_hasta,
      identity_key,
      _idempotency_key
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    try {
      let result;
      if (isEdit) {
        if (!handlers.updateListaPrecios) {
          throw new Error('Handler updateListaPrecios no inyectado');
        }
        result = await handlers.updateListaPrecios(lista.id, payload);
        getFeedback().success('Lista de precios actualizada correctamente.');
      } else {
        if (!handlers.createListaPrecios) {
          throw new Error('Handler createListaPrecios no inyectado');
        }
        result = await handlers.createListaPrecios(payload);
        getFeedback().success('Lista de precios creada correctamente.');
      }

      if (onSaved) onSaved(result);
    } catch (err) {
      getFeedback().error(err.message || 'Error al procesar la lista de precios.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Actualizar Lista' : 'Guardar Lista';
    }
  });
}
