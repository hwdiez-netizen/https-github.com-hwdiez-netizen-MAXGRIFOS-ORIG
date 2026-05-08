import { politicasRepository, createPoliticasRepository } from './politicas-repository.js';
import { politicasQueryService, createPoliticasQueryService } from './politicas-query-service.js';
import * as handlersModule from './handlers/index.js';

import { renderListaPreciosList } from './lista-precios-list.js';
import { renderListaPreciosForm } from './lista-precios-form.js';
import { renderListaPreciosDetail } from './lista-precios-detail.js';
import { renderPrecioAssignment } from './precio-assignment.js';
import { renderDinamicaComercialList } from './dinamica-comercial-list.js';
import { renderDinamicaComercialForm } from './dinamica-comercial-form.js';
import { renderDinamicaComercialDetail } from './dinamica-comercial-detail.js';

export * from './lista-precios-list.js';
export * from './lista-precios-form.js';
export * from './lista-precios-detail.js';
export * from './precio-assignment.js';
export * from './dinamica-comercial-list.js';
export * from './dinamica-comercial-form.js';
export * from './dinamica-comercial-detail.js';

/**
 * getFeedback
 * Helper local para feedback si no está disponible el global.
 */
function getFeedback() {
  return window.__mg_feedback ?? {
    warn: (message) => console.warn(message),
    success: (message) => console.info(message),
    error: (message) => console.error(message),
  };
}

/**
 * renderPoliticasComercialesModule
 * Punto de entrada oficial para integrar el módulo al Router/App Shell.
 * Provee un menú interno para navegar entre las funciones del módulo.
 */
export async function renderPoliticasComercialesModule(container, options = {}) {
  const { eventBus, productQuery } = options;

  // Inicializar handlers con dependencias inyectadas
  const handlers = handlersModule.createPoliticasComercialesHandlers({
    eventBus,
    repository: politicasRepository,
    queryService: politicasQueryService
  });

  /**
   * showMainMenu
   * Renderiza el dashboard principal del módulo.
   */
  const showMainMenu = () => {
    const fragment = document.createDocumentFragment();
    const mainDiv = document.createElement('div');
    mainDiv.className = 'module-politicas mg-premium-flow';
    mainDiv.style.padding = '2rem';

    const header = document.createElement('div');
    header.style.marginBottom = '2.5rem';
    const h2 = document.createElement('h2');
    h2.textContent = 'Políticas Comerciales';
    header.appendChild(h2);
    mainDiv.appendChild(header);

    const menuGrid = document.createElement('div');
    menuGrid.className = 'mg-grid-layout';
    menuGrid.style.display = 'grid';
    menuGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
    menuGrid.style.gap = '1.5rem';

    const createMenuCard = (title, desc, onClick) => {
      const card = document.createElement('div');
      card.className = 'mg-card clickable-card';
      card.style.cursor = 'pointer';
      card.style.padding = '1.5rem';
      card.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
      
      const h3 = document.createElement('h3');
      h3.textContent = title;
      h3.style.marginBottom = '0.5rem';
      card.appendChild(h3);
      
      const p = document.createElement('p');
      p.textContent = desc;
      p.style.color = '#6b7280';
      p.style.fontSize = '0.875rem';
      card.appendChild(p);
      
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = '';
      });

      card.addEventListener('click', onClick);
      return card;
    };

    menuGrid.appendChild(createMenuCard('Listas de Precios', 'Catálogos de precios maestros y tarifas base por canal.', () => {
      showListaPreciosFlow();
    }));

    menuGrid.appendChild(createMenuCard('Asignar Precios', 'Vincular productos a listas de precios de forma masiva.', () => {
      showPriceAssignmentFlow();
    }));

    menuGrid.appendChild(createMenuCard('Dinámicas Comerciales', 'Descuentos, recargos y promociones temporales.', () => {
      showDinamicasFlow();
    }));

    mainDiv.appendChild(menuGrid);
    fragment.appendChild(mainDiv);
    container.replaceChildren(fragment);
  };

  // --- FLUJO LISTAS DE PRECIOS ---
  const showListaPreciosFlow = () => {
    const listOptions = {
      queryService: politicasQueryService,
      handlers,
      onCreate: () => showListaPreciosForm('create'),
      onEdit: (lp) => showListaPreciosForm('edit', lp),
      onView: (lp) => showListaPreciosDetail(lp),
      onBack: () => showMainMenu()
    };
    renderListaPreciosList(container, listOptions);
  };

  const showListaPreciosForm = (mode, lp = null) => {
    renderListaPreciosForm(container, {
      mode,
      lista: lp,
      handlers,
      onSaved: () => showListaPreciosFlow(),
      onCancel: () => showListaPreciosFlow()
    });
  };

  const showListaPreciosDetail = (lp) => {
    renderListaPreciosDetail(container, {
      lista: lp,
      handlers,
      onEdit: (data) => showListaPreciosForm('edit', data),
      onBack: () => showListaPreciosFlow()
    });
  };

  // --- FLUJO ASIGNACIÓN DE PRECIOS ---
  const showPriceAssignmentFlow = () => {
    if (!productQuery) {
      getFeedback().error('productQuery requerido para asignación de precios.');
      return;
    }
    renderPrecioAssignment(container, {
      handlers,
      queryService: politicasQueryService,
      productQuery,
      onCancel: () => showMainMenu()
    });
  };

  // --- FLUJO DINÁMICAS COMERCIALES ---
  const showDinamicasFlow = () => {
    const listOptions = {
      queryService: politicasQueryService,
      handlers,
      onCreate: () => showDinamicasForm('create'),
      onEdit: (dinamica) => showDinamicasForm('edit', dinamica),
      onView: (dinamica) => showDinamicasDetail(dinamica),
      onBack: () => showMainMenu()
    };
    renderDinamicaComercialList(container, listOptions);
  };

  const showDinamicasForm = (mode, dinamica = null) => {
    renderDinamicaComercialForm(container, {
      mode,
      dinamica,
      handlers,
      onSaved: () => showDinamicasFlow(),
      onCancel: () => showDinamicasFlow()
    });
  };

  const showDinamicasDetail = (dinamica) => {
    renderDinamicaComercialDetail(container, {
      dinamica,
      handlers,
      onEdit: (data) => showDinamicasForm('edit', data),
      onBack: () => showDinamicasFlow()
    });
  };

  // Iniciar en el menú principal
  showMainMenu();
}

/**
 * Exportaciones de componentes y servicios.
 */
export {
  politicasRepository as repository,
  politicasQueryService as queryService,
  handlersModule as handlers,
  createPoliticasRepository,
  createPoliticasQueryService
};

export default {
  repository: politicasRepository,
  queryService: politicasQueryService,
  handlers: handlersModule,
  renderPoliticasComercialesModule
};
