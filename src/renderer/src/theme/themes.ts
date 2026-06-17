export interface Theme {
  id: string;
  name: string;
  type: 'dark' | 'light';
  colors: Record<string, string>;
}

const DARK: Theme = {
  id: 'forge-dark',
  name: 'Forge Dark',
  type: 'dark',
  colors: {
    bg: '#0b0b0d',
    surface: '#131316',
    'surface-2': '#1a1a1e',
    'surface-3': '#232329',
    line: '#26262c',
    'line-soft': '#1d1d21',
    fg: '#e7e7ea',
    muted: '#a0a0a8',
    faint: '#6a6a73',
    accent: '#6366f1',
    'accent-fg': '#ffffff',
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    info: '#60a5fa',
  },
};

const LIGHT: Theme = {
  id: 'forge-light',
  name: 'Forge Light',
  type: 'light',
  colors: {
    bg: '#ffffff',
    surface: '#f7f7f8',
    'surface-2': '#f0f0f2',
    'surface-3': '#e6e6ea',
    line: '#e3e3e7',
    'line-soft': '#ededf0',
    fg: '#18181b',
    muted: '#52525b',
    faint: '#9b9ba3',
    accent: '#6366f1',
    'accent-fg': '#ffffff',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    info: '#2563eb',
  },
};

export const builtInThemes: Record<string, Theme> = {
  [DARK.id]: DARK,
  [LIGHT.id]: LIGHT,
};
