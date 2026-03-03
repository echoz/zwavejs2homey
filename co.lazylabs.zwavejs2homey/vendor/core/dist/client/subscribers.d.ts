import type { ZwjsClientEvent } from './types';
export declare class SubscriberRegistry {
    private readonly handlers;
    subscribe(handler: (event: ZwjsClientEvent) => void): () => void;
    dispatch(event: ZwjsClientEvent, onHandlerError?: (error: unknown) => void): void;
}
//# sourceMappingURL=subscribers.d.ts.map