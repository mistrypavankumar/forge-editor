import type { Result } from './result';

export const IpcChannels = {
  ping: 'forge:ping',
  openFolder: 'forge:fs:openFolder',
  openFileDialog: 'forge:fs:openFileDialog',
  saveDialog: 'forge:fs:saveDialog',
  readDirectory: 'forge:fs:readDirectory',
  readFile: 'forge:fs:readFile',
  writeFile: 'forge:fs:writeFile',
  listFiles: 'forge:fs:listFiles',
  gitBranch: 'forge:fs:gitBranch',
  gitChanges: 'forge:git:changes',
  gitCommit: 'forge:git:commit',
  gitStage: 'forge:git:stage',
  gitUnstage: 'forge:git:unstage',
  gitDiscard: 'forge:git:discard',
  gitStageAll: 'forge:git:stageAll',
  gitOriginal: 'forge:git:original',
  gitStaged: 'forge:git:staged',
  gitBlame: 'forge:git:blame',
  gitBranches: 'forge:git:branches',
  gitCheckout: 'forge:git:checkout',
  gitCreateBranch: 'forge:git:createBranch',
  gitPush: 'forge:git:push',
  gitPull: 'forge:git:pull',
  gitFetch: 'forge:git:fetch',
  gitLog: 'forge:git:log',
  search: 'forge:search',
  replaceInFiles: 'forge:search:replace',
  watchWorkspace: 'forge:fs:watch',
  fsChanged: 'forge:fs:changed',
  menuAction: 'forge:menu:action',
  menuSyncState: 'forge:menu:syncState',
  rename: 'forge:fs:rename',
  remove: 'forge:fs:remove',
  copyEntry: 'forge:fs:copyEntry',
  moveEntry: 'forge:fs:moveEntry',
  mkdir: 'forge:fs:mkdir',
  loadSettings: 'forge:settings:load',
  saveSettings: 'forge:settings:save',
  runFormatter: 'forge:format:run',
  formatText: 'forge:format:text',
  runDiagnostics: 'forge:diagnostics:run',
  resolveImport: 'forge:nav:resolveImport',
  terminalCreate: 'forge:terminal:create',
  terminalInput: 'forge:terminal:input',
  terminalResize: 'forge:terminal:resize',
  terminalKill: 'forge:terminal:kill',
  terminalData: 'forge:terminal:data',
  terminalExit: 'forge:terminal:exit',
  openExternal: 'forge:shell:openExternal',
  // TypeScript Language Service (real IDE intelligence).
  langInit: 'forge:lang:init',
  langOpenDoc: 'forge:lang:openDoc',
  langUpdateDoc: 'forge:lang:updateDoc',
  langCloseDoc: 'forge:lang:closeDoc',
  langDiagnostics: 'forge:lang:diagnostics',
  langDefinition: 'forge:lang:definition',
  langReferences: 'forge:lang:references',
  langHover: 'forge:lang:hover',
  langCompletions: 'forge:lang:completions',
  langSignatureHelp: 'forge:lang:signatureHelp',
  langRename: 'forge:lang:rename',
  langFormat: 'forge:lang:format',
  langSemanticTokens: 'forge:lang:semanticTokens',
} as const;

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  /** True when the entry matches a .gitignore rule (dimmed in the tree). */
  ignored?: boolean;
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

export interface GitChange {
  path: string;
  name: string;
  status: 'M' | 'A' | 'D' | 'R' | 'U';
  staged: boolean;
  unstaged: boolean;
}

