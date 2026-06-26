import { describe, it, expect } from 'vitest';
import { isBinaryContent } from './is-binary';

describe('isBinaryContent', () => {
  it('treats normal source/text as text', () => {
    expect(isBinaryContent('const x = 1;\n// comment\n')).toBe(false);
    expect(isBinaryContent('héllo wörld — em dash, emoji 🎉')).toBe(false);
  });

  it('treats an empty file as text', () => {
    expect(isBinaryContent('')).toBe(false);
  });

  it('flags content containing a NUL byte', () => {
    expect(isBinaryContent('\x89PNG\x00\x00IHDR data')).toBe(true);
  });

  it('flags content dense with replacement characters', () => {
    expect(isBinaryContent('�'.repeat(50) + 'abc')).toBe(true);
  });

  it('tolerates a few stray replacement characters in mostly-text content', () => {
    expect(isBinaryContent('a'.repeat(1000) + '�')).toBe(false);
  });
});
