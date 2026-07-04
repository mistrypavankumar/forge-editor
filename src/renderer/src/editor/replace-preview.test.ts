import { describe, expect, it } from 'vitest';
import { buildReplaceDecorations } from './replace-preview';
import type { ReplacePreview } from '../stores/search-store';

// Minimal stand-ins for the Monaco pieces buildReplaceDecorations touches.
class FakeRange {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number,
  ) {}
}
const fakeMonaco = { Range: FakeRange } as unknown as typeof import('monaco-editor');

function fakeModel(text: string): import('monaco-editor').editor.ITextModel {
  const lines = text.split('\n');
  return {
    getLineCount: () => lines.length,
    getLineContent: (n: number) => lines[n - 1],
  } as unknown as import('monaco-editor').editor.ITextModel;
}

function preview(query: string, replacement: string, extra: Partial<ReplacePreview['options']> = {}): ReplacePreview {
  return {
    options: { query, regex: false, caseSensitive: false, wholeWord: false, ...extra },
    replacement,
  };
}

describe('buildReplaceDecorations', () => {
  it('decorates each match with the old range struck through and the replacement after it', () => {
    const decos = buildReplaceDecorations(fakeMonaco, fakeModel('run the test\nno match here'), preview('test', 'spec'));
    expect(decos).toHaveLength(1);
    const d = decos[0];
    // "test" starts at column 9 (1-based) on line 1 and spans 4 chars → end column 13.
    expect(d.range).toMatchObject({ startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 13 });
    expect(d.options.inlineClassName).toBe('forge-replace-old');
    expect(d.options.after).toEqual({ content: 'spec', inlineClassName: 'forge-replace-new' });
  });

  it('finds every occurrence across and within lines, case-insensitively by default', () => {
    const decos = buildReplaceDecorations(fakeMonaco, fakeModel('Test test\ntEsT'), preview('test', 'x'));
    expect(decos).toHaveLength(3);
    expect(decos.map((d) => d.range.startLineNumber)).toEqual([1, 1, 2]);
  });

  it('previews a deletion (no ghost text) when the replacement is empty', () => {
    const decos = buildReplaceDecorations(fakeMonaco, fakeModel('drop this'), preview('this', ''));
    expect(decos).toHaveLength(1);
    expect(decos[0].options.after).toBeUndefined();
    expect(decos[0].options.inlineClassName).toBe('forge-replace-old');
  });

  it('honors case sensitivity when requested', () => {
    const decos = buildReplaceDecorations(fakeMonaco, fakeModel('Test test'), preview('test', 'x', { caseSensitive: true }));
    expect(decos).toHaveLength(1);
    expect(decos[0].range.startColumn).toBe(6); // only the lowercase "test"
  });

  it('expands $1 capture references in regex replacements', () => {
    const decos = buildReplaceDecorations(
      fakeMonaco,
      fakeModel('foo(bar)'),
      preview('foo\\((\\w+)\\)', '$1', { regex: true }),
    );
    expect(decos).toHaveLength(1);
    expect(decos[0].options.after).toEqual({ content: 'bar', inlineClassName: 'forge-replace-new' });
  });

  it('returns nothing for an invalid regex', () => {
    expect(buildReplaceDecorations(fakeMonaco, fakeModel('x'), preview('(unclosed', 'y', { regex: true }))).toEqual([]);
  });
});
