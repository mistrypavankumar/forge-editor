import type * as monacoNs from 'monaco-editor';
import type { editor, languages, Position } from 'monaco-editor';
import type { LsLocation } from '@shared/ipc-contract';
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

// Declaration kinds that get a CodeLens. USAGE_KINDS get a "N usages" lens; the subset in
// IMPL_KINDS also get a "N implementations" lens (interfaces, classes, and overridable members).
// Kinds are the ScriptElementKind-style strings shared by the TS LS and the jdtls symbol mapping.
const USAGE_KINDS = new Set([
  'class', 'interface', 'enum', 'method', 'function', 'constructor', 'property', 'field', 'getter', 'setter',
]);
const IMPL_KINDS = new Set(['class', 'interface', 'method', 'getter', 'setter']);

/** Context stashed on a CodeLens so resolveCodeLens knows what to count and where to peek. */
interface LensContext {
  file: string;
  line: number;
  column: number;
  kind: 'usages' | 'impls';
}
type ForgeLens = languages.CodeLens & { __ctx?: LensContext };

/** Compare two absolute paths ignoring slash direction (Monaco URIs vs TS forward-slash paths). */
function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/') === b.replace(/\\/g, '/');
}

function toRange(monaco: typeof monacoNs, loc: LsLocation): monacoNs.IRange {
  return new monaco.Range(loc.line, loc.column, loc.endLine, loc.endColumn);
}

function toMonacoLocation(monaco: typeof monacoNs, loc: LsLocation): languages.Location {
  return { uri: monaco.Uri.file(loc.file), range: toRange(monaco, loc) };
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

  // CodeLens: an IntelliJ/VS Code-style "N usages" / "N implementations" line above each
  // declaration. Declarations come from the document-symbol backend (TS LS or jdtls); counts are
  // resolved lazily per visible lens via getReferences/getImplementations, so a file with many
  // declarations never fans out into hundreds of eager reference queries. Clicking a lens opens
  // Monaco's references peek (editor.action.showReferences) populated with the matching locations.
  monaco.languages.registerCodeLensProvider(FEATURE_SELECTOR, {
    async provideCodeLenses(model) {
      if (model.getValueLength() > LARGE_FILE_CHARS) return { lenses: [], dispose() {} };
      const res = await lang.getDocumentSymbols(fileOf(model));
      if (!res.ok) return { lenses: [], dispose() {} };
      const lineCount = model.getLineCount();
      const lenses: ForgeLens[] = [];
      for (const sym of res.data) {
        if (!USAGE_KINDS.has(sym.kind) || sym.line < 1 || sym.line > lineCount) continue;
        // Anchor reference/implementation queries on the identifier: the document-symbol position
        // can point at the start of the declaration span, so find the name on that line instead.
        const idx = model.getLineContent(sym.line).indexOf(sym.name);
        const column = idx >= 0 ? idx + 1 : sym.column;
        const range = new monaco.Range(sym.line, 1, sym.line, 1);
        const ctx = { file: sym.file, line: sym.line, column };
        lenses.push({ range, __ctx: { ...ctx, kind: 'usages' } });
        if (IMPL_KINDS.has(sym.kind)) lenses.push({ range, __ctx: { ...ctx, kind: 'impls' } });
      }
      return { lenses, dispose() {} };
    },
    async resolveCodeLens(model, codeLens) {
      const ctx = (codeLens as ForgeLens).__ctx;
      if (!ctx) return codeLens;
      const res = await (ctx.kind === 'usages'
        ? lang.getReferences(ctx.file, ctx.line, ctx.column)
        : lang.getImplementations(ctx.file, ctx.line, ctx.column));
      // Drop the declaration itself so counts read like an IDE ("usages", not "occurrences").
      // The TS LS includes the declaration in references; jdtls already excludes it.
      const locs = (res.ok ? res.data : []).filter(
        (l) => !(samePath(l.file, ctx.file) && l.line === ctx.line),
      );
      const noun = ctx.kind === 'usages' ? 'usage' : 'implementation';
      const monacoLocs = locs.map((l) => toMonacoLocation(monaco, l));
      // Preview panes in the references peek call createModelReference on each target; make sure a
      // model exists so expanding a hit in an unopened file doesn't throw "Model not found".
      await ensureModelsFor(monaco, monacoLocs);
      codeLens.command = {
        id: 'editor.action.showReferences',
        // An implementation lens with nothing to show (e.g. a concrete class) renders blank.
        title:
          ctx.kind === 'impls' && locs.length === 0
            ? ''
            : `${locs.length} ${locs.length === 1 ? noun : `${noun}s`}`,
        arguments: [model.uri, new monaco.Position(ctx.line, ctx.column), monacoLocs],
      };
      return codeLens;
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
