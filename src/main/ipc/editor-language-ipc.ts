import type { IpcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-contract';
import { toResult } from '@shared/result';
import { languageClient } from '../language/language-client';
import { jdtlsService } from '../java/jdtls-service';

const isJava = (file: string): boolean => file.endsWith('.java');

/**
 * Wire the editor language features into IPC. TypeScript/JavaScript queries go to the in-process
 * TS Language Service (worker thread); `.java` files are routed to the Eclipse JDT Language Server
 * (jdtls) instead. Both speak the same renderer-facing shapes (`Ls*` types), so the renderer's
 * providers don't care which backend answered. Queries are wrapped in {@link toResult} so a
 * backend error surfaces as a failed Result rather than an unhandled rejection. Features jdtls
 * isn't wired for here (signature help, rename, format, semantic tokens) return empty for Java.
 */
export function registerLanguageIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IpcChannels.langInit, (_e, rootPath: string) =>
    toResult(() => {
      // Java init is lazy (on first .java doc); just record the root here.
      jdtlsService.setWorkspace(rootPath);
      return languageClient.initializeProject(rootPath);
    }),
  );
  ipcMain.on(IpcChannels.langOpenDoc, (_e, file: string, content: string) =>
    isJava(file) ? jdtlsService.openDocument(file, content) : languageClient.openDocument(file, content),
  );
  ipcMain.on(IpcChannels.langUpdateDoc, (_e, file: string, content: string) =>
    isJava(file)
      ? jdtlsService.updateDocument(file, content)
      : languageClient.updateDocument(file, content),
  );
  ipcMain.on(IpcChannels.langCloseDoc, (_e, file: string) =>
    isJava(file) ? jdtlsService.closeDocument(file) : languageClient.closeDocument(file),
  );
  ipcMain.handle(IpcChannels.langDiagnostics, (_e, file: string) =>
    toResult(async () =>
      isJava(file) ? jdtlsService.getDiagnostics(file) : languageClient.getDiagnostics(file),
    ),
  );
  ipcMain.handle(IpcChannels.langDefinition, (_e, file: string, line: number, col: number) =>
    toResult(() =>
      isJava(file)
        ? jdtlsService.getDefinition(file, line, col)
        : languageClient.getDefinition(file, line, col),
    ),
  );
  ipcMain.handle(IpcChannels.langReferences, (_e, file: string, line: number, col: number) =>
    toResult(() =>
      isJava(file)
        ? jdtlsService.getReferences(file, line, col)
        : languageClient.getReferences(file, line, col),
    ),
  );
  ipcMain.handle(IpcChannels.langHover, (_e, file: string, line: number, col: number) =>
    toResult(() =>
      isJava(file) ? jdtlsService.getHover(file, line, col) : languageClient.getHover(file, line, col),
    ),
  );
  ipcMain.handle(IpcChannels.langCompletions, (_e, file: string, line: number, col: number) =>
    toResult(() =>
      isJava(file)
        ? jdtlsService.getCompletions(file, line, col)
        : languageClient.getCompletions(file, line, col),
    ),
  );
  ipcMain.handle(
    IpcChannels.langCompletionDetails,
    (_e, file: string, line: number, col: number, label: string, source?: string, data?: unknown) =>
      toResult(async () =>
        // jdtls has no completion-resolve wired up; only TS/JS get auto-import details.
        isJava(file)
          ? null
          : languageClient.getCompletionDetails(file, line, col, label, source, data),
      ),
  );
  ipcMain.handle(IpcChannels.langSignatureHelp, (_e, file: string, line: number, col: number) =>
    toResult(async () => (isJava(file) ? null : languageClient.getSignatureHelp(file, line, col))),
  );
  ipcMain.handle(
    IpcChannels.langRename,
    (_e, file: string, line: number, col: number, newName: string) =>
      toResult(async () =>
        isJava(file) ? { edits: [] } : languageClient.renameSymbol(file, line, col, newName),
      ),
  );
  ipcMain.handle(IpcChannels.langFormat, (_e, file: string) =>
    toResult(async () => (isJava(file) ? [] : languageClient.formatDocument(file))),
  );
  ipcMain.handle(IpcChannels.langSemanticTokens, (_e, file: string) =>
    toResult(async () => (isJava(file) ? { data: [] } : languageClient.getSemanticTokens(file))),
  );
  ipcMain.handle(IpcChannels.langDocSymbols, (_e, file: string) =>
    // jdtls symbol support isn't wired up; only TS/JS files surface document symbols.
    toResult(async () => (isJava(file) ? [] : languageClient.getDocumentSymbols(file))),
  );
  ipcMain.handle(IpcChannels.langWorkspaceSymbols, (_e, query: string, file?: string) =>
    toResult(async () => (file && isJava(file) ? [] : languageClient.getWorkspaceSymbols(query, file))),
  );
}
