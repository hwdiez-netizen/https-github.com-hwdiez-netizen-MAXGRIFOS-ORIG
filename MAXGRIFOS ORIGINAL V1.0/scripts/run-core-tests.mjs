import { TestRunner } from '../src/core/testing/test-runner.js';
import { testEventBus } from '../src/core/testing/event-bus.test.js';
import { testContracts } from '../src/core/testing/contracts-kernel.test.js';
import { testHandlers } from '../src/core/testing/handlers-kernel.test.js';
import { testStoreGuard } from '../src/core/testing/store-guard.test.js';
import { testSeedIntegrity } from '../src/core/testing/seed-data-integrity.test.js';

async function runAll() {
  console.log(">>> MAXGRIFOS V2 - CORE KERNEL UNIT TESTS");
  
  const suites = [
    testEventBus,
    testContracts,
    testHandlers,
    testStoreGuard,
    testSeedIntegrity
  ];

  let allPassed = true;
  for (const suite of suites) {
    const passed = await suite();
    if (!passed) allPassed = false;
  }

  console.log("\n========================================");
  console.log(allPassed ? "ALL TEST SUITES PASSED" : "SOME TEST SUITES FAILED");
  console.log("========================================\n");

  process.exit(allPassed ? 0 : 1);
}

runAll().catch(err => {
  console.error("FATAL ERROR IN TEST RUNNER:", err);
  process.exit(1);
});
