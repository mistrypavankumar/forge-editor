import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import type {
  LsCompletionDetail,
  LsCompletions,
  LsDiagnostic,
  LsHover,
  LsLocation,
  LsRenameResult,
  LsSemanticTokens,
  LsSignatureHelp,
  LsSymbol,
  LsTextEdit,
} from '@shared/ipc-contract';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
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
    if (p.timer) clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error ?? 'Language service error'));
  });
  const fail = (err: Error): void => {
    // A dead worker fires both 'error' and 'exit'; once it has been replaced, its late events must
    // not reject the new worker's in-flight calls.
    if (worker !== w) return;
    for (const p of pending.values()) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
    // Drop the handle so the next call spins up a fresh service (recovers from a crash).
    worker = null;
  };
  w.on('error', fail);
  // Any exit — clean or not — strands every in-flight call and leaves a handle whose postMessage
  // silently goes nowhere. Settling and dropping it keeps a dead worker from wedging IntelliSense
  // (a completion left pending shows as a permanent "Loading…" in the suggest widget).
  w.on('exit', (code) => fail(new Error(`Language worker exited with code ${code}`)));
  worker = w;
  return w;
}

/**
 * Upper bound on how long a query may stay unanswered. A reply that never arrives — a wedged or
 * silently dead worker — otherwise leaves the renderer's provider promise pending forever, which
 * Monaco renders as a suggest popup stuck on "Loading…". Timing out turns that into an ordinary
 * failed Result: the feature comes up empty for one pass and the next keystroke retries.
 */
const CALL_TIMEOUT_MS = 30_000;

function call<T>(method: string, args: unknown[]): Promise<T> {
  const w = ensureWorker();
  const id = (seq += 1);
  return new Promise<T>((resolve, reject) => {
    // Project initialization is exempt: building the program for a large monorepo runs long.
    const timer =
      method === 'initializeProject'
        ? undefined
        : setTimeout(() => {
            // A late reply is harmless — the message handler ignores ids no longer pending.
            if (pending.delete(id)) reject(new Error(`Language service timed out: ${method}`));
          }, CALL_TIMEOUT_MS);
    timer?.unref?.();
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
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
  getImplementations: (file: string, line: number, col: number) =>
    call<LsLocation[]>('getImplementations', [file, line, col]),
  getHover: (file: string, line: number, col: number) =>
    call<LsHover | null>('getHover', [file, line, col]),
  getCompletions: (file: string, line: number, col: number) =>
    call<LsCompletions>('getCompletions', [file, line, col]),
  getCompletionDetails: (
    file: string,
    line: number,
    col: number,
    label: string,
    source?: string,
    data?: unknown,
  ) => call<LsCompletionDetail | null>('getCompletionDetails', [file, line, col, label, source, data]),
  getSignatureHelp: (file: string, line: number, col: number) =>
    call<LsSignatureHelp | null>('getSignatureHelp', [file, line, col]),
  renameSymbol: (file: string, line: number, col: number, newName: string) =>
    call<LsRenameResult>('renameSymbol', [file, line, col, newName]),
  formatDocument: (file: string) => call<LsTextEdit[]>('formatDocument', [file]),
  getSemanticTokens: (file: string) => call<LsSemanticTokens>('getSemanticTokens', [file]),
  getDocumentSymbols: (file: string) => call<LsSymbol[]>('getDocumentSymbols', [file]),
  getWorkspaceSymbols: (query: string, file?: string) =>
    call<LsSymbol[]>('getWorkspaceSymbols', [query, file]),
};
