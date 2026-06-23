import { describe, expect, it } from 'vitest';
import { monacoThemeForScheme } from './editor-schemes';

describe('monacoThemeForScheme', () => {
  it('auto follows the interface theme', () => {
    expect(monacoThemeForScheme('auto', 'light')).toBe('forge-light');
    expect(monacoThemeForScheme('auto', 'dark')).toBe('forge-dark');
  });

  it('uses a matching forced scheme as-is', () => {
    expect(monacoThemeForScheme('light-plus', 'light')).toBe('forge-light');
    expect(monacoThemeForScheme('dark-plus', 'dark')).toBe('forge-dark');
    expect(monacoThemeForScheme('github-dark', 'dark')).toBe('github-dark');
    expect(monacoThemeForScheme('monokai', 'dark')).toBe('monokai');
  });

  it('auto-swaps a scheme whose type mismatches the interface', () => {
    // Dark scheme on a light UI → interface default (readable), not the dark palette.
    expect(monacoThemeForScheme('dark-plus', 'light')).toBe('forge-light');
    expect(monacoThemeForScheme('github-dark', 'light')).toBe('forge-light');
    expect(monacoThemeForScheme('monokai', 'light')).toBe('forge-light');
    // Light scheme on a dark UI → dark default.
    expect(monacoThemeForScheme('light-plus', 'dark')).toBe('forge-dark');
  });

  it('falls back to the interface default for unknown schemes', () => {
    expect(monacoThemeForScheme('nope', 'light')).toBe('forge-light');
    expect(monacoThemeForScheme('nope', 'dark')).toBe('forge-dark');
  });
});
