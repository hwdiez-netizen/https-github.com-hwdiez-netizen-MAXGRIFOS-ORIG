import { initPwaRuntime } from './pwa/pwa-runtime.js';
import { initPwaBanners } from './pwa/pwa-banners.js';
import { appShell } from './core/app-shell/app-shell.js';
import { initDB } from './db/local-db.js';
import './core/design-system/design-system.index.js';

initPwaRuntime();
initPwaBanners();

async function bootstrap() {
  console.info('[Boot] Initializing V2 Default Mode');
  
  try {
    await initDB();
  } catch (err) {
    console.error('[Boot][DB] Failed to initialize DB:', err);
  }
  
  appShell.init().catch(err => console.error('[V2] Failed to init core:', err));
}

bootstrap();