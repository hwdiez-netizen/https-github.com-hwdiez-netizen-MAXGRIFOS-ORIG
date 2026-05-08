import { confirmDialog } from '../../utils/confirm-dialog.js';

function getFeedback() {
  return window.__mg_feedback ?? {
    warn: (message) => console.warn(message),
    success: (message) => console.info(message),
    error: (message) => console.error(message),
  };
}

/**
 * renderDinamicaComercialForm
 * @param {HTMLElement} container 
 * @param {Object} options 
 */
export function renderDinamicaComercialForm(container, options = {}) {
  const { 
    mode = 'create', 
    dinamica = null, 
    handlers = {}, 
    onSaved = null, 
    onCancel = null 
  } = options;

  const isEdit = mode === 'edit' && !!dinamica;

  const fragment = document.createDocumentFragment();

  const mainDiv = document.createElement('div');
  mainDiv.className = 'form-container mg-mobile-form-safe mg-premium-flow module-politicas';

  const btnBack = document.createElement('button');
  btnBack.type = 'button';
  btnBack.className = 'btn-back';
  btnBack.id = 'btn-back';
  btnBack.textContent = '← Volver';
  mainDiv.appendChild(btnBack);

  const h2 = document.createElement('h2');
  h2.textContent = isEdit ? 'Editar Dinámica Comercial' : 'Nueva Dinámica Comercial';
  mainDiv.appendChild(h2);

  const form = document.createElement('form');
  form.id = 'dinamica-form';
  form.noValidate = true;

  const createFieldGroup = (labelText, inputElement) => {
    const group = document.createElement('div');
    group.className = 'field-group';
    const label = document.createElement('label');
    label.setAttribute('for', inputElement.id);
    label.textContent = labelText;
    group.appendChild(label);
    group.appendChild(inputElement);
    return group;
  };

  const createFormRow = (children) => {
    const row = document.createElement('div');
    row.className = 'form-row';
    children.forEach(child => {
      child.style.flex = '1';
      row.appendChild(child);
    });
    return row;
  };

  // Nombre
  const nombreInput = document.createElement('input');
  nombreInput.type = 'text';
  nombreInput.id = 'nombre';
  nombreInput.name = 'nombre';
  nombreInput.autocomplete = 'off';
  nombreInput.required = true;
  form.appendChild(createFieldGroup('Nombre de la dinámica', nombreInput));

  // Tipo & Estado row
  const tipoSelect = document.createElement('select');
  tipoSelect.id = 'tipo';
  tipoSelect.name = 'tipo';
  tipoSelect.required = true;
  ['descuento', 'recargo', 'promocion', 'condicion'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
    tipoSelect.appendChild(opt);
  });

  const estadoSelect = document.createElement('select');
  estadoSelect.id = 'estado';
  estadoSelect.name = 'estado';
  estadoSelect.required = true;
  ['borrador', 'programada', 'activa', 'suspendida', 'cancelada'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
    estadoSelect.appendChild(opt);
  });

  form.appendChild(createFormRow([
    createFieldGroup('Tipo', tipoSelect),
    createFieldGroup('Estado', estadoSelect)
  ]));

  // Forma Pago
  const formaPagoSelect = document.createElement('select');
  formaPagoSelect.id = 'forma_pago';
  formaPagoSelect.name = 'forma_pago';
  const optGlobal = document.createElement('option');
  optGlobal.value = '';
  optGlobal.textContent = '-- Global / Todas --';
  formaPagoSelect.appendChild(optGlobal);
  ['CONTADO', 'CREDITO', 'B2B'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    formaPagoSelect.appendChild(opt);
  });
  form.appendChild(createFieldGroup('Forma de Pago (Opcional)', formaPagoSelect));

  // Valor & Porcentaje row
  const valorInput = document.createElement('input');
  valorInput.type = 'number';
  valorInput.id = 'valor';
  valorInput.name = 'valor';
  valorInput.step = '0.01';
  valorInput.min = '0';

  const porcentajeInput = document.createElement('input');
  porcentajeInput.type = 'number';
  porcentajeInput.id = 'porcentaje';
  porcentajeInput.name = 'porcentaje';
  porcentajeInput.step = '0.01';
  porcentajeInput.min = '0';
  porcentajeInput.max = '100';

  form.appendChild(createFormRow([
    createFieldGroup('Valor Fijo', valorInput),
    createFieldGroup('Porcentaje (%)', porcentajeInput)
  ]));

  // Vigencias row
  const desdeInput = document.createElement('input');
  desdeInput.type = 'date';
  desdeInput.id = 'vigencia_desde';
  desdeInput.name = 'vigencia_desde';

  const hastaInput = document.createElement('input');
  hastaInput.type = 'date';
  hastaInput.id = 'vigencia_hasta';
  hastaInput.name = 'vigencia_hasta';

  form.appendChild(createFormRow([
    createFieldGroup('Vigencia Desde', desdeInput),
    createFieldGroup('Vigencia Hasta', hastaInput)
  ]));

  // Actions
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
  submitBtn.textContent = isEdit ? 'Actualizar Dinámica' : 'Guardar Dinámica';

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button';
  btnCancel.className = 'btn-cancel';
  btnCancel.id = 'btn-cancel';
  btnCancel.style.flex = '1';
  btnCancel.textContent = 'Cancelar';

  formActions.appendChild(submitBtn);
  formActions.appendChild(btnCancel);
  form.appendChild(formActions);

  mainDiv.appendChild(form);
  fragment.appendChild(mainDiv);

  container.replaceChildren(fragment);

  if (isEdit) {
    nombreInput.value = dinamica.nombre ?? '';
    tipoSelect.value = dinamica.tipo ?? 'descuento';
    estadoSelect.value = dinamica.estado ?? 'borrador';
    formaPagoSelect.value = dinamica.forma_pago ?? '';
    valorInput.value = dinamica.valor ?? '';
    porcentajeInput.value = dinamica.porcentaje ?? '';
    desdeInput.value = dinamica.vigencia_desde ?? '';
    hastaInput.value = dinamica.vigencia_hasta ?? '';
  }

  container.querySelector('#btn-back')?.addEventListener('click', () => {
    if (onCancel) onCancel();
  });

  container.querySelector('#btn-cancel')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog('¿Cancelar la edición?\nSe perderán los datos no guardados.');
    if (confirmed && onCancel) onCancel();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre = nombreInput.value.trim();
    const tipo = tipoSelect.value;
    const estado = estadoSelect.value;
    const forma_pago = formaPagoSelect.value;
    const valor = valorInput.value ? Number(valorInput.value) : null;
    const porcentaje = porcentajeInput.value ? Number(porcentajeInput.value) : null;
    const vigencia_desde = desdeInput.value;
    const vigencia_hasta = hastaInput.value;

    // Validations
    if (!nombre) {
      getFeedback().warn('El nombre de la dinámica es obligatorio.');
      return;
    }

    if (porcentaje !== null && (porcentaje < 0 || porcentaje > 100)) {
      getFeedback().warn('El porcentaje debe estar entre 0 y 100.');
      return;
    }

    if (vigencia_desde && vigencia_hasta && vigencia_hasta < vigencia_desde) {
      getFeedback().warn('La fecha de fin no puede ser menor a la fecha de inicio.');
      return;
    }

    const normalizedNombre = nombre.toUpperCase().replace(/\s+/g, '_');
    const paymentSuffix = forma_pago || 'GLOBAL';
    const identity_key = isEdit ? dinamica.identity_key : `DINAMICA:${normalizedNombre}:${tipo}:${paymentSuffix}`;
    const _idempotency_key = isEdit ? `DINAMICA:${dinamica.id}:UPDATE` : `DINAMICA:${identity_key}:CREATE`;

    const payload = {
      nombre,
      tipo,
      estado,
      forma_pago: forma_pago || null,
      valor,
      porcentaje,
      vigencia_desde,
      vigencia_hasta,
      identity_key,
      _idempotency_key
    };

    const submitBtn = container.querySelector('#btn-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    try {
      if (isEdit) {
        if (!handlers.updateDinamicaComercial) throw new Error('Handler updateDinamicaComercial no disponible.');
        await handlers.updateDinamicaComercial(dinamica.id, payload);
        getFeedback().success('Dinámica actualizada correctamente.');
      } else {
        if (!handlers.createDinamicaComercial) throw new Error('Handler createDinamicaComercial no disponible.');
        await handlers.createDinamicaComercial(payload);
        getFeedback().success('Dinámica creada correctamente.');
      }
      if (onSaved) onSaved();
    } catch (err) {
      getFeedback().error(err.message || 'Falla al guardar dinámica comercial.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Actualizar Dinámica' : 'Guardar Dinámica';
    }
  });
}