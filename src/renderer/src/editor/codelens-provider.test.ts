import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { languages } from 'monaco-editor';

// The CodeLens provider is the hot spot behind the "Cmd+F / right-click freeze on a huge file"
// bug: a symbol-dense file (e.g. a nested path→permission map where every property is a symbol)
// produced thousands of "0 usages" lenses, each firing an uncancellable project-wide getReferences
// at the single language worker plus a synchronous createModel burst on the renderer thread. These
// tests drive the *actually registered* provider to lock in the cap and the cancellation guard.

/** Minimal LS-client mock; return values are swapped per test. */
const lang = {
  getDocumentSymbols: vi.fn(),
  getReferences: vi.fn(),
  getImplementations: vi.fn(),
  getDefinition: vi.fn(),
  getHover: vi.fn(),
  getCompletions: vi.fn(),
  getCompletionDetails: vi.fn(),
  getSignatureHelp: vi.fn(),
  renameSymbol: vi.fn(),
  getSemanticTokens: vi.fn(),
};

class Range {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number,
  ) {}
}
class Position {
  constructor(public lineNumber: number, public column: number) {}
}

/** A monaco stub: every register* is a recording no-op; registerCodeLensProvider is captured. */
function makeMonaco(): { monaco: unknown; getCodeLensProvider: () => languages.CodeLensProvider } {
  let codeLensProvider: languages.CodeLensProvider | undefined;
  const registerNoop = vi.fn();
  const tsDefaults = { modeConfiguration: {}, setModeConfiguration: vi.fn() };
  const monaco = {
    Range,
    Position,
    Uri: { file: (p: string) => ({ path: p, toString: () => `file://${p}` }) },
    languages: {
      registerCodeLensProvider: (_sel: unknown, p: languages.CodeLensProvider) => {
        codeLensProvider = p;
        return { dispose() {} };
      },
      registerDefinitionProvider: registerNoop,
      registerReferenceProvider: registerNoop,
      registerHoverProvider: registerNoop,
      registerCompletionItemProvider: registerNoop,
      registerSignatureHelpProvider: registerNoop,
      registerRenameProvider: registerNoop,
      registerDocumentSemanticTokensProvider: registerNoop,
      registerInlineCompletionsProvider: registerNoop,
      registerDocumentHighlightProvider: registerNoop,
      CompletionItemKind: { Snippet: 27 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      CompletionItemInsertTextRules: { InsertAsSnippet: 4 },
      typescript: { typescriptDefaults: tsDefaults, javascriptDefaults: tsDefaults },
    },
    editor: {
      registerEditorOpener: registerNoop,
      getModel: () => null,
      createModel: vi.fn(),
    },
  };
  return { monaco, getCodeLensProvider: () => codeLensProvider! };
}

/** A model whose symbol count/line count we control; small byte size so the byte guard is inert. */
function makeModel(lineCount: number): unknown {
  return {
    uri: { path: '/repo/map.ts' },
    getValueLength: () => 10_000,
    getLineCount: () => lineCount,
    getLineContent: (line: number) => `  prop${line}: value,`,
  };
}

let provider: languages.CodeLensProvider;

beforeAll(async () => {
  // monaco-providers reads window.forge.editorLanguage at import time.
  (window as unknown as { forge: unknown }).forge = {
    editorLanguage: lang,
    isMac: true,
    readFile: vi.fn(async () => ({ ok: false })),
  };
  const { registerLanguageProviders } = await import('./monaco-providers');
  const { monaco, getCodeLensProvider } = makeMonaco();
  registerLanguageProviders(monaco as never);
  provider = getCodeLensProvider();
});

const notCancelled = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

/** Build `n` distinct `property` document symbols on consecutive lines. */
function propertySymbols(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `prop${i + 1}`,
    kind: 'property',
    file: '/repo/map.ts',
    line: i + 1,
    column: 3,
  }));
}

describe('CodeLens provider — symbol-dense guard', () => {
  it('emits lenses for a normal file', async () => {
    lang.getDocumentSymbols.mockResolvedValue({ ok: true, data: propertySymbols(20) });
    const res = await provider.provideCodeLenses!(makeModel(40) as never, notCancelled as never);
    expect(res && 'lenses' in res ? res.lenses.length : 0).toBe(20);
  });

  it('suppresses lenses when a file exceeds the cap (the freeze case)', async () => {
    // 501 property symbols > MAX_CODE_LENSES (500) → no lenses, so no resolve fan-out.
    lang.getDocumentSymbols.mockResolvedValue({ ok: true, data: propertySymbols(501) });
    const res = await provider.provideCodeLenses!(makeModel(600) as never, notCancelled as never);
    expect(res && 'lenses' in res ? res.lenses.length : -1).toBe(0);
    // The document-symbol call still happens once; the expensive per-lens fan-out does not follow.
    expect(lang.getReferences).not.toHaveBeenCalled();
  });
});

describe('CodeLens provider — resolve cancellation guard', () => {
  it('sets the usages command when the token is live', async () => {
    lang.getReferences.mockResolvedValue({
      ok: true,
      // Only the declaration itself → filtered out → "0 usages", no model creation.
      data: [{ file: '/repo/map.ts', line: 5, column: 3, endLine: 5, endColumn: 8 }],
    });
    const lens = {
      range: new Range(5, 1, 5, 1),
      __ctx: { file: '/repo/map.ts', line: 5, column: 3, kind: 'usages' },
    };
    const resolved = await provider.resolveCodeLens!(
      makeModel(40) as never,
      lens as never,
      notCancelled as never,
    );
    expect(resolved!.command?.id).toBe('editor.action.showReferences');
    expect(resolved!.command?.title).toBe('0 usages');
  });

  it('drops the result (no command) when the token is cancelled mid-flight', async () => {
    lang.getReferences.mockResolvedValue({ ok: true, data: [] });
    const lens = {
      range: new Range(5, 1, 5, 1),
      __ctx: { file: '/repo/map.ts', line: 5, column: 3, kind: 'usages' },
    };
    const cancelled = { isCancellationRequested: true, onCancellationRequested: () => ({ dispose() {} }) };
    const resolved = await provider.resolveCodeLens!(
      makeModel(40) as never,
      lens as never,
      cancelled as never,
    );
    expect(resolved!.command).toBeUndefined();
  });
});
