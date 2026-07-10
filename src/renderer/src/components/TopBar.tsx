import {
  Camera,
  ChevronDown,
  PanelLeft,
  PanelRight,
  PanelBottom,
  Search,
  Sparkles,
  Sparkle,
} from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';
import { usePaletteStore } from '../stores/palette-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useGitUserStore } from '../stores/git-user-store';
import { commandRegistry } from '../commands/command-registry';
import { IconButton } from './ui/IconButton';
import { FileMenu } from './FileMenu';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { BranchStatePill } from './BranchStatePill';
import { useState } from 'react';

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/** Up to two initials from a name/login (e.g. "dax-pavankumar-mistry" → "DM", "Pavan" → "P"). */
function initials(name: string): string {
  const parts = name.split(/[\s\-_.]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function TopBar(): React.JSX.Element {
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const rightVisible = useLayoutStore((s) => s.rightVisible);
  const bottomVisible = useLayoutStore((s) => s.bottomVisible);
  const openPalette = usePaletteStore((s) => s.openPalette);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const workspaceName = rootPath ? basename(rootPath) : 'No workspace';
  const gitUser = useGitUserStore((s) => s.active);
  const openGitUserPicker = useGitUserStore((s) => s.openPicker);
  const avatarLabel = gitUser?.username || gitUser?.name;
  const [switcher, setSwitcher] = useState<{ x: number; y: number } | null>(null);

  return (
    <header className="drag flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface pl-20 pr-3">
      {/* Brand + workspace */}
      <div className="no-drag flex items-center gap-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-accent-fg">
          F
        </div>
        {window.forge.isMac ? null : <FileMenu />}
        <button
          type="button"
          aria-label="Switch window"
          onClick={(e) => {
            if (switcher) {
              setSwitcher(null);
              return;
            }
            const r = e.currentTarget.getBoundingClientRect();
            setSwitcher({ x: r.left, y: r.bottom + 4 });
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-fg hover:bg-surface-3"
        >
          {workspaceName}
          <ChevronDown size={14} className="text-faint" />
        </button>
        {switcher ? (
          <WorkspaceSwitcher x={switcher.x} y={switcher.y} onClose={() => setSwitcher(null)} />
        ) : null}
        <BranchStatePill />
      </div>

      {/* Center command bar */}
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={() => openPalette('commands')}
          className="no-drag group flex h-7 w-full max-w-xl items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-left text-xs text-faint transition-colors hover:border-line hover:bg-surface-3"
        >
          <Search size={13} />
          <span className="flex-1 truncate">Search files, symbols, commands, or ask AI…</span>
          <span className="flex items-center gap-1 text-[10px]">
            <Sparkles size={11} className="text-accent" />
            <kbd className="rounded border border-line bg-surface px-1 font-mono text-faint">⌘K</kbd>
          </span>
        </button>
      </div>

      {/* Actions */}
      <div className="no-drag flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => useLayoutStore.getState().setFeaturesOpen(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <Sparkle size={12} className="text-accent" />
          Features
        </button>

        <button
          type="button"
          onClick={() => void commandRegistry.run('forge.annotate.capture')}
          title="Annotate the editor and copy a screenshot"
          className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <Camera size={12} className="text-accent" />
          Annotate
        </button>

        <div className="mx-1 h-5 w-px bg-line" />

        <IconButton
          label="Toggle sidebar"
          active={sidebarVisible}
          className="h-7 w-7"
          onClick={() => togglePanel('sidebar')}
        >
          <PanelLeft size={15} />
        </IconButton>
        <IconButton
          label="Toggle panel"
          active={bottomVisible}
          className="h-7 w-7"
          onClick={() => togglePanel('bottom')}
        >
          <PanelBottom size={15} />
        </IconButton>
        <IconButton
          label="Toggle assistant"
          active={rightVisible}
          className="h-7 w-7"
          onClick={() => togglePanel('right')}
        >
          <PanelRight size={15} />
        </IconButton>

        <div className="mx-1 h-5 w-px bg-line" />

        <button
          type="button"
          aria-label="Switch git user"
          title={avatarLabel ? `Git user: ${avatarLabel} — click to switch` : 'Switch git user'}
          onClick={openGitUserPicker}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent to-info text-[11px] font-semibold text-white"
        >
          {avatarLabel ? initials(avatarLabel) : 'PM'}
        </button>
      </div>
    </header>
  );
}
