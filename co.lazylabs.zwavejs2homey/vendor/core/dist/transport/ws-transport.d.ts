export interface TransportEvents {
    onOpen?: () => void;
    onClose?: (event: {
        code: number;
        reason: string;
        wasClean: boolean;
    }) => void;
    onError?: (error: unknown) => void;
    onMessage?: (data: string) => void;
}
export declare class WsTransport {
    private socket?;
    connect(url: string, events: TransportEvents, headers?: Record<string, string>): Promise<void>;
    send(data: string): void;
    close(): void;
    isOpen(): boolean;
}
//# sourceMappingURL=ws-transport.d.ts.map