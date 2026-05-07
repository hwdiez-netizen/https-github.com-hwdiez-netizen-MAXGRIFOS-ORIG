import { runNisGlobalTests } from '../src/core/testing/nis-global.test.js';

try {
  const result = runNisGlobalTests();
  console.log('[PASS] NIS Global Hardening:', JSON.stringify(result));
  process.exit(0);
} catch (error) {
  console.error('[FAIL] NIS Global Hardening:', error.message);
  process.exit(1);
}
