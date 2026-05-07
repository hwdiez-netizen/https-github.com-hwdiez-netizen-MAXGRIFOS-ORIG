import { eventBus, Events } from '../events/domain-events.js';

const HD_CONSTRAINTS = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920, min: 1280 },
    height: { ideal: 1080, min: 720 },
  },
};

const NATIVE_FORMATS = ['code_128', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];

export class ScannerController {
  constructor(container) {
    this.container = container;
    this._stream = null;
    this._worker = null;
    this._scanning = false;
    this._frameTimer = null;
    this._nativeDetector = null;
    this._useWorker = false;
    this._workerReady = false;
  }

  async mount() {
    this.container.innerHTML = this._template();
    this.container
      .querySelector('#btn-scan-toggle')
      .addEventListener('click', () => this._toggleScan());
    await this._initDetector();
  }

  _template() {
    return `
      <div class="scanner-container">
        <h2>Escanear Código</h2>
        <div class="scanner-viewport">
          <video id="scanner-video" playsinline muted autoplay></video>
          <canvas id="scanner-canvas"></canvas>
          <div class="scanner-roi" aria-hidden="true"></div>
          <div class="scanner-status" id="scanner-status">Listo para escanear</div>
        </div>
        <button class="btn-primary" id="btn-scan-toggle">▶ Iniciar Escáner</button>
        <div id="scan-result" class="scan-result hidden"></div>
        <div class="scanner-note">
          Apunte el código de barras hacia la zona central marcada.<br>
          <strong>iOS Safari:</strong> linterna no disponible — asegure buena iluminación.
        </div>
      </div>`;
  }

  async _initDetector() {
    if ('BarcodeDetector' in window) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        const hasCodeFormats = NATIVE_FORMATS.some((f) => supported.includes(f));
        if (hasCodeFormats) {
          this._nativeDetector = new BarcodeDetector({ formats: NATIVE_FORMATS });
          this._useWorker = false;
          return;
        }
      } catch {
        // Fall through to worker
      }
    }
    this._useWorker = true;
    this._worker = new Worker(
      new URL('/src/scanner/scanner-worker.js', import.meta.url),
      { type: 'module' }
    );
    this._worker.onmessage = (e) => this._handleWorkerResult(e.data);
    this._worker.onerror = (e) => console.error('[Scanner Worker]', e.message);
    // Signal worker to preload WASM
    this._worker.postMessage({ type: 'INIT' });
  }

  async _toggleScan() {
    if (this._scanning) {
      this._stopScan();
    } else {
      await this._startScan();
    }
  }

  async _startScan() {
    const status = this.container.querySelector('#scanner-status');
    const btn = this.container.querySelector('#btn-scan-toggle');

    // Guard: MediaDevices API requires secure context (HTTPS or localhost).
    // Over plain HTTP (LAN/IP), navigator.mediaDevices is undefined.
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'Cámara no disponible. Accede desde localhost o una conexión HTTPS.';
      return;
    }

    status.textContent = 'Solicitando acceso a cámara...';

    try {
      this._stream = await navigator.mediaDevices.getUserMedia(HD_CONSTRAINTS);
    } catch (err) {
      // Retry with relaxed constraints if HD fails (some Android devices)
      try {
        this._stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch {
        status.textContent = 'Sin acceso a cámara. Verifica los permisos del navegador.';
        return;
      }
    }

    const video = this.container.querySelector('#scanner-video');
    video.srcObject = this._stream;
    await video.play().catch(() => {});

    this._scanning = true;
    btn.textContent = '⏹ Detener Escáner';
    status.textContent = 'Escaneando...';
    this._scheduleFrame();
  }

  _stopScan() {
    this._scanning = false;
    if (this._frameTimer) clearTimeout(this._frameTimer);
    this._stream?.getTracks().forEach((t) => t.stop());
    this._stream = null;

    const btn = this.container.querySelector('#btn-scan-toggle');
    const status = this.container.querySelector('#scanner-status');
    if (btn) btn.textContent = '▶ Iniciar Escáner';
    if (status) status.textContent = 'Listo para escanear';
  }

  _scheduleFrame() {
    // ~15 fps — preserves battery and avoids blocking the UI thread
    this._frameTimer = setTimeout(() => {
      if (!this._scanning) return;
      requestAnimationFrame(() => {
        this._processFrame();
        this._scheduleFrame();
      });
    }, 66);
  }

  _processFrame() {
    const video = this.container.querySelector('#scanner-video');
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;

    if (this._useWorker) {
      this._captureAndSendToWorker(video);
    } else {
      this._detectWithNative(video);
    }
  }

  async _detectWithNative(video) {
    if (!this._nativeDetector) return;
    try {
      const barcodes = await this._nativeDetector.detect(video);
      if (barcodes.length > 0) {
        this._onResult(barcodes[0].rawValue, String(barcodes[0].format));
      }
    } catch {
      // Transient frame errors are expected; ignore
    }
  }

  _captureAndSendToWorker(video) {
    const canvas = this.container.querySelector('#scanner-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Extract central ROI (60% wide × 60% tall)
    const roiX = Math.floor(canvas.width * 0.2);
    const roiY = Math.floor(canvas.height * 0.2);
    const roiW = Math.floor(canvas.width * 0.6);
    const roiH = Math.floor(canvas.height * 0.6);
    const imageData = ctx.getImageData(roiX, roiY, roiW, roiH);

    this._worker.postMessage(
      { type: 'DECODE', pixels: imageData.data.buffer, width: roiW, height: roiH },
      [imageData.data.buffer]
    );
  }

  _handleWorkerResult(data) {
    if (data.type === 'RESULT' && data.success) {
      this._onResult(data.code, data.format);
    }
  }

  _onResult(code, format) {
    this._stopScan();

    const resultEl = this.container.querySelector('#scan-result');
    if (resultEl) {
      resultEl.innerHTML = `<strong>Código detectado:</strong> ${code} &nbsp;<small>(${format})</small>`;
      resultEl.className = 'scan-result success';
    }

    eventBus.emit(Events.BARCODE_SCANNED, { code, format });
  }

  unmount() {
    this._stopScan();
    this._worker?.terminate();
    this._worker = null;
  }
}
