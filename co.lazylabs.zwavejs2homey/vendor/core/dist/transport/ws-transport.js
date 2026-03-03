"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsTransport = void 0;
const ws_1 = require("ws");
class WsTransport {
    connect(url, events, headers) {
        if (this.socket && this.socket.readyState === ws_1.WebSocket.OPEN) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const socket = new ws_1.WebSocket(url, { headers });
            let settled = false;
            this.socket = socket;
            socket.once('open', () => {
                settled = true;
                events.onOpen?.();
                resolve();
            });
            socket.on('message', (data) => {
                events.onMessage?.(typeof data === 'string' ? data : data.toString());
            });
            socket.on('close', (code, reason) => {
                const closeFrameReceived = Boolean(socket._closeFrameReceived);
                const closeFrameSent = Boolean(socket._closeFrameSent);
                const wasClean = closeFrameReceived && closeFrameSent;
                events.onClose?.({ code, reason: reason.toString(), wasClean });
            });
            socket.on('error', (error) => {
                events.onError?.(error);
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            });
        });
    }
    send(data) {
        if (!this.socket || this.socket.readyState !== ws_1.WebSocket.OPEN) {
            throw new Error('WebSocket is not connected');
        }
        this.socket.send(data);
    }
    close() {
        this.socket?.close();
    }
    isOpen() {
        return this.socket?.readyState === ws_1.WebSocket.OPEN;
    }
}
exports.WsTransport = WsTransport;
