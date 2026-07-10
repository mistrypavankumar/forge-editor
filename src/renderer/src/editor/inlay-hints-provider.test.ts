import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { languages } from 'monaco-editor';

// The inline reference-hint provider (IntelliJ-style "N usages" / "M implementations" at the end of
// a declaration line) is the hot spot behind the "Cmd+F / right-click freeze on a huge file" bug: a
// symbol-dense file (e.g. a nested path→permission map where every property is a symbol) produced
// hundreds of hints, each firing an uncancellable project-wide getReferences at the single language
// worker. These tests drive the *actually registered* provider to lock in the visible-range scope,
// the per-pass cap, the declaration-self filter, and the per-version count cache.

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

/** A monaco stub: every register* is a recording no-op; registerInlayHintsProvider is captured. */
function makeMonaco(): {
  monaco: unknown;
  getInlayHintsProvider: () => languages.InlayHintsProvider;
} {
  let inlayHintsProvider: languages.InlayHintsProvider | undefined;
  const registerNoop = vi.fn();
  const tsDefaults = { modeConfiguration: {}, setModeConfiguration: vi.fn() };
  const monaco = {
    Range,
    Position,
    Uri: { file: (p: string) => ({ path: p, toString: () => `file://${p}` }) },
    languages: {
      registerInlayHintsProvider: (_sel: unknown, p: languages.InlayHintsProvider) => {
        inlayHintsProvider = p;
        return { dispose() {} };
      },
      registerCodeLensProvider: registerNoop,
      registerDefinitionProvider: registerNoop,
      registerReferenceProvider: registerNoop,
      registerHoverProvider: registerNoop,
      registerCompletionItemProvider: registerNoop,
      registerSignatureHelpProvider: registerNoop,
      registerRenameProvider: registerNoop,
      registerDocumentSemanticTokensProvider: registerNoop,
      registerInlineCompletionsProvider: registerNoop,
      registerDocumentHighlightProvider: registerNoop,
      InlayHintKind: { Type: 1, Parameter: 2 },
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
  return { monaco, getInlayHintsProvider: () => inlayHintsProvider! };
}

let version = 1;
/** A model whose symbol count/line count we control; small byte size so the byte guard is inert. */
function makeModel(lineCount: number): unknown {
  return {
    uri: { path: '/repo/map.ts', toString: () => 'file:///repo/map.ts' },
    getValueLength: () => 10_000,
    getLineCount: () => lineCount,
    getLineContent: (line: number) => `  prop${line}: value,`,
    getLineMaxColumn: (line: number) => `  prop${line}: value,`.length + 1,
    getVersionId: () => version,
  };
}

/** A range spanning the whole file (lines 1..lineCount) — the default "everything visible" case. */
function fullRange(lineCount: number): unknown {
  return new Range(1, 1, lineCount, 1);
}

let provider: languages.InlayHintsProvider;

beforeAll(async () => {
  // monaco-providers reads window.forge.editorLanguage at import time.
  (window as unknown as { forge: unknown }).forge = {
    editorLanguage: lang,
    isMac: true,
    readFile: vi.fn(async () => ({ ok: false })),
  };
  const { registerLanguageProviders } = await import('./monaco-providers');
  const { monaco, getInlayHintsProvider } = makeMonaco();
  registerLanguageProviders(monaco as never);
  provider = getInlayHintsProvider();
});

beforeEach(() => {
  // A fresh model version per test so the per-version count cache never leaks between cases.
  version += 1;
  lang.getReferences.mockReset();
  lang.getImplementations.mockReset();
  lang.getDocumentSymbols.mockReset();
});

const notCancelled = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose() {} }),
};

/**
 * Build `n` distinct hint-eligible document symbols on consecutive lines. Uses `function` kind:
 * data-member kinds (`property`, `field`) are intentionally excluded from usage hints, so a symbol
 * must be a callable/type declaration to produce a hint at all. `function` is in USAGE_KINDS but not
 * IMPL_KINDS, so these emit a usages hint without an implementations query.
 */
function declSymbols(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `prop${i + 1}`,
    kind: 'function',
    file: '/repo/map.ts',
    line: i + 1,
    column: 3,
  }));
}

