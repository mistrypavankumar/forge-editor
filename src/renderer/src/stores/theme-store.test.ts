import { beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from './theme-store';

describe('theme-store', () => {
  beforeEach(() => useThemeStore.setState({ currentId: 'forge-dark' }));

  it('defaults to forge-dark', () => {
    expect(useThemeStore.getState().currentId).toBe('forge-dark');
  });

  it('setTheme changes the current id', () => {
    useThemeStore.getState().setTheme('forge-light');
    expect(useThemeStore.getState().currentId).toBe('forge-light');
  });
});
