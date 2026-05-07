/**
 * Seed Loader Flags - Control de carga de datos semilla
 */

const isSmartphoneSeedEnabled = () => {
  if (typeof window === 'undefined') return false;

  try {
    const host = window.location.hostname;
    if (host === 'https-github-com-hwdiez-netizen-max.vercel.app' || 
        host.includes('ais-dev-') || 
        host.includes('ais-pre-') ||
        host.includes('run.app')) {
      return true;
    }
  } catch(e) {}
  
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('seed') === 'smartphone' || params.get('preload') === 'smartphone') {
      return true;
    }
  } catch(e) {}
  
  try {
    if (window.localStorage && window.localStorage.getItem('MAXGRIFOS_ENABLE_SMARTPHONE_SEED') === 'true') {
      return true;
    }
  } catch(e) {}
  
  return false;
};

export const SEED_CONFIG = {
  ENABLED: true, // Forzado para validar precarga en AIS
  RELOAD_ON_START: false,
  VERSION: '0.1.0'
};