/** A single non-declaration reference (so a symbol reads as "1 usage", not filtered to zero). */
function oneExternalUsage() {
  return { ok: true, data: [{ file: '/repo/other.ts', line: 7, column: 1, endLine: 7, endColumn: 5 }] };
}

describe('Inlay hint provider — visible range + symbol-dense guard', () => {
  it('emits one hint per declaration inside the visible range', async () => {
    lang.getDocumentSymbols.mockResolvedValue({ ok: true, data: declSymbols(20) });
    lang.getReferences.mockResolvedValue(oneExternalUsage());
    const res = await provider.provideInlayHints!(
      makeModel(40) as never,
      fullRange(40) as never,
      notCancelled as never,
    );
    expect(res?.hints.length).toBe(20);
  });

  it('skips declarations outside the visible range and does not query them', async () => {
    lang.getDocumentSymbols.mockResolvedValue({ ok: true, data: declSymbols(20) });
    lang.getReferences.mockResolvedValue(oneExternalUsage());
    // Only lines 5..8 are visible → 4 hints, 4 reference queries.
    const res = await provider.provideInlayHints!(
      makeModel(40) as never,
      new Range(5, 1, 8, 1) as never,
      notCancelled as never,
    );
    expect(res?.hints.length).toBe(4);
    expect(lang.getReferences).toHaveBeenCalledTimes(4);
  });

  it('suppresses hints when the visible range exceeds the cap (the freeze case)', async () => {
    // 201 eligible symbols on screen > MAX_INLAY_HINTS (200) → no hints, so no resolve fan-out.
    lang.getDocumentSymbols.mockResolvedValue({ ok: true, data: declSymbols(201) });
    const res = await provider.provideInlayHints!(
      makeModel(300) as never,
      fullRange(300) as never,
      notCancelled as never,
    );
    expect(res?.hints.length).toBe(0);
    // The document-symbol call still happens once; the expensive per-hint fan-out does not follow.
    expect(lang.getReferences).not.toHaveBeenCalled();
  });
});

describe('Inlay hint provider — counts, cache, and cancellation', () => {
  it('excludes the declaration itself from the usage count', async () => {
    lang.getDocumentSymbols.mockResolvedValue({ ok: true, data: declSymbols(1) });
    // Two hits: the declaration (line 1, same file) and one real usage. Count should read "1 usage".
    lang.getReferences.mockResolvedValue({
      ok: true,
      data: [
        { file: '/repo/map.ts', line: 1, column: 3, endLine: 1, endColumn: 8 },
        { file: '/repo/other.ts', line: 7, column: 1, endLine: 7, endColumn: 5 },
      ],
    });
    const res = await provider.provideInlayHints!(
      makeModel(10) as never,
      fullRange(10) as never,
      notCancelled as never,
    );
    const parts = res!.hints[0].label as languages.InlayHintLabelPart[];
    expect(parts[0].label).toBe('1 usage');
    // The hint is anchored at the end of the declaration line (trailing, not above it).
    expect(res!.hints[0].position.lineNumber).toBe(1);
    expect(res!.hints[0].position.column).toBeGreaterThan(1);
    // The click opens the references peek populated with the non-declaration location only.
    expect(parts[0].command?.id).toBe('editor.action.showReferences');
  });

  it('reuses cached counts on a second pass at the same model version', async () => {
    lang.getDocumentSymbols.mockResolvedValue({ ok: true, data: declSymbols(3) });
    lang.getReferences.mockResolvedValue(oneExternalUsage());
    const model = makeModel(10) as never;
    await provider.provideInlayHints!(model, fullRange(10) as never, notCancelled as never);
    expect(lang.getReferences).toHaveBeenCalledTimes(3);
    // Re-request (e.g. a scroll) at the same version → served from cache, no new queries.
    await provider.provideInlayHints!(model, fullRange(10) as never, notCancelled as never);
    expect(lang.getReferences).toHaveBeenCalledTimes(3);
  });

  it('returns no hints when cancelled before the symbols come back', async () => {
    lang.getDocumentSymbols.mockResolvedValue({ ok: true, data: declSymbols(5) });
    const cancelled = {
      isCancellationRequested: true,
      onCancellationRequested: () => ({ dispose() {} }),
    };
    const res = await provider.provideInlayHints!(
      makeModel(10) as never,
      fullRange(10) as never,
      cancelled as never,
    );
    expect(res?.hints.length).toBe(0);
    expect(lang.getReferences).not.toHaveBeenCalled();
  });

  it('drops a single failed declaration but keeps the rest of the pass', async () => {
    lang.getDocumentSymbols.mockResolvedValue({ ok: true, data: declSymbols(3) });
    // The middle declaration's reference query rejects; its hint is dropped, the other two survive.
    lang.getReferences.mockImplementation((_f: string, line: number) =>
      line === 2 ? Promise.reject(new Error('LS worker died')) : Promise.resolve(oneExternalUsage()),
    );
    const res = await provider.provideInlayHints!(
      makeModel(10) as never,
      fullRange(10) as never,
      notCancelled as never,
    );
    expect(res?.hints.length).toBe(2);
  });
});

