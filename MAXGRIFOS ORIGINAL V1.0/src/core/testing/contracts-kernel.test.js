import { TestRunner } from './test-runner.js';
import { assert } from './assert.js';
import { contractKernel } from '../contracts/contract-kernel.js';
import { ContractResult } from '../contracts/contract-result.js';

export async function testContracts() {
  const runner = new TestRunner('Contracts Kernel');

  runner.add('should validate registered contracts', async () => {
    contractKernel.register('test:contract', (data) => {
      if (data.val > 10) return ContractResult.Success();
      return ContractResult.Fail('VAL_TOO_LOW', 'Value must be > 10');
    });

    const res1 = await contractKernel.validate('test:contract', { val: 20 });
    assert.assertTrue(res1.ok);

    const res2 = await contractKernel.validate('test:contract', { val: 5 });
    assert.assertTrue(!res2.ok);
    assert.assertEqual(res2.code, 'VAL_TOO_LOW');
  });

  return await runner.run();
}
