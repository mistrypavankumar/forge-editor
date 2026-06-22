import { useEffect, useState } from 'react';
import {
  Check,
  Plus,
  Trash2,
  User,
  X,
  CircleAlert,
  KeyRound,
  Pencil,
  Loader2,
  CircleCheck,
  Github,
} from 'lucide-react';
import { useGitUserStore } from '../stores/git-user-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useLayoutStore } from '../stores/layout-store';
import { useTerminalStore } from '../stores/terminal-store';
import { runInTerminal } from '../lib/terminal-exec';
import type { GhAccount, GitCredentialTest, GitUser } from '@shared/ipc-contract';
import { cn } from '../lib/cn';

export function GitUserPicker(): React.JSX.Element | null {
  const open = useGitUserStore((s) => s.pickerOpen);
  const close = useGitUserStore((s) => s.closePicker);
  const users = useGitUserStore((s) => s.users);
  const active = useGitUserStore((s) => s.active);
  const error = useGitUserStore((s) => s.error);
  const setActive = useGitUserStore((s) => s.setActive);
  const removeUser = useGitUserStore((s) => s.removeUser);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const setBottomTab = useLayoutStore((s) => s.setBottomTab);
  const setPanelVisible = useLayoutStore((s) => s.setPanelVisible);
  const newTerminal = useTerminalStore((s) => s.newTerminal);

  const [editing, setEditing] = useState<null | { originalEmail: string | null }>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [testResult, setTestResult] = useState<GitCredentialTest | null>(null);
  // Every `gh` account signed in for this repo's host, each surfaced as a one-click import row.
  const [ghAccounts, setGhAccounts] = useState<GhAccount[]>([]);

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setName('');
    setEmail('');
    setUsername('');
    setToken('');
    setTestResult(null);
    setGhAccounts([]);
    if (rootPath) {
      void window.forge.gitGhAccounts(rootPath).then((res) => {
        if (res.ok && res.data.installed) setGhAccounts(res.data.accounts);
      });
    }
  }, [open, rootPath]);

  if (!open) return null;

  const isActive = (e: string): boolean =>
    !!active && active.email.trim().toLowerCase() === e.trim().toLowerCase();

  const startAdd = (): void => {
    setEditing({ originalEmail: null });
    setName('');
    setEmail('');
    setUsername('');
    setToken('');
  };

  const startEdit = (u: GitUser): void => {
    setEditing({ originalEmail: u.email });
    setName(u.name);
    setEmail(u.email);
    setUsername(u.username ?? '');
    setToken(u.token ?? '');
  };

  // Apply `user` as the repo's identity; close on success, keep open (showing error) on failure.
  const apply = (user: GitUser): void => {
    if (!rootPath) return;
    void setActive(rootPath, user).then(() => {
      if (!useGitUserStore.getState().error) close();
    });
  };

  const pick = (u: GitUser): void => apply(u);

  // Offer each gh account that isn't already a saved user (matched by username), active first.
  const importable = ghAccounts
    .filter((a) => !users.some((u) => u.username?.trim().toLowerCase() === a.login.trim().toLowerCase()))
    .sort((a, b) => Number(b.active) - Number(a.active));

  const importGh = (gh: GhAccount): void => {
    apply({
      name: gh.name || gh.login,
      email: gh.email || '',
      username: gh.login,
      token: gh.token,
    });
  };

  const runTest = (): void => {
    if (!rootPath || !username.trim() || !token.trim()) return;
    setTesting(true);
    setTestResult(null);
    void window.forge.gitTestCredential(rootPath, username.trim(), token.trim()).then((res) => {
      setTesting(false);
      setTestResult(
        res.ok ? res.data : { ok: false, message: res.error.split('\n')[0] || 'Test failed.' },
      );
    });
  };

  // `gh auth login` is interactive, so the full-screen picker must close first — otherwise its
  // backdrop covers the terminal and swallows the prompts. We print the next step in the terminal
  // since there's no modal left to show a message in.
  const launchGhLogin = (): void => {
    const id = newTerminal('gh auth login');
    setBottomTab('terminal');
    setPanelVisible('bottom', true);
    close();
    const next =
      "echo; echo '→ When done: open Switch Git User → Add User → Sign in with GitHub to use this account.'";
    runInTerminal(id, `gh auth login --web --git-protocol https --skip-ssh-key; ${next}`);
  };

  const signInDifferent = (): void => launchGhLogin();

  const ghSignIn = (): void => {
    if (!rootPath) return;
    setSigningIn(true);
    setTestResult(null);
    void window.forge.gitGhAuth(rootPath).then((res) => {
      setSigningIn(false);
      if (!res.ok) {
        setTestResult({ ok: false, message: res.error.split('\n')[0] || 'gh sign-in failed.' });
        return;
      }
      const gh = res.data;
      if (!gh.installed) {
        setTestResult({
          ok: false,
          message: "GitHub CLI (gh) isn't installed. Get it from cli.github.com, then try again.",
        });
        return;
      }
      if (gh.token && gh.login) {
        setUsername(gh.login);
        setToken(gh.token);
        if (!name.trim()) setName(gh.name || gh.login);
        if (!email.trim() && gh.email) setEmail(gh.email);
        setTestResult({
          ok: true,
          login: gh.login,
          message: `Signed in as ${gh.login} via gh — review and click "Use this user".`,
        });
        return;
      }
      // Installed but not signed in for this host → kick off the browser flow (closes the picker).
      launchGhLogin();
    });
  };

  const canSave = name.trim() !== '' && email.trim() !== '';
  const canTest = username.trim() !== '' && token.trim() !== '' && !testing;
  const saveForm = (): void => {
    if (!canSave) return;
    // Renaming the email of an existing entry: drop the stale one (matched by old email).
    if (editing?.originalEmail && editing.originalEmail.toLowerCase() !== email.trim().toLowerCase()) {
      removeUser(editing.originalEmail);
    }
    apply({
      name: name.trim(),
      email: email.trim(),
      username: username.trim() || undefined,
      token: token.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onClick={close}
    >
      <div
        className="flex max-h-[70vh] w-[520px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/50"
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
            {users.length === 0 && !editing ? (
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
                  onClick={() => pick(u)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span className="flex w-4 shrink-0 items-center justify-center text-faint">
                    <User size={13} />
                  </span>
                  <span className="shrink-0 truncate text-[13px] text-fg">{u.name || '(no name)'}</span>
                  <span className="ml-1 truncate text-[11px] text-faint">{u.email}</span>
                  {u.username ? (
                    <KeyRound
                      size={11}
                      className="shrink-0 text-accent"
                      aria-label={`Authenticates as ${u.username}`}
                    />
                  ) : null}
                </button>
                <button
                  type="button"
                  title="Edit"
                  onClick={() => startEdit(u)}
                  className="shrink-0 rounded p-1 text-faint opacity-0 hover:bg-surface-2 hover:text-fg group-hover:opacity-100"
                >
                  <Pencil size={13} />
                </button>
                {isActive(u.email) ? (
                  <Check size={13} className="shrink-0 text-accent" />
                ) : (
                  <button
                    type="button"
                    title="Forget this user"
                    onClick={() => removeUser(u.email)}
                    className="shrink-0 rounded p-1 text-faint opacity-0 hover:bg-surface-2 hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}

            {!editing
              ? importable.map((a) => (
                  <button
                    key={a.login}
                    type="button"
                    onClick={() => importGh(a)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-3"
                  >
                    <span className="flex w-4 shrink-0 items-center justify-center text-accent">
                      <Github size={13} />
                    </span>
                    <span className="truncate text-[13px] text-fg">Import {a.login}</span>
                    <span className="ml-1 truncate text-[11px] text-faint">from GitHub CLI</span>
                  </button>
                ))
              : null}

            {editing ? (
              <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-2.5">
                <input
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
                  autoFocus
                  value={name}
                  placeholder="Name (commit author)"
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
                  value={email}
                  placeholder="Email (commit author)"
                  onChange={(e) => setEmail(e.target.value)}
                />
                <div className="mt-1 text-[11px] text-faint">
                  Optional — for pushing as this account over HTTPS:
                </div>
                <button
                  type="button"
                  disabled={signingIn || !rootPath}
                  onClick={ghSignIn}
                  className="flex items-center justify-center gap-2 rounded border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg hover:bg-surface-3 disabled:opacity-40"
                >
                  {signingIn ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
                  Sign in with GitHub
                </button>
                <button
                  type="button"
                  disabled={signingIn || !rootPath}
                  onClick={signInDifferent}
                  className="text-center text-[10px] text-faint underline-offset-2 hover:text-fg hover:underline disabled:opacity-40"
                >
                  Use a different GitHub account
                </button>
                <div className="text-center text-[10px] text-faint">or enter manually</div>
                <input
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
                  value={username}
                  placeholder="GitHub username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setTestResult(null);
                  }}
                />
                <input
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
                  type="password"
                  value={token}
                  placeholder="Personal access token"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setTestResult(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveForm();
                  }}
                />
                {testResult ? (
                  <div
                    className={cn(
                      'flex items-start gap-1.5 rounded px-2 py-1.5 text-[11px]',
                      testResult.ok ? 'text-accent' : 'text-danger',
                    )}
                  >
                    {testResult.ok ? (
                      <CircleCheck size={13} className="mt-px shrink-0" />
                    ) : (
                      <CircleAlert size={13} className="mt-px shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!canTest}
                    onClick={runTest}
                    className="flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-40"
                  >
                    {testing ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                    Test connection
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded px-2.5 py-1 text-[12px] text-muted hover:bg-surface-3 hover:text-fg"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!canSave}
                      onClick={saveForm}
                      className="rounded bg-accent px-2.5 py-1 text-[12px] text-white disabled:opacity-40"
                    >
                      Use this user
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={startAdd}
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