/** A model with an explicit single-line body, so anchor-column math is exercised on real text. */
function singleLineModel(line: string): unknown {
  return {
    uri: { path: '/repo/a.ts', toString: () => 'file:///repo/a.ts' },
    getValueLength: () => 200,
    getLineCount: () => 1,
    getLineContent: () => line,
    getLineMaxColumn: () => line.length + 1,
    getVersionId: () => version,
  };
}

/** `n` distinct non-declaration reference locations (all pass the not-self filter). */
function externalUsages(n: number) {
  return {
    ok: true,
    data: Array.from({ length: n }, (_, i) => ({
      file: '/repo/other.ts', line: 7 + i, column: 1, endLine: 7 + i, endColumn: 5,
    })),
  };
}

describe('Inlay hint provider — anchor + same-line declarations', () => {
  it('anchors the reference query at an identifier boundary, not a bare substring', async () => {
    // `foo` also appears inside `fooBar`; the query must anchor on the standalone identifier.
    const line = 'const fooBar = foo;';
    lang.getDocumentSymbols.mockResolvedValue({
      ok: true,
      data: [{ name: 'foo', kind: 'function', file: '/repo/a.ts', line: 1, column: 1 }],
    });
    lang.getReferences.mockResolvedValue(oneExternalUsage());
    await provider.provideInlayHints!(
      singleLineModel(line) as never,
      new Range(1, 1, 1, 1) as never,
      notCancelled as never,
    );
    const col = lang.getReferences.mock.calls[0][2];
    expect(col).toBe(line.indexOf('foo', 8) + 1); // the second `foo`, not the one inside fooBar
  });

  it('gives two declarations sharing a line their own counts (line:column cache key)', async () => {
    const line = 'function alpha(){} function beta(){}';
    const alphaCol = line.indexOf('alpha') + 1;
    const betaCol = line.indexOf('beta') + 1;
    lang.getDocumentSymbols.mockResolvedValue({
      ok: true,
      data: [
        { name: 'alpha', kind: 'function', file: '/repo/a.ts', line: 1, column: 1 },
        { name: 'beta', kind: 'function', file: '/repo/a.ts', line: 1, column: 1 },
      ],
    });
    // Counts differ by anchored column; a line-only cache key would serve beta alpha's 3 usages.
    lang.getReferences.mockImplementation((_f: string, _l: number, col: number) =>
      Promise.resolve(col === alphaCol ? externalUsages(3) : externalUsages(1)),
    );
    const res = await provider.provideInlayHints!(
      singleLineModel(line) as never,
      new Range(1, 1, 1, 1) as never,
      notCancelled as never,
    );
    expect(res?.hints.length).toBe(2);
    expect(lang.getReferences).toHaveBeenCalledTimes(2);
    const labels = res!.hints.map(
      (h) => (h.label as languages.InlayHintLabelPart[])[0].label,
    );
    expect(labels.sort()).toEqual(['1 usage', '3 usages']);
    expect(betaCol).toBeGreaterThan(alphaCol); // sanity: the two anchors really are distinct
  });
});
