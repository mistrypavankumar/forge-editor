interface FileMeta {
  label: string;
  color: string;
}

const EXT_LABEL: Record<string, string> = {
  ts: 'TS', tsx: 'TSX', js: 'JS', jsx: 'JSX', mjs: 'JS', cjs: 'JS',
  json: 'JSON', md: 'MD', mdx: 'MDX', yml: 'YML', yaml: 'YML',
  sql: 'SQL', graphql: 'GQL', gql: 'GQL', sh: 'SH', css: 'CSS',
  scss: 'SCSS', html: 'HTML', java: 'JAVA',
};

const CONFIG_NAMES = new Set([
  'package.json', 'tsconfig.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml',
  'eslint.config.mjs', '.npmrc', '.editorconfig', '.prettierrc.json',
  '.gitignore', 'vite.config.ts', 'electron.vite.config.ts', 'turbo.json',
]);

const COLOR = {
  blue: '#5b9df0',
  cyan: '#22b8cf',
  violet: '#a78bfa',
  amber: '#e0a045',
  slate: '#8b95a5',
  grey: '#9aa0a6',
  teal: '#2dd4bf',
  green: '#3ddc97',
  orange: '#e0884a',
  pink: '#e84aa0',
};

function fileMeta(name: string): FileMeta {
  const lower = name.toLowerCase();
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';
  const label = EXT_LABEL[ext] ?? (ext ? ext.slice(0, 3).toUpperCase() : 'CFG');

  if (lower.startsWith('.env')) return { label: 'ENV', color: COLOR.teal };
  if (/\.(test|spec)\./.test(lower)) return { label, color: COLOR.green };
  if (lower.includes('service') || lower.includes('.api.')) return { label, color: COLOR.violet };
  if (CONFIG_NAMES.has(lower) || lower.includes('.config.') || lower.endsWith('.lock'))
    return { label: EXT_LABEL[ext] ?? 'CFG', color: COLOR.slate };
  if (lower === 'page.tsx' || lower.endsWith('page.tsx')) return { label, color: COLOR.cyan };

  switch (ext) {
    case 'ts': return { label, color: COLOR.blue };
    case 'tsx': return { label, color: COLOR.cyan };
    case 'js': case 'jsx': case 'mjs': case 'cjs': return { label, color: COLOR.amber };
    case 'json': return { label, color: COLOR.slate };
    case 'md': case 'mdx': return { label, color: COLOR.grey };
    case 'yml': case 'yaml': return { label, color: COLOR.violet };
    case 'sql': return { label, color: COLOR.orange };
    case 'graphql': case 'gql': return { label, color: COLOR.pink };
    case 'java': return { label, color: COLOR.orange };
    default: return { label, color: COLOR.grey };
  }
}

interface ModernFileIconProps {
  name: string;
  size?: number;
}

export function ModernFileIcon({ name, size = 16 }: ModernFileIconProps): React.JSX.Element {
  const { label, color } = fileMeta(name);
  const fontSize = label.length >= 4 ? 4.6 : label.length === 3 ? 5.4 : 6.4;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="1.5" width="12" height="13" rx="3" fill={color} fillOpacity="0.16" />
      <rect
        x="2"
        y="1.5"
        width="12"
        height="13"
        rx="3"
        stroke={color}
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      <text
        x="8"
        y="8.6"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.2"
        fill={color}
      >
        {label}
      </text>
    </svg>
  );
}
