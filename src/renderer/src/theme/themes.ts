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
    bg: '#0a0a0c',
    surface: '#141417',
    'surface-2': '#1c1c21',
    'surface-3': '#272730',
    line: '#2c2c34',
    'line-soft': '#1f1f25',
    fg: '#ededf0',
    muted: '#b2b2bb',
    faint: '#7c7c87',
    accent: '#7079f5',
    'accent-fg': '#ffffff',
    success: '#3ddc97',
    warning: '#f5c451',
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
    surface: '#fafafa',
    'surface-2': '#f3f3f5',
    'surface-3': '#e8e8ec',
    line: '#e4e4e8',
    'line-soft': '#efeff1',
    fg: '#18181b',
    muted: '#5a5a64',
    faint: '#9a9aa3',
    accent: '#5b5fef',
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
