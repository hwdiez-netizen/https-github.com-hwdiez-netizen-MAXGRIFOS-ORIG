import { TestRunner } from './test-runner.js';
import { assert } from './assert.js';
import { eventBus } from '../event-bus/event-bus.js';

export async function testEventBus() {
  const runner = new TestRunner('Event Bus');

  runner.add('should allow subscribing and publishing', () => {
    let received = false;
    eventBus.subscribe('test:event', (e) => {
      received = true;
      assert.assertEqual(e.payload.val, 123);
    });
    eventBus.publish({ type: 'test:event', payload: { val: 123 } });
    assert.assertTrue(received, 'Event was not received');
  });

  runner.add('should support idempotency_key in metadata', () => {
    let capturedMetadata = null;
    eventBus.subscribe('test:meta', (e) => {
      capturedMetadata = e.metadata;
    });
    eventBus.publish({ 
      type: 'test:meta', 
      payload: {}, 
      metadata: { idempotency_key: 'key-123' } 
    });
    assert.assertEqual(capturedMetadata.idempotency_key, 'key-123');
  });

  return await runner.run();
}
