import { describe, expect, it } from 'vitest';
import { REACT_SNIPPETS } from './react-snippets';

describe('REACT_SNIPPETS', () => {
  it('has unique prefixes', () => {
    const prefixes = REACT_SNIPPETS.map((s) => s.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('every snippet has a non-empty body and description', () => {
    for (const s of REACT_SNIPPETS) {
      expect(s.body.length, s.prefix).toBeGreaterThan(0);
      expect(s.description.length, s.prefix).toBeGreaterThan(0);
    }
  });

  it('includes the headline ES7 prefixes', () => {
    const prefixes = new Set(REACT_SNIPPETS.map((s) => s.prefix));
    for (const p of ['rfc', 'rafce', 'rcc', 'useState', 'useEffect', 'imr', 'clg']) {
      expect(prefixes.has(p), p).toBe(true);
    }
  });
});
