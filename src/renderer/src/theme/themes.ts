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
    bg: '#1b1b1f',
    'bg-elevated': '#202024',
    'bg-titlebar': '#18181b',
    'bg-activitybar': '#161619',
    'bg-statusbar': '#18181b',
    'surface-hover': '#26262c',
    'surface-active': '#2e2e36',
    border: '#2a2a31',
    'border-subtle': '#232328',
    fg: '#e4e4e7',
    'fg-muted': '#a1a1aa',
    'fg-faint': '#71717a',
    accent: '#7c6cf6',
    'accent-hover': '#8f80f8',
    'accent-soft': '#7c6cf61f',
    dirty: '#e2b340',
  },
};

const LIGHT: Theme = {
  id: 'forge-light',
  name: 'Forge Light',
  type: 'light',
  colors: {
    bg: '#ffffff',
    'bg-elevated': '#f6f6f8',
    'bg-titlebar': '#ececed',
    'bg-activitybar': '#e8e8eb',
    'bg-statusbar': '#ececed',
    'surface-hover': '#ececef',
    'surface-active': '#e0e0e4',
    border: '#d4d4d8',
    'border-subtle': '#e4e4e7',
    fg: '#1f1f23',
    'fg-muted': '#52525b',
    'fg-faint': '#9b9ba3',
    accent: '#6950e8',
    'accent-hover': '#5a40d8',
    'accent-soft': '#6950e81f',
    dirty: '#c2820a',
  },
};

export const builtInThemes: Record<string, Theme> = {
  [DARK.id]: DARK,
  [LIGHT.id]: LIGHT,
};
