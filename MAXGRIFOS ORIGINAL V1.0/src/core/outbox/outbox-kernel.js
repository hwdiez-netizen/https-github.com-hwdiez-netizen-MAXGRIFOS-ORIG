/**
 * Outbox Kernel - Cola de sincronización asíncrona
 */

export class OutboxKernel {
  constructor() {
    this.queue = [];
  }

  /**
   * Encolar acción para sincronización futura
   */
  async enqueue(action) {
    const entry = {
      id: crypto.randomUUID(),
      action,
      created_at: Date.now(),
      attempts: 0,
    };
    this.queue.push(entry);
    console.debug('[Outbox] Enqueued action', entry);
    return entry.id;
  }

  async getPending() {
    return this.queue;
  }
}

export const outboxKernel = new OutboxKernel();
export default outboxKernel;
