import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

interface Pending {
  resolve: (value: Json) => void;
  reject: (err: Error) => void;
}

/**
 * A minimal Language Server Protocol client speaking JSON-RPC over a child process's stdio
 * (the `Content-Length` framing LSP mandates). Deliberately dependency-free — we only need
 * request/notify, inbound notifications (e.g. publishDiagnostics), and the ability to answer
 * the handful of server→client requests jdtls blocks on (configuration, registerCapability…).
 */
export class LspClient {
  private readonly proc: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private contentLength = -1;
  private seq = 0;
  private exited = false;
  private readonly pending = new Map<number, Pending>();
  private readonly notificationHandlers = new Map<string, (params: Json) => void>();
  private readonly requestHandlers = new Map<string, (params: Json) => Json>();
  private exitHandler: ((code: number | null) => void) | undefined;

  constructor(
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
  ) {
    this.proc = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    // jdtls writes verbose progress to stderr; swallow it so it doesn't pollute logs.
    this.proc.stderr.on('data', () => {});
    this.proc.on('error', () => this.die(null));
    this.proc.on('exit', (code) => this.die(code));
  }

  get pid(): number | undefined {
    return this.proc.pid;
  }

  get alive(): boolean {
    return !this.exited;
  }

  onExit(handler: (code: number | null) => void): void {
    this.exitHandler = handler;
  }

  onNotification(method: string, handler: (params: Json) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  /** Register a responder for a server→client request (jdtls hangs without these answered). */
  onRequest(method: string, handler: (params: Json) => Json): void {
    this.requestHandlers.set(method, handler);
  }

  request(method: string, params?: Json): Promise<Json> {
    if (this.exited) return Promise.reject(new Error('language server not running'));
    const id = ++this.seq;
    return new Promise<Json>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method: string, params?: Json): void {
    if (this.exited) return;
    this.send({ jsonrpc: '2.0', method, params });
  }

  dispose(): void {
    if (this.exited) return;
    try {
      this.proc.kill();
    } catch {
      // already gone
    }
  }

  private die(code: number | null): void {
    if (this.exited) return;
    this.exited = true;
    for (const p of this.pending.values()) p.reject(new Error('language server exited'));
    this.pending.clear();
    this.exitHandler?.(code);
  }

  private send(msg: Json): void {
    const payload = Buffer.from(JSON.stringify(msg), 'utf8');
    const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'ascii');
    try {
      this.proc.stdin.write(Buffer.concat([header, payload]));
    } catch {
      this.die(null);
    }
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      if (this.contentLength < 0) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd < 0) return;
        const header = this.buffer.subarray(0, headerEnd).toString('ascii');
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        this.contentLength = match ? Number(match[1]) : 0;
        this.buffer = this.buffer.subarray(headerEnd + 4);
      }
      if (this.buffer.length < this.contentLength) return;
      const body = this.buffer.subarray(0, this.contentLength).toString('utf8');
      this.buffer = this.buffer.subarray(this.contentLength);
      this.contentLength = -1;
      try {
        this.dispatch(JSON.parse(body) as Json);
      } catch {
        // ignore malformed frame
      }
    }
  }

  private dispatch(msg: Json): void {
    // Server→client request: id + method present. Answer it (default null) so jdtls proceeds.
    if (msg.id !== undefined && typeof msg.method === 'string') {
      const handler = this.requestHandlers.get(msg.method);
      const result = handler ? handler(msg.params) : null;
      this.send({ jsonrpc: '2.0', id: msg.id, result });
      return;
    }
    // Response to one of our requests.
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? 'language server error'));
      else p.resolve(msg.result);
      return;
    }
    // Server notification.
    if (typeof msg.method === 'string') {
      this.notificationHandlers.get(msg.method)?.(msg.params);
    }
  }
}
