"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transitionState = transitionState;
const errors_1 = require("../errors");
const ALLOWED_TRANSITIONS = {
    idle: ['connecting', 'stopping', 'stopped', 'error'],
    connecting: ['connected', 'reconnecting', 'stopping', 'error'],
    connected: ['reconnecting', 'stopping', 'error'],
    reconnecting: ['connecting', 'connected', 'stopping', 'error'],
    stopping: ['stopped', 'error'],
    stopped: ['connecting', 'stopping', 'error'],
    error: ['connecting', 'reconnecting', 'stopping', 'stopped'],
};
function transitionState(current, next) {
    if (current === next)
        return current;
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
        throw new errors_1.ZwjsClientError({
            code: 'INVALID_STATE',
            message: `Invalid lifecycle transition: ${current} -> ${next}`,
            retryable: false,
        });
    }
    return next;
}
