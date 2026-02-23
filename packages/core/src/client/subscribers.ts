import type { ZwjsClientEvent } from './types';

export class SubscriberRegistry {
  private readonly handlers = new Set<(event: ZwjsClientEvent) => void>();

  subscribe(handler: (event: ZwjsClientEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  dispatch(event: ZwjsClientEvent, onHandlerError?: (error: unknown) => void): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        onHandlerError?.(error);
      }
    }
  }
}
