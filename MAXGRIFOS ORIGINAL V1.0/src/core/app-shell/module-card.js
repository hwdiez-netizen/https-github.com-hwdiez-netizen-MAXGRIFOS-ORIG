/**
 * Module Card Component - V2 Neon Flex
 */
import { MG_STYLES, createMGElement } from '../design-system/ui-primitives.js';

const ICON_MAP = {
  'home': '🏠',
  'package': '📦',
  'users': '👥',
  'shopping-cart': '🛒',
  'file-text': '📝',
  'shield-check': '🛡️',
  'truck': '🚚',
  'building': '🏢',
  'layers': '📚',
  'clipboard-list': '📋',
  'receipt': '🧾',
  'award': '🏆',
  'activity': '📈',
  'maximize': '🔍',
  'wallet': '💳',
  'arrow-down-circle': '📥',
  'arrow-up-circle': '📤',
  'landmark': '🏛️',
  'bar-chart-2': '📊'
};

export function createModuleCard(module, demoCount = 0) {
  const card = createMGElement('div', MG_STYLES.CARD_INTERACTIVE + ' mg-module-card');
  card.dataset.path = module.path;

  const emoji = ICON_MAP[module.icon] || '🔹';
  const icon = createMGElement('div', 'mg-module-icon', emoji);
  
  const label = createMGElement('div', 'mg-module-label', module.label);
  
  if (module.status === 'PREPARING') {
    const badge = createMGElement('div', MG_STYLES.BADGE_WARNING + ' mg-module-badge', 'V2');
    card.appendChild(badge);
  } else if (module.status === 'FUTURE') {
    card.style.opacity = '0.4';
    card.style.pointerEvents = 'none';
    card.style.filter = 'grayscale(100%)';
  }

  if (demoCount > 0 && module.status === 'ACTIVE') {
    const bubble = createMGElement('div', 'mg-counter-bubble', demoCount);
    card.appendChild(bubble);
  }

  card.appendChild(icon);
  card.appendChild(label);

  card.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('mg:navigate', { detail: { path: module.path } }));
  });

  return card;
}
