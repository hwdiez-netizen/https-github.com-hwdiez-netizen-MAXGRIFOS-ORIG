/**
 * PocketBase Bridge Stub - Placeholder seguro para PocketBase
 */
import { BackendBridgeInterface } from './backend-bridge.interface.js';

export class PocketBaseBridgeStub extends BackendBridgeInterface {
  async connect() {
    console.debug('[PocketBaseBridge] Connection stub initialized');
    return true;
  }
}
