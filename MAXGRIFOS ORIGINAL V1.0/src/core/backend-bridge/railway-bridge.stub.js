/**
 * Railway Bridge Stub - Placeholder seguro para Railway
 */
import { BackendBridgeInterface } from './backend-bridge.interface.js';

export class RailwayBridgeStub extends BackendBridgeInterface {
  async connect() {
    console.debug('[RailwayBridge] Connection stub initialized');
    return true;
  }
}
