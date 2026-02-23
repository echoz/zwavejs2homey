import { ZwjsClientError } from '../errors';

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class RequestTracker {
  private readonly pending = new Map<string, PendingRequest<unknown>>();
  private nextId = 1;

  create<T>(timeoutMs: number): { id: string; promise: Promise<T> } {
    const id = String(this.nextId++);
    const promise = new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new ZwjsClientError({
            code: 'REQUEST_TIMEOUT',
            message: `Request timed out: ${id}`,
            retryable: true,
          }),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timeoutId });
    });
    return { id, promise };
  }

  resolve<T>(id: string, value: T): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    clearTimeout(pending.timeoutId);
    this.pending.delete(id);
    pending.resolve(value);
    return true;
  }

  reject(id: string, error: unknown): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    clearTimeout(pending.timeoutId);
    this.pending.delete(id);
    pending.reject(error);
    return true;
  }

  rejectAll(error: unknown): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeoutId);
      this.pending.delete(id);
      pending.reject(error);
    }
  }
}
