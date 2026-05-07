const DEVICE_ID_KEY = 'maxgrifos_erp:device_id';
const DEVICE_LABEL_KEY = 'maxgrifos_erp:device_label';

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceLabel() {
  const saved = localStorage.getItem(DEVICE_LABEL_KEY);
  if (saved) return saved;
  const ua = navigator.userAgent ?? '';
  if (/Android/i.test(ua)) return 'Móvil Android';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone/iPad';
  return 'PC / Tablet';
}

export function setDeviceLabel(label) {
  if (label && String(label).trim()) {
    localStorage.setItem(DEVICE_LABEL_KEY, String(label).trim().slice(0, 40));
  }
}
