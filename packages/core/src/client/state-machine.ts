import { ZwjsClientError } from '../errors';
import type { ZwjsLifecycleState } from './types';

const ALLOWED_TRANSITIONS: Record<ZwjsLifecycleState, ZwjsLifecycleState[]> = {
  idle: ['connecting', 'stopping', 'stopped', 'error'],
  connecting: ['connected', 'reconnecting', 'stopping', 'error'],
  connected: ['reconnecting', 'stopping', 'error'],
  reconnecting: ['connecting', 'connected', 'stopping', 'error'],
  stopping: ['stopped', 'error'],
  stopped: ['connecting', 'stopping', 'error'],
  error: ['connecting', 'reconnecting', 'stopping', 'stopped'],
};

export function transitionState(current: ZwjsLifecycleState, next: ZwjsLifecycleState): ZwjsLifecycleState {
  if (current === next) return current;
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new ZwjsClientError({
      code: 'INVALID_STATE',
      message: `Invalid lifecycle transition: ${current} -> ${next}`,
      retryable: false,
    });
  }
  return next;
}
