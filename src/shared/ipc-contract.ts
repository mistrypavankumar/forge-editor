import type { Result } from './result';

export const IpcChannels = {
  ping: 'forge:ping',
  openFolder: 'forge:fs:openFolder',
  openFileDialog: 'forge:fs:openFileDialog',
  readDirectory: 'forge:fs:readDirectory',
  readFile: 'forge:fs:readFile',
  writeFile: 'forge:fs:writeFile',
  listFiles: 'forge:fs:listFiles',
  gitBranch: 'forge:fs:gitBranch',
  rename: 'forge:fs:rename',
  remove: 'forge:fs:remove',
  copyEntry: 'forge:fs:copyEntry',
  moveEntry: 'forge:fs:moveEntry',
  mkdir: 'forge:fs:mkdir',
  loadSettings: 'forge:settings:load',
  saveSettings: 'forge:settings:save',
  terminalRun: 'forge:terminal:run',
  terminalKill: 'forge:terminal:kill',
  terminalData: 'forge:terminal:data',
  terminalExit: 'forge:terminal:exit',
  openExternal: 'forge:shell:openExternal',
} as const;

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface WorkspaceData {
  rootPath: string;
  tree: DirEntry[];
}

export interface FileItem {
  name: string;
  path: string;
  relPath: string;
}

export interface OpenedFile {
  path: string;
  name: string;
  content: string;
}

export interface RecentEntry {
  type: 'folder' | 'file';
  path: string;
  name: string;
}

export interface ForgeSettings {
  themeId?: string;
  sidebarVisible?: boolean;
  sidebarSide?: 'left' | 'right';
  keybindings?: Record<string, string>;
  recents?: RecentEntry[];
}

export interface TerminalRunArgs {
  id: string;
  command: string;
  cwd?: string;
}

export interface TerminalDataEvent {
  id: string;
  chunk: string;
}

export interface TerminalExitEvent {
  id: string;
  code: number;
}

export interface ForgeApi {
  ping: (msg: string) => Promise<string>;
  openFolder: () => Promise<Result<WorkspaceData | null>>;
  openFileDialog: () => Promise<Result<OpenedFile | null>>;
  readDirectory: (path: string) => Promise<Result<DirEntry[]>>;
  readFile: (path: string) => Promise<Result<string>>;
  writeFile: (path: string, content: string) => Promise<Result<void>>;
  listFiles: (rootPath: string) => Promise<Result<FileItem[]>>;
  gitBranch: (rootPath: string) => Promise<Result<string | null>>;
  rename: (oldPath: string, newPath: string) => Promise<Result<void>>;
  remove: (path: string) => Promise<Result<void>>;
  copyEntry: (src: string, destDir: string) => Promise<Result<void>>;
  moveEntry: (src: string, destDir: string) => Promise<Result<void>>;
  mkdir: (path: string) => Promise<Result<void>>;
  loadSettings: () => Promise<Result<ForgeSettings>>;
  saveSettings: (settings: ForgeSettings) => Promise<Result<void>>;
  runCommand: (args: TerminalRunArgs) => Promise<Result<void>>;
  killCommand: (id: string) => Promise<Result<void>>;
  openExternal: (url: string) => Promise<Result<void>>;
  onTerminalData: (cb: (e: TerminalDataEvent) => void) => () => void;
  onTerminalExit: (cb: (e: TerminalExitEvent) => void) => () => void;
}

export function pongOf(msg: string): string {
  return `pong: ${msg}`;
}
