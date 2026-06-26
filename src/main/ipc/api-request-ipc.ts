import type { IpcMain } from 'electron';
import { IpcChannels, type ApiHttpRequest } from '@shared/ipc-contract';
import { toResult } from '@shared/result';

/** How long a single request may run before it's aborted. */
const REQUEST_TIMEOUT_MS = 60_000;

/** Methods that never carry a request body. */
const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

/**
 * Wire the API Explorer's HTTP request into IPC. The request is performed here in the main
 * process (Node's global fetch) rather than the renderer, so it behaves like a real HTTP client —
 * no CORS, and arbitrary endpoints/methods/headers work. The renderer supplies the method, the
 * pre-serialized body, and any headers; we return the raw status + body + headers for the renderer
 * to parse and display.
 */
export function registerApiRequestIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.apiRequest, (_e, req: ApiHttpRequest) =>
    toResult(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const method = req.method ?? 'GET';
        const hasBody = !BODYLESS_METHODS.has(method) && req.body != null && req.body !== '';
        const headers: Record<string, string> = { accept: '*/*', ...(req.headers ?? {}) };
        // Default JSON content-type only when a body is present and the caller didn't set one.
        if (hasBody && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
          headers['content-type'] = 'application/json';
        }
        const res = await fetch(req.url, {
          method,
          headers,
          body: hasBody ? req.body : undefined,
          signal: controller.signal,
        });
        const body = await res.text();
        const responseHeaders: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
        return { status: res.status, statusText: res.statusText, body, headers: responseHeaders };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}
