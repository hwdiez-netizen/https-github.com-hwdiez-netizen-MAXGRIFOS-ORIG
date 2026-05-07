/**
 * NIS Global Hardening Tests
 * Validación estructural sin navegador real.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve ROOT to the parent of 'src' where 'package.json' should be
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../'); 

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runNisGlobalTests() {
  const gesture = read('src/core/nis/gesture-engine.js');
  const controller = read('src/core/nis/nis-controller.js');
  const guard = read('src/core/nis/process-guard.js');
  const appShell = read('src/core/app-shell/app-shell.js');
  const appShellCss = read('src/core/app-shell/app-shell.css');

  assert(!controller.includes('window.history.back'), 'NIS Controller must not use window.history.back()');

  assert(gesture.includes('touchstart'), 'GestureEngine must handle touchstart');
  assert(gesture.includes('touchmove'), 'GestureEngine must handle touchmove');
  assert(gesture.includes('touchend'), 'GestureEngine must handle touchend');
  assert(gesture.includes('destroy()'), 'GestureEngine must expose destroy()');
  assert(gesture.includes('Math.max(Number(options.threshold || 60), 50)'), 'GestureEngine must enforce threshold >= 50');
  assert(gesture.includes('verticalDominant'), 'GestureEngine must protect vertical scroll');
  assert(gesture.includes('onDoubleTap'), 'GestureEngine must support safe double tap');

  assert(controller.includes('mg:navigate'), 'NIS Controller must use visual navigation event mg:navigate');
  assert(controller.includes('nis:gesture'), 'NIS Controller must emit DOM event nis:gesture');
  assert(controller.includes('nis:blocked'), 'NIS Controller must emit blocked event');
  assert(controller.includes('transactional: false'), 'NIS Controller gestures must be non-transactional');

  assert(guard.includes('markDirty'), 'ProcessGuard must implement markDirty');
  assert(guard.includes('clearDirty'), 'ProcessGuard must implement clearDirty');
  assert(guard.includes('isDirty'), 'ProcessGuard must implement isDirty');
  assert(guard.includes('getDirtyReason'), 'ProcessGuard must implement getDirtyReason');
  assert(guard.includes('blockNavigationMessage'), 'ProcessGuard must implement blockNavigationMessage');

  assert(appShell.includes('showNisToast'), 'AppShell must implement showNisToast');
  assert(appShell.includes('nis:blocked'), 'AppShell must listen to nis:blocked');
  assert(appShell.includes('nis:gesture'), 'AppShell must listen to nis:gesture');
  assert(appShell.includes('nis:doubletap'), 'AppShell must listen to nis:doubletap');

  assert(appShellCss.includes('.mg-nis-toast'), 'app-shell.css must define .mg-nis-toast');
  assert(appShellCss.includes('touch-action: pan-y'), 'app-shell.css must protect vertical scroll with touch-action: pan-y');
  assert(appShellCss.includes('overscroll-behavior: contain'), 'app-shell.css must contain overscroll behavior');

  assert(!appShell.includes('window.history.back'), 'AppShell must not use window.history.back()');

  return {
    ok: true,
    suite: 'nis-global',
    assertions: 24
  };
}
