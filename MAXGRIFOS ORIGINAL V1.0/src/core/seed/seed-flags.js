/**
 * Seed Loader Flags - Control de carga de datos semilla
 */

const isSmartphoneSeedEnabled = () => {
  if (typeof window === 'undefined') return false;

  try {
    if (window.location.hostname === 'https-github-com-hwdiez-netizen-max.vercel.app') {
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
  ENABLED: isSmartphoneSeedEnabled(),
  RELOAD_ON_START: false,
  VERSION: '0.1.0'
};
