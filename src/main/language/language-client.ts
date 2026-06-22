import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import type {
  LsCompletions,
  LsDiagnostic,
  LsHover,
  LsLocation,
  LsRenameResult,
  LsSemanticTokens,
  LsSignatureHelp,
  LsTextEdit,
} from '@shared/ipc-contract';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface WorkerReply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

/** Spawn the language worker lazily; respawn transparently if it ever dies. */
function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(join(__dirname, 'language.worker.js'));
  w.on('message', (msg: WorkerReply) => {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error ?? 'Language service error'));
  });
  const fail = (err: Error): void => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    // Drop the handle so the next call spins up a fresh service (recovers from a crash).
    worker = null;
  };
  w.on('error', fail);
  w.on('exit', (code) => {
    if (code !== 0) fail(new Error(`Language worker exited with code ${code}`));
  });
  worker = w;
  return w;
}

function call<T>(method: string, args: unknown[]): Promise<T> {
  const w = ensureWorker();
  const id = (seq += 1);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    w.postMessage({ id, method, args });
  });
}

/** Fire-and-forget document sync — no reply needed, ordered ahead of subsequent queries. */
function notify(method: string, args: unknown[]): void {
  ensureWorker().postMessage({ method, args });
}

/** Async proxy mirroring the worker's LanguageServiceManager; all heavy work runs off-main. */
export const languageClient = {
  initializeProject: (root: string) => call<void>('initializeProject', [root]),
  openDocument: (file: string, content: string) => notify('openDocument', [file, content]),
  updateDocument: (file: string, content: string) => notify('updateDocument', [file, content]),
  closeDocument: (file: string) => notify('closeDocument', [file]),
  getDiagnostics: (file: string) => call<LsDiagnostic[]>('getDiagnostics', [file]),
  getDefinition: (file: string, line: number, col: number) =>
    call<LsLocation[]>('getDefinition', [file, line, col]),
  getReferences: (file: string, line: number, col: number) =>
    call<LsLocation[]>('getReferences', [file, line, col]),
  getHover: (file: string, line: number, col: number) =>
    call<LsHover | null>('getHover', [file, line, col]),
  getCompletions: (file: string, line: number, col: number) =>
    call<LsCompletions>('getCompletions', [file, line, col]),
  getSignatureHelp: (file: string, line: number, col: number) =>
    call<LsSignatureHelp | null>('getSignatureHelp', [file, line, col]),
  renameSymbol: (file: string, line: number, col: number, newName: string) =>
    call<LsRenameResult>('renameSymbol', [file, line, col, newName]),
  formatDocument: (file: string) => call<LsTextEdit[]>('formatDocument', [file]),
  getSemanticTokens: (file: string) => call<LsSemanticTokens>('getSemanticTokens', [file]),
};
