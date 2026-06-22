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
    bg: '#080B12',
    surface: '#0D111B',
    'surface-2': '#111827',
    'surface-3': '#1B2638',
    elevated: '#161F2E',
    active: '#202C44',
    line: '#1F2A3D',
    'line-soft': '#141C2A',
    'line-strong': '#2D3A52',
    fg: '#E6EDF7',
    muted: '#A8B3C7',
    faint: '#6B768A',
    accent: '#7C5CFF',
    'accent-hover': '#8B73FF',
    'accent-fg': '#FFFFFF',
    success: '#3DDC97',
    warning: '#F7B955',
    danger: '#FF5C7A',
    info: '#4DBBFF',
  },
};

const LIGHT: Theme = {
  id: 'forge-light',
  name: 'Forge Light',
  type: 'light',
  colors: {
    bg: '#ffffff',
    surface: '#f7f8fb',
    'surface-2': '#eef1f6',
    'surface-3': '#e5e9f1',
    elevated: '#ffffff',
    active: '#e3e9f6',
    line: '#e2e6ee',
    'line-soft': '#eef1f6',
    'line-strong': '#d2d9e4',
    fg: '#1a2230',
    muted: '#5a6477',
    faint: '#98a1b2',
    accent: '#6f4ff0',
    'accent-hover': '#5d3fe0',
    'accent-fg': '#ffffff',
    success: '#0f9d6b',
    warning: '#c98a1f',
    danger: '#e23b5a',
    info: '#2596e6',
  },
};

export const builtInThemes: Record<string, Theme> = {
  [DARK.id]: DARK,
  [LIGHT.id]: LIGHT,
};
