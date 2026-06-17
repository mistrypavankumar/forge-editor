import type { Theme } from './themes';

export function applyCssVariables(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value);
  }
}
