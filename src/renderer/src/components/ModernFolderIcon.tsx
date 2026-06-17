export type FolderCategory =
  | 'apps'
  | 'packages'
  | 'services'
  | 'config'
  | 'docs'
  | 'scripts'
  | 'hidden'
  | 'generic';

const CATEGORY_COLOR: Record<FolderCategory, string> = {
  apps: '#5b9df0',
  packages: '#a78bfa',
  services: '#22b8cf',
  config: '#8b95a5',
  docs: '#2dd4bf',
  scripts: '#e0a045',
  hidden: '#5c5c66',
  generic: '#7c8696',
};

interface ModernFolderIconProps {
  category?: FolderCategory;
  open?: boolean;
  size?: number;
}

/** Sleek duotone rounded folder. Closed = solid body; open = lifted front flap. */
export function ModernFolderIcon({
  category = 'generic',
  open = false,
  size = 16,
}: ModernFolderIconProps): React.JSX.Element {
  const color = CATEGORY_COLOR[category];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      {/* back tab */}
      <path
        d="M1.5 4.2c0-.83.67-1.5 1.5-1.5h2.84c.4 0 .78.16 1.06.44l.92.92h4.18c.83 0 1.5.67 1.5 1.5v1.2H1.5V4.2Z"
        fill={color}
        fillOpacity="0.45"
      />
      {open ? (
        <>
          {/* open: body outline + lifted front */}
          <rect x="1.5" y="5.5" width="13" height="7.3" rx="1.6" fill={color} fillOpacity="0.18" />
          <path
            d="M3.1 7.4h11.1c.6 0 1.02.58.85 1.15l-1.15 3.9c-.12.4-.49.68-.91.68H2.2c-.6 0-1.02-.58-.85-1.15l1.15-3.9c.12-.4.49-.68.91-.68Z"
            fill={color}
            fillOpacity="0.55"
          />
        </>
      ) : (
        <rect x="1.5" y="5.4" width="13" height="7.4" rx="1.6" fill={color} fillOpacity="0.85" />
      )}
    </svg>
  );
}
