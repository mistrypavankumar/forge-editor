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
  gitCommitFiles: 'forge:git:commitFiles',
  gitFileAt: 'forge:git:fileAt',
  gitGetUser: 'forge:git:getUser',
  gitSetUser: 'forge:git:setUser',
  gitTestCredential: 'forge:git:testCredential',
  gitGhAuth: 'forge:git:ghAuth',
  gitGhAccounts: 'forge:git:ghAccounts',
  search: 'forge:search',
  replaceInFiles: 'forge:search:replace',
  watchWorkspace: 'forge:fs:watch',
  fsChanged: 'forge:fs:changed',
  menuAction: 'forge:menu:action',
  menuSyncState: 'forge:menu:syncState',
  newWindow: 'forge:window:new',
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
  terminalBusy: 'forge:terminal:busy',
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
  // Java (jdtls) language-server status, for the status-bar indicator.
  jdtlsGetStatus: 'forge:java:getStatus',
  jdtlsStatus: 'forge:java:status',
  // AWS connection switcher.
  awsListProfiles: 'forge:aws:listProfiles',
  awsValidateProfile: 'forge:aws:validateProfile',
  awsSetActiveProfile: 'forge:aws:setActiveProfile',
  awsGetActiveProfile: 'forge:aws:getActiveProfile',
  awsConfigPaths: 'forge:aws:configPaths',
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

/** A ref pointing at a commit, as shown on the graph: branch, remote-tracking branch, or tag. */
export interface GitRef {
  name: string;
  /** 'head' = the checked-out branch (HEAD), 'branch' = other local, 'remote' = remote-tracking, 'tag' = tag. */
  kind: 'head' | 'branch' | 'remote' | 'tag';
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  subject: string;
  refs: GitRef[];
  /** Abbreviated parent hashes (matching `hash`); 2+ for merges, 0 for the root commit. */
  parents: string[];
}

/** A git author identity (`user.name` / `user.email`) plus optional push credentials. */
export interface GitUser {
  name: string;
  email: string;
  /**
   * Login used for HTTPS push/pull auth (e.g. a GitHub username). When set together with
   * `token`, switching to this user wires the repo to authenticate as this account.
   */
  username?: string;
  /** Personal Access Token paired with `username`. Stored to seed git's credential store. */
  token?: string;
}

/** Result of probing a git host's API with a username/token (the picker's "Test connection"). */
export interface GitCredentialTest {
  /** True when the token authenticates AND (if the repo is known) can push to it. */
  ok: boolean;
  /** Login the token actually resolves to (may differ from the entered username). */
  login?: string;
  /** "owner/repo" parsed from origin, when available. */
  repo?: string;
  /** Whether `login` can push to `repo`; undefined when the repo couldn't be checked. */
  canPush?: boolean;
  /** Classic-token OAuth scopes (from the x-oauth-scopes header); empty for fine-grained tokens. */
  scopes?: string;
  /** Human-readable summary for the UI. */
  message: string;
}

/** What the `gh` CLI knows for the repo's host — used to import a login without pasting a token. */
export interface GhAuth {
  /** Whether the `gh` CLI is on PATH. */
  installed: boolean;
  /** Authenticated login for the host, when signed in. */
  login?: string;
  /** Profile name, for prefilling the commit author. */
  name?: string;
  /** Public/no-reply email, for prefilling the commit author. */
  email?: string;
  /** OAuth token gh holds for the host, when signed in. */
  token?: string;
}

/** One `gh` account signed in for the repo's host, offered as a one-click import. */
export interface GhAccount {
  /** Authenticated login. */
  login: string;
  /** Profile name, for prefilling the commit author. */
  name?: string;
  /** Public/no-reply email, for prefilling the commit author. */
  email?: string;
  /** OAuth token gh holds for this account. */
  token: string;
  /** True for gh's currently-active account on the host. */
  active: boolean;
}

