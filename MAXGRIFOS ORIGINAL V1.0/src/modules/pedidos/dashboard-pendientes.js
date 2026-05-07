function bindEvents(container) {
  container.querySelectorAll('[data-pedido-id]').forEach(card => {
    card.addEventListener('click', () => {
      const pedidoId = card.dataset.pedidoId;
      const fase = card.dataset.fase;

      // Lógica de ruteo basada en el estado de la Saga
      let route = '';
      switch (fase) {
        case 'creacion':
        case 'standby': // Si se pausó antes de terminar la creación
          route = 'pedido-form';
          break;
        case 'picking':
          route = 'picking-form';
          break;
        case 'packing':
          route = 'packing-form';
          break;
        default:
          route = 'pedido-detail'; // Fallback a la vista de detalle
      }

      // Disparamos evento de navegación global (manejado en app.js)
      const navEvent = new CustomEvent('navigate', {
        detail: { 
          page: route, 
          params: { pedidoId, resume: true } 
        },
        bubbles: true
      });
      card.dispatchEvent(navEvent);
    });
  });
}

function renderSkeleton() {
  return `
    <div class="animate-pulse space-y-4">
      ${[1, 2, 3].map(() => `
        <div class="bg-gray-200 h-24 w-full rounded-2xl"></div>
      `).join('')}
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="text-center py-12">
      <div class="text-5xl mb-4">☕</div>
      <p class="font-bold text-gray-400 uppercase">Todo al día</p>
      <p class="text-xs text-gray-400">No hay tareas pausadas en este dispositivo.</p>
    </div>
  `;
}