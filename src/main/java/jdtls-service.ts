import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type {
  LsCompletionItem,
  LsCompletions,
  LsDiagnostic,
  LsHover,
  LsLocation,
} from '@shared/ipc-contract';
import { LspClient } from './lsp-client';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

/** Locate a jdtls launcher: explicit override → $JDTLS_HOME/bin → bare `jdtls` on PATH. */
function resolveJdtlsCommand(): string | null {
  const explicit = process.env.FORGE_JDTLS_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const home = process.env.JDTLS_HOME;
  if (home) {
    const launcher = join(home, 'bin', 'jdtls');
    if (existsSync(launcher)) return launcher;
  }
  // Fall back to PATH; spawn will surface ENOENT (handled as "unavailable") if it's missing.
  return 'jdtls';
}

/** LSP positions are 0-based; the app/Monaco uses 1-based line+column. */
function toLspPosition(line: number, column: number): Json {
  return { line: line - 1, character: column - 1 };
}

function rangeToLocation(file: string, range: Json): LsLocation {
  return {
    file,
    line: range.start.line + 1,
    column: range.start.character + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function severityOf(n: number | undefined): LsDiagnostic['severity'] {
  if (n === 1) return 'error';
  if (n === 2) return 'warning';
  return 'info';
}

/** Map an LSP CompletionItemKind (numeric) to the kind string the renderer's provider understands. */
function completionKindName(kind: number | undefined): string {
  switch (kind) {
    case 2:
    case 4:
      return 'method';
    case 3:
      return 'function';
    case 5:
    case 10:
      return 'property';
    case 6:
      return 'var';
    case 7:
    case 22:
      return 'class';
    case 8:
      return 'interface';
    case 9:
      return 'module';
    case 13:
      return 'enum';
    case 14:
      return 'keyword';
    case 20:
      return 'enum member';
    case 21:
      return 'const';
    default:
      return '';
  }
}

function markdownOf(hoverContents: Json): string {
  if (hoverContents == null) return '';
  if (typeof hoverContents === 'string') return hoverContents;
  if (Array.isArray(hoverContents)) {
    return hoverContents
      .map((c) => (typeof c === 'string' ? c : c.language ? '```' + c.language + '\n' + c.value + '\n```' : c.value))
      .join('\n\n');
  }
  // MarkupContent { kind, value }
  return hoverContents.value ?? '';
}

interface TrackedDoc {
  version: number;
  text: string;
  open: boolean;
}

/**
 * Java language support backed by the Eclipse JDT Language Server (jdtls), spoken over LSP.
 *
 * jdtls is an external process and is NOT bundled (it needs a JDK 17+ and the jdtls
 * distribution). We discover a launcher lazily on the first `.java` document and degrade
 * gracefully — every query returns empty/null when jdtls is unavailable, so the editor still
 * gives syntax highlighting from Monaco's grammar. Diagnostics arrive via publishDiagnostics
 * notifications and are cached so the renderer's pull-based refresh can read them.
 */
class JdtlsService {
  private client: LspClient | null = null;
  private startPromise: Promise<boolean> | null = null;
  private available = true;
  private workspaceRoot: string | null = null;
  private readonly docs = new Map<string, TrackedDoc>();
  private readonly diagnostics = new Map<string, LsDiagnostic[]>();

  /** Remember the workspace root (cheap — does not spawn jdtls until a Java file opens). */
  setWorkspace(root: string): void {
    if (this.workspaceRoot === root) return;
    this.workspaceRoot = root;
    // A new workspace means a fresh server; tear down any prior one.
    this.shutdown();
  }

  openDocument(file: string, text: string): void {
    this.docs.set(file, { version: 1, text, open: false });
    void this.ensureStarted().then((ok) => {
      if (ok) this.sendDidOpen(file);
    });
  }

  updateDocument(file: string, text: string): void {
    const doc = this.docs.get(file);
    if (!doc) {
      this.openDocument(file, text);
      return;
    }
    doc.version += 1;
    doc.text = text;
    if (doc.open && this.client?.alive) {
      this.client.notify('textDocument/didChange', {
        textDocument: { uri: this.uri(file), version: doc.version },
        contentChanges: [{ text }],
      });
    }
  }

  closeDocument(file: string): void {
    const doc = this.docs.get(file);
    if (doc?.open && this.client?.alive) {
      this.client.notify('textDocument/didClose', { textDocument: { uri: this.uri(file) } });
    }
    this.docs.delete(file);
    this.diagnostics.delete(file);
  }

  getDiagnostics(file: string): LsDiagnostic[] {
    return this.diagnostics.get(file) ?? [];
  }

  async getCompletions(file: string, line: number, column: number): Promise<LsCompletions> {
    const res = await this.query('textDocument/completion', file, line, column);
    if (!res) return { items: [] };
    const raw: Json[] = Array.isArray(res) ? res : (res.items ?? []);
    const items: LsCompletionItem[] = raw.map((item) => ({
      label: typeof item.label === 'string' ? item.label : item.label?.label ?? '',
      kind: completionKindName(item.kind),
      insertText: stripSnippet(item.insertText ?? item.textEdit?.newText ?? item.label),
      sortText: item.sortText,
      detail: item.detail,
    }));
    return { items };
  }

  async getHover(file: string, line: number, column: number): Promise<LsHover | null> {
    const res = await this.query('textDocument/hover', file, line, column);
    if (!res || res.contents == null) return null;
    const contents = markdownOf(res.contents);
    if (!contents.trim()) return null;
    return {
      contents,
      range: res.range
        ? {
            line: res.range.start.line + 1,
            column: res.range.start.character + 1,
            endLine: res.range.end.line + 1,
            endColumn: res.range.end.character + 1,
          }
        : null,
    };
  }

  async getDefinition(file: string, line: number, column: number): Promise<LsLocation[]> {
    const res = await this.query('textDocument/definition', file, line, column);
    return this.toLocations(res);
  }

  async getReferences(file: string, line: number, column: number): Promise<LsLocation[]> {
    const res = await this.query('textDocument/references', file, line, column, {
      context: { includeDeclaration: false },
    });
    return this.toLocations(res);
  }

  private toLocations(res: Json): LsLocation[] {
    if (!res) return [];
    const arr: Json[] = Array.isArray(res) ? res : [res];
    return arr
      .map((loc) => {
        // Location | LocationLink
        const uri = loc.uri ?? loc.targetUri;
        const range = loc.range ?? loc.targetSelectionRange ?? loc.targetRange;
        if (!uri || !range) return null;
        return rangeToLocation(fileURLToPath(uri), range);
      })
      .filter((l): l is LsLocation => l !== null);
  }

  /** Await readiness, ensure the doc is opened server-side, then send a positional request. */
  private async query(
    method: string,
    file: string,
    line: number,
    column: number,
    extra: Json = {},
  ): Promise<Json> {
    const ok = await this.ensureStarted();
    if (!ok || !this.client) return null;
    this.sendDidOpen(file);
    try {
      return await this.client.request(method, {
        textDocument: { uri: this.uri(file) },
        position: toLspPosition(line, column),
        ...extra,
      });
    } catch {
      return null;
    }
  }

  private sendDidOpen(file: string): void {
    const doc = this.docs.get(file);
    if (!doc || doc.open || !this.client?.alive) return;
    doc.open = true;
    this.client.notify('textDocument/didOpen', {
      textDocument: { uri: this.uri(file), languageId: 'java', version: doc.version, text: doc.text },
    });
  }

  private uri(file: string): string {
    return pathToFileURL(file).toString();
  }

  private ensureStarted(): Promise<boolean> {
    if (!this.available || !this.workspaceRoot) return Promise.resolve(false);
    if (this.client?.alive) return Promise.resolve(true);
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.start().catch(() => {
      // Don't respawn on every keystroke once start has failed.
      this.available = false;
      this.shutdown();
      return false;
    });
    return this.startPromise;
  }

  private async start(): Promise<boolean> {
    const root = this.workspaceRoot;
    if (!root) return false;
    const command = resolveJdtlsCommand();
    if (!command) return false;

    // Per-workspace data dir keeps jdtls's index/build state isolated across projects.
    const dataDir = join(
      app.getPath('userData'),
      'jdtls',
      createHash('sha1').update(root).digest('hex').slice(0, 16),
    );
    const client = new LspClient(command, ['-data', dataDir], { cwd: root, env: process.env });
    this.client = client;

    client.onExit(() => {
      this.client = null;
      this.startPromise = null;
      for (const doc of this.docs.values()) doc.open = false;
    });

    // Answer the server→client requests jdtls blocks the handshake on.
    client.onRequest('workspace/configuration', (params: Json) =>
      Array.isArray(params?.items) ? params.items.map(() => null) : [],
    );
    client.onRequest('client/registerCapability', () => null);
    client.onRequest('client/unregisterCapability', () => null);
    client.onRequest('window/workDoneProgress/create', () => null);
    client.onRequest('workspace/applyEdit', () => ({ applied: false }));
    client.onRequest('window/showMessageRequest', () => null);

    client.onNotification('textDocument/publishDiagnostics', (params: Json) => {
      const file = fileURLToPath(params.uri);
      this.diagnostics.set(
        file,
        (params.diagnostics ?? []).map((d: Json) => ({
          line: d.range.start.line + 1,
          column: d.range.start.character + 1,
          endLine: d.range.end.line + 1,
          endColumn: d.range.end.character + 1,
          severity: severityOf(d.severity),
          code: d.code ?? '',
          message: d.message,
        })),
      );
    });

    await client.request('initialize', {
      processId: process.pid,
      clientInfo: { name: 'Forge' },
      rootUri: this.uri(root),
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: false },
          completion: { completionItem: { snippetSupport: false } },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: { linkSupport: true },
          references: {},
          publishDiagnostics: {},
        },
        workspace: { configuration: true, workspaceFolders: true, applyEdit: false },
      },
      workspaceFolders: [{ uri: this.uri(root), name: 'workspace' }],
      initializationOptions: { settings: { java: {} } },
    });
    client.notify('initialized', {});

    // Replay didOpen for any documents opened while jdtls was starting.
    for (const file of this.docs.keys()) this.sendDidOpen(file);
    return true;
  }

  private shutdown(): void {
    this.client?.dispose();
    this.client = null;
    this.startPromise = null;
    this.diagnostics.clear();
    for (const doc of this.docs.values()) doc.open = false;
  }
}

/** Strip LSP snippet placeholders (`${1:x}`, `$0`) — we request plain text, but be defensive. */
function stripSnippet(text: string | undefined): string | undefined {
  if (!text) return text;
  return text
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\$\d+/g, '');
}

export const jdtlsService = new JdtlsService();
