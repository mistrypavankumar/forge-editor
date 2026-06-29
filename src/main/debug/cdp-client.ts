import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Minimal Chrome DevTools Protocol client over a WebSocket. Node's V8 inspector speaks CDP:
 * requests are `{id, method, params}` and resolve with `{id, result}` (or `{id, error}`); events
 * arrive as `{method, params}` with no id and are re-emitted by `method` name.
 *
 * Electron's main process runs Node 20, which has no global `WebSocket`, so we connect through
 * the `ws` package. This is deliberately tiny — just enough to drive `Debugger`/`Runtime`.
 */
export class CdpClient extends EventEmitter {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingCall>();

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // The inspector can stream large RemoteObject previews; lift the default payload cap.
      const socket = new WebSocket(url, { maxPayload: 256 * 1024 * 1024 });
      this.socket = socket;
      socket.on('open', () => resolve());
      socket.on('error', (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
        this.emit('socket-error', error);
      });
      socket.on('close', () => this.emit('socket-close'));
      socket.on('message', (data) => this.onMessage(data.toString()));
    });
  }

  private onMessage(text: string): void {
    let msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof msg.id === 'number') {
      const call = this.pending.get(msg.id);
      if (!call) return;
      this.pending.delete(msg.id);
      if (msg.error) call.reject(new Error(msg.error.message ?? 'CDP error'));
      else call.resolve(msg.result);
    } else if (msg.method) {
      this.emit(msg.method, msg.params);
    }
  }

  /** Send a CDP command and resolve with its `result` payload (rejects on a protocol error). */
  send<T = Record<string, unknown>>(method: string, params?: Record<string, unknown>): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('CDP socket is not connected'));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      socket.send(JSON.stringify({ id, method, params: params ?? {} }), (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  close(): void {
    for (const call of this.pending.values()) call.reject(new Error('CDP connection closed'));
    this.pending.clear();
    try {
      this.socket?.close();
    } catch {
      // ignore — already closing/closed
    }
    this.socket = null;
  }
}
