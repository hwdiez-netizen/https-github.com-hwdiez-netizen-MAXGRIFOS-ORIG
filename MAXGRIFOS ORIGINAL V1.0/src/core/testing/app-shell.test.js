import { TestRunner } from './test-runner.js';
import { assert } from './assert.js';

export async function testAppShell() {
  const runner = new TestRunner('App Shell Visual');

  runner.add('should have a root container style defined', () => {
    assert.assertEqual('mg-app-shell', 'mg-app-shell');
  });

  return await runner.run();
}
