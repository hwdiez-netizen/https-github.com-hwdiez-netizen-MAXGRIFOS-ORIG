
import { ScannerController } from '../src/scanner/scanner-controller.js';
import assert from 'assert';
import fs from 'fs';
import crypto from 'crypto';

console.log('Validando Scanner & Code Reading Engine...');

// Check worker hash
const workerPath = 'MAXGRIFOS ORIGINAL V1.0/src/scanner/scanner-worker.js';
const workerData = fs.readFileSync(workerPath);
const hash = crypto.createHash('sha256').update(workerData).digest('hex');
const EXPECTED_WORKER_SHA = '994ce458750facf73579c1252f939826821d9b0afbcc4e7571efdf58dc8b2849';
assert(hash === EXPECTED_WORKER_SHA, 'Worker SHA mismatch');

// Check controller has correct worker path
const controllerPath = 'MAXGRIFOS ORIGINAL V1.0/src/scanner/scanner-controller.js';
const controllerData = fs.readFileSync(controllerPath, 'utf8');
assert(controllerData.includes("/src/scanner/scanner-worker.js"), 'Controller path to worker incorrect');

// Test ScannerController structure
const mockContainer = {
  innerHTML: '',
  querySelector: () => ({
    addEventListener: () => {},
    innerHTML: '',
    className: '',
  }),
};
const controller = new ScannerController(mockContainer);
assert(controller instanceof ScannerController, 'ScannerController class missing');

// Check placeholder
const placeholderPath = 'MAXGRIFOS ORIGINAL V1.0/src/core/app-shell/module-placeholder.js';
const placeholderData = fs.readFileSync(placeholderPath, 'utf8');
assert(placeholderData.includes("new ScannerController"), 'Placeholder missing ScannerController instance');
assert(placeholderData.includes("module.path === '/scanner'"), 'Placeholder missing /scanner condition');

console.log('Validación Scanner F8 exitosa.');
