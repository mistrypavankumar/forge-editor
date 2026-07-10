import type * as monacoNs from 'monaco-editor';
import type { editor, languages, Position } from 'monaco-editor';
import type { LsLocation, LsSymbol } from '@shared/ipc-contract';
import { SEMANTIC_TOKEN_TYPES, SEMANTIC_TOKEN_MODIFIERS } from '@shared/ipc-contract';
import { LARGE_FILE_CHARS } from './language-bridge';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { useAiStore } from '../stores/ai-store';
import { openFilePath } from '../lib/workspace-actions';
import { importSpecForName, moduleSpecAtColumn, localDeclarationLine } from '../lib/go-to-definition';
import { languageFor } from './language';
import { REACT_SNIPPETS } from './react-snippets';
import { JAVA_SNIPPETS } from './java-snippets';

let registered = false;

const lang = window.forge.editorLanguage;
const SELECTOR = ['typescript', 'javascript'];
// Features served for both the TS Language Service and jdtls (Java). Semantic tokens,
// signature help, and rename stay TS-only (jdtls isn't wired for them), and Java keeps
// Monaco's grammar-based highlighting rather than LS semantic tokens.
const FEATURE_SELECTOR = ['typescript', 'javascript', 'java'];

function fileOf(model: editor.ITextModel): string {
  return model.uri.path;
}

/** Context stashed on a completion item so resolveCompletionItem can fetch its auto-import edit. */
interface ResolveContext {
  file: string;
  line: number;
  column: number;
  label: string;
  source?: string;
  data?: unknown;
}
type ForgeCompletion = languages.CompletionItem & { __forge?: ResolveContext };

// Declaration kinds that get an inline reference hint. USAGE_KINDS get a "N usages" hint; the
// subset in IMPL_KINDS also get a "N implementations" hint (interfaces, classes, and overridable
// members). Kinds are the ScriptElementKind-style strings shared by the TS LS and the jdtls symbol
// mapping. Data members (`property`, `field`) are intentionally excluded: they clutter object and
// JSX literals with mostly-noise counts (e.g. every `sx` style key). Hints are reserved for
// components, functions, classes, and other callable/overridable declarations.
const USAGE_KINDS = new Set([
  'class', 'interface', 'enum', 'method', 'function', 'constructor', 'getter', 'setter',
]);
const IMPL_KINDS = new Set(['class', 'interface', 'method', 'getter', 'setter']);

// Cap the number of inline reference hints resolved per provide pass. Monaco only asks for hints in
// the visible range, so a pass can't fan out across a whole file — but a giant nested-object literal
// (e.g. a path→permission map) can still pack hundreds of `property` declarations into one
// screenful, and each hint fires an uncancellable project-wide getReferences at the single language
// worker. Above this many visible declarations, skip hints for the pass rather than jank the UI
// (the freeze that made Cmd+F and the context menu appear frozen until reload).
const MAX_INLAY_HINTS = 200;

/** Resolved reference/implementation locations for one declaration (the declaration itself excluded). */
interface HintCounts {
  usageLocs: LsLocation[];
  implLocs: LsLocation[];
}
type ForgeHint = languages.InlayHint & { __locs?: languages.Location[] };

// Per-model cache of resolved counts, keyed by model URI and invalidated when the content version
// changes. Monaco re-requests hints on every scroll; without this, revisiting a line would refire
// its getReferences/getImplementations. An edit bumps the version, which drops the stale map.
// Inner map is keyed by `line:column` (not line alone): two eligible declarations can share a line
// (e.g. `export interface A {} export class B {}`), and a line-only key would serve the second the
// first's counts.
const countsCache = new Map<string, { version: number; byLine: Map<string, HintCounts> }>();

function countsFor(uri: string, version: number): Map<string, HintCounts> {
  const entry = countsCache.get(uri);
  if (entry && entry.version === version) return entry.byLine;
  const byLine = new Map<string, HintCounts>();
  countsCache.set(uri, { version, byLine });
  return byLine;
}

/** Compare two absolute paths ignoring slash direction (Monaco URIs vs TS forward-slash paths). */
function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/') === b.replace(/\\/g, '/');
}

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 1-based column of `name` on `lineText`, matched at an identifier boundary so a bare substring —
 * an earlier lookalike token, or `name` embedded in a longer identifier — doesn't misplace the
 * reference-query anchor. Returns `fallback` when the name isn't found on the line. `$`/`_` count as
 * identifier chars (so `$foo` / `_foo` anchor correctly).
 */
