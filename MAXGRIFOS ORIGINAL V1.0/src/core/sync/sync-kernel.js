/**
 * Sync Kernel - Motor de sincronización idempotente
 */
import { eventBus } from '../event-bus/event-bus.js';
import { CORE_EVENTS } from '../event-bus/event-types.js';

export const SYNC_STATUS = {
  OFFLINE: 'offline',
  ONLINE: 'online',
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed',
};

class SyncKernel {
  constructor() {
    this.status = SYNC_STATUS.OFFLINE;
  }

  updateStatus(newStatus) {
    this.status = newStatus;
    eventBus.publish({
      type: CORE_EVENTS.SYNC_STATUS_CHANGED,
      payload: { status: newStatus }
    });
    console.debug(`[Sync] Status: ${newStatus}`);
  }

  async startSync() {
    if (this.status === SYNC_STATUS.SYNCING) return;
    this.updateStatus(SYNC_STATUS.SYNCING);
    
    // Simulación de sync
    setTimeout(() => {
      this.updateStatus(SYNC_STATUS.SYNCED);
    }, 2000);
  }
}

export const syncKernel = new SyncKernel();
export default syncKernel;
