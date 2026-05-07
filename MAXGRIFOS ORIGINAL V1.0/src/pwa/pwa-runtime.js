import { registerSW } from 'virtual:pwa-register';

const state = {
  installAvailable: false,
  updateAvailable: false,
  installing: false,
  appInstalled: false,
  localBuildId: (window.__MAXGRIFOS_FLAGS__?.build_id ?? 'dev'),
  remoteBuildId: null,
  isVersionBehind: false,
};

let deferredInstallPrompt = null;
let updateSW = null;
let refreshing = false;
const listeners = new Set();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshot() {
  return { ...state };
}

function emit() {
  const payload = snapshot();
  window.dispatchEvent(new CustomEvent('maxgrifos:pwa-state', { detail: payload }));
  for (const fn of listeners) fn(payload);
}

function setState(patch) {
  Object.assign(state, patch);
  emit();
}

function _extractBuildIdFromFlags(text) {
  const m = String(text ?? '').match(/build_id:\s*['"]([a-z0-9_-]{3,40})['"]/i);
  return m?.[1] ?? null;
}

async function _fetchRemoteBuildId() {
  const ts = Date.now();
  const url = `/maxgrifos-flags.js?v=${ts}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`flags_http_${res.status}`);
  const text = await res.text();
  return _extractBuildIdFromFlags(text);
}

async function _refreshVersionState() {
  try {
    const remoteBuildId = await _fetchRemoteBuildId();
    const localBuildId = window.__MAXGRIFOS_FLAGS__?.build_id ?? state.localBuildId ?? 'dev';
    const isVersionBehind = Boolean(remoteBuildId && localBuildId && remoteBuildId !== localBuildId);
    setState({ localBuildId, remoteBuildId, isVersionBehind });
    return { localBuildId, remoteBuildId, isVersionBehind };
  } catch {
    const localBuildId = window.__MAXGRIFOS_FLAGS__?.build_id ?? state.localBuildId ?? 'dev';
    setState({ localBuildId });
    return { localBuildId, remoteBuildId: null, isVersionBehind: false };
  }
}

async function activateUpdate() {
  if (typeof updateSW === 'function') {
    await updateSW(true);
    setTimeout(() => window.location.reload(), 400);
    return true;
  }
  if (!('serviceWorker' in navigator)) {
    window.location.reload();
    return false;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.waiting) {
    await reg?.update();
  }
  reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  // Fallback garantizado: si controllerchange no dispara, reload directo.
  setTimeout(() => window.location.reload(), 400);
  return true;
}

async function checkForUpdate(options = {}) {
  const apply = Boolean(options.apply);
  const emitResult = (result) => {
    window.dispatchEvent(new CustomEvent('maxgrifos:pwa-check-result', { detail: result }));
    return result;
  };

  try {
    if (!('serviceWorker' in navigator)) {
      return emitResult({ status: 'no_sw', message: 'Service Worker no disponible.' });
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      return emitResult({ status: 'no_registration', message: 'No hay registro de Service Worker.' });
    }

    const versionState = await _refreshVersionState();
    await reg.update();

    for (let i = 0; i < 6; i += 1) {
      if (reg.waiting) break;
      await wait(350);
      await reg.update();
    }

    if (reg.waiting) {
      setState({ updateAvailable: true, ...versionState });
      if (apply) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        return emitResult({
          status: 'applying',
          message: 'Actualizacion aplicada. Recargando...',
          ...versionState,
        });
      }
      return emitResult({
        status: 'available',
        message: 'Nueva version disponible.',
        ...versionState,
      });
    }

    const noWaitingVersionState = await _refreshVersionState();
    setState({ updateAvailable: false, ...noWaitingVersionState });
    if (noWaitingVersionState.isVersionBehind) {
      return emitResult({
        status: 'behind',
        message: 'Version nueva detectada, cierra y reabre la app para aplicar.',
        ...noWaitingVersionState,
      });
    }
    return emitResult({ status: 'up_to_date', message: 'Ya estas en la ultima version.' });
  } catch (error) {
    const message = error?.message ?? String(error);
    return emitResult({ status: 'error', message: `Error verificando actualizacion: ${message}` });
  }
}

async function promptInstall() {
  if (!deferredInstallPrompt) return false;
  setState({ installing: true });
  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferredInstallPrompt = null;
  setState({
    installing: false,
    installAvailable: false,
    appInstalled: result?.outcome === 'accepted',
  });
  return result?.outcome === 'accepted';
}

export function subscribePwaState(listener) {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function getPwaState() {
  return snapshot();
}

export function initPwaRuntime() {
  if (import.meta.env.DEV) {
    // Evita cache stale en localhost sin borrar IndexedDB/localStorage.
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister())))
        .catch(() => {});
    }
    emit();
    return;
  }

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setState({ updateAvailable: true });
      _refreshVersionState().catch(() => {});
    },
    onOfflineReady() {
      emit();
    },
    onRegisteredSW() {
      emit();
    },
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setState({ installAvailable: true, appInstalled: false });
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setState({ installAvailable: false, appInstalled: true, installing: false });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      setState({ updateAvailable: false });
      window.location.reload();
    });
  }

  if ('storage' in navigator && 'persist' in navigator.storage) {
    navigator.storage.persist().catch(() => {});
  }

  window.__MAXGRIFOS_PWA__ = {
    getState: getPwaState,
    subscribe: subscribePwaState,
    promptInstall,
    activateUpdate,
    checkForUpdate,
  };

  _refreshVersionState().catch(() => {});
  emit();
}
