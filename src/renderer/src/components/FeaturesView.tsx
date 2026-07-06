import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X, FileCode2, Wand2, Search, GitBranch, TerminalSquare, Command, Settings,
  PanelsTopLeft, GitCompare, Code2, Sparkles, type LucideIcon,
} from 'lucide-react';
import { useLayoutStore } from '../stores/layout-store';

interface Feature {
  name: string;
  desc: string;
  shortcut?: string;
}
interface Group {
  icon: LucideIcon;
  title: string;
  features: Feature[];
}

const GROUPS: Group[] = [
  {
    icon: FileCode2,
    title: 'Editor',
    features: [
      { name: 'Monaco code editor', desc: 'Syntax highlighting for dozens of languages, multi-tab editing.' },
      { name: 'Auto-close tags', desc: 'Typing <tag> inserts the matching </tag> in HTML/XML/Markdown.' },
      { name: 'Tab-out & type-over', desc: 'Tab jumps past a closing bracket/quote; retyping it skips over.', shortcut: 'Tab' },
      { name: 'Go to Line', desc: 'Jump to any line/column.', shortcut: '⌘G' },
      { name: 'Adjustable font size', desc: 'Set the editor font size in Settings.' },
    ],
  },
  {
    icon: Sparkles,
    title: 'Language intelligence',
    features: [
      { name: 'Code completion', desc: 'Context-aware suggestions with auto-import for TS/JS.', shortcut: '⌃Space' },
      { name: 'Hover & signature help', desc: 'Types, JSDoc, and parameter hints as you type.' },
      { name: 'Go to Definition', desc: 'Jump to where a symbol is defined.', shortcut: 'F12' },
      { name: 'References & Rename', desc: 'See every use, or rename a symbol across files.', shortcut: 'F2' },
      { name: 'Inline diagnostics', desc: 'Type errors and warnings highlighted as you edit.' },
      { name: 'Java support', desc: 'TS/JS built in; Java via jdtls (bring your own JDK).' },
    ],
  },
  {
    icon: Wand2,
    title: 'Formatting',
    features: [
      { name: 'Format Document', desc: 'Format with ESLint, Prettier, Biome, or dprint.', shortcut: '⇧⌥F' },
      { name: 'Format Document With…', desc: 'Pick a formatter per run and set the default.' },
      { name: 'Format on save & Auto format', desc: 'Format on every save, or 5s after edits stop.' },
    ],
  },
  {
    icon: Search,
    title: 'Search',
    features: [
      { name: 'Find in Files', desc: 'Project-wide search with match highlighting.', shortcut: '⌘⇧F' },
      { name: 'Replace in Files', desc: 'Replace across files with regex, case, and whole-word options.' },
      { name: 'Include / exclude globs', desc: 'Scope searches to specific paths.' },
      { name: 'Go to File', desc: 'Fuzzy-open any file by name.', shortcut: '⌘P' },
    ],
  },
  {
    icon: GitBranch,
    title: 'Source Control',
    features: [
      { name: 'Stage, commit, discard', desc: 'Manage changes inline with diffs.' },
      { name: 'Branches', desc: 'Switch and create branches from the panel.' },
      { name: 'Push / Pull / Fetch', desc: 'Sync with the remote in one click.' },
      { name: 'Commit history', desc: 'Browse recent commits.' },
    ],
  },
  {
    icon: GitCompare,
    title: 'Diff & Git insights',
    features: [
      { name: 'Change gutter & peek', desc: 'See and revert per-line changes against HEAD.' },
      { name: 'Inline blame', desc: 'Who last changed the current line, shown at the end of the line.' },
      { name: 'Side-by-side diff', desc: 'Compare working tree vs. staged/HEAD.' },
    ],
  },
  {
    icon: TerminalSquare,
    title: 'Run & Terminal',
    features: [
      { name: 'Integrated terminal', desc: 'A real shell, with clickable path:line links.', shortcut: '⌃`' },
      { name: 'Task runner', desc: 'Run package.json scripts (auto-detects your package manager).' },
      { name: 'Open from terminal', desc: 'Run `forge <file>` to open it here, or set Forge as your $EDITOR.' },
    ],
  },
  {
    icon: Command,
    title: 'Navigation',
    features: [
      { name: 'Command palette', desc: 'Run any command by name.', shortcut: '⌘K' },
      { name: 'Editor tabs', desc: 'Next/previous tab, reopen closed, save all.', shortcut: '⌘⌥→' },
      { name: 'Markdown preview', desc: 'Toggle a rendered view for .md files.' },
    ],
  },
  {
    icon: PanelsTopLeft,
    title: 'Workspace',
    features: [
      { name: 'Project map & structure', desc: 'Browse apps, packages, folders, and files.' },
      { name: 'File operations', desc: 'Create, rename, move, copy, and delete from the tree.' },
      { name: 'Problems & Output', desc: 'See diagnostics and task output in the bottom panel.' },
    ],
  },
  {
    icon: Settings,
    title: 'Customization',
    features: [
      { name: 'Settings', desc: 'Theme, formatter, auto-save, font size, and more.', shortcut: '⌘,' },
      { name: 'Custom keybindings', desc: 'Rebind any command in Settings → Keyboard.' },
      { name: 'Themes', desc: 'Switch between light and dark.' },
    ],
  },
];

export function FeaturesView(): React.JSX.Element | null {
  const open = useLayoutStore((s) => s.featuresOpen);
  const close = (): void => useLayoutStore.getState().setFeaturesOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm" onMouseDown={close}>
      <div
        className="flex h-[80vh] max-h-[820px] w-[min(960px,94vw)] flex-col overflow-hidden rounded-2xl border border-line-strong bg-elevated shadow-2xl shadow-black/60"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Code2 size={18} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-fg">Everything in Forge</h2>
              <p className="text-[12px] text-faint">A quick tour of what this editor can do.</p>
            </div>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {GROUPS.map((group) => (
              <section key={group.title} className="rounded-xl border border-line bg-surface-2/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <group.icon size={15} className="text-accent" />
                  <h3 className="text-[13px] font-semibold text-fg">{group.title}</h3>
                </div>
                <ul className="space-y-2.5">
                  {group.features.map((f) => (
                    <li key={f.name} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-medium text-fg">{f.name}</span>
                          {f.shortcut ? (
                            <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted">
                              {f.shortcut}
                            </kbd>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11.5px] leading-snug text-faint">{f.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
