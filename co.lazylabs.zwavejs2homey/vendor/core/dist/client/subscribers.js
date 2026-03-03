"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriberRegistry = void 0;
class SubscriberRegistry {
    constructor() {
        this.handlers = new Set();
    }
    subscribe(handler) {
        this.handlers.add(handler);
        return () => {
            this.handlers.delete(handler);
        };
    }
    dispatch(event, onHandlerError) {
        for (const handler of this.handlers) {
            try {
                handler(event);
            }
            catch (error) {
                onHandlerError?.(error);
            }
        }
    }
}
exports.SubscriberRegistry = SubscriberRegistry;
