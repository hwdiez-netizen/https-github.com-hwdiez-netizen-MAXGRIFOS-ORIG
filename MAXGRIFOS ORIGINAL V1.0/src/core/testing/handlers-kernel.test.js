import { TestRunner } from './test-runner.js';
import { assert } from './assert.js';
import { handlerKernel } from '../handlers/handler-kernel.js';
import { contractKernel } from '../contracts/contract-kernel.js';
import { ContractResult } from '../contracts/contract-result.js';

export async function testHandlers() {
  const runner = new TestRunner('Handlers Kernel');

  contractKernel.register('mock:contract', (data) => {
    if (data.name) return ContractResult.Success();
    return ContractResult.Fail('NAME_REQUIRED');
  });

  runner.add('should execute logic if contract passes', async () => {
    handlerKernel.register('mock:intent', {
      contract: 'mock:contract',
      logic: async (data) => {
        return { processed: data.name.toUpperCase() };
      }
    });

    const res = await handlerKernel.execute('mock:intent', { name: 'test' });
    assert.assertTrue(res.ok);
    assert.assertEqual(res.data.processed, 'TEST');
  });

  runner.add('should fail if contract fails', async () => {
    const res = await handlerKernel.execute('mock:intent', { });
    assert.assertTrue(!res.ok);
    assert.assertEqual(res.code, 'CONTRACT_VIOLATION');
  });

  return await runner.run();
}
