/**
 * Module Placeholder - V2 Preview
 */
import { createMGElement, MG_STYLES } from '../design-system/ui-primitives.js';
import { renderModuleEntryPilot } from '../modules/module-entry-pilot.js';
import { ScannerController } from '../../scanner/scanner-controller.js';

export function createModulePlaceholder(module) {
  const container = createMGElement('div', 'p-6 mg-fade-in');
  
  if (module.path === '/module-entry-pilot') {
    renderModuleEntryPilot(container);
    return container;
  }
  
  if (module.path === '/scanner') {
    const scannerMount = createMGElement('div', 'mg-scanner-module');
    const scanner = new ScannerController(scannerMount);
    scanner.mount();
    container.appendChild(scannerMount);
    return container;
  }
  
  const headerContent = createMGElement('div', 'mb-6', `
    <h1 class="text-3xl font-bold mb-2" style="letter-spacing:-0.02em">${module.label}</h1>
    <div class="${MG_STYLES.BADGE_WARNING}" style="display:inline-flex">${module.status || 'CORE V2'}</div>
  `);
  
  const content = createMGElement('div', 'mg-card p-6', `
    <div style="background:rgba(0,102,255,0.03); border-radius:12px; padding:20px; border:1px solid rgba(0,102,255,0.08);">
      <p style="color:var(--mg-text); font-weight:600; font-size:1.1rem; margin-bottom:8px;">Módulo en preparación</p>
      <p style="color:var(--mg-text-muted); font-size:0.9rem; line-height:1.5;">
        Este módulo está siendo migrado al motor core V2. Proximamente contará con arquitectura determinista y sincronización offline nativa.
      </p>
    </div>
  `);

  const backBtn = createMGElement('button', MG_STYLES.BTN_SECONDARY + ' mt-8 w-full', '← Volver al Inicio');
  backBtn.style.padding = '14px';
  backBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('mg:navigate', { detail: { path: '/' } }));
  });

  container.appendChild(headerContent);
  container.appendChild(content);
  container.appendChild(backBtn);

  return container;
}
