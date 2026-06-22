import { describe, it, expect } from 'vitest';
import { detectFormatters, resolveFormatterForFile, FORMATTERS } from './detect-formatters';

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

describe('resolveFormatterForFile', () => {
  it('keeps ESLint for JS/TS files', () => {
    expect(resolveFormatterForFile('eslint', '/a.ts', ['eslint', 'prettier'])).toBe('eslint');
    expect(resolveFormatterForFile('eslint', '/a.tsx', ['eslint', 'prettier'])).toBe('eslint');
  });

  it('falls back to Prettier for non-JS/TS files when available', () => {
    expect(resolveFormatterForFile('eslint', '/a.html', ['eslint', 'prettier'])).toBe('prettier');
    expect(resolveFormatterForFile('eslint', '/a.css', ['eslint', 'prettier'])).toBe('prettier');
    expect(resolveFormatterForFile('eslint', '/a.json', ['eslint', 'prettier'])).toBe('prettier');
  });

  it('stays on ESLint for non-JS/TS files when Prettier is not available', () => {
    expect(resolveFormatterForFile('eslint', '/a.html', ['eslint'])).toBe('eslint');
  });

  it('never overrides a non-ESLint selection', () => {
    expect(resolveFormatterForFile('prettier', '/a.ts', ['eslint', 'prettier'])).toBe('prettier');
    expect(resolveFormatterForFile('biome', '/a.html', ['eslint', 'biome'])).toBe('biome');
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

describe('FORMATTERS stdin', () => {
  it('builds stdin argv that reads the buffer and emits formatted output', () => {
    expect(FORMATTERS.prettier.stdin.args('/r/a.ts')).toEqual(['--stdin-filepath', '/r/a.ts']);
    expect(FORMATTERS.eslint.stdin.args('/r/a.ts')).toEqual([
      '--stdin', '--stdin-filename', '/r/a.ts', '--fix-dry-run', '--format', 'json',
    ]);
  });

  it('prettier stdout is the formatted text directly', () => {
    expect(FORMATTERS.prettier.stdin.parse('const x = 1;\n', 'const x=1;')).toBe('const x = 1;\n');
  });

  it('eslint parses the fixed source from JSON output', () => {
    const json = JSON.stringify([{ output: 'const x = 1;\n' }]);
    expect(FORMATTERS.eslint.stdin.parse(json, 'const x=1;')).toBe('const x = 1;\n');
  });

  it('eslint falls back to the input when there is no fix or invalid JSON', () => {
    expect(FORMATTERS.eslint.stdin.parse(JSON.stringify([{}]), 'const x=1;')).toBe('const x=1;');
    expect(FORMATTERS.eslint.stdin.parse('not json', 'const x=1;')).toBe('const x=1;');
  });
});
