import {
  Play,
  ChevronDown,
  PanelLeft,
  PanelRight,
  PanelBottom,
  Search,
  Sparkles,
} from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';
import { usePaletteStore } from '../stores/palette-store';
import { commandRegistry } from '../commands/command-registry';
import { workspaces } from '../data/workspace-meta';
import { IconButton } from './ui/IconButton';

export function TopBar(): React.JSX.Element {
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const rightVisible = useLayoutStore((s) => s.rightVisible);
  const bottomVisible = useLayoutStore((s) => s.bottomVisible);
  const openPalette = usePaletteStore((s) => s.openPalette);

  return (
    <header className="drag flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface pl-20 pr-3">
      {/* Brand + workspace */}
      <div className="no-drag flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-accent-fg">
          F
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-fg hover:bg-surface-3"
        >
          {workspaces[0]}
          <ChevronDown size={14} className="text-faint" />
        </button>
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
          onClick={() => void commandRegistry.run('file.save')}
          className="flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          <Play size={12} className="fill-current" />
          Run
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
          aria-label="Account"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent to-info text-[11px] font-semibold text-white"
        >
          PM
        </button>
      </div>
    </header>
  );
}