function identifierColumn(lineText: string, name: string, fallback: number): number {
  const m = new RegExp(`(?<![$\\w])${escapeRegExp(name)}(?![$\\w])`).exec(lineText);
  return m ? m.index + 1 : fallback;
}

function toRange(monaco: typeof monacoNs, loc: LsLocation): monacoNs.IRange {
  return new monaco.Range(loc.line, loc.column, loc.endLine, loc.endColumn);
}

function toMonacoLocation(monaco: typeof monacoNs, loc: LsLocation): languages.Location {
  return { uri: monaco.Uri.file(loc.file), range: toRange(monaco, loc) };
}

/**
 * Fetch (or reuse the cached) reference/implementation locations for a declaration, always dropping
 * the declaration itself so counts read like an IDE ("usages", not "occurrences"). The TS LS
 * includes the declaration in references; jdtls already excludes it. Implementations are only
 * queried for IMPL_KINDS. Results are memoized per line for the current model version.
 */
async function resolveHintCounts(
  byLine: Map<string, HintCounts>,
  file: string,
  sym: LsSymbol,
  column: number,
): Promise<HintCounts> {
  const key = `${sym.line}:${column}`;
  const cached = byLine.get(key);
  if (cached) return cached;
  const notSelf = (l: LsLocation) => !(samePath(l.file, file) && l.line === sym.line);
  // References and (for impl-eligible kinds) implementations are independent LS round-trips — run
  // them concurrently rather than one after the other.
  const wantImpl = IMPL_KINDS.has(sym.kind);
  const [refRes, implRes] = await Promise.all([
    lang.getReferences(file, sym.line, column),
    wantImpl ? lang.getImplementations(file, sym.line, column) : Promise.resolve(null),
  ]);
  const usageLocs = (refRes.ok ? refRes.data : []).filter(notSelf);
  const implLocs = implRes && implRes.ok ? implRes.data.filter(notSelf) : [];
  const counts: HintCounts = { usageLocs, implLocs };
  byLine.set(key, counts);
  return counts;
}

/**
 * Build the trailing inlay hint for one declaration: a clickable "N usages" label part, plus an
 * "M implementations" part for impl-eligible kinds that actually have implementations (a concrete
 * class with none is left off entirely). Each part opens Monaco's references peek on click; the
 * union of target locations is stashed on `__locs` for resolveInlayHint to pre-create models for.
 */
function buildHint(
  monaco: typeof monacoNs,
  model: editor.ITextModel,
  sym: LsSymbol,
  column: number,
  counts: HintCounts,
): ForgeHint {
  const anchor = new monaco.Position(sym.line, column);
  const usageLocs = counts.usageLocs.map((l) => toMonacoLocation(monaco, l));
  const parts: languages.InlayHintLabelPart[] = [
    {
      label: `${usageLocs.length} ${usageLocs.length === 1 ? 'usage' : 'usages'}`,
      command: {
        id: 'editor.action.showReferences',
        title: 'usages',
        arguments: [model.uri, anchor, usageLocs],
      },
    },
  ];
  const implLocs = counts.implLocs.map((l) => toMonacoLocation(monaco, l));
  if (IMPL_KINDS.has(sym.kind) && implLocs.length > 0) {
    parts.push({
      // Leading spaces separate the two counts; Monaco renders adjacent parts as one run.
      label: `   ${implLocs.length} ${implLocs.length === 1 ? 'implementation' : 'implementations'}`,
      command: {
        id: 'editor.action.showReferences',
        title: 'implementations',
        arguments: [model.uri, anchor, implLocs],
      },
    });
  }
  return {
    label: parts,
    position: { lineNumber: sym.line, column: model.getLineMaxColumn(sym.line) },
    paddingLeft: true,
    __locs: [...usageLocs, ...implLocs],
  };
}

/**
 * Go-to-definition / references land on files that may not be open, so no Monaco model exists for
 * them. The standalone editor's peek/hover preview eagerly calls `createModelReference`, which
 * throws "Model not found" for an unregistered URI. Pre-create a model per unique target file (from
 * disk, deduped by URI) so the preview resolves. Monaco keys models by URI, so a later tab-open in
 * CodeEditor reuses the same instance rather than creating a duplicate.
 */
