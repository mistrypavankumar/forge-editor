import { useEffect, useState } from 'react';
import { Check, Plus, Trash2, User, X, CircleAlert } from 'lucide-react';
import { useGitUserStore } from '../stores/git-user-store';
import { useWorkspaceStore } from '../stores/workspace-store';

export function GitUserPicker(): React.JSX.Element | null {
  const open = useGitUserStore((s) => s.pickerOpen);
  const close = useGitUserStore((s) => s.closePicker);
  const users = useGitUserStore((s) => s.users);
  const active = useGitUserStore((s) => s.active);
  const error = useGitUserStore((s) => s.error);
  const setActive = useGitUserStore((s) => s.setActive);
  const removeUser = useGitUserStore((s) => s.removeUser);
  const rootPath = useWorkspaceStore((s) => s.rootPath);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (open) {
      setAdding(false);
      setName('');
      setEmail('');
    }
  }, [open]);

  if (!open) return null;

  const isActive = (email: string): boolean =>
    !!active && active.email.trim().toLowerCase() === email.trim().toLowerCase();

  const pick = (name: string, email: string): void => {
    if (!rootPath) return;
    void setActive(rootPath, { name, email }).then(() => {
      // Close only on success; on failure the store sets `error` and we stay open.
      if (!useGitUserStore.getState().error) close();
    });
  };

  const canSave = name.trim() !== '' && email.trim() !== '';
  const saveNew = (): void => {
    if (!canSave) return;
    pick(name.trim(), email.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onClick={close}
    >
      <div
        className="flex max-h-[60vh] w-[520px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2 text-[12px] text-muted">
          <span className="font-medium">Switch Git User</span>
          <button
            type="button"
            title="Close"
            onClick={close}
            className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>

        {!rootPath ? (
          <div className="px-4 py-6 text-center text-[13px] text-faint">
            Open a folder to switch its git user.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {users.length === 0 && !adding ? (
              <div className="px-2.5 py-3 text-[12px] text-faint">
                No saved users yet. Add one below.
              </div>
            ) : null}

            {users.map((u) => (
              <div
                key={u.email}
                className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-surface-3"
              >
                <button
                  type="button"
                  onClick={() => pick(u.name, u.email)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span className="flex w-4 shrink-0 items-center justify-center text-faint">
                    <User size={13} />
                  </span>
                  <span className="shrink-0 truncate text-[13px] text-fg">{u.name || '(no name)'}</span>
                  <span className="ml-1 truncate text-[11px] text-faint">{u.email}</span>
                </button>
                {isActive(u.email) ? (
                  <Check size={13} className="ml-auto shrink-0 text-accent" />
                ) : (
                  <button
                    type="button"
                    title="Forget this user"
                    onClick={() => removeUser(u.email)}
                    className="ml-auto shrink-0 rounded p-1 text-faint opacity-0 hover:bg-surface-2 hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}

            {adding ? (
              <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-2.5">
                <input
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
                  autoFocus
                  value={name}
                  placeholder="Name"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNew();
                  }}
                />
                <input
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
                  value={email}
                  placeholder="Email"
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNew();
                  }}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="rounded px-2.5 py-1 text-[12px] text-muted hover:bg-surface-3 hover:text-fg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canSave}
                    onClick={saveNew}
                    className="rounded bg-accent px-2.5 py-1 text-[12px] text-white disabled:opacity-40"
                  >
                    Use this user
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-3"
              >
                <span className="flex w-4 shrink-0 items-center justify-center text-faint">
                  <Plus size={13} />
                </span>
                <span className="text-[13px] text-fg">Add User</span>
              </button>
            )}

            {error ? (
              <div className="mt-1 flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-danger">
                <CircleAlert size={13} className="shrink-0" />
                {error}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
