"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestTracker = void 0;
const errors_1 = require("../errors");
class RequestTracker {
    constructor() {
        this.pending = new Map();
        this.nextId = 1;
    }
    create(timeoutMs) {
        const id = String(this.nextId++);
        const promise = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pending.delete(id);
                reject(new errors_1.ZwjsClientError({
                    code: 'REQUEST_TIMEOUT',
                    message: `Request timed out: ${id}`,
                    retryable: true,
                }));
            }, timeoutMs);
            this.pending.set(id, { resolve: resolve, reject, timeoutId });
        });
        return { id, promise };
    }
    resolve(id, value) {
        const pending = this.pending.get(id);
        if (!pending)
            return false;
        clearTimeout(pending.timeoutId);
        this.pending.delete(id);
        pending.resolve(value);
        return true;
    }
    reject(id, error) {
        const pending = this.pending.get(id);
        if (!pending)
            return false;
        clearTimeout(pending.timeoutId);
        this.pending.delete(id);
        pending.reject(error);
        return true;
    }
    rejectAll(error) {
        for (const [id, pending] of this.pending) {
            clearTimeout(pending.timeoutId);
            this.pending.delete(id);
            pending.reject(error);
        }
    }
}
exports.RequestTracker = RequestTracker;
