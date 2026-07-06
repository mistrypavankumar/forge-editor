import { describe, it, expect } from 'vitest';
import { extractJson, parsePlan, parsePatches, extractErrorLines } from './parse';

describe('extractJson', () => {
  it('reads a fenced ```json block', () => {
    const text = 'Here is the plan:\n```json\n{"summary":"hi","steps":[]}\n```\nDone.';
    expect(extractJson(text)).toEqual({ summary: 'hi', steps: [] });
  });

  it('reads an unfenced object with surrounding prose', () => {
    const text = 'Sure — {"a":1} that is it';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it('throws when there is no object', () => {
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('parsePlan', () => {
  it('normalizes a well-formed plan', () => {
    const reply = `\`\`\`json
{
  "summary": "Add pagination",
  "steps": ["Add state", "Wire the API"],
  "filesToEdit": [{"path": "src/List.tsx", "reason": "add controls"}],
  "commands": ["npm run type-check"]
}
\`\`\``;
    const plan = parsePlan(reply);
    expect(plan.summary).toBe('Add pagination');
    expect(plan.steps).toHaveLength(2);
    expect(plan.filesToEdit).toEqual([{ path: 'src/List.tsx', reason: 'add controls' }]);
    expect(plan.commands).toEqual(['npm run type-check']);
  });

  it('drops files without a path and blank steps', () => {
    const reply = '{"summary":"x","steps":["a","",null],"filesToEdit":[{"reason":"no path"},{"path":"a.ts"}],"commands":[]}';
    const plan = parsePlan(reply);
    expect(plan.steps).toEqual(['a']);
    expect(plan.filesToEdit).toEqual([{ path: 'a.ts', reason: '' }]);
  });

  it('throws when the plan is empty', () => {
    expect(() => parsePlan('{"summary":"","steps":[],"filesToEdit":[]}')).toThrow();
  });
});

describe('parsePatches', () => {
  it('extracts patches', () => {
    const reply = '```json\n{"patches":[{"path":"a.ts","content":"x","description":"d"}]}\n```';
    expect(parsePatches(reply)).toEqual([{ path: 'a.ts', content: 'x', description: 'd' }]);
  });

  it('skips entries without a path', () => {
    const reply = '{"patches":[{"content":"x"},{"path":"a.ts","content":"y","description":""}]}';
    expect(parsePatches(reply)).toEqual([{ path: 'a.ts', content: 'y', description: '' }]);
  });

  it('throws when there are no patches', () => {
    expect(() => parsePatches('{"patches":[]}')).toThrow();
  });
});

describe('extractErrorLines', () => {
  it('captures tsc-style diagnostics', () => {
    const out = 'src/foo.ts(12,5): error TS2345: Argument of type ...\nOther noise line';
    const errs = extractErrorLines(out);
    expect(errs[0]).toContain('src/foo.ts(12,5)');
  });

  it('captures eslint-style path:line:col', () => {
    const out = "src/bar.tsx:8:3: 'x' is not defined";
    expect(extractErrorLines(out)[0]).toContain('src/bar.tsx:8:3');
  });

  it('de-duplicates repeated lines', () => {
    const out = 'error: boom\nerror: boom';
    expect(extractErrorLines(out)).toHaveLength(1);
  });
});
