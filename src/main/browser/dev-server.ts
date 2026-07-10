import net from 'node:net';
import type { DevServerStatus } from '@shared/ipc-contract';

/**
 * Dev-server detection for the embedded browser. There's no HTTP client involved — a bare TCP
 * connect is enough to know whether something is listening on a local port, and it's fast and
 * framework-agnostic (Next.js, Vite, CRA, etc. all just open a port).
 */

/** Resolve true if a TCP connection to `host:port` succeeds within `timeoutMs`. */
export function isPortOpen(port: number, host = '127.0.0.1', timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (open: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

/** Probe candidate dev-server ports in parallel and report which are accepting connections. */
export async function probePorts(ports: number[]): Promise<DevServerStatus[]> {
  const unique = [...new Set(ports)].filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
  return Promise.all(
    unique.map(async (port) => ({
      port,
      url: `http://localhost:${port}`,
      running: await isPortOpen(port),
    })),
  );
}
