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

const port = parentPort;
if (port) {
  port.on('message', (msg: WorkerRequest) => {
    const { id, method, args } = msg;
    try {
      const result = handle(method, args);
      if (id != null) port.postMessage({ id, ok: true, result });
    } catch (e) {
      if (id != null) port.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
