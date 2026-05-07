/**
 * Preview Banner - V2
 */
import { createMGElement } from '../design-system/ui-primitives.js';

export function createPreviewBanner() {
  const banner = createMGElement('div', '', `
    <div style="background:#F2F2F7; color:#8E8E93; font-size:9px; font-weight:700; text-align:center; padding:4px; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid rgba(0,0,0,0.03);">
      Modo Preview Apple-like Core V2
    </div>
  `);
  return banner;
}
