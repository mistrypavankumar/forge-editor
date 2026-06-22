import { describe, expect, it } from 'vitest';
import { parseTscOutput } from './diagnostics-service';

describe('parseTscOutput', () => {
  it('parses errors and warnings with code and position', () => {
    const out = [
      "src/a.ts(11,3): error TS2322: Type 'string' is not assignable to type 'number'.",
      'src/b.tsx(7,15): warning TS6133: ',
    ].join('\n');
    const result = parseTscOutput(out);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      file: 'src/a.ts',
      line: 11,
      col: 3,
      severity: 'error',
      code: 'TS2322',
      message: "Type 'string' is not assignable to type 'number'.",
    });
    expect(result[1].severity).toBe('warning');
    expect(result[1].file).toBe('src/b.tsx');
  });

  it('ignores indented continuation/related-info lines', () => {
    const out = [
      "src/a.ts(1,1): error TS2322: Type 'A' is not assignable to type 'B'.",
      "  Type 'A' is missing the following properties from type 'B'.",
      '    index.ts(18,3): The expected type comes from property ...',
    ].join('\n');
    expect(parseTscOutput(out)).toHaveLength(1);
  });

  it('returns nothing for clean output', () => {
    expect(parseTscOutput('')).toEqual([]);
    expect(parseTscOutput('\n\n')).toEqual([]);
  });
});
