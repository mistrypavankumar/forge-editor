import { describe, it, expect } from 'vitest';
import { SourceMapRegistry, pathToUrl } from './source-maps';

// Minimal base64 VLQ encoder, so we can hand-build a real inline source map for the test.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vlq(n: number): string {
  let v = n < 0 ? (-n << 1) | 1 : n << 1;
  let out = '';
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += B64[digit];
  } while (v > 0);
  return out;
}
function seg(parts: number[]): string {
  return parts.map(vlq).join('');
}

/** A map where authored line N (1-based) lands on generated line N+3 — as if a 3-line prologue
 *  were injected (mirrors what a TS loader does). Built as an inline data URI like a real tool. */
function inlineMap(): string {
  // Generated lines 0..2 are unmapped (prologue); line 3 -> authored line 0, then +1 each line.
  const mappings = ['', '', '', seg([0, 0, 0, 0]), seg([0, 0, 1, 0]), seg([0, 0, 1, 0])].join(';');
  const map = { version: 3, sources: ['app.ts'], names: [], mappings };
  return 'data:application/json;base64,' + Buffer.from(JSON.stringify(map)).toString('base64');
}

describe('SourceMapRegistry', () => {
  it('maps an authored line through a source map to the generated line, and back', () => {
    const reg = new SourceMapRegistry();
    reg.register('1', 'file:///proj/app.js', inlineMap());

    // Authored line 2 (1-based) -> generated line 5 (1-based) -> CDP lineNumber 4 (0-based).
    const gen = reg.authoredToGenerated('/proj/app.ts', 2);
    expect(gen).toEqual([{ url: 'file:///proj/app.js', lineNumber: 4, columnNumber: 0 }]);

    // The reverse: paused at generated 0-based line 4 maps back to authored line 2.
    const orig = reg.generatedToAuthored('1', 4, 0);
    expect(orig).toEqual({ file: '/proj/app.ts', line: 2, column: 1 });
  });

  it('falls back to identity for scripts with no source map (plain JS / type-stripping)', () => {
    const reg = new SourceMapRegistry();
    reg.register('2', pathToUrl('/proj/plain.js'), undefined);

    // No map: the authored line is the generated line (0-based on the file URL).
    expect(reg.authoredToGenerated('/proj/plain.js', 10)).toEqual([
      { url: pathToUrl('/proj/plain.js'), lineNumber: 9, columnNumber: 0 },
    ]);
    expect(reg.generatedToAuthored('2', 9, 0)).toEqual({ file: '/proj/plain.js', line: 10, column: 1 });
  });

  it('returns no candidates for an unparsed file and never throws on a bad map', () => {
    const reg = new SourceMapRegistry();
    expect(reg.authoredToGenerated('/proj/never-seen.ts', 1)).toEqual([]);
    expect(() => reg.register('3', 'file:///proj/x.js', 'data:application/json;base64,not-base64!!')).not.toThrow();
    reg.clear();
    expect(reg.generatedToAuthored('1', 0, 0)).toBeNull();
  });
});
