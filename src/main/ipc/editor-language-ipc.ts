import type { IpcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-contract';
import { toResult } from '@shared/result';
import { languageManager } from '../language/typescript-service';

/**
 * Wire the TypeScript Language Service into IPC. Every query runs synchronously inside the LS
 * but is wrapped in {@link toResult} so a thrown error (e.g. a transient crash) surfaces as a
 * failed Result the renderer can ignore rather than an unhandled rejection.
 */
export function registerLanguageIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.langInit, (_e, rootPath: string) =>
    toResult(async () => languageManager.initializeProject(rootPath)),
  );
  ipcMain.on(IpcChannels.langOpenDoc, (_e, file: string, content: string) =>
    languageManager.openDocument(file, content),
  );
  ipcMain.on(IpcChannels.langUpdateDoc, (_e, file: string, content: string) =>
    languageManager.updateDocument(file, content),
  );
  ipcMain.on(IpcChannels.langCloseDoc, (_e, file: string) => languageManager.closeDocument(file));
  ipcMain.handle(IpcChannels.langDiagnostics, (_e, file: string) =>
    toResult(async () => languageManager.getDiagnostics(file)),
  );
  ipcMain.handle(IpcChannels.langDefinition, (_e, file: string, line: number, col: number) =>
    toResult(async () => languageManager.getDefinition(file, line, col)),
  );
  ipcMain.handle(IpcChannels.langReferences, (_e, file: string, line: number, col: number) =>
    toResult(async () => languageManager.getReferences(file, line, col)),
  );
  ipcMain.handle(IpcChannels.langHover, (_e, file: string, line: number, col: number) =>
    toResult(async () => languageManager.getHover(file, line, col)),
  );
  ipcMain.handle(IpcChannels.langCompletions, (_e, file: string, line: number, col: number) =>
    toResult(async () => languageManager.getCompletions(file, line, col)),
  );
  ipcMain.handle(IpcChannels.langSignatureHelp, (_e, file: string, line: number, col: number) =>
    toResult(async () => languageManager.getSignatureHelp(file, line, col)),
  );
  ipcMain.handle(
    IpcChannels.langRename,
    (_e, file: string, line: number, col: number, newName: string) =>
      toResult(async () => languageManager.renameSymbol(file, line, col, newName)),
  );
  ipcMain.handle(IpcChannels.langFormat, (_e, file: string) =>
    toResult(async () => languageManager.formatDocument(file)),
  );
  ipcMain.handle(IpcChannels.langSemanticTokens, (_e, file: string) =>
    toResult(async () => languageManager.getSemanticTokens(file)),
  );
}