async function ensureModelsFor(
  monaco: typeof monacoNs,
  locs: readonly languages.Location[],
): Promise<void> {
  const missing = new Set<string>();
  for (const l of locs) {
    const p = l.uri.path;
    if (p.startsWith('/') && !monaco.editor.getModel(l.uri)) missing.add(p);
  }
  await Promise.all(
    [...missing].map(async (p) => {
      const res = await window.forge.readFile(p);
      // Re-check under the await: a concurrent request (or a tab open) may have created it.
      if (!res.ok || monaco.editor.getModel(monaco.Uri.file(p))) return;
      const name = p.slice(p.lastIndexOf('/') + 1);
      monaco.editor.createModel(res.data, languageFor(name), monaco.Uri.file(p));
    }),
  );
}

/** Map a TS ScriptElementKind to the closest Monaco completion-item kind. */
function completionKind(monaco: typeof monacoNs, kind: string): languages.CompletionItemKind {
  const K = monaco.languages.CompletionItemKind;
  switch (kind) {
    case 'method':
    case 'construct':
    case 'call':
      return K.Method;
    case 'function':
    case 'local function':
      return K.Function;
    case 'property':
    case 'getter':
    case 'setter':
      return K.Property;
    case 'class':
    case 'local class':
      return K.Class;
    case 'interface':
      return K.Interface;
    case 'type':
      return K.TypeParameter;
    case 'enum':
      return K.Enum;
    case 'enum member':
      return K.EnumMember;
    case 'module':
    case 'external module name':
      return K.Module;
    case 'var':
    case 'let':
    case 'const':
    case 'parameter':
      return K.Variable;
    case 'keyword':
      return K.Keyword;
    case 'string':
      return K.Constant;
    default:
      return K.Field;
  }
}

/**
 * Regex fallback for definitions when the Language Service returns nothing — resolves an import
 * specifier under the cursor to its file (via the existing main-process resolver), or jumps to a
 * same-file declaration. The LS is always tried first; this only fills gaps.
 */
async function fallbackDefinition(
  monaco: typeof monacoNs,
  model: editor.ITextModel,
  position: Position,
): Promise<languages.Definition | null> {
  const rootPath = useWorkspaceStore.getState().rootPath;
  const fromPath = fileOf(model);
  const lineText = model.getLineContent(position.lineNumber);
  const fullText = model.getValue();

  let spec = moduleSpecAtColumn(lineText, position.column);
  let symbol: string | null = null;
  if (!spec) {
    const word = model.getWordAtPosition(position);
    if (word) {
      symbol = word.word;
      spec = importSpecForName(fullText, word.word);
    }
  }

  if (spec && rootPath) {
    const res = await window.forge.resolveImport(rootPath, fromPath, spec);
    if (res.ok && res.data) {
      return { uri: monaco.Uri.file(res.data), range: new monaco.Range(1, 1, 1, 1) };
    }
  }
  if (symbol) {
    const line = localDeclarationLine(fullText, symbol);
    if (line) return { uri: model.uri, range: new monaco.Range(line, 1, line, 1) };
  }
  return null;
}

/**
 * Register all Language-Service-backed Monaco providers and route cross-file navigation into the
 * app's existing tab system. Call once. Disables the overlapping Monaco TS-worker features first
 * so the in-process LS (which sees the whole project, tsconfig aliases, and node_modules) is the
 * single source of truth — the browser worker can't resolve real project files.
 */
