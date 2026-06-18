import { ipcRenderer } from 'electron';
import {
  IpcChannels,
  type ForgeApi,
  type TerminalDataEvent,
  type TerminalExitEvent,
} from '@shared/ipc-contract';

export const api: ForgeApi = {
  ping: (msg) => ipcRenderer.invoke(IpcChannels.ping, msg),
  openFolder: () => ipcRenderer.invoke(IpcChannels.openFolder),
  openFileDialog: () => ipcRenderer.invoke(IpcChannels.openFileDialog),
  saveDialog: (defaultName) => ipcRenderer.invoke(IpcChannels.saveDialog, defaultName),
  readDirectory: (path) => ipcRenderer.invoke(IpcChannels.readDirectory, path),
  readFile: (path) => ipcRenderer.invoke(IpcChannels.readFile, path),
  writeFile: (path, content) => ipcRenderer.invoke(IpcChannels.writeFile, path, content),
  listFiles: (rootPath) => ipcRenderer.invoke(IpcChannels.listFiles, rootPath),
  gitBranch: (rootPath) => ipcRenderer.invoke(IpcChannels.gitBranch, rootPath),
  gitChangedFiles: (rootPath) => ipcRenderer.invoke(IpcChannels.gitChanges, rootPath),
  gitCommit: (rootPath, message) => ipcRenderer.invoke(IpcChannels.gitCommit, rootPath, message),
  gitStage: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitStage, rootPath, path),
  gitUnstage: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitUnstage, rootPath, path),
  gitDiscard: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitDiscard, rootPath, path),
  gitStageAll: (rootPath) => ipcRenderer.invoke(IpcChannels.gitStageAll, rootPath),
  gitOriginal: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitOriginal, rootPath, path),
  gitStaged: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitStaged, rootPath, path),
  gitBlame: (rootPath, path) => ipcRenderer.invoke(IpcChannels.gitBlame, rootPath, path),
  gitBranches: (rootPath) => ipcRenderer.invoke(IpcChannels.gitBranches, rootPath),
  gitCheckout: (rootPath, name) => ipcRenderer.invoke(IpcChannels.gitCheckout, rootPath, name),
  gitCreateBranch: (rootPath, name) =>
    ipcRenderer.invoke(IpcChannels.gitCreateBranch, rootPath, name),
  gitPush: (rootPath) => ipcRenderer.invoke(IpcChannels.gitPush, rootPath),
  gitPull: (rootPath) => ipcRenderer.invoke(IpcChannels.gitPull, rootPath),
  gitFetch: (rootPath) => ipcRenderer.invoke(IpcChannels.gitFetch, rootPath),
  gitLog: (rootPath, limit) => ipcRenderer.invoke(IpcChannels.gitLog, rootPath, limit),
  search: (rootPath, options) => ipcRenderer.invoke(IpcChannels.search, rootPath, options),
  replaceInFiles: (rootPath, options, replacement, files) =>
    ipcRenderer.invoke(IpcChannels.replaceInFiles, rootPath, options, replacement, files),
  watchWorkspace: (rootPath) => ipcRenderer.send(IpcChannels.watchWorkspace, rootPath),
  onFsChanged: (cb) => {
    const listener = (): void => cb();
    ipcRenderer.on(IpcChannels.fsChanged, listener);
    return () => ipcRenderer.removeListener(IpcChannels.fsChanged, listener);
  },
  onMenuAction: (cb) => {
    const listener = (_e: unknown, id: string): void => cb(id);
    ipcRenderer.on(IpcChannels.menuAction, listener);
    return () => ipcRenderer.removeListener(IpcChannels.menuAction, listener);
  },
  syncMenuState: (autoSave) => ipcRenderer.send(IpcChannels.menuSyncState, autoSave),
  isMac: process.platform === 'darwin',
  rename: (oldPath, newPath) => ipcRenderer.invoke(IpcChannels.rename, oldPath, newPath),
  remove: (path) => ipcRenderer.invoke(IpcChannels.remove, path),
  copyEntry: (src, destDir) => ipcRenderer.invoke(IpcChannels.copyEntry, src, destDir),
  moveEntry: (src, destDir) => ipcRenderer.invoke(IpcChannels.moveEntry, src, destDir),
  mkdir: (path) => ipcRenderer.invoke(IpcChannels.mkdir, path),
  loadSettings: () => ipcRenderer.invoke(IpcChannels.loadSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IpcChannels.saveSettings, settings),
  runFormatter: (rootPath, tool, args) =>
    ipcRenderer.invoke(IpcChannels.runFormatter, rootPath, tool, args),
  formatText: (rootPath, tool, args, input) =>
    ipcRenderer.invoke(IpcChannels.formatText, rootPath, tool, args, input),
  runDiagnostics: (rootPath) => ipcRenderer.invoke(IpcChannels.runDiagnostics, rootPath),
  resolveImport: (rootPath, fromFile, spec) =>
    ipcRenderer.invoke(IpcChannels.resolveImport, rootPath, fromFile, spec),
  createTerminal: (args) => ipcRenderer.invoke(IpcChannels.terminalCreate, args),
  sendInput: (id, data) => ipcRenderer.send(IpcChannels.terminalInput, id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send(IpcChannels.terminalResize, id, cols, rows),
  killCommand: (id) => ipcRenderer.invoke(IpcChannels.terminalKill, id),
  openExternal: (url) => ipcRenderer.invoke(IpcChannels.openExternal, url),
  editorLanguage: {
    initializeProject: (root) => ipcRenderer.invoke(IpcChannels.langInit, root),
    openDocument: (file, content) => ipcRenderer.send(IpcChannels.langOpenDoc, file, content),
    updateDocument: (file, content) => ipcRenderer.send(IpcChannels.langUpdateDoc, file, content),
    closeDocument: (file) => ipcRenderer.send(IpcChannels.langCloseDoc, file),
    getDiagnostics: (file) => ipcRenderer.invoke(IpcChannels.langDiagnostics, file),
    getDefinition: (file, line, col) => ipcRenderer.invoke(IpcChannels.langDefinition, file, line, col),
    getReferences: (file, line, col) => ipcRenderer.invoke(IpcChannels.langReferences, file, line, col),
    getHover: (file, line, col) => ipcRenderer.invoke(IpcChannels.langHover, file, line, col),
    getCompletions: (file, line, col) =>
      ipcRenderer.invoke(IpcChannels.langCompletions, file, line, col),
    getSignatureHelp: (file, line, col) =>
      ipcRenderer.invoke(IpcChannels.langSignatureHelp, file, line, col),
    renameSymbol: (file, line, col, newName) =>
      ipcRenderer.invoke(IpcChannels.langRename, file, line, col, newName),
    formatDocument: (file) => ipcRenderer.invoke(IpcChannels.langFormat, file),
    getSemanticTokens: (file) => ipcRenderer.invoke(IpcChannels.langSemanticTokens, file),
  },
  onTerminalData: (cb) => {
    const listener = (_e: unknown, payload: TerminalDataEvent): void => cb(payload);
    ipcRenderer.on(IpcChannels.terminalData, listener);
    return () => ipcRenderer.removeListener(IpcChannels.terminalData, listener);
  },
  onTerminalExit: (cb) => {
    const listener = (_e: unknown, payload: TerminalExitEvent): void => cb(payload);
    ipcRenderer.on(IpcChannels.terminalExit, listener);
    return () => ipcRenderer.removeListener(IpcChannels.terminalExit, listener);
  },
};
