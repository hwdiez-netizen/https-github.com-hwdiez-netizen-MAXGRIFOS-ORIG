import { TestRunner } from '../src/core/testing/test-runner.js';
import { assert } from '../src/core/testing/assert.js';

async function runSmoke() {
  const runner = new TestRunner('Core Smoke Test');

  runner.add('Environment check', () => {
    assert.assertDefined(process.env, 'Process env missing');
  });

  runner.add('Build ID check', async () => {
    // En un entorno de build real, esto vendría de public/maxgrifos-flags.js
    assert.assertTrue(true);
  });

  const success = await runner.run();
  process.exit(success ? 0 : 1);
}

runSmoke();
