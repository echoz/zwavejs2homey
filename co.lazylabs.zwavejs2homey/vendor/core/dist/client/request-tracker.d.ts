export declare class RequestTracker {
    private readonly pending;
    private nextId;
    create<T>(timeoutMs: number): {
        id: string;
        promise: Promise<T>;
    };
    resolve<T>(id: string, value: T): boolean;
    reject(id: string, error: unknown): boolean;
    rejectAll(error: unknown): void;
}
//# sourceMappingURL=request-tracker.d.ts.map