import { describe, expect, it } from 'vitest';
import {
  blankInterpolations,
  computeGraphqlProblems,
  extractGqlTemplates,
} from './graphql-diagnostics';

describe('extractGqlTemplates', () => {
  it('finds gql and graphql tagged templates and their offsets', () => {
    const src = 'const A = gql`query { a }`;\nconst B = graphql`{ b }`;';
    const tpls = extractGqlTemplates(src);
    expect(tpls.map((t) => t.text)).toEqual(['query { a }', '{ b }']);
    // The reported body starts right after the opening backtick.
    expect(src[tpls[0].start - 1]).toBe('`');
    expect(src[tpls[0].end]).toBe('`');
  });

  it('ignores identifiers that merely end in gql', () => {
    expect(extractGqlTemplates('const x = mygql`{ a }`;')).toHaveLength(0);
  });

  it('does not end the literal on a backtick inside an interpolation', () => {
    const src = 'gql`query { ${cond ? `x` : `y`} a }`';
    const tpls = extractGqlTemplates(src);
    expect(tpls).toHaveLength(1);
    expect(tpls[0].hasInterpolation).toBe(true);
    expect(tpls[0].text).toContain('a }');
  });
});

describe('blankInterpolations', () => {
  it('blanks ${…} to equal-length whitespace, preserving newlines and offsets', () => {
    const input = 'a ${foo\n.bar} b';
    const out = blankInterpolations(input);
    expect(out).toHaveLength(input.length);
    // Interpolation blanked to spaces; the newline inside it is preserved so line numbers hold.
    expect(out).toBe('a      \n      b');
    expect(out.indexOf('\n')).toBe(input.indexOf('\n'));
  });
});

describe('computeGraphqlProblems', () => {
  it('flags a duplicate scalar field', () => {
    const src = ['const Q = gql`', '  query {', '    a', '    b', '    a', '  }', '`;'].join('\n');
    const problems = computeGraphqlProblems(src);
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe('warning');
    expect(problems[0].message).toContain('Duplicate field "a"');
    // The marker points at the second `a`, not the first.
    expect(src.slice(problems[0].start, problems[0].end)).toBe('a');
    expect(src.indexOf('a', src.indexOf('a') + 1)).toBe(problems[0].start);
  });

  it('does not flag same-named object fields with different sub-selections (they merge)', () => {
    const src = 'gql`{ user { name } user { email } }`';
    expect(computeGraphqlProblems(src)).toEqual([]);
  });

  it('flags duplicates independently within nested selection sets', () => {
    const src = 'gql`{ outer { x x } y y }`';
    const problems = computeGraphqlProblems(src);
    expect(problems).toHaveLength(2);
  });

  it('still validates a query that injects a fragment via a trailing interpolation', () => {
    const src = 'const Q = gql`query { ...Frag a a }\n${Frag}`;';
    const problems = computeGraphqlProblems(src);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain('Duplicate field "a"');
  });

  it('reports syntax errors only for interpolation-free templates', () => {
    expect(computeGraphqlProblems('gql`query { a `').length).toBeGreaterThan(0);
    // An in-selection interpolation that blanks to invalid GraphQL is skipped, not flagged.
    expect(computeGraphqlProblems('gql`query { ...${Frag} }`')).toEqual([]);
  });

  it('short-circuits when there is no gql at all', () => {
    expect(computeGraphqlProblems('const x = 1;')).toEqual([]);
  });
});
