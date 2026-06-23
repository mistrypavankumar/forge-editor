import type * as monacoNs from 'monaco-editor';
import type { editor, languages, Position } from 'monaco-editor';
import type { LsLocation } from '@shared/ipc-contract';
import { SEMANTIC_TOKEN_TYPES, SEMANTIC_TOKEN_MODIFIERS } from '@shared/ipc-contract';
import { LARGE_FILE_CHARS } from './language-bridge';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useEditorStore } from '../stores/editor-store';
import { openFilePath } from '../lib/workspace-actions';
import { importSpecForName, moduleSpecAtColumn, localDeclarationLine } from '../lib/go-to-definition';
import { REACT_SNIPPETS } from './react-snippets';

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

function toRange(monaco: typeof monacoNs, loc: LsLocation): monacoNs.IRange {
  return new monaco.Range(loc.line, loc.column, loc.endLine, loc.endColumn);
}

function toMonacoLocation(monaco: typeof monacoNs, loc: LsLocation): languages.Location {
  return { uri: monaco.Uri.file(loc.file), range: toRange(monaco, loc) };
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
      if (res.ok && res.data.length > 0) return res.data.map((l) => toMonacoLocation(monaco, l));
      return fallbackDefinition(monaco, model, position);
    },
  });

  monaco.languages.registerReferenceProvider(FEATURE_SELECTOR, {
    async provideReferences(model, position) {
      const res = await lang.getReferences(fileOf(model), position.lineNumber, position.column);
      if (!res.ok) return [];
      return res.data.map((l) => toMonacoLocation(monaco, l));
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
        suggestions: res.data.items.map((item) => ({
          label: item.label,
          kind: completionKind(monaco, item.kind),
          insertText: item.insertText ?? item.label,
          sortText: item.sortText,
          detail: item.detail,
          range,
        })),
      };
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

  registerReactSnippets(monaco);
}

/** Render a snippet body as readable preview text (strip tab stops / variables). */
function previewSnippet(body: string): string {
  return body
    .replace(/set\$\{1\/\(\.\*\)\/\$\{1:\/capitalize\}\/\}/g, 'setState')
    .replace(/\$\{TM_FILENAME_BASE\}/g, 'ComponentName')
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\$\d+/g, '');
}

/**
 * ES7+ React/Redux/GraphQL/React-Native snippet completions (rfc, rafce, useState, imr, clg, …)
 * for JS/TS — which also covers .jsx/.tsx. Registered as a separate completion provider; Monaco
 * merges these snippet suggestions with the Language-Service completions above.
 */
function registerReactSnippets(monaco: typeof monacoNs): void {
  const K = monaco.languages.CompletionItemKind.Snippet;
  const insertAsSnippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  monaco.languages.registerCompletionItemProvider(SELECTOR, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      return {
        suggestions: REACT_SNIPPETS.map((s) => ({
          label: s.prefix,
          kind: K,
          insertText: s.body,
          insertTextRules: insertAsSnippet,
          detail: `⚛ ${s.description}`,
          documentation: { value: '```tsx\n' + previewSnippet(s.body) + '\n```' },
          range,
        })),
      };
    },
  });
}
