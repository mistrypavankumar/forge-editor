import { describe, expect, it } from 'vitest';
import { applyCssVariables } from './theme-service';

describe('theme-service', () => {
  it('writes color tokens as CSS variables on the root', () => {
    const root = document.createElement('div');
    applyCssVariables(
      { id: 't', name: 'T', type: 'dark', colors: { bg: '#000', fg: '#fff' } },
      root,
    );
    expect(root.style.getPropertyValue('--bg')).toBe('#000');
    expect(root.style.getPropertyValue('--fg')).toBe('#fff');
  });
});
