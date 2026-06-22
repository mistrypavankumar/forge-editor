import { useEffect, useMemo, useState } from 'react';
import { Search, Link2, CircleX, Loader2, Check, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { useAwsStore, type AwsStatus } from '../stores/aws-store';
import { useTerminalStore } from '../stores/terminal-store';
import { useLayoutStore } from '../stores/layout-store';
import { useEditorStore } from '../stores/editor-store';
import { runInTerminal } from '../lib/terminal-exec';
import type { AwsProfile } from '@shared/ipc-contract';
import { cn } from '../lib/cn';

const EDIT_CREDENTIALS = '__edit_credentials__';
const ADD_CONNECTION = '__add_connection__';

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function isValid(status: AwsStatus | undefined): boolean {
  return Boolean(status && status !== 'pending' && status.valid);
}

/** Secondary description line for a profile, mirroring the AWS Toolkit wording. */
function describe(profile: AwsProfile, status: AwsStatus | undefined): string {
  if (status && status !== 'pending' && !status.valid) {
    return 'Expired or Invalid, select to authenticate';
  }
  const kind = profile.kind === 'sso' ? 'SSO Session' : 'IAM Credential';
  return `${kind}, configured locally (${profile.source})`;
}

export function AwsConnectionPicker(): React.JSX.Element | null {
  const open = useAwsStore((s) => s.pickerOpen);
  const close = useAwsStore((s) => s.closePicker);
  const profiles = useAwsStore((s) => s.profiles);
  const statuses = useAwsStore((s) => s.statuses);
  const active = useAwsStore((s) => s.active);
  const setActive = useAwsStore((s) => s.setActive);
  const validateAll = useAwsStore((s) => s.validateAll);
  const openEdit = useAwsStore((s) => s.openEdit);

  const newTerminal = useTerminalStore((s) => s.newTerminal);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const setPanelVisible = useLayoutStore((s) => s.setPanelVisible);
  const openFile = useEditorStore((s) => s.openFile);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? profiles.filter((p) => p.name.toLowerCase().includes(q)) : profiles;
  }, [profiles, query]);

  // Rows are the filtered profiles followed by the two fixed actions.
  const rowCount = filtered.length + 2;

  if (!open) return null;

  // "Add New Connection" opens ~/.aws/config (where new profiles/sso-sessions are defined).
  const openConfigTab = async (): Promise<void> => {
    const paths = await window.forge.awsConfigPaths();
    if (!paths.ok) return;
    const path = paths.data.config;
    const res = await window.forge.readFile(path);
    if (res.ok) openFile({ path, name: basename(path), content: res.data });
  };

  const selectProfile = (profile: AwsProfile): void => {
    const status = statuses[profile.name];
    if (profile.kind === 'sso' && !isValid(status)) {
      // Expired/unauthenticated SSO: make it active, then run `aws sso login` in a terminal.
      void setActive(profile.name, profile.region ?? null);
      setBottomTab('terminal');
      setPanelVisible('bottom', true);
      const id = newTerminal(`aws sso login: ${profile.name}`);
      runInTerminal(id, `aws sso login --profile ${profile.name}`);
    } else {
      void setActive(profile.name, profile.region ?? null);
    }
    close();
  };

  const runAt = (index: number): void => {
    if (index < filtered.length) {
      selectProfile(filtered[index]);
      return;
    }
    const action = index === filtered.length ? EDIT_CREDENTIALS : ADD_CONNECTION;
    if (action === EDIT_CREDENTIALS) {
      // Open the side-by-side config | credentials editor.
      openEdit();
    } else {
      close();
      void openConfigTab();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rowCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(activeIndex);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onClick={close}
    >
      <div
        className="flex max-h-[60vh] w-[640px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2 text-[12px] text-muted">
          <span className="font-medium">Switch Connection</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              title="Refresh"
              onClick={() => void validateAll()}
              className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
            >
              <RefreshCw size={13} />
            </button>
            <button
              type="button"
              title="Close"
              onClick={close}
              className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
            >
              <X size={14} />
            </button>
          </span>
        </div>

        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-faint" />
          <input
            className="w-full bg-transparent py-3 text-sm text-fg outline-none placeholder:text-faint"
            autoFocus
            value={query}
            placeholder="Select a connection"
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {filtered.map((p, i) => {
            const status = statuses[p.name];
            const pending = status === 'pending';
            const valid = isValid(status);
            return (
              <button
                key={p.name}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => runAt(i)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left',
                  i === activeIndex ? 'bg-active' : 'hover:bg-surface-3',
                )}
              >
                <span className="flex w-4 shrink-0 items-center justify-center">
                  {pending ? (
                    <Loader2 size={13} className="animate-spin text-faint" />
                  ) : valid ? (
                    <Link2 size={13} className="text-faint" />
                  ) : (
                    <CircleX size={13} className="text-danger" />
                  )}
                </span>
                <span className="shrink-0 truncate text-[13px] text-fg">profile:{p.name}</span>
                <span className="ml-2 truncate text-[11px] text-faint">{describe(p, status)}</span>
                {p.name === active ? <Check size={13} className="ml-auto shrink-0 text-accent" /> : null}
              </button>
            );
          })}

          <button
            type="button"
            onMouseEnter={() => setActiveIndex(filtered.length)}
            onClick={() => runAt(filtered.length)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left',
              activeIndex === filtered.length ? 'bg-active' : 'hover:bg-surface-3',
            )}
          >
            <span className="flex w-4 shrink-0 items-center justify-center text-faint">
              <Pencil size={13} />
            </span>
            <span className="text-[13px] text-fg">Edit Credentials</span>
          </button>

          <button
            type="button"
            onMouseEnter={() => setActiveIndex(filtered.length + 1)}
            onClick={() => runAt(filtered.length + 1)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left',
              activeIndex === filtered.length + 1 ? 'bg-active' : 'hover:bg-surface-3',
            )}
          >
            <span className="flex w-4 shrink-0 items-center justify-center text-faint">
              <Plus size={13} />
            </span>
            <span className="text-[13px] text-fg">Add New Connection</span>
          </button>
        </div>
      </div>
    </div>
  );
}
