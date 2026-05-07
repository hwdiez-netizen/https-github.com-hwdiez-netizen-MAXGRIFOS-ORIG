import { TestRunner } from './test-runner.js';
import { assert } from './assert.js';
import { MG_ROUTES } from '../router/route-registry.js';

export async function testHomeMenu() {
  const runner = new TestRunner('Home Menu');

  runner.add('should have all 18 modules registered', () => {
    assert.assertTrue(MG_ROUTES.length >= 18);
  });

  return await runner.run();
}