export interface GitBranches {
  current: string | null;
  all: string[];
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface BlameLine {
  author: string;
  /** Author commit time in epoch seconds, or null for uncommitted local changes. */
  time: number | null;
}

export interface SearchMatch {
  path: string;
  name: string;
  line: number;
  preview: string;
  /** 1-based column of the first match on the line (for highlighting). */
  col: number;
  /** Length of the matched text. */
  length: number;
}

export interface SearchOptions {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Comma/space-separated globs to include (empty = all). */
  include?: string;
  /** Comma/space-separated globs to exclude. */
  exclude?: string;
}

export interface ReplaceResult {
  /** Number of files modified. */
  files: number;
  /** Total occurrences replaced. */
  replacements: number;
}

export interface ProjectDiagnostic {
  /** Path relative to the workspace root. */
  file: string;
  line: number;
  col: number;
  severity: 'error' | 'warning';
  /** Diagnostic code, e.g. "TS2322". */
  code: string;
  message: string;
}

// ---- TypeScript Language Service types --------------------------------------

/**
 * Semantic-token legend, shared by the main-process classifier and the renderer's Monaco
 * provider so their indices stay in lockstep. Order matches TypeScript's classifier v2020
 * token-type / token-modifier enums exactly, so a TS classification index maps straight through.
 * The type names double as Monaco theme token scopes (see DARK_PLUS_RULES in monaco-setup).
 */
export const SEMANTIC_TOKEN_TYPES = [
  'class',
  'enum',
  'interface',
  'namespace',
  'typeParameter',
  'type',
  'parameter',
  'variable',
  'enumMember',
  'property',
  'function',
  'member',
] as const;

export const SEMANTIC_TOKEN_MODIFIERS = [
  'declaration',
  'static',
  'async',
  'readonly',
  'defaultLibrary',
  'local',
] as const;

/** Monaco delta-encoded semantic tokens: flat groups of 5 (deltaLine, deltaChar, len, type, mods). */
export interface LsSemanticTokens {
  data: number[];
}

// All positions are 1-based line / 1-based column (Monaco-native) so the renderer
// passes Monaco positions straight through and maps results back without conversion.

/** A source range in a file, used for definitions, references, and rename edits. */
export interface LsLocation {
  /** Absolute file path of the target. */
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface LsDiagnostic {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: 'error' | 'warning' | 'info';
  code: number | string;
  message: string;
}

export interface LsHover {
  /** Markdown contents (signature fenced as TypeScript, plus any JSDoc). */
  contents: string;
  range?: { line: number; column: number; endLine: number; endColumn: number } | null;
}

export interface LsCompletionItem {
  label: string;
  /** Raw TS ScriptElementKind (e.g. "function", "property"); mapped to a Monaco kind in the provider. */
  kind: string;
  insertText?: string;
  sortText?: string;
  detail?: string;
}

export interface LsCompletions {
  items: LsCompletionItem[];
}

export interface LsSignatureParameter {
  label: string;
  documentation?: string;
}

export interface LsSignature {
  label: string;
  documentation?: string;
  parameters: LsSignatureParameter[];
}

export interface LsSignatureHelp {
  signatures: LsSignature[];
  activeSignature: number;
  activeParameter: number;
}

export interface LsTextEdit {
  /** Absolute file path the edit applies to. */
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  newText: string;
}

export interface LsRenameResult {
  edits: LsTextEdit[];
}

/** Renderer-facing surface for the main-process TypeScript Language Service. */
export interface EditorLanguageApi {
  initializeProject: (workspaceRoot: string) => Promise<Result<void>>;
  openDocument: (filePath: string, content: string) => void;
  updateDocument: (filePath: string, content: string) => void;
  closeDocument: (filePath: string) => void;
  getDiagnostics: (filePath: string) => Promise<Result<LsDiagnostic[]>>;
  getDefinition: (filePath: string, line: number, column: number) => Promise<Result<LsLocation[]>>;
  getReferences: (filePath: string, line: number, column: number) => Promise<Result<LsLocation[]>>;
  getHover: (filePath: string, line: number, column: number) => Promise<Result<LsHover | null>>;
  getCompletions: (filePath: string, line: number, column: number) => Promise<Result<LsCompletions>>;
  getSignatureHelp: (
    filePath: string,
    line: number,
    column: number,
  ) => Promise<Result<LsSignatureHelp | null>>;
  renameSymbol: (
    filePath: string,
    line: number,
    column: number,
    newName: string,
  ) => Promise<Result<LsRenameResult>>;
  formatDocument: (filePath: string) => Promise<Result<LsTextEdit[]>>;
  getSemanticTokens: (filePath: string) => Promise<Result<LsSemanticTokens>>;
}

export interface RecentEntry {
  type: 'folder' | 'file';
  path: string;
  name: string;
}

export interface ForgeSettings {
  themeId?: string;
  /** Editor syntax color scheme id ('auto' follows the interface theme). */
  editorScheme?: string;
  sidebarVisible?: boolean;
  sidebarSide?: 'left' | 'right';
  keybindings?: Record<string, string>;
  recents?: RecentEntry[];
  taskCommands?: Record<string, string>;
  customTasks?: { id: string; label: string; command: string }[];
  autoSave?: boolean;
  /** Editor font size in px. */
  fontSize?: number;
  /** The active document formatter (e.g. 'eslint', 'prettier'). */
  formatterId?: string;
  /** Run the active formatter automatically after each save. */
  formatOnSave?: boolean;
  /** Run the active formatter automatically 5s after edits stop. */
  autoFormat?: boolean;
  /** Run a project-wide type-check automatically after changes settle. */
  autoCheckProblems?: boolean;
}

/** Outcome of running a formatter CLI against a file. */
export interface FormatRunResult {
  /** Process exit code (0 = clean). Non-zero may still mean the file was reformatted. */
  code: number;
  stderr: string;
}

/** Outcome of running a formatter in stdin mode (formatted text on stdout). */
export interface FormatTextResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface TerminalCreateArgs {
  id: string;
  cwd?: string;
  cols: number;
  rows: number;
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
  saveDialog: (defaultName: string) => Promise<Result<string | null>>;
  readDirectory: (path: string) => Promise<Result<DirEntry[]>>;
  readFile: (path: string) => Promise<Result<string>>;
  writeFile: (path: string, content: string) => Promise<Result<void>>;
  listFiles: (rootPath: string) => Promise<Result<FileItem[]>>;
  gitBranch: (rootPath: string) => Promise<Result<string | null>>;
  gitChangedFiles: (rootPath: string) => Promise<Result<GitChange[]>>;
  gitCommit: (rootPath: string, message: string) => Promise<Result<void>>;
  gitStage: (rootPath: string, path: string) => Promise<Result<void>>;
  gitUnstage: (rootPath: string, path: string) => Promise<Result<void>>;
  gitDiscard: (rootPath: string, path: string) => Promise<Result<void>>;
  gitStageAll: (rootPath: string) => Promise<Result<void>>;
  gitOriginal: (rootPath: string, path: string) => Promise<Result<string | null>>;
  gitStaged: (rootPath: string, path: string) => Promise<Result<string | null>>;
  gitBlame: (rootPath: string, path: string) => Promise<Result<BlameLine[]>>;
  gitBranches: (rootPath: string) => Promise<Result<GitBranches>>;
  gitCheckout: (rootPath: string, name: string) => Promise<Result<void>>;
  gitCreateBranch: (rootPath: string, name: string) => Promise<Result<void>>;
  gitPush: (rootPath: string) => Promise<Result<void>>;
  gitPull: (rootPath: string) => Promise<Result<void>>;
  gitFetch: (rootPath: string) => Promise<Result<void>>;
  gitLog: (rootPath: string, limit?: number) => Promise<Result<GitCommit[]>>;
  search: (rootPath: string, options: SearchOptions) => Promise<Result<SearchMatch[]>>;
  replaceInFiles: (
    rootPath: string,
    options: SearchOptions,
    replacement: string,
    files: string[],
  ) => Promise<Result<ReplaceResult>>;
  watchWorkspace: (rootPath: string) => void;
  onFsChanged: (cb: () => void) => () => void;
  onMenuAction: (cb: (id: string) => void) => () => void;
  syncMenuState: (autoSave: boolean) => void;
  isMac: boolean;
  rename: (oldPath: string, newPath: string) => Promise<Result<void>>;
  remove: (path: string) => Promise<Result<void>>;
  copyEntry: (src: string, destDir: string) => Promise<Result<void>>;
  moveEntry: (src: string, destDir: string) => Promise<Result<void>>;
  mkdir: (path: string) => Promise<Result<void>>;
  loadSettings: () => Promise<Result<ForgeSettings>>;
  saveSettings: (settings: ForgeSettings) => Promise<Result<void>>;
  runFormatter: (rootPath: string, tool: string, args: string[]) => Promise<Result<FormatRunResult>>;
  formatText: (
    rootPath: string,
    tool: string,
    args: string[],
    input: string,
  ) => Promise<Result<FormatTextResult>>;
  runDiagnostics: (rootPath: string) => Promise<Result<ProjectDiagnostic[]>>;
  resolveImport: (rootPath: string, fromFile: string, spec: string) => Promise<Result<string | null>>;
  createTerminal: (args: TerminalCreateArgs) => Promise<Result<void>>;
  sendInput: (id: string, data: string) => void;
  resizeTerminal: (id: string, cols: number, rows: number) => void;
  killCommand: (id: string) => Promise<Result<void>>;
  openExternal: (url: string) => Promise<Result<void>>;
  onTerminalData: (cb: (e: TerminalDataEvent) => void) => () => void;
  onTerminalExit: (cb: (e: TerminalExitEvent) => void) => () => void;
  /** Real TypeScript/JavaScript IDE intelligence backed by the main-process Language Service. */
  editorLanguage: EditorLanguageApi;
}

export function pongOf(msg: string): string {
  return `pong: ${msg}`;
}
