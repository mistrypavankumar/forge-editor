import type { IpcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-contract';
import { toResult } from '@shared/result';
import { languageClient } from '../language/language-client';

/**
 * Wire the TypeScript Language Service into IPC. The service runs in a worker thread
 * (see language-client/language.worker), so these handlers just forward to it — nothing
 * heavy executes on the main thread. Queries are wrapped in {@link toResult} so a worker
 * error surfaces as a failed Result instead of an unhandled rejection.
 */
export function registerLanguageIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.langInit, (_e, rootPath: string) =>
    toResult(() => languageClient.initializeProject(rootPath)),
  );
  ipcMain.on(IpcChannels.langOpenDoc, (_e, file: string, content: string) =>
    languageClient.openDocument(file, content),
  );
  ipcMain.on(IpcChannels.langUpdateDoc, (_e, file: string, content: string) =>
    languageClient.updateDocument(file, content),
  );
  ipcMain.on(IpcChannels.langCloseDoc, (_e, file: string) => languageClient.closeDocument(file));
  ipcMain.handle(IpcChannels.langDiagnostics, (_e, file: string) =>
    toResult(() => languageClient.getDiagnostics(file)),
  );
  ipcMain.handle(IpcChannels.langDefinition, (_e, file: string, line: number, col: number) =>
    toResult(() => languageClient.getDefinition(file, line, col)),
  );
  ipcMain.handle(IpcChannels.langReferences, (_e, file: string, line: number, col: number) =>
    toResult(() => languageClient.getReferences(file, line, col)),
  );
  ipcMain.handle(IpcChannels.langHover, (_e, file: string, line: number, col: number) =>
    toResult(() => languageClient.getHover(file, line, col)),
  );
  ipcMain.handle(IpcChannels.langCompletions, (_e, file: string, line: number, col: number) =>
    toResult(() => languageClient.getCompletions(file, line, col)),
  );
  ipcMain.handle(IpcChannels.langSignatureHelp, (_e, file: string, line: number, col: number) =>
    toResult(() => languageClient.getSignatureHelp(file, line, col)),
  );
  ipcMain.handle(
    IpcChannels.langRename,
    (_e, file: string, line: number, col: number, newName: string) =>
      toResult(() => languageClient.renameSymbol(file, line, col, newName)),
  );
  ipcMain.handle(IpcChannels.langFormat, (_e, file: string) =>
    toResult(() => languageClient.formatDocument(file)),
  );
  ipcMain.handle(IpcChannels.langSemanticTokens, (_e, file: string) =>
    toResult(() => languageClient.getSemanticTokens(file)),
  );
}
