import { describe, it, expect } from 'vitest';
import { detectFormatters, FORMATTERS } from './detect-formatters';

describe('detectFormatters', () => {
  it('always includes eslint as the default, even with no config', () => {
    expect(detectFormatters([])).toEqual(['eslint']);
    expect(detectFormatters(['package.json', 'src'])).toEqual(['eslint']);
  });

  it('adds prettier when a prettier config is present', () => {
    expect(detectFormatters(['.prettierrc'])).toEqual(['eslint', 'prettier']);
    expect(detectFormatters(['prettier.config.mjs'])).toEqual(['eslint', 'prettier']);
  });

  it('adds biome and dprint when their configs are present', () => {
    expect(detectFormatters(['biome.json'])).toContain('biome');
    expect(detectFormatters(['.dprint.json'])).toContain('dprint');
  });

  it('returns detected formatters in registry order', () => {
    const result = detectFormatters(['dprint.json', '.prettierrc', 'biome.json']);
    expect(result).toEqual(['eslint', 'prettier', 'biome', 'dprint']);
  });

  it('does not add a formatter for an unrelated eslint config (eslint already default)', () => {
    expect(detectFormatters(['eslint.config.js'])).toEqual(['eslint']);
  });
});

describe('FORMATTERS argv', () => {
  it('builds the in-place format command for each tool', () => {
    expect(FORMATTERS.eslint.args('/r/a.ts')).toEqual(['--fix', '/r/a.ts']);
    expect(FORMATTERS.prettier.args('/r/a.ts')).toEqual(['--write', '/r/a.ts']);
    expect(FORMATTERS.biome.args('/r/a.ts')).toEqual(['format', '--write', '/r/a.ts']);
    expect(FORMATTERS.dprint.args('/r/a.ts')).toEqual(['fmt', '/r/a.ts']);
  });
});
