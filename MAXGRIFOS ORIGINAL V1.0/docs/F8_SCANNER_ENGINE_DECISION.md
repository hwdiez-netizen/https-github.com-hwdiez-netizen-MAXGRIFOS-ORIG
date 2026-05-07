# F8: Scanner Engine Technical Decision

## Objetivo
Definir la arquitectura oficial para el motor de captura de códigos (CODE128 + QR) en la PWA de MAXGRIFOS V2.

## Ruta Real F8
- **Ruta base:** `src/scanner/`
- **Controller:** `src/scanner/scanner-controller.js`
- **Worker:** `src/scanner/scanner-worker.js`

## Arquitectura Recomendada
- **Fast-path (Nativo):** Implementación directa de la API `BarcodeDetector` (W3C), aprovechando aceleración de hardware en navegadores modernos compatibles.
- **Fallback (Universal):** Para navegadores donde `BarcodeDetector` no esté presente o sea inestable, se utilizará `@undecaf/barcode-detector-polyfill` con un motor pesado basado en WebAssembly (`zbar-wasm` o `zxing-wasm`).

## Análisis de Alternativas
- **html5-qrcode** / **@zxing/library:** NO se adoptan como motor base principal debido a inconsistencias de rendimiento extremo en escenarios de red baja y limitaciones de precisión en lecturas masivas.
- **SDK Comerciales (Dynamsoft/STRICH/Scandit/Scanbot):** Se definen como OPCIONALES. Su integración se habilitará solo bajo demanda de negocio si se justifica un coste de falsos positivos inaceptable en el campo.

## Reglas de Integración (Arquitectura V2)
1. **Separación de Responsabilidades:** El scanner está prohibido de escribir directamente en `Store` o `DB`.
2. **Producción de Intenciones:** El scanner emite exclusivamente un evento de intención (`BarcodeScanned`).
3. **Decisión Maestro:** La lógica de qué hacer con el dato recibido (`producto`, `pedido`, `compra`, `cliente`) recae en el `Contract` y `Handler` correspondiente, nunca en el módulo de scanner.
