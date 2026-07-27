import { parentPort } from 'node:worker_threads';
import { languageManager } from './typescript-service';

/**
 * Worker-thread host for the TypeScript Language Service. Running it off the Electron main thread
 * keeps the program build, type-checking, and per-keystroke completion/semantic work from blocking
 * IPC and the UI. Messages are `{ id?, method, args }`; requests with an `id` get a `{ id, ok, … }`
 * reply, fire-and-forget document syncs (open/update/close) carry no `id`.
 */
interface WorkerRequest {
  id?: number;
  method: string;
  args: unknown[];
}

function handle(method: string, args: unknown[]): unknown {
  switch (method) {
    case 'initializeProject':
      return languageManager.initializeProject(args[0] as string);
    case 'openDocument':
      return languageManager.openDocument(args[0] as string, args[1] as string);
    case 'updateDocument':
      return languageManager.updateDocument(args[0] as string, args[1] as string);
    case 'closeDocument':
      return languageManager.closeDocument(args[0] as string);
    case 'getDiagnostics':
      return languageManager.getDiagnostics(args[0] as string);
    case 'getDefinition':
      return languageManager.getDefinition(args[0] as string, args[1] as number, args[2] as number);
    case 'getReferences':
      return languageManager.getReferences(args[0] as string, args[1] as number, args[2] as number);
    case 'getImplementations':
      return languageManager.getImplementations(
        args[0] as string,
        args[1] as number,
        args[2] as number,
      );
    case 'getHover':
      return languageManager.getHover(args[0] as string, args[1] as number, args[2] as number);
    case 'getCompletions':
      return languageManager.getCompletions(args[0] as string, args[1] as number, args[2] as number);
    case 'getCompletionDetails':
      return languageManager.getCompletionDetails(
        args[0] as string,
        args[1] as number,
        args[2] as number,
        args[3] as string,
        args[4] as string | undefined,
        args[5],
      );
    case 'getSignatureHelp':
      return languageManager.getSignatureHelp(args[0] as string, args[1] as number, args[2] as number);
    case 'renameSymbol':
      return languageManager.renameSymbol(
        args[0] as string,
        args[1] as number,
        args[2] as number,
        args[3] as string,
      );
    case 'formatDocument':
      return languageManager.formatDocument(args[0] as string);
    case 'getSemanticTokens':
      return languageManager.getSemanticTokens(args[0] as string);
    case 'getDocumentSymbols':
      return languageManager.getDocumentSymbols(args[0] as string);
    case 'getWorkspaceSymbols':
      return languageManager.getWorkspaceSymbols(args[0] as string, args[1] as string | undefined);
    default:
      throw new Error(`Unknown language method: ${method}`);
  }
}

/**
 * Feature requests the user is actively waiting on (the completion popup, signature help, hover, a
 * go-to-definition jump). These jump ahead of background passes — full-file diagnostics, semantic
 * tokens, document symbols, and the inlay-hint reference fan-out — that the editor fires around the
 * same keystrokes. Every handler runs synchronously to completion on this one thread, so a slow
 * background pass already in flight can't be preempted; prioritization only reorders what is still
 * *queued*, which is what keeps a just-typed Cmd+Space from waiting behind a diagnostics refresh.
 */
const INTERACTIVE = new Set([
  'getCompletions',
  'getCompletionDetails',
  'getSignatureHelp',
  'getHover',
  'getDefinition',
]);

/**
 * Background passes keyed by `args[0]` = file, re-requested by the editor after every edit. A queued
 * one that predates an edit to its file is answering a question about text the user has already
 * replaced, so it is dropped rather than run — otherwise a fast typist builds an unbounded backlog
 * of full-program searches, and the interactive request at the head of the queue still has to wait
 * out whichever of them is mid-flight. Deliberately excludes the user-initiated whole-file
 * operations (format, rename) — those must run even if the file changed underneath them.
 */
const STALE_ON_EDIT = new Set([
  'getDiagnostics',
  'getSemanticTokens',
  'getDocumentSymbols',
  'getReferences',
  'getImplementations',
]);

const port = parentPort;
if (port) {
  const queue: WorkerRequest[] = [];
  let draining = false;

  const run = (msg: WorkerRequest): void => {
    const { id, method, args } = msg;
    try {
      const result = handle(method, args);
      if (id != null) port.postMessage({ id, ok: true, result });
    } catch (e) {
      if (id != null) port.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const drain = (): void => {
    // Apply every pending document sync first, in arrival order, so any query that runs below sees
    // exactly the text the user has typed. Syncs (open/update/close) are cheap Map writes with no
    // `id`; reordering queries must never let one skip ahead of an edit that preceded it.
    for (let i = 0; i < queue.length; ) {
      const msg = queue[i];
      if (msg.id != null) {
        i++;
        continue;
      }
      // Queue order is arrival order, so anything still sitting ahead of this sync was asked before
      // the edit landed. Answer the now-stale background passes with an error instead of running
      // them: every caller treats a failed Result as "no data for this pass" and the editor
      // re-requests against the new text.
      const file = typeof msg.args[0] === 'string' ? msg.args[0] : null;
      for (let j = 0; file && j < i; ) {
        const q = queue[j];
        if (q.id != null && STALE_ON_EDIT.has(q.method) && q.args[0] === file) {
          port.postMessage({ id: q.id, ok: false, error: 'Superseded by a newer edit' });
          queue.splice(j, 1);
          i--;
        } else {
          j++;
        }
      }
      run(queue.splice(i, 1)[0]);
    }
    if (queue.length === 0) {
      draining = false;
      return;
    }
    // Run one query per tick: the highest-priority pending one, ties broken by arrival order.
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      const better = INTERACTIVE.has(queue[i].method) && !INTERACTIVE.has(queue[best].method);
      if (better) best = i;
    }
    run(queue.splice(best, 1)[0]);
    // Yield before the next pick so requests that arrived during the (synchronous) run above are
    // enqueued first — this is what lets a fresh interactive request overtake queued background work.
    setImmediate(drain);
  };

  port.on('message', (msg: WorkerRequest) => {
    queue.push(msg);
    if (!draining) {
      draining = true;
      setImmediate(drain);
    }
  });
}