export function registerLanguageProviders(monaco: typeof monacoNs): void {
  if (registered) return;
  registered = true;

  // Hand these features to our LS providers; keep the worker only for tokenization/bracket logic.
  for (const defaults of [
    monaco.languages.typescript.typescriptDefaults,
    monaco.languages.typescript.javascriptDefaults,
  ]) {
    defaults.setModeConfiguration({
      ...defaults.modeConfiguration,
      completionItems: false,
      hovers: false,
      definitions: false,
      references: false,
      rename: false,
      signatureHelp: false,
      documentSymbols: false,
      diagnostics: false,
    });
  }

  monaco.languages.registerDefinitionProvider(FEATURE_SELECTOR, {
    async provideDefinition(model, position) {
      const res = await lang.getDefinition(fileOf(model), position.lineNumber, position.column);
      const def =
        res.ok && res.data.length > 0
          ? res.data.map((l) => toMonacoLocation(monaco, l))
          : await fallbackDefinition(monaco, model, position);
      if (!def) return null;
      const locs = Array.isArray(def) ? def : [def];
      await ensureModelsFor(monaco, locs);
      return locs;
    },
  });

  monaco.languages.registerReferenceProvider(FEATURE_SELECTOR, {
    async provideReferences(model, position) {
      const res = await lang.getReferences(fileOf(model), position.lineNumber, position.column);
      if (!res.ok) return [];
      const locs = res.data.map((l) => toMonacoLocation(monaco, l));
      await ensureModelsFor(monaco, locs);
      return locs;
    },
  });

  // Inline reference hints, IntelliJ-style: a dim "N usages" / "M implementations" rendered at the
  // end of each declaration line (not on a CodeLens line above it). Declarations come from the
  // document-symbol backend (TS LS or jdtls); counts resolve via getReferences/getImplementations.
  // Monaco requests hints only for the visible range, so the reference fan-out is bounded to
  // on-screen declarations and cached per line until the next edit. Clicking a hint opens Monaco's
  // references peek (editor.action.showReferences) populated with the matching locations.
  monaco.languages.registerInlayHintsProvider(FEATURE_SELECTOR, {
    async provideInlayHints(model, range, token) {
      if (model.getValueLength() > LARGE_FILE_CHARS) return { hints: [], dispose() {} };
      const res = await lang.getDocumentSymbols(fileOf(model));
      if (!res.ok || token.isCancellationRequested) return { hints: [], dispose() {} };
      const file = fileOf(model);
      const lineCount = model.getLineCount();
      const visible: LsSymbol[] = [];
      for (const sym of res.data) {
        if (!USAGE_KINDS.has(sym.kind) || sym.line < 1 || sym.line > lineCount) continue;
        if (sym.line < range.startLineNumber || sym.line > range.endLineNumber) continue;
        visible.push(sym);
        // Too many declarations on one screen (a symbol-dense literal) — skip the pass before the
        // resolve fan-out can jank the UI.
        if (visible.length > MAX_INLAY_HINTS) return { hints: [], dispose() {} };
      }
      const byLine = countsFor(model.uri.toString(), model.getVersionId());
      const hints = await Promise.all(
        visible.map(async (sym) => {
          try {
            // Anchor reference/implementation queries on the identifier: the document-symbol
            // position can point at the start of the declaration span, so find the name on that
            // line instead (at an identifier boundary, not a bare substring).
            const column = identifierColumn(model.getLineContent(sym.line), sym.name, sym.column);
            const counts = await resolveHintCounts(byLine, file, sym, column);
            // The user scrolled/edited while a worker was busy — drop the pass' results.
            if (token.isCancellationRequested) return null;
            return buildHint(monaco, model, sym, column, counts);
          } catch {
            // One declaration's LS query failed — drop just its hint, keep the rest of the pass.
            return null;
          }
        }),
      );
      return { hints: hints.filter((h): h is ForgeHint => h !== null), dispose() {} };
    },
    // Peek preview panes call createModelReference on each target; make sure a model exists so
    // expanding a hit in an unopened file doesn't throw "Model not found". Deferred to hover so the
    // (disk-reading) model creation happens only for a hint the user actually interacts with.
    async resolveInlayHint(hint) {
      const locs = (hint as ForgeHint).__locs;
      if (locs && locs.length) await ensureModelsFor(monaco, locs);
      return hint;
    },
  });

  monaco.languages.registerHoverProvider(FEATURE_SELECTOR, {
    async provideHover(model, position) {
      const res = await lang.getHover(fileOf(model), position.lineNumber, position.column);
      if (!res.ok || !res.data) return null;
      const { contents, range } = res.data;
      return {
        contents: [{ value: contents }],
        range: range
          ? new monaco.Range(range.line, range.column, range.endLine, range.endColumn)
          : undefined,
      };
    },
  });

  monaco.languages.registerCompletionItemProvider(FEATURE_SELECTOR, {
    triggerCharacters: ['.', '"', "'", '`', '/', '@', '<', ' '],
    async provideCompletionItems(model, position) {
      const res = await lang.getCompletions(fileOf(model), position.lineNumber, position.column);
      if (!res.ok) return { suggestions: [] };
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      return {
        suggestions: res.data.items.map((item) => {
          const suggestion: ForgeCompletion = {
            // Show the source module beside the name so an auto-import candidate is obvious.
            label: item.source ? { label: item.label, description: item.source } : item.label,
            kind: completionKind(monaco, item.kind),
            insertText: item.insertText ?? item.label,
            sortText: item.sortText,
            detail: item.detail,
            range,
          };
          // Auto-import candidates carry a `source`/`hasAction`; defer the (costly) import-edit
          // computation to resolveCompletionItem, which fires only when the item is focused.
          if (item.hasAction || item.source) {
            suggestion.__forge = {
              file: fileOf(model),
              line: position.lineNumber,
              column: position.column,
              label: item.label,
              source: item.source,
              data: item.data,
            };
          }
          return suggestion;
        }),
      };
    },
    async resolveCompletionItem(item) {
      const ctx = (item as ForgeCompletion).__forge;
      if (!ctx) return item;
      const res = await lang.getCompletionDetails(
        ctx.file,
        ctx.line,
        ctx.column,
        ctx.label,
        ctx.source,
        ctx.data,
      );
      if (!res.ok || !res.data) return item;
      const docParts: string[] = [];
      if (res.data.detail) docParts.push('```typescript\n' + res.data.detail + '\n```');
      if (res.data.documentation) docParts.push(res.data.documentation);
      if (docParts.length) item.documentation = { value: docParts.join('\n\n') };
      // The import-insertion edit (and any other code-action edits) for the current file. Monaco
      // applies these atomically with the inserted symbol — that's the auto-import.
      const edits = res.data.additionalEdits
        .filter((e) => samePath(e.file, ctx.file))
        .map((e) => ({
          range: new monaco.Range(e.line, e.column, e.endLine, e.endColumn),
          text: e.newText,
        }));
      if (edits.length) item.additionalTextEdits = edits;
      return item;
    },
  });

  monaco.languages.registerSignatureHelpProvider(SELECTOR, {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [')'],
    async provideSignatureHelp(model, position) {
      const res = await lang.getSignatureHelp(fileOf(model), position.lineNumber, position.column);
      if (!res.ok || !res.data) return undefined;
      const help = res.data;
      return {
        value: {
          signatures: help.signatures.map((s) => ({
            label: s.label,
            documentation: s.documentation,
            parameters: s.parameters.map((p) => ({ label: p.label, documentation: p.documentation })),
          })),
          activeSignature: help.activeSignature,
          activeParameter: help.activeParameter,
        },
        dispose: () => {},
      };
    },
  });

  monaco.languages.registerRenameProvider(SELECTOR, {
    async provideRenameEdits(model, position, newName) {
      const res = await lang.renameSymbol(
        fileOf(model),
        position.lineNumber,
        position.column,
        newName,
      );
      if (!res.ok) return { edits: [] };
      return {
        edits: res.data.edits.map((e) => ({
          resource: monaco.Uri.file(e.file),
          versionId: undefined,
          textEdit: {
            range: new monaco.Range(e.line, e.column, e.endLine, e.endColumn),
            text: e.newText,
          },
        })),
      };
    },
  });

  // Semantic highlighting straight from the project's Language Service: colors classes/types teal,
  // functions gold, variables/params/properties blue (the Dark+ look). The legend type names line
  // up with the theme token scopes in monaco-setup, so coloring is driven entirely by the theme.
  const legend: languages.SemanticTokensLegend = {
    tokenTypes: [...SEMANTIC_TOKEN_TYPES],
    tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
  };
  monaco.languages.registerDocumentSemanticTokensProvider(SELECTOR, {
    getLegend: () => legend,
    async provideDocumentSemanticTokens(model) {
      // Whole-file classification gets too costly on very large buffers; let basic
      // tokenization handle those rather than round-tripping a huge token array.
      if (model.getValueLength() > LARGE_FILE_CHARS) return null;
      const res = await lang.getSemanticTokens(fileOf(model));
      if (!res.ok) return null;
      return { data: new Uint32Array(res.data.data), resultId: undefined };
    },
    releaseDocumentSemanticTokens() {},
  });

  // Route every go-to/peek "open" (Cmd/Ctrl+Click, F12, references) into the app's tab system.
  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selectionOrPosition) {
      const path = resource.path;
      if (!path || !path.startsWith('/')) return false;
      let line = 1;
      let col = 1;
      let endLine: number | undefined;
      let endColumn: number | undefined;
      if (selectionOrPosition) {
        if ('startLineNumber' in selectionOrPosition) {
          line = selectionOrPosition.startLineNumber;
          col = selectionOrPosition.startColumn;
          endLine = selectionOrPosition.endLineNumber;
          endColumn = selectionOrPosition.endColumn;
        } else {
          line = selectionOrPosition.lineNumber;
          col = selectionOrPosition.column;
        }
      }
      const name = path.slice(path.lastIndexOf('/') + 1);
      void openFilePath(path, name).then(() => {
        useEditorStore.getState().requestReveal({ path, line, col, endLine, endColumn });
      });
      return true;
    },
  });

  registerInlineCompletions(monaco);

  registerSnippets(monaco, SELECTOR, REACT_SNIPPETS, '⚛', 'tsx');
  registerSnippets(monaco, ['java'], JAVA_SNIPPETS, '☕', 'java');
}

