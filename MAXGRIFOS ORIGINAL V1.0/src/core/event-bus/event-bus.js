/**
 * Event Bus Core - Desacoplamiento de componentes V2
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.sequence = 0;
  }

  /**
   * Suscribirse a un evento
   */
  subscribe(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    return () => this.unsubscribe(type, callback);
  }

  /**
   * Eliminar suscripción
   */
  unsubscribe(type, callback) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(callback);
    }
  }

  /**
   * Publicar un evento
   */
  publish(event) {
    if (!event.type) {
      throw new Error('[EventBus] Event must have a type');
    }

    this.sequence += 1;

    const eventWithMetadata = {
      ...event,
      metadata: {
        sequence: this.sequence,
        timestamp: event.metadata?.timestamp ?? null,
        idempotency_key: event.metadata?.idempotency_key || null,
        ...event.metadata
      }
    };

    const subscribers = this.listeners.get(event.type);
    if (subscribers) {
      subscribers.forEach(callback => callback(eventWithMetadata));
    }
    
    // Log para auditoría futura
    console.debug(`[EventBus] ${event.type}`, eventWithMetadata);
  }
}

export const eventBus = new EventBus();
export default eventBus;