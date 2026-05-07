import { TestRunner } from './test-runner.js';
import { assert } from './assert.js';
import { SEED_DATA } from '../../mock/maxgrifos-seed-data.js';
import { SeedValidator } from '../seed/seed-validator.js';

export async function testSeedIntegrity() {
  const runner = new TestRunner('Seed Data Integrity');

  runner.add('should pass validation', () => {
    const result = SeedValidator.validate(SEED_DATA);
    if (!result.valid) {
      throw new Error(`Seed validation failed: ${result.findings.join(', ')}`);
    }
    assert.assertTrue(result.valid);
  });

  runner.add('should contain minimum 10 products', () => {
    assert.assertTrue(SEED_DATA.products.length >= 10);
  });

  runner.add('should contain minimum 5 clients', () => {
    assert.assertTrue(SEED_DATA.clients.length >= 5);
  });

  return await runner.run();
}