/** Pause `ms`, resolving false early if `token` is cancelled (the user typed again). */
function debounce(ms: number, token: monacoNs.CancellationToken): Promise<boolean> {
  return new Promise((resolve) => {
    if (token.isCancellationRequested) return resolve(false);
    const timer = setTimeout(() => resolve(true), ms);
    token.onCancellationRequested(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * Register Copilot-style ghost-text completions backed by the AI provider. Gated behind the
 * `inlineSuggest` toggle (off by default). Each keystroke cancels the prior request via Monaco's
 * cancellation token, which both stops the debounce and aborts any in-flight model call in main.
 * Skips large files and empty-context positions to avoid pointless requests.
 */
function registerInlineCompletions(monaco: typeof monacoNs): void {
  const DEBOUNCE_MS = 300;
  monaco.languages.registerInlineCompletionsProvider(FEATURE_SELECTOR, {
    async provideInlineCompletions(model, position, _ctx, token) {
      if (!useAiStore.getState().inlineSuggest) {
        console.debug('[forge:inline] skipped — toggle is off');
        return undefined;
      }
      if (model.getValueLength() > LARGE_FILE_CHARS) return undefined;
      // Debounce: only fire once the user pauses typing.
      if (!(await debounce(DEBOUNCE_MS, token))) return undefined;

      const offset = model.getOffsetAt(position);
      const text = model.getValue();
      const prefix = text.slice(0, offset);
      const suffix = text.slice(offset);
      if (!prefix.trim()) return undefined;

      const id = crypto.randomUUID();
      token.onCancellationRequested(() => window.forge.cancelCompletion(id));
      console.debug('[forge:inline] requesting completion…');
      const res = await window.forge.requestCompletion({
        id,
        language: model.getLanguageId(),
        prefix,
        suffix,
      });
      console.debug('[forge:inline] result', res);
      if (token.isCancellationRequested || !res.ok || !res.data) return undefined;

      const range = new monaco.Range(
        position.lineNumber,
        position.column,
        position.lineNumber,
        position.column,
      );
      return { items: [{ insertText: res.data, range }] };
    },
    freeInlineCompletions() {},
  });
}

/** Render a snippet body as readable preview text (strip tab stops / variables). */
function previewSnippet(body: string): string {
  return body
    .replace(/set\$\{1\/\(\.\*\)\/\$\{1:\/capitalize\}\/\}/g, 'setState')
    .replace(/\$\{TM_FILENAME_BASE\}/g, 'Name')
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\$\d+/g, '');
}

/**
 * Register snippet completions for a set of languages, merged by Monaco alongside the
 * Language-Service completions. Used for the React/ES7 prefixes (JS/TS) and Java live templates.
 */
function registerSnippets(
  monaco: typeof monacoNs,
  languages: string[],
  snippets: { prefix: string; body: string; description: string }[],
  badge: string,
  previewLang: string,
): void {
  const kind = monaco.languages.CompletionItemKind.Snippet;
  const insertAsSnippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  monaco.languages.registerCompletionItemProvider(languages, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      return {
        suggestions: snippets.map((s) => ({
          label: s.prefix,
          kind,
          insertText: s.body,
          insertTextRules: insertAsSnippet,
          detail: `${badge} ${s.description}`,
          documentation: { value: '```' + previewLang + '\n' + previewSnippet(s.body) + '\n```' },
          range,
        })),
      };
    },
  });
}
