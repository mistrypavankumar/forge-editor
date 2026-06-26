import type { IpcMain } from 'electron';
import { IpcChannels, type GraphqlHttpRequest } from '@shared/ipc-contract';
import { toResult } from '@shared/result';

/** How long a single GraphQL request may run before it's aborted. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Wire the API Explorer's GraphQL HTTP request into IPC. The request is performed here in
 * the main process (Node's global fetch) rather than the renderer, so it behaves like a real
 * HTTP client — no CORS, and arbitrary endpoints/headers work. The renderer pre-serializes
 * the body and supplies any Authorization/custom headers; we return the raw status + body for
 * the renderer to parse and display.
 */
export function registerGraphqlIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.graphqlRequest, (_e, req: GraphqlHttpRequest) =>
    toResult(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(req.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(req.headers ?? {}),
          },
          body: req.body,
          signal: controller.signal,
        });
        const body = await res.text();
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return { status: res.status, statusText: res.statusText, body, headers };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}
