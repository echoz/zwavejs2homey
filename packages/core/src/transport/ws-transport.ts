import { WebSocket } from 'ws';
import type { RawData } from 'ws';

export interface TransportEvents {
  onOpen?: () => void;
  onClose?: (event: { code: number; reason: string; wasClean: boolean }) => void;
  onError?: (error: unknown) => void;
  onMessage?: (data: string) => void;
}

export class WsTransport {
  private socket?: WebSocket;

  connect(url: string, events: TransportEvents, headers?: Record<string, string>): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { headers });
      let settled = false;
      this.socket = socket;

      socket.once('open', () => {
        settled = true;
        events.onOpen?.();
        resolve();
      });

      socket.on('message', (data: RawData) => {
        events.onMessage?.(typeof data === 'string' ? data : data.toString());
      });

      socket.on('close', (code: number, reason: Buffer) => {
        events.onClose?.({ code, reason: reason.toString(), wasClean: true });
      });

      socket.on('error', (error: Error) => {
        events.onError?.(error);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
    });
  }

  send(data: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.socket.send(data);
  }

  close(): void {
    this.socket?.close();
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}
