import { execFile, spawn } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, join, relative, sep } from 'node:path';
import type {
  BlameLine,
  GhAccount,
  GhAccounts,
  GhAuth,
  GitBranches,
  GitChange,
  GitCommit,
  GitCredentialTest,
  GitRef,
  GitUser,
} from '@shared/ipc-contract';

const run = promisify(execFile);

/**
 * A live git op holds `.git/index.lock` only momentarily; a lock older than this
 * was almost certainly orphaned by a crashed git (or a force-quit GUI). We only
 * remove locks past this age, so we never race a concurrently-running git.
 */
const STALE_LOCK_MS = 2000;

/** True when git refused to run because it couldn't acquire `.git/index.lock`. */
function isIndexLockError(message: string): boolean {
  return /index\.lock/i.test(message) && /File exists|Unable to create/i.test(message);
}

/**
 * Remove `.git/index.lock` only when it's demonstrably stale (mtime older than
 * STALE_LOCK_MS) — i.e. left behind by a crashed git, not held by a live one.
 * Returns true if a stale lock was removed. Never throws; a fresh lock, a missing
 * lock, or a `.git` file (worktree/submodule pointer) all yield false.
 */
async function clearStaleIndexLock(rootPath: string): Promise<boolean> {
  const lock = join(rootPath, '.git', 'index.lock');
  try {
    const { mtimeMs } = await stat(lock);
    if (Date.now() - mtimeMs < STALE_LOCK_MS) return false;
    await rm(lock, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * `git -C <root> <args>` via execFile, with one-shot recovery from a stale index
 * lock: if the command fails because a crashed git left `.git/index.lock` behind,
 * remove the stale lock and retry once. Resolves with stdout; rejects with the
 * trimmed stderr (matching runGit's error shape) when there's nothing to recover.
 */
async function execGit(rootPath: string, args: string[], maxBuffer = 16 * 1024 * 1024): Promise<string> {
  try {
    const { stdout } = await run('git', ['-C', rootPath, ...args], { maxBuffer });
    return stdout;
  } catch (e) {
    const ex = e as { stderr?: string; message?: string };
    const message = (ex.stderr || ex.message || 'git command failed').trim();
    if (isIndexLockError(message) && (await clearStaleIndexLock(rootPath))) {
      const { stdout } = await run('git', ['-C', rootPath, ...args], { maxBuffer });
      return stdout;
    }
    throw new Error(message);
  }
}

/** Byte that separates `git log` fields (emitted by the %x00 in the pretty format). */
const FIELD_SEP = String.fromCharCode(0);

/** `git show <ref>:<relpath>`, or null when the path isn't resolvable at that ref. */
async function gitShow(rootPath: string, filePath: string, ref: string): Promise<string | null> {
  const rel = relative(rootPath, filePath).split(sep).join('/');
  if (!rel || rel.startsWith('..')) return null;
  try {
    const { stdout } = await run('git', ['-C', rootPath, 'show', `${ref}:${rel}`], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * The committed (HEAD) content of a file, or null when it isn't tracked
 * (new/untracked files, or paths outside a repo). Used to diff the gutter.
 */
export function getGitOriginalContent(rootPath: string, filePath: string): Promise<string | null> {
  return gitShow(rootPath, filePath, 'HEAD');
}

/** The staged (index) content of a file — what a commit would record right now. */
export function getGitStagedContent(rootPath: string, filePath: string): Promise<string | null> {
  return gitShow(rootPath, filePath, '');
}

export async function getGitChanges(rootPath: string): Promise<GitChange[]> {
  try {
    const { stdout } = await run('git', ['-C', rootPath, 'status', '--porcelain'], {
      maxBuffer: 4 * 1024 * 1024,
    });
    const changes: GitChange[] = [];
    for (const raw of stdout.split('\n')) {
      if (!raw.trim()) continue;
      const x = raw[0];
      const y = raw[1];
      let p = raw.slice(3);
      if (raw.slice(0, 2).includes('R') && p.includes(' -> ')) p = p.split(' -> ')[1];
      const untracked = x === '?' && y === '?';
      const staged = !untracked && x !== ' ';
      const unstaged = untracked || y !== ' ';
      const code = untracked ? '?' : unstaged ? y : x;
      const status: GitChange['status'] =
        code === 'A' ? 'A' : code === 'D' ? 'D' : code === 'R' ? 'R' : code === '?' ? 'U' : 'M';
      changes.push({ path: p, name: basename(p), status, staged, unstaged });
    }
    return changes;
  } catch {
    return [];
  }
}

export async function gitStage(rootPath: string, path: string): Promise<void> {
  await execGit(rootPath, ['add', '--', path]);
}

export async function gitUnstage(rootPath: string, path: string): Promise<void> {
  await execGit(rootPath, ['reset', '-q', 'HEAD', '--', path]);
}

export async function gitDiscard(rootPath: string, path: string): Promise<void> {
  await execGit(rootPath, ['checkout', '--', path]);
}

export async function gitStageAll(rootPath: string): Promise<void> {
  await execGit(rootPath, ['add', '-A']);
}

export async function gitCommit(rootPath: string, message: string): Promise<void> {
  // Commit staged changes; if nothing is staged, stage everything first (VS Code-style).
  let nothingStaged = false;
  try {
    await run('git', ['-C', rootPath, 'diff', '--cached', '--quiet']);
    nothingStaged = true; // exit 0 = no staged changes
  } catch {
    nothingStaged = false; // exit 1 = staged changes exist
  }
  if (nothingStaged) await execGit(rootPath, ['add', '-A']);
  await execGit(rootPath, ['commit', '-m', message]);
}

/** A single git config value, or '' when the key is unset (git exits 1, which we swallow). */
async function gitConfig(rootPath: string, key: string): Promise<string> {
  try {
    return (await runGit(rootPath, ['config', key])).trim();
  } catch {
    return '';
  }
}

/** The repo's configured author identity; empty strings when `user.name`/`user.email` are unset. */
export async function getGitUser(rootPath: string): Promise<GitUser> {
  const [name, email] = await Promise.all([
    gitConfig(rootPath, 'user.name'),
    gitConfig(rootPath, 'user.email'),
  ]);
  return { name, email };
}

/** Run `git <args>` in `rootPath`, feeding `input` on stdin; resolves with stdout. */
function gitInput(rootPath: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', rootPath, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error((stderr || `git exited ${code}`).trim())),
    );
    child.stdin.end(input);
  });
}

/** The host the repo's `origin` points at (e.g. "github.com"); defaults to GitHub. */
async function originHost(rootPath: string): Promise<string> {
  try {
    const url = (await runGit(rootPath, ['remote', 'get-url', 'origin'])).trim();
    // https://host/... | https://user@host/... | git@host:owner/repo
    const m = url.match(/^[a-z]+:\/\/(?:[^@/]+@)?([^/]+)/i) ?? url.match(/@([^:]+):/);
    return m ? m[1] : 'github.com';
  } catch {
    return 'github.com';
  }
}

/** "owner/repo" parsed from the repo's `origin` URL, or null when there's no usable remote. */
async function originSlug(rootPath: string): Promise<string | null> {
  try {
    const url = (await runGit(rootPath, ['remote', 'get-url', 'origin'])).trim();
    const m = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Point the repo at a private credential store (so it no longer falls back to the OS keychain's
 * stale account), seed it with `username`/`token`, and pin the username git authenticates with.
 * Repo-local config means the integrated terminal honours it too. `credentialsPath` is a plain
 * file written 0600 by git's `store` helper.
 */
async function applyCredential(
  rootPath: string,
  credentialsPath: string,
  username: string,
  token: string,
): Promise<void> {
  const host = await originHost(rootPath);
  const helper = `store --file ${credentialsPath}`;
  // Reset the repo's helper chain to *only* our store (leading empty value clears inherited
  // helpers like osxkeychain), so the pinned account — not a cached one — is what git uses.
  await runGit(rootPath, ['config', '--local', '--replace-all', 'credential.helper', '']);
  await runGit(rootPath, ['config', '--local', '--add', 'credential.helper', helper]);
  await runGit(rootPath, ['config', '--local', `credential.https://${host}.username`, username]);
  if (token) {
    await gitInput(
      rootPath,
      ['-c', `credential.helper=${helper}`, 'credential', 'approve'],
      `protocol=https\nhost=${host}\nusername=${username}\npassword=${token}\n\n`,
    );
  }
}

/**
 * Switch the repo's git user. Always sets the commit author (`user.name`/`user.email`); when the
 * identity carries push credentials, also wires HTTPS auth so pushes go out as that account.
 */
export async function setGitUser(
  rootPath: string,
  user: GitUser,
  credentialsPath: string,
): Promise<void> {
  await runGit(rootPath, ['config', 'user.name', user.name]);
  await runGit(rootPath, ['config', 'user.email', user.email]);
  if (user.username) {
    await applyCredential(rootPath, credentialsPath, user.username, user.token ?? '');
  }
}

/**
 * What `gh` can tell us for the repo's host without any browser interaction: whether it's
 * installed, and (if already signed in) the login/profile/token to import. When `installed` is
 * true but there's no token, the caller should launch `gh auth login` for the browser flow.
 */
export async function ghAuth(rootPath: string): Promise<GhAuth> {
  try {
    await run('gh', ['--version']);
  } catch {
    return { installed: false };
  }
  const host = await originHost(rootPath);
  let token = '';
  try {
    token = (await run('gh', ['auth', 'token', '--hostname', host])).stdout.trim();
  } catch {
    return { installed: true }; // installed but not signed in for this host
  }
  if (!token) return { installed: true };

  let login: string | undefined;
  let name: string | undefined;
  let email: string | undefined;
  try {
    const out = (await run('gh', ['api', 'user', '--hostname', host])).stdout;
    const u = JSON.parse(out) as { login?: string; name?: string; email?: string; id?: number };
    login = u.login ?? undefined;
    name = u.name ?? undefined;
    // GitHub hides the real email when "keep my email private" is on; the no-reply alias still
    // attributes commits correctly, so prefill that when no public email is exposed.
    email = u.email ?? (u.login && u.id ? `${u.id}+${u.login}@users.noreply.github.com` : undefined);
  } catch {
    /* token is usable even if the profile fetch fails */
  }
  return { installed: true, login, name, email, token };
}

/**
 * Every `gh` account signed in for the repo's host — each with the token and profile needed
 * to import it without pasting credentials. Unlike {@link ghAuth} (which only sees gh's active
 * account), this surfaces all logged-in accounts so the picker can offer each as a one-click
 * import. Returns installed:false when gh isn't on PATH; an empty list when not signed in.
 */
export async function ghAccounts(rootPath: string): Promise<GhAccounts> {
  try {
    await run('gh', ['--version']);
  } catch {
    return { installed: false, accounts: [] };
  }
  const host = await originHost(rootPath);

  let logins: { login: string; active: boolean }[];
  try {
    const out = (await run('gh', ['auth', 'status', '--json', 'hosts'])).stdout;
    const parsed = JSON.parse(out) as {
      hosts?: Record<string, { login?: string; active?: boolean }[]>;
    };
    logins = (parsed.hosts?.[host] ?? [])
      .filter((a) => typeof a.login === 'string')
      .map((a) => ({ login: a.login as string, active: a.active === true }));
  } catch {
    return { installed: true, accounts: [] }; // installed but not signed in (or pre-2.x gh without --json)
  }

  const accounts: GhAccount[] = [];
  for (const { login, active } of logins) {
    let token = '';
    try {
      token = (
        await run('gh', ['auth', 'token', '--hostname', host, '--user', login])
      ).stdout.trim();
    } catch {
      continue; // no usable token for this account — skip it
    }
    if (!token) continue;

    let name: string | undefined;
    let email: string | undefined;
    try {
      // `gh api` queries the *active* account by default; inject this account's token so the
      // profile we read matches `login`. GH_ENTERPRISE_TOKEN covers GHE hosts.
      const env = { ...process.env, GH_TOKEN: token, GH_ENTERPRISE_TOKEN: token };
      const out = (await run('gh', ['api', 'user', '--hostname', host], { env })).stdout;
      const u = JSON.parse(out) as { login?: string; name?: string; email?: string; id?: number };
      name = u.name ?? undefined;
      // Mirror ghAuth: fall back to the no-reply alias when the public email is hidden.
      email = u.email ?? (u.login && u.id ? `${u.id}+${u.login}@users.noreply.github.com` : undefined);
    } catch {
      /* token is still usable for import even if the profile fetch fails */
    }
    accounts.push({ login, name, email, token, active });
  }
  return { installed: true, accounts };
}

/** A bounded fetch (8s) so a hung network call can't wedge the picker's "Test connection". */
async function fetchJson(
  url: string,
  token: string,
): Promise<{ status: number; scopes: string | null; body: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'forge-editor',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, scopes: res.headers.get('x-oauth-scopes'), body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Confirm a username/token can actually push: resolve the token to a login via the host API,
 * then (when origin is known) read the repo's permissions. Catches the "authenticates but lacks
 * write scope / repo access" 403 in the UI instead of at push time.
 */
export async function testGitCredential(
  rootPath: string,
  username: string,
  token: string,
): Promise<GitCredentialTest> {
  if (!token) return { ok: false, message: 'Enter a token to test.' };
  const host = await originHost(rootPath);
  const api = host === 'github.com' ? 'https://api.github.com' : `https://${host}/api/v3`;

  let who: { status: number; scopes: string | null; body: unknown };
  try {
    who = await fetchJson(`${api}/user`, token);
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ok: false, message: aborted ? `Timed out reaching ${host}.` : `Couldn't reach ${host}.` };
  }
  if (who.status === 401) return { ok: false, message: 'Token is invalid or expired (401).' };
  if (who.status >= 400) return { ok: false, message: `Host rejected the token (HTTP ${who.status}).` };

  const login = (who.body as { login?: string } | null)?.login;
  const scopes = who.scopes ?? undefined;
  const repo = (await originSlug(rootPath)) ?? undefined;
  const mismatch = login && login.toLowerCase() !== username.trim().toLowerCase()
    ? ` (note: token belongs to ${login}, not ${username})`
    : '';

  if (!repo) {
    return { ok: true, login, scopes, message: `Token valid — authenticates as ${login}.${mismatch}` };
  }

  const repoRes = await fetchJson(`${api}/repos/${repo}`, token).catch(() => null);
  if (!repoRes || repoRes.status === 404) {
    return {
      ok: false,
      login,
      repo,
      scopes,
      canPush: false,
      message: `Authenticated as ${login}, but ${repo} isn't visible to this token — repo not found or no access${mismatch}.`,
    };
  }
  const canPush = Boolean((repoRes.body as { permissions?: { push?: boolean } } | null)?.permissions?.push);
  return {
    ok: canPush,
    login,
    repo,
    scopes,
    canPush,
    message: canPush
      ? `Ready — ${login} can push to ${repo}.${mismatch}`
      : `Authenticated as ${login}, but no push access to ${repo}. Grant the token 'repo' scope (or Contents: write) / repo access${mismatch}.`,
  };
}

/** Run a git subcommand, surfacing stderr as the error message on failure. */
function runGit(rootPath: string, args: string[]): Promise<string> {
  return execGit(rootPath, args);
}

export async function getBranches(rootPath: string): Promise<GitBranches> {
  try {
    const stdout = await runGit(rootPath, ['branch', '--format=%(refname:short)']);
    const all = stdout.split('\n').map((b) => b.trim()).filter(Boolean);
    const current = (await runGit(rootPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || null;
    return { current, all };
  } catch {
    return { current: null, all: [] };
  }
}

export async function checkoutBranch(rootPath: string, name: string): Promise<void> {
  await runGit(rootPath, ['checkout', name]);
}

export async function createBranch(rootPath: string, name: string): Promise<void> {
  await runGit(rootPath, ['checkout', '-b', name]);
}

export async function gitPush(rootPath: string): Promise<void> {
  await runGit(rootPath, ['push']);
}

export async function gitPull(rootPath: string): Promise<void> {
  await runGit(rootPath, ['pull', '--ff-only']);
}

export async function gitFetch(rootPath: string): Promise<void> {
  await runGit(rootPath, ['fetch', '--prune']);
}

/** Turn a `%D` decoration string ("HEAD -> main, origin/main, tag: v1") into typed refs. */
function parseRefs(decoration: string, remotes: Set<string>): GitRef[] {
  const refs: GitRef[] = [];
  for (const raw of decoration.split(',')) {
    const token = raw.trim();
    if (!token || token === 'HEAD') continue;
    // "HEAD -> branch" marks the checked-out branch.
    const arrow = token.indexOf(' -> ');
    if (arrow !== -1) {
      refs.push({ name: token.slice(arrow + 4).trim(), kind: 'head' });
      continue;
    }
    if (token.startsWith('tag: ')) {
      refs.push({ name: token.slice(5), kind: 'tag' });
      continue;
    }
    // A remote-tracking ref is prefixed by a configured remote name (e.g. "origin/dev").
    const kind: GitRef['kind'] = remotes.has(token.split('/')[0]) ? 'remote' : 'branch';
    refs.push({ name: token, kind });
  }
  return refs;
}

/**
 * Branch refs (local + remote-tracking) whose tip commit was authored by the current git user —
 * "my branches". Used to scope the graph instead of `--all` (which shows everyone's branches).
 */
async function currentUserRefs(rootPath: string): Promise<string[]> {
  const email = (await runGit(rootPath, ['config', 'user.email'])).trim().toLowerCase();
  if (!email) return [];
  const out = await runGit(rootPath, [
    'for-each-ref', '--format=%(authoremail)%x00%(refname:short)', 'refs/heads', 'refs/remotes',
  ]);
  const refs: string[] = [];
  for (const raw of out.split('\n')) {
    if (!raw.trim()) continue;
    const [authorEmail, name] = raw.split(FIELD_SEP);
    if (!name || name.endsWith('/HEAD')) continue; // skip the origin/HEAD symbolic ref
    if (authorEmail.replace(/[<>]/g, '').trim().toLowerCase() === email) refs.push(name);
  }
  return refs;
}

/** The remote's default branch (e.g. "origin/dev"), so the graph always shows the integration lane. */
async function defaultRemoteBranch(rootPath: string): Promise<string | null> {
  try {
    const head = (await runGit(rootPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).trim();
    if (head) return head;
  } catch {
    /* origin/HEAD not configured locally — fall through to common names */
  }
  for (const cand of ['origin/main', 'origin/master', 'origin/dev', 'origin/develop']) {
    try {
      await runGit(rootPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/${cand}`]);
      return cand;
    } catch {
      /* not present */
    }
  }
  return null;
}

export async function getGitLog(rootPath: string, limit = 50): Promise<GitCommit[]> {
  try {
    const remotes = new Set(
      (await runGit(rootPath, ['remote'])).split('\n').map((r) => r.trim()).filter(Boolean),
    );
    // NUL-separated fields, newline-separated records (subjects can contain anything else).
    // %D carries the ref decorations; %p the abbreviated parent hashes (for the graph).
    const fmt = '%h%x00%an%x00%ad%x00%s%x00%D%x00%p';
    // Scope to the current user's branches plus HEAD and the remote's default branch (so the
    // integration lane like origin/dev always shows), without every teammate's branch.
    // --topo-order keeps each branch's commits contiguous for clean lanes.
    const def = await defaultRemoteBranch(rootPath);
    const revs = [
      ...new Set(['HEAD', ...(def ? [def] : []), ...(await currentUserRefs(rootPath))]),
    ];
    const stdout = await runGit(rootPath, [
      'log', '--topo-order', `-n${limit}`, '--date=relative', '--decorate=short',
      `--pretty=format:${fmt}`, ...revs,
    ]);
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, author, date, subject, decoration, parents] = line.split(FIELD_SEP);
        return {
          hash,
          author,
          date,
          subject: subject ?? '',
          refs: parseRefs(decoration ?? '', remotes),
          parents: (parents ?? '').trim().split(' ').filter(Boolean),
        };
      });
  } catch {
    return [];
  }
}

/** Files changed by a single commit, parsed from `git show --name-status`. */
export async function getCommitFiles(rootPath: string, hash: string): Promise<GitChange[]> {
  try {
    const stdout = await runGit(rootPath, [
      'show', '--no-renames', '--name-status', '--format=', '-z', hash,
    ]);
    // With -z, fields are NUL-terminated: STATUS \0 PATH \0 STATUS \0 PATH \0 ... (alternating).
    const parts = stdout.split(FIELD_SEP).filter((s) => s.length > 0);
    const files: GitChange[] = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const code = parts[i][0];
      const p = parts[i + 1];
      const status: GitChange['status'] =
        code === 'A' ? 'A' : code === 'D' ? 'D' : code === 'R' ? 'R' : 'M';
      files.push({ path: p, name: basename(p), status, staged: false, unstaged: false });
    }
    return files;
  } catch {
    return [];
  }
}

/** A file's content at a ref (commit hash, branch, …); null when it doesn't exist there. */
export function getFileAtRef(
  rootPath: string,
  ref: string,
  relPath: string,
): Promise<string | null> {
  return gitShow(rootPath, `${rootPath}/${relPath}`, ref);
}

/**
 * Of the given entry names (relative to `dirPath`), the subset matched by a
 * .gitignore rule. Empty when `dirPath` isn't in a git repo.
 */
export async function getIgnoredNames(dirPath: string, names: string[]): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  try {
    // check-ignore echoes each matched pathspec (one per line); -z is stdin-only.
    const { stdout } = await run('git', ['-C', dirPath, 'check-ignore', '--', ...names], {
      maxBuffer: 4 * 1024 * 1024,
    });
    return new Set(stdout.split('\n').filter(Boolean));
  } catch {
    // exit 1 = none ignored; exit 128 = not a repo. Either way: nothing to dim.
    return new Set();
  }
}

const BLAME_HEADER = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/;

/** Parse `git blame --porcelain` output into per-line author/time (1-based index). */
function parseBlame(stdout: string): BlameLine[] {
  const commits = new Map<string, { author: string; time: number }>();
  const result: BlameLine[] = [];
  let sha = '';
  let finalLine = 0;
  let author: string | undefined;
  let time: number | undefined;

  for (const line of stdout.split('\n')) {
    const header = BLAME_HEADER.exec(line);
    if (header) {
      sha = header[1];
      finalLine = Number(header[2]);
      author = undefined;
      time = undefined;
    } else if (line.startsWith('author ')) {
      author = line.slice('author '.length);
    } else if (line.startsWith('author-time ')) {
      time = Number(line.slice('author-time '.length));
    } else if (line.startsWith('\t')) {
      // The content line closes a group; commit info is cached per sha (repeats omit it).
      let info = commits.get(sha);
      if (!info) {
        info = { author: author ?? 'Unknown', time: time ?? 0 };
        commits.set(sha, info);
      }
      result[finalLine - 1] = /^0{40}$/.test(sha)
        ? { author: 'You', time: null }
        : { author: info.author, time: info.time };
    }
  }
  return result;
}

/** Per-line blame for a file; empty when the file isn't tracked or not in a repo. */
export async function getGitBlame(rootPath: string, filePath: string): Promise<BlameLine[]> {
  const rel = relative(rootPath, filePath).split(sep).join('/');
  if (!rel || rel.startsWith('..')) return [];
  try {
    const { stdout } = await run('git', ['-C', rootPath, 'blame', '--porcelain', '--', rel], {
      maxBuffer: 32 * 1024 * 1024,
    });
    return parseBlame(stdout);
  } catch {
    return [];
  }
}
