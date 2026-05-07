// Fallback barcode decoder using zxing-wasm loaded from CDN (LGPL-2.1+).
// Runs in a Web Worker to avoid blocking the main thread.
// The WASM binary is cached by the Service Worker via NetworkFirst strategy.

const CDN_URL = 'https://esm.sh/zxing-wasm@1/full';

let readBarcodesFromImageData = null;

async function ensureLoaded() {
  if (readBarcodesFromImageData) return;
  const mod = await import(CDN_URL);
  readBarcodesFromImageData = mod.readBarcodesFromImageData;
}

const READER_OPTIONS = {
  formats: ['CODE_128', 'QR_CODE', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'],
  tryHarder: true,
  tryRotate: true,
};

self.onmessage = async ({ data }) => {
  if (data.type === 'INIT') {
    // Preload WASM eagerly so the first scan is fast
    ensureLoaded().catch(() => {});
    return;
  }

  if (data.type !== 'DECODE') return;

  const { pixels, width, height } = data;

  try {
    await ensureLoaded();

    const clampedArray = new Uint8ClampedArray(pixels);
    const imageData = new ImageData(clampedArray, width, height);
    const results = await readBarcodesFromImageData(imageData, READER_OPTIONS);

    if (results && results.length > 0) {
      self.postMessage({
        type: 'RESULT',
        success: true,
        code: results[0].text,
        format: String(results[0].format),
      });
    } else {
      self.postMessage({ type: 'RESULT', success: false });
    }
  } catch (err) {
    self.postMessage({ type: 'RESULT', success: false, error: err.message });
  }
};
