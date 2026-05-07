/**
 * Simple Test Runner for MAXGRIFOS V2
 */

export class TestRunner {
  constructor(name) {
    this.name = name;
    this.tests = [];
    this.results = [];
  }

  add(description, fn) {
    this.tests.push({ description, fn });
  }

  async run() {
    console.log(`\n>>> Running Test Suite: ${this.name}`);
    let passed = 0;
    let failed = 0;

    for (const test of this.tests) {
      try {
        await test.fn();
        console.log(`  [PASS] ${test.description}`);
        passed++;
        this.results.push({ description: test.description, ok: true });
      } catch (error) {
        console.error(`  [FAIL] ${test.description}`);
        console.error(`         Reason: ${error.message}`);
        failed++;
        this.results.push({ description: test.description, ok: false, error: error.message });
      }
    }

    console.log(`\nSummary: ${passed} passed, ${failed} failed`);
    return failed === 0;
  }
}