/** Every `gh` account available to import for the repo's host. */
export interface GhAccounts {
  /** Whether the `gh` CLI is on PATH. */
  installed: boolean;
  /** Signed-in accounts for the host (empty when not signed in). */
  accounts: GhAccount[];
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

/**
 * Java (jdtls) language-server lifecycle, surfaced in the status bar:
 * `idle` (not started — no Java file opened yet), `starting` (spawning + handshake),
 * `ready` (initialized), `unavailable` (jdtls/JDK not found or failed to start).
 */
export type JdtlsStatus = 'idle' | 'starting' | 'ready' | 'unavailable';

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

// ---- AWS connection switcher ------------------------------------------------

/** A credential profile discovered in ~/.aws/config or ~/.aws/credentials. */
export interface AwsProfile {
  /** Profile name as referenced on the CLI (`--profile <name>`); `default` for the default. */
  name: string;
  /** `sso` when the profile resolves credentials via SSO; otherwise long-lived IAM keys. */
  kind: 'sso' | 'iam';
  /** Human-readable source file, e.g. '~/.aws/config'. */
  source: string;
  /** Configured region, if any. */
  region?: string;
}

/** Result of probing a profile with `aws sts get-caller-identity`. */
export interface AwsValidation {
  valid: boolean;
  /** AWS account id when valid. */
  accountId?: string;
  /** Short error message when invalid/expired. */
  error?: string;
}

/** The currently-active connection, injected into new terminals/run-tasks. */
export interface AwsActive {
  profile: string | null;
  region: string | null;
}

/** Absolute paths to the AWS config files (for "Edit Credentials"). */
export interface AwsConfigPaths {
  config: string;
  credentials: string;
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
  /** Frosted-glass transparency for the UI (macOS window vibrancy shows through). */
  glass?: boolean;
  /** Base background opacity (0.1–1) when glass is on; lower = more see-through. */
  glassOpacity?: number;
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
  /** Active AWS profile, injected as AWS_PROFILE into new terminals/run-tasks. */
  awsProfile?: string;
  /** Region paired with the active AWS profile. */
  awsRegion?: string;
  /** Saved git identities, offered in the status-bar "switch git user" picker. */
  gitUsers?: GitUser[];
  /**
   * Folder names skipped during global file search (quick open), on top of .gitignore.
   * Any file with a matching path segment (e.g. ".next", "coverage") is excluded.
   */
  searchExclude?: string[];
  /** Set once the built-in default excludes have been merged in, so we never re-add removed ones. */
  searchExcludeSeeded?: boolean;
  /** Height (px) of the resizable commit-graph pane in the Source Control panel. */
  scmGraphHeight?: number;
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

/** Emitted when a terminal's foreground process starts (busy) or returns to the shell (idle). */
export interface TerminalBusyEvent {
  id: string;
  busy: boolean;
  /** Name of the current foreground process (e.g. "zsh", "node", "vim") — drives the tab title. */
  proc: string;
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
  /** Files changed by a single commit (status + path), for the graph's expandable file list. */
  gitCommitFiles: (rootPath: string, hash: string) => Promise<Result<GitChange[]>>;
  /** A file's content at a given ref (e.g. a commit hash), or null if absent at that ref. */
  gitFileAt: (rootPath: string, ref: string, relPath: string) => Promise<Result<string | null>>;
  /** The repo's configured author identity (empty strings when unset). */
  gitGetUser: (rootPath: string) => Promise<Result<GitUser>>;
  /**
   * Switch the repo's git user: writes repo-local `user.name`/`user.email`, and when the user
   * carries `username`/`token`, wires the repo to authenticate pushes as that account (so both
   * the app and the integrated terminal push as the chosen identity).
   */
  gitSetUser: (rootPath: string, user: GitUser) => Promise<Result<void>>;
  /** Probe the repo's git host with a username/token to confirm it authenticates and can push. */
  gitTestCredential: (
    rootPath: string,
    username: string,
    token: string,
  ) => Promise<Result<GitCredentialTest>>;
  /** Import the repo host's login + token from the `gh` CLI (browser-based sign-in). */
  gitGhAuth: (rootPath: string) => Promise<Result<GhAuth>>;
  /** List every `gh` account signed in for the repo's host, each importable in one click. */
  gitGhAccounts: (rootPath: string) => Promise<Result<GhAccounts>>;
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
  /** Open a fresh, empty editor window where the user can open a folder. */
  newWindow: () => void;
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
  onTerminalBusy: (cb: (e: TerminalBusyEvent) => void) => () => void;
  /** Real TypeScript/JavaScript IDE intelligence backed by the main-process Language Service. */
  editorLanguage: EditorLanguageApi;
  /** Current Java (jdtls) language-server status, for the status-bar indicator. */
  getJavaStatus: () => Promise<JdtlsStatus>;
  /** Subscribe to Java (jdtls) status changes; returns an unsubscribe fn. */
  onJavaStatus: (cb: (status: JdtlsStatus) => void) => () => void;
  // AWS connection switcher.
  awsListProfiles: () => Promise<Result<AwsProfile[]>>;
  awsValidateProfile: (name: string) => Promise<Result<AwsValidation>>;
  awsSetActiveProfile: (name: string | null, region?: string | null) => Promise<Result<void>>;
  awsGetActiveProfile: () => Promise<Result<AwsActive>>;
  awsConfigPaths: () => Promise<Result<AwsConfigPaths>>;
}

export function pongOf(msg: string): string {
  return `pong: ${msg}`;
}
