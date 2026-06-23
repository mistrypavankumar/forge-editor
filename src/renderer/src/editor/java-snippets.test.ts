import { describe, expect, it } from 'vitest';
import { JAVA_SNIPPETS } from './java-snippets';

describe('JAVA_SNIPPETS', () => {
  it('has unique prefixes', () => {
    const prefixes = JAVA_SNIPPETS.map((s) => s.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('every snippet has a non-empty body and description', () => {
    for (const s of JAVA_SNIPPETS) {
      expect(s.body.length, s.prefix).toBeGreaterThan(0);
      expect(s.description.length, s.prefix).toBeGreaterThan(0);
    }
  });

  it('includes the headline Java prefixes', () => {
    const prefixes = new Set(JAVA_SNIPPETS.map((s) => s.prefix));
    for (const p of ['sout', 'psvm', 'fori', 'foreach', 'tryc', 'class', 'test']) {
      expect(prefixes.has(p), p).toBe(true);
    }
  });
});
