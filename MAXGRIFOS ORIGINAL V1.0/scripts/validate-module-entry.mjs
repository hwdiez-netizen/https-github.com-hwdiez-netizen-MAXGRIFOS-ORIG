/**
 * Validate Module Entry
 * Runner para CI/CD de F6.
 */

import { runModuleEntryTests } from '../src/core/testing/module-entry.test.js';

console.log('--- MAXGRIFOS F6 VALIDATOR ---');

try {
  const result = runModuleEntryTests();
  
  if (result.ok) {
    console.log('[PASS] Module Entry Patterns are valid.');
    process.exit(0);
  } else {
    console.error('[FAIL] Module Entry Patterns detected issues.');
    process.exit(1);
  }
} catch (error) {
  console.error('[CRITICAL] Validator failed to execute:', error);
  process.exit(1);
}
