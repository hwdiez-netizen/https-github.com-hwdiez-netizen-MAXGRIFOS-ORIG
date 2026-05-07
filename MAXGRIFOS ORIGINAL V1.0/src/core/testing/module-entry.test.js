/**
 * Module Entry Contract Tests
 * Valida la arquitectura F6.
 */

import { validateModuleEntry } from '../modules/module-entry-contract.js';

export const runModuleEntryTests = () => {
  const suite = 'Module Entry Architecture';
  const assertions = [];

  const assert = (condition, description) => {
    assertions.push({ ok: !!condition, description });
    if (!condition) console.error(`[FAIL] ${description}`);
  };

  console.log(`\n[TEST SUITE] ${suite}`);

  // Test 1: Contrato rechazado por falta de campos
  const invalidIntent = { moduleId: 'TEST' };
  const v1 = validateModuleEntry(invalidIntent);
  assert(v1.ok === false, 'Debe rechazar intención incompleta');
  assert(v1.issues.includes('route is required'), 'Debe detectar falta de ruta');
  assert(v1.issues.includes('idempotency_key is required for audit'), 'Debe detectar falta de idempotencia');

  // Test 2: Contrato aceptado con campos correctos
  const validIntent = {
    moduleId: 'SALES',
    route: '/ventas',
    source: 'TEST_RUNNER',
    idempotency_key: 'ENTRY:SALES:/ventas:TEST_RUNNER'
  };
  const v2 = validateModuleEntry(validIntent);
  assert(v2.ok === true, 'Debe aceptar intención completa');
  assert(v2.normalized.moduleId === 'SALES', 'Debe normalizar moduleId');
  assert(v2.normalized.audit_marker === 'MODULE_ENTRY_CONTRACT_V1', 'Debe contener audit_marker');
  assert(v2.normalized.timestamp === undefined, 'No debe contener timestamp dinámico');

  // Test 3: Idempotencia determinista
  const intentA = { moduleId: 'M1', route: '/r1', source: 'S1', idempotency_key: 'ENTRY:M1:/r1:S1' };
  const intentB = { moduleId: 'M1', route: '/r1', source: 'S1', idempotency_key: 'ENTRY:M1:/r1:S1' };
  const vA = validateModuleEntry(intentA);
  const vB = validateModuleEntry(intentB);
  assert(vA.normalized.idempotency_key === vB.normalized.idempotency_key, 'Idempotencia debe ser determinista y estable');

  // Test 4: Integridad de datos normalizados
  assert(Object.isFrozen(v2.normalized) === false, 'Normalized object should be extensible (standard JS object)');

  const okCount = assertions.filter(a => a.ok).length;
  const failCount = assertions.length - okCount;

  console.log(`[SUMMARY] ${okCount}/${assertions.length} assertions passed.`);

  return {
    ok: failCount === 0,
    suite,
    assertions: assertions.length
  };
};
