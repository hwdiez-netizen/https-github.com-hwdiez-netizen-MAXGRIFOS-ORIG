import { subscribePwaState } from './pwa-runtime.js';

const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const _isStandalone =
  window.navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches;

let _container = null;
let _dismissedInstall = false;
let _dismissedUpdate = false;
let _lastUpdateAvailable = false;
let _currentState = {};

function _ensureContainer() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.id = 'pwa-banners';
  _container.style.cssText =
    'position:fixed;bottom:calc(64px + env(safe-area-inset-bottom,0px));left:0;right:0;z-index:9998;pointer-events:none';
  document.body.appendChild(_container);
  return _container;
}

function _render() {
  const state = _currentState;
  const container = _ensureContainer();

  if (state.updateAvailable && !_lastUpdateAvailable) {
    _dismissedUpdate = false;
  }
  _lastUpdateAvailable = Boolean(state.updateAvailable);

  const showUpdate = !_dismissedUpdate && Boolean(state.updateAvailable);
  const showInstall =
    !_dismissedInstall &&
    (Boolean(state.installAvailable) || (_isIOS && !_isStandalone));

  const parts = [];

  if (showUpdate) {
    parts.push(`
      <div id="pwa-update-banner" style="pointer-events:all;background:#1a56db;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:2px solid #1e40af">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;line-height:1.3">Nueva version disponible</div>
          <div style="font-size:11px;opacity:0.85;margin-top:2px">Los datos se conservan. Actualiza cuando estes listo.</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button id="pwa-update-do" style="background:#fff;color:#1a56db;border:none;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Actualizar App</button>
          <button id="pwa-update-dismiss" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.35);border-radius:6px;padding:8px 10px;font-size:13px;cursor:pointer;white-space:nowrap">Ahora no</button>
        </div>
      </div>`);
  }

  if (showInstall) {
    if (_isIOS && !_isStandalone) {
      parts.push(`
        <div id="pwa-install-banner" style="pointer-events:all;background:#065f46;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:2px solid #064e3b">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700">Instalar App (iOS)</div>
            <div style="font-size:11px;opacity:0.85;margin-top:2px">Toca <strong>Compartir</strong> → <strong>Agregar a pantalla de inicio</strong></div>
          </div>
          <button id="pwa-install-dismiss" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.35);border-radius:6px;padding:8px 10px;font-size:12px;cursor:pointer;flex-shrink:0">✕</button>
        </div>`);
    } else if (state.installAvailable) {
      parts.push(`
        <div id="pwa-install-banner" style="pointer-events:all;background:#065f46;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:2px solid #064e3b">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700">Instalar App</div>
            <div style="font-size:11px;opacity:0.85;margin-top:2px">Funciona sin red. Acceso directo desde inicio.</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button id="pwa-install-do" style="background:#fff;color:#065f46;border:none;border-radius:6px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Instalar App</button>
            <button id="pwa-install-dismiss" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.35);border-radius:6px;padding:8px 10px;font-size:13px;cursor:pointer;white-space:nowrap">Ahora no</button>
          </div>
        </div>`);
    }
  }

  container.innerHTML = parts.join('');

  document.getElementById('pwa-update-do')?.addEventListener('click', async () => {
    const btn = document.getElementById('pwa-update-do');
    if (btn) { btn.textContent = 'Actualizando...'; btn.disabled = true; }
    await window.__MAXGRIFOS_PWA__?.activateUpdate?.();
  });

  document.getElementById('pwa-update-dismiss')?.addEventListener('click', () => {
    _dismissedUpdate = true;
    _render();
  });

  document.getElementById('pwa-install-do')?.addEventListener('click', async () => {
    await window.__MAXGRIFOS_PWA__?.promptInstall?.();
  });

  document.getElementById('pwa-install-dismiss')?.addEventListener('click', () => {
    _dismissedInstall = true;
    _render();
  });
}

export function initPwaBanners() {
  subscribePwaState((state) => {
    _currentState = state;
    _render();
  });
}
