import type { Result } from './result';

export const IpcChannels = {
  ping: 'forge:ping',
  openFolder: 'forge:fs:openFolder',
  readDirectory: 'forge:fs:readDirectory',
  readFile: 'forge:fs:readFile',
  writeFile: 'forge:fs:writeFile',
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

export interface ForgeApi {
  ping: (msg: string) => Promise<string>;
  openFolder: () => Promise<Result<WorkspaceData | null>>;
  readDirectory: (path: string) => Promise<Result<DirEntry[]>>;
  readFile: (path: string) => Promise<Result<string>>;
  writeFile: (path: string, content: string) => Promise<Result<void>>;
}

export function pongOf(msg: string): string {
  return `pong: ${msg}`;
}
