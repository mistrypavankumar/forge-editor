import { tmpdir, homedir } from "node:os";
import { promises, existsSync, watch, statSync } from "node:fs";
import { basename, relative, sep, join, resolve as resolve$1, dirname, isAbsolute, delimiter, extname } from "node:path";
import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from "electron";
import { execFile, spawn, execFileSync } from "node:child_process";
import { stat, rm, mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import ts from "typescript";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
const IpcChannels = {
  ping: "forge:ping",
  openFolder: "forge:fs:openFolder",
  openFileDialog: "forge:fs:openFileDialog",
  saveDialog: "forge:fs:saveDialog",
  readDirectory: "forge:fs:readDirectory",
  readFile: "forge:fs:readFile",
  readFileBase64: "forge:fs:readFileBase64",
  writeFile: "forge:fs:writeFile",
  listFiles: "forge:fs:listFiles",
  gitBranch: "forge:fs:gitBranch",
  gitChanges: "forge:git:changes",
  gitCommit: "forge:git:commit",
  gitStage: "forge:git:stage",
  gitUnstage: "forge:git:unstage",
  gitDiscard: "forge:git:discard",
  gitStageAll: "forge:git:stageAll",
  gitUnstageAll: "forge:git:unstageAll",
  gitDiscardAll: "forge:git:discardAll",
  gitOriginal: "forge:git:original",
  gitStaged: "forge:git:staged",
  gitBlame: "forge:git:blame",
  gitBranches: "forge:git:branches",
  gitCheckout: "forge:git:checkout",
  gitCreateBranch: "forge:git:createBranch",
  gitPush: "forge:git:push",
  gitPublishBranch: "forge:git:publishBranch",
  gitPull: "forge:git:pull",
  gitFetch: "forge:git:fetch",
  gitAheadBehind: "forge:git:aheadBehind",
  gitLog: "forge:git:log",
  gitSearchLog: "forge:git:searchLog",
  gitRefsSig: "forge:git:refsSig",
  gitCommitFiles: "forge:git:commitFiles",
  gitCommitDetail: "forge:git:commitDetail",
  gitFileAt: "forge:git:fileAt",
  gitGetUser: "forge:git:getUser",
  gitSetUser: "forge:git:setUser",
  gitTestCredential: "forge:git:testCredential",
  gitGhAuth: "forge:git:ghAuth",
  gitGhAccounts: "forge:git:ghAccounts",
  // AI-generated commit message (via the local `claude` CLI).
  aiCommitMessage: "forge:ai:commitMessage",
  // Assistant chat (streaming, via the local `claude` CLI).
  assistantSend: "forge:assistant:send",
  assistantCancel: "forge:assistant:cancel",
  assistantChunk: "forge:assistant:chunk",
  assistantDone: "forge:assistant:done",
  // Inline AI code completion (ghost text). Request/response is keyed by id so an in-flight
  // request can be cancelled when the user keeps typing.
  aiCompletion: "forge:ai:completion",
  aiCompletionCancel: "forge:ai:completionCancel",
  // AI provider API-key management (keys live in a separate 0600 credentials file).
  aiKeyStatus: "forge:ai:keyStatus",
  aiSetKey: "forge:ai:setKey",
  search: "forge:search",
  replaceInFiles: "forge:search:replace",
  watchWorkspace: "forge:fs:watch",
  fsChanged: "forge:fs:changed",
  menuAction: "forge:menu:action",
  menuSyncState: "forge:menu:syncState",
  // A file the OS asked us to open (Finder "Open With", dock/taskbar drop, or a CLI arg).
  openPath: "forge:file:openPath",
  newWindow: "forge:window:new",
  // Title-bar window switcher: track each window's open repo and switch between windows.
  windowReport: "forge:window:report",
  windowList: "forge:window:list",
  windowFocus: "forge:window:focus",
  windowOpenFolder: "forge:window:openFolder",
  windowsChanged: "forge:window:changed",
  openFolderInWindow: "forge:window:openInThis",
  rename: "forge:fs:rename",
  remove: "forge:fs:remove",
  copyEntry: "forge:fs:copyEntry",
  moveEntry: "forge:fs:moveEntry",
  mkdir: "forge:fs:mkdir",
  loadSettings: "forge:settings:load",
  saveSettings: "forge:settings:save",
  runFormatter: "forge:format:run",
  formatText: "forge:format:text",
  runDiagnostics: "forge:diagnostics:run",
  runInline: "forge:run:inline",
  resolveImport: "forge:nav:resolveImport",
  terminalCreate: "forge:terminal:create",
  terminalInput: "forge:terminal:input",
  terminalResize: "forge:terminal:resize",
  terminalKill: "forge:terminal:kill",
  terminalData: "forge:terminal:data",
  terminalAck: "forge:terminal:ack",
  terminalExit: "forge:terminal:exit",
  terminalBusy: "forge:terminal:busy",
  openExternal: "forge:shell:openExternal",
  // Generic HTTP request (API Explorer) — performed in main to bypass renderer CORS.
  apiRequest: "forge:api:request",
  // TypeScript Language Service (real IDE intelligence).
  langInit: "forge:lang:init",
  langOpenDoc: "forge:lang:openDoc",
  langUpdateDoc: "forge:lang:updateDoc",
  langCloseDoc: "forge:lang:closeDoc",
  langDiagnostics: "forge:lang:diagnostics",
  langDefinition: "forge:lang:definition",
  langReferences: "forge:lang:references",
  langHover: "forge:lang:hover",
  langCompletions: "forge:lang:completions",
  langCompletionDetails: "forge:lang:completionDetails",
  langSignatureHelp: "forge:lang:signatureHelp",
  langRename: "forge:lang:rename",
  langFormat: "forge:lang:format",
  langSemanticTokens: "forge:lang:semanticTokens",
  langDocSymbols: "forge:lang:docSymbols",
  langWorkspaceSymbols: "forge:lang:workspaceSymbols",
  // Java (jdtls) language-server status, for the status-bar indicator.
  jdtlsGetStatus: "forge:java:getStatus",
  jdtlsStatus: "forge:java:status",
  // AWS connection switcher.
  awsListProfiles: "forge:aws:listProfiles",
  awsValidateProfile: "forge:aws:validateProfile",
  awsSetActiveProfile: "forge:aws:setActiveProfile",
  awsGetActiveProfile: "forge:aws:getActiveProfile",
  awsConfigPaths: "forge:aws:configPaths",
  // Editor integration: install/remove the `forge` PATH command + shell-profile env vars.
  editorIntegrationStatus: "forge:editor-integration:status",
  editorIntegrationInstall: "forge:editor-integration:install",
  editorIntegrationUninstall: "forge:editor-integration:uninstall",
  // Step debugger (Node V8 Inspector, driven over the Chrome DevTools Protocol).
  debugStart: "forge:debug:start",
  debugStop: "forge:debug:stop",
  debugContinue: "forge:debug:continue",
  debugPause: "forge:debug:pause",
  debugStepOver: "forge:debug:stepOver",
  debugStepInto: "forge:debug:stepInto",
  debugStepOut: "forge:debug:stepOut",
  debugSetBreakpoints: "forge:debug:setBreakpoints",
  debugEvaluate: "forge:debug:evaluate",
  debugGetVariables: "forge:debug:getVariables",
  // Events pushed from the active session to the renderer.
  debugState: "forge:debug:state",
  debugStopped: "forge:debug:stopped",
  debugOutput: "forge:debug:output",
  // AI Agent Workspace Mode: a one-shot "brain" completion (plan / edit) plus a captured-output
  // command runner. The agent drives tools itself in the renderer; the model only returns text.
  agentComplete: "forge:agent:complete",
  agentCancel: "forge:agent:cancel",
  agentRunCommand: "forge:agent:runCommand",
  agentCancelCommand: "forge:agent:cancelCommand",
  // Codebase Map: static dependency-graph analysis (runs in main, off the render thread).
  codemapBuild: "forge:codemap:build",
  // Generate Skeleton: React component analysis + loading-skeleton generation (runs in main).
  skeletonDetect: "forge:skeleton:detect",
  skeletonGenerate: "forge:skeleton:generate",
  skeletonGenerateAi: "forge:skeleton:generateAi"
};
function pongOf(msg) {
  return `pong: ${msg}`;
}
const ok = (data) => ({ ok: true, data });
const err = (error) => ({ ok: false, error });
async function toResult(fn) {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
const run$3 = promisify(execFile);
const STALE_LOCK_MS = 2e3;
function isIndexLockError(message) {
  return /index\.lock/i.test(message) && /File exists|Unable to create/i.test(message);
}
async function clearStaleIndexLock(rootPath) {
  const lock = join(rootPath, ".git", "index.lock");
  try {
    const { mtimeMs } = await stat(lock);
    if (Date.now() - mtimeMs < STALE_LOCK_MS) return false;
    await rm(lock, { force: true });
    return true;
  } catch {
    return false;
  }
}
const LOCK_WAIT_MS = 5e3;
const LOCK_POLL_MS = 120;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const repoQueues = /* @__PURE__ */ new Map();
function serializeByRepo(rootPath, fn) {
  const prev = (repoQueues.get(rootPath) ?? Promise.resolve()).catch(() => {
  });
  const next = prev.then(fn);
  repoQueues.set(rootPath, next.catch(() => {
  }));
  return next;
}
async function execGit(rootPath, args, maxBuffer = 16 * 1024 * 1024) {
  return serializeByRepo(rootPath, async () => {
    const deadline = Date.now() + LOCK_WAIT_MS;
    for (; ; ) {
      try {
        const { stdout } = await run$3("git", ["-C", rootPath, ...args], { maxBuffer });
        return stdout;
      } catch (e) {
        const ex = e;
        const message = (ex.stderr || ex.message || "git command failed").trim();
        if (!isIndexLockError(message)) throw new Error(message);
        if (await clearStaleIndexLock(rootPath)) continue;
        if (Date.now() >= deadline) throw new Error(message);
        await delay(LOCK_POLL_MS);
      }
    }
  });
}
const FIELD_SEP = String.fromCharCode(0);
async function gitShow(rootPath, filePath, ref) {
  const rel = relative(rootPath, filePath).split(sep).join("/");
  if (!rel || rel.startsWith("..")) return null;
  try {
    const { stdout } = await run$3("git", ["-C", rootPath, "show", `${ref}:${rel}`], {
      maxBuffer: 16 * 1024 * 1024
    });
    return stdout;
  } catch {
    return null;
  }
}
function getGitOriginalContent(rootPath, filePath) {
  return gitShow(rootPath, filePath, "HEAD");
}
function getGitStagedContent(rootPath, filePath) {
  return gitShow(rootPath, filePath, "");
}
async function getGitChanges(rootPath) {
  try {
    const stdout = await execGit(rootPath, ["status", "--porcelain"], 4 * 1024 * 1024);
    const changes = [];
    for (const raw of stdout.split("\n")) {
      if (!raw.trim()) continue;
      const x = raw[0];
      const y = raw[1];
      let p = raw.slice(3);
      if (raw.slice(0, 2).includes("R") && p.includes(" -> ")) p = p.split(" -> ")[1];
      const untracked = x === "?" && y === "?";
      const staged = !untracked && x !== " ";
      const unstaged = untracked || y !== " ";
      const code = untracked ? "?" : unstaged ? y : x;
      const status2 = code === "A" ? "A" : code === "D" ? "D" : code === "R" ? "R" : code === "?" ? "U" : "M";
      changes.push({ path: p, name: basename(p), status: status2, staged, unstaged });
    }
    return changes;
  } catch {
    return [];
  }
}
async function gitStage(rootPath, path) {
  await execGit(rootPath, ["add", "--", path]);
}
async function gitUnstage(rootPath, path) {
  await execGit(rootPath, ["reset", "-q", "HEAD", "--", path]);
}
async function gitDiscard(rootPath, path) {
  await execGit(rootPath, ["checkout", "--", path]);
}
async function gitStageAll(rootPath) {
  await execGit(rootPath, ["add", "-A"]);
}
async function gitUnstageAll(rootPath) {
  await execGit(rootPath, ["reset", "-q", "HEAD", "--"]);
}
async function gitDiscardAll(rootPath) {
  await execGit(rootPath, ["checkout", "--", "."]);
  await execGit(rootPath, ["clean", "-fd"]);
}
async function gitCommit(rootPath, message) {
  let nothingStaged = false;
  try {
    await execGit(rootPath, ["diff", "--cached", "--quiet"]);
    nothingStaged = true;
  } catch {
    nothingStaged = false;
  }
  if (nothingStaged) await execGit(rootPath, ["add", "-A"]);
  await execGit(rootPath, ["commit", "-m", message]);
}
const MAX_COMMIT_DIFF = 24 * 1024;
async function getCommitDiff(rootPath) {
  const cached = await execGit(rootPath, ["diff", "--cached"]).catch(() => "");
  let diff = cached;
  if (!diff.trim()) {
    const unstaged = await execGit(rootPath, ["diff"]).catch(() => "");
    const untracked = await execGit(rootPath, ["ls-files", "--others", "--exclude-standard"]).catch(
      () => ""
    );
    const parts = [unstaged];
    for (const file of untracked.split("\n").map((s) => s.trim()).filter(Boolean)) {
      const d = await run$3("git", ["-C", rootPath, "diff", "--no-index", "--", "/dev/null", file]).then((r) => r.stdout).catch((e) => e.stdout ?? "");
      if (d) parts.push(d);
    }
    diff = parts.filter(Boolean).join("\n");
  }
  return diff.length > MAX_COMMIT_DIFF ? `${diff.slice(0, MAX_COMMIT_DIFF)}
…[diff truncated]` : diff;
}
async function gitConfig(rootPath, key) {
  try {
    return (await runGit(rootPath, ["config", key])).trim();
  } catch {
    return "";
  }
}
async function getGitUser(rootPath) {
  const [name, email] = await Promise.all([
    gitConfig(rootPath, "user.name"),
    gitConfig(rootPath, "user.email")
  ]);
  return { name, email };
}
function gitInput(rootPath, args, input) {
  return new Promise((resolve2, reject) => {
    const child = spawn("git", ["-C", rootPath, ...args]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => stdout += d);
    child.stderr.on("data", (d) => stderr += d);
    child.on("error", reject);
    child.on(
      "close",
      (code) => code === 0 ? resolve2(stdout) : reject(new Error((stderr || `git exited ${code}`).trim()))
    );
    child.stdin.end(input);
  });
}
async function originHost(rootPath) {
  try {
    const url = (await runGit(rootPath, ["remote", "get-url", "origin"])).trim();
    const m = url.match(/^[a-z]+:\/\/(?:[^@/]+@)?([^/]+)/i) ?? url.match(/@([^:]+):/);
    return m ? m[1] : "github.com";
  } catch {
    return "github.com";
  }
}
async function originSlug(rootPath) {
  try {
    const url = (await runGit(rootPath, ["remote", "get-url", "origin"])).trim();
    const m = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
async function applyCredential(rootPath, credentialsPath, username, token) {
  const host = await originHost(rootPath);
  const helper = `store --file ${credentialsPath}`;
  await runGit(rootPath, ["config", "--local", "--replace-all", "credential.helper", ""]);
  await runGit(rootPath, ["config", "--local", "--add", "credential.helper", helper]);
  await runGit(rootPath, ["config", "--local", `credential.https://${host}.username`, username]);
  if (token) {
    await gitInput(
      rootPath,
      ["-c", `credential.helper=${helper}`, "credential", "approve"],
      `protocol=https
host=${host}
username=${username}
password=${token}

`
    );
  }
}
async function setGitUser(rootPath, user, credentialsPath) {
  await runGit(rootPath, ["config", "user.name", user.name]);
  await runGit(rootPath, ["config", "user.email", user.email]);
  if (user.username) {
    await applyCredential(rootPath, credentialsPath, user.username, user.token ?? "");
  }
}
async function ghAuth(rootPath) {
  try {
    await run$3("gh", ["--version"]);
  } catch {
    return { installed: false };
  }
  const host = await originHost(rootPath);
  let token = "";
  try {
    token = (await run$3("gh", ["auth", "token", "--hostname", host])).stdout.trim();
  } catch {
    return { installed: true };
  }
  if (!token) return { installed: true };
  let login;
  let name;
  let email;
  try {
    const out = (await run$3("gh", ["api", "user", "--hostname", host])).stdout;
    const u = JSON.parse(out);
    login = u.login ?? void 0;
    name = u.name ?? void 0;
    email = u.email ?? (u.login && u.id ? `${u.id}+${u.login}@users.noreply.github.com` : void 0);
  } catch {
  }
  return { installed: true, login, name, email, token };
}
async function ghAccounts(rootPath) {
  try {
    await run$3("gh", ["--version"]);
  } catch {
    return { installed: false, accounts: [] };
  }
  const host = await originHost(rootPath);
  let logins;
  try {
    const out = (await run$3("gh", ["auth", "status", "--json", "hosts"])).stdout;
    const parsed = JSON.parse(out);
    logins = (parsed.hosts?.[host] ?? []).filter((a) => typeof a.login === "string").map((a) => ({ login: a.login, active: a.active === true }));
  } catch {
    return { installed: true, accounts: [] };
  }
  const accounts = [];
  for (const { login, active: active2 } of logins) {
    let token = "";
    try {
      token = (await run$3("gh", ["auth", "token", "--hostname", host, "--user", login])).stdout.trim();
    } catch {
      continue;
    }
    if (!token) continue;
    let name;
    let email;
    try {
      const env = { ...process.env, GH_TOKEN: token, GH_ENTERPRISE_TOKEN: token };
      const out = (await run$3("gh", ["api", "user", "--hostname", host], { env })).stdout;
      const u = JSON.parse(out);
      name = u.name ?? void 0;
      email = u.email ?? (u.login && u.id ? `${u.id}+${u.login}@users.noreply.github.com` : void 0);
    } catch {
    }
    accounts.push({ login, name, email, token, active: active2 });
  }
  return { installed: true, accounts };
}
async function fetchJson(url, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8e3);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "forge-editor",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, scopes: res.headers.get("x-oauth-scopes"), body };
  } finally {
    clearTimeout(timer);
  }
}
async function testGitCredential(rootPath, username, token) {
  if (!token) return { ok: false, message: "Enter a token to test." };
  const host = await originHost(rootPath);
  const api = host === "github.com" ? "https://api.github.com" : `https://${host}/api/v3`;
  let who;
  try {
    who = await fetchJson(`${api}/user`, token);
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, message: aborted ? `Timed out reaching ${host}.` : `Couldn't reach ${host}.` };
  }
  if (who.status === 401) return { ok: false, message: "Token is invalid or expired (401)." };
  if (who.status >= 400) return { ok: false, message: `Host rejected the token (HTTP ${who.status}).` };
  const login = who.body?.login;
  const scopes = who.scopes ?? void 0;
  const repo = await originSlug(rootPath) ?? void 0;
  const mismatch = login && login.toLowerCase() !== username.trim().toLowerCase() ? ` (note: token belongs to ${login}, not ${username})` : "";
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
      message: `Authenticated as ${login}, but ${repo} isn't visible to this token — repo not found or no access${mismatch}.`
    };
  }
  const canPush = Boolean(repoRes.body?.permissions?.push);
  return {
    ok: canPush,
    login,
    repo,
    scopes,
    canPush,
    message: canPush ? `Ready — ${login} can push to ${repo}.${mismatch}` : `Authenticated as ${login}, but no push access to ${repo}. Grant the token 'repo' scope (or Contents: write) / repo access${mismatch}.`
  };
}
function runGit(rootPath, args) {
  return execGit(rootPath, args);
}
async function defaultLocalBranch(rootPath, all) {
  let remoteHead = "";
  try {
    remoteHead = (await runGit(rootPath, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).trim();
  } catch {
  }
  if (remoteHead) {
    const local = remoteHead.slice(remoteHead.indexOf("/") + 1);
    if (all.includes(local)) return local;
  }
  for (const cand of ["main", "master", "dev", "develop", "development", "staging", "prod", "production"]) {
    if (all.includes(cand)) return cand;
  }
  return null;
}
async function getBranches(rootPath) {
  try {
    const stdout = await runGit(rootPath, ["branch", "--sort=-committerdate", "--format=%(refname:short)"]);
    const all = stdout.split("\n").map((b) => b.trim()).filter(Boolean);
    const current = (await runGit(rootPath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim() || null;
    const defaultBranch = await defaultLocalBranch(rootPath, all);
    return { current, all, defaultBranch };
  } catch {
    return { current: null, all: [], defaultBranch: null };
  }
}
async function defaultRemoteRef(rootPath) {
  try {
    return (await runGit(rootPath, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).trim() || null;
  } catch {
    return null;
  }
}
async function getAheadBehind(rootPath) {
  let upstream = null;
  try {
    upstream = (await runGit(rootPath, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}"
    ])).trim() || null;
  } catch {
    upstream = null;
  }
  let ahead = 0;
  let behind = 0;
  if (upstream) {
    try {
      const out = (await runGit(rootPath, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"])).trim();
      const [b, a] = out.split(/\s+/).map((n) => Number.parseInt(n, 10) || 0);
      behind = b ?? 0;
      ahead = a ?? 0;
    } catch {
    }
  }
  let baseBehind = 0;
  let base = null;
  const baseRef = await defaultRemoteRef(rootPath);
  if (baseRef && baseRef !== upstream) {
    try {
      const count = Number.parseInt(
        (await runGit(rootPath, ["rev-list", "--count", `HEAD..${baseRef}`])).trim(),
        10
      );
      if (count > 0) {
        baseBehind = count;
        base = baseRef;
      }
    } catch {
    }
  }
  return { ahead, behind, upstream, baseBehind, base };
}
async function checkoutBranch(rootPath, name) {
  await runGit(rootPath, ["checkout", name]);
}
async function createBranch(rootPath, name) {
  await runGit(rootPath, ["checkout", "-b", name]);
}
async function gitPush(rootPath) {
  await runGit(rootPath, ["push"]);
}
async function publishBranch(rootPath) {
  await runGit(rootPath, ["push", "-u", "origin", "HEAD"]);
}
async function gitPull(rootPath) {
  await runGit(rootPath, ["pull", "--rebase"]);
}
async function gitFetch(rootPath) {
  await runGit(rootPath, ["fetch", "--prune"]);
}
function parseRefs(decoration, remotes) {
  const refs = [];
  for (const raw of decoration.split(",")) {
    const token = raw.trim();
    if (!token || token === "HEAD") continue;
    const arrow = token.indexOf(" -> ");
    if (arrow !== -1) {
      refs.push({ name: token.slice(arrow + 4).trim(), kind: "head" });
      continue;
    }
    if (token.startsWith("tag: ")) {
      refs.push({ name: token.slice(5), kind: "tag" });
      continue;
    }
    const kind = remotes.has(token.split("/")[0]) ? "remote" : "branch";
    refs.push({ name: token, kind });
  }
  return refs;
}
async function currentUserRefs(rootPath) {
  const email = (await runGit(rootPath, ["config", "user.email"])).trim().toLowerCase();
  if (!email) return [];
  const out = await runGit(rootPath, [
    "for-each-ref",
    "--format=%(authoremail)%x00%(refname:short)",
    "refs/heads",
    "refs/remotes"
  ]);
  const refs = [];
  for (const raw of out.split("\n")) {
    if (!raw.trim()) continue;
    const [authorEmail, name] = raw.split(FIELD_SEP);
    if (!name || name.endsWith("/HEAD")) continue;
    if (authorEmail.replace(/[<>]/g, "").trim().toLowerCase() === email) refs.push(name);
  }
  return refs;
}
async function defaultRemoteBranch(rootPath) {
  try {
    const head = (await runGit(rootPath, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).trim();
    if (head) return head;
  } catch {
  }
  for (const cand of ["origin/main", "origin/master", "origin/dev", "origin/develop"]) {
    try {
      await runGit(rootPath, ["rev-parse", "--verify", "--quiet", `refs/remotes/${cand}`]);
      return cand;
    } catch {
    }
  }
  return null;
}
async function getGitLog(rootPath, limit = 50) {
  try {
    const remotes = new Set(
      (await runGit(rootPath, ["remote"])).split("\n").map((r) => r.trim()).filter(Boolean)
    );
    const fmt = "%h%x00%an%x00%ad%x00%s%x00%D%x00%p";
    const def = await defaultRemoteBranch(rootPath);
    const revs = [
      .../* @__PURE__ */ new Set(["HEAD", ...def ? [def] : [], ...await currentUserRefs(rootPath)])
    ];
    const stdout = await runGit(rootPath, [
      "log",
      "--topo-order",
      `-n${limit}`,
      "--date=relative",
      "--decorate=short",
      `--pretty=format:${fmt}`,
      ...revs
    ]);
    return stdout.split("\n").filter(Boolean).map((line) => {
      const [hash, author, date, subject, decoration, parents] = line.split(FIELD_SEP);
      return {
        hash,
        author,
        date,
        subject: subject ?? "",
        refs: parseRefs(decoration ?? "", remotes),
        parents: (parents ?? "").trim().split(" ").filter(Boolean)
      };
    });
  } catch {
    return [];
  }
}
const HASH_PREFIX = /^[0-9a-f]{4,40}$/i;
async function searchGitLog(rootPath, query, limit = 100) {
  const q = query.trim();
  if (!q) return [];
  try {
    const remotes = new Set(
      (await runGit(rootPath, ["remote"])).split("\n").map((r) => r.trim()).filter(Boolean)
    );
    const fmt = "%h%x00%an%x00%ad%x00%s%x00%D%x00%p%x00%ct";
    const base = [
      "log",
      "--all",
      "-i",
      `-n${limit}`,
      "--date=relative",
      "--decorate=short",
      `--pretty=format:${fmt}`
    ];
    const runFacet = async (extra) => {
      try {
        return await runGit(rootPath, [...base, ...extra]);
      } catch {
        return "";
      }
    };
    const outputs = await Promise.all([
      runFacet([`--grep=${q}`]),
      runFacet([`--author=${q}`]),
      // Direct hash lookup: resolve a prefix to a commit, then log just that one.
      HASH_PREFIX.test(q) ? (async () => {
        try {
          const full = (await runGit(rootPath, ["rev-parse", "--verify", "--quiet", `${q}^{commit}`])).trim();
          if (!full) return "";
          return await runGit(rootPath, ["log", "-n1", "--date=relative", "--decorate=short", `--pretty=format:${fmt}`, full]);
        } catch {
          return "";
        }
      })() : Promise.resolve("")
    ]);
    const byHash = /* @__PURE__ */ new Map();
    for (const stdout of outputs) {
      for (const line of stdout.split("\n").filter(Boolean)) {
        const [hash, author, date, subject, decoration, parents, ct] = line.split(FIELD_SEP);
        if (!hash || byHash.has(hash)) continue;
        byHash.set(hash, {
          ts: Number(ct) || 0,
          commit: {
            hash,
            author,
            date,
            subject: subject ?? "",
            refs: parseRefs(decoration ?? "", remotes),
            parents: (parents ?? "").trim().split(" ").filter(Boolean)
          }
        });
      }
    }
    return [...byHash.values()].sort((a, b) => b.ts - a.ts).slice(0, limit).map((e) => e.commit);
  } catch {
    return [];
  }
}
async function getGitRefsSig(rootPath) {
  try {
    return (await execGit(rootPath, ["show-ref", "--head"])).trim();
  } catch {
    return "";
  }
}
async function getCommitFiles(rootPath, hash) {
  try {
    const stdout = await runGit(rootPath, [
      "show",
      "--no-renames",
      "--name-status",
      "--format=",
      "-z",
      hash
    ]);
    const parts = stdout.split(FIELD_SEP).filter((s) => s.length > 0);
    const files = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const code = parts[i][0];
      const p = parts[i + 1];
      const status2 = code === "A" ? "A" : code === "D" ? "D" : code === "R" ? "R" : "M";
      files.push({ path: p, name: basename(p), status: status2, staged: false, unstaged: false });
    }
    return files;
  } catch {
    return [];
  }
}
async function getCommitDetail(rootPath, hash) {
  const fmt = "%H%x00%h%x00%an%x00%ae%x00%aI%x00%ar%x00%s%x00%b";
  const meta = await runGit(rootPath, ["show", "-s", `--format=${fmt}`, hash]);
  const [full, short, author, email, iso, rel, subject, ...rest] = meta.split(FIELD_SEP);
  const body = rest.join("").replace(/\n+$/, "");
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;
  try {
    const stat2 = await runGit(rootPath, ["show", "--shortstat", "--format=", hash]);
    filesChanged = Number(stat2.match(/(\d+) files? changed/)?.[1] ?? 0);
    insertions = Number(stat2.match(/(\d+) insertions?\(\+\)/)?.[1] ?? 0);
    deletions = Number(stat2.match(/(\d+) deletions?\(-\)/)?.[1] ?? 0);
  } catch {
  }
  const slug = await originSlug(rootPath);
  const host = await originHost(rootPath);
  const webUrl = slug ? `https://${host}/${slug}/commit/${full}` : null;
  return {
    hash: full,
    shortHash: short,
    author,
    authorEmail: email,
    isoDate: iso,
    relativeDate: rel,
    subject: subject ?? "",
    body,
    filesChanged,
    insertions,
    deletions,
    webUrl
  };
}
function getFileAtRef(rootPath, ref, relPath) {
  return gitShow(rootPath, `${rootPath}/${relPath}`, ref);
}
async function getIgnoredNames(dirPath, names) {
  if (names.length === 0) return /* @__PURE__ */ new Set();
  try {
    const { stdout } = await run$3("git", ["-C", dirPath, "check-ignore", "--", ...names], {
      maxBuffer: 4 * 1024 * 1024
    });
    return new Set(stdout.split("\n").filter(Boolean));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
async function listProjectFiles(rootPath) {
  try {
    const stdout = await execGit(rootPath, [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z"
    ]);
    return [...new Set(stdout.split("\0").filter(Boolean))];
  } catch {
    return null;
  }
}
const BLAME_HEADER = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/;
function parseBlame(stdout) {
  const commits = /* @__PURE__ */ new Map();
  const result = [];
  let sha = "";
  let finalLine = 0;
  let author;
  let time;
  let summary;
  for (const line of stdout.split("\n")) {
    const header = BLAME_HEADER.exec(line);
    if (header) {
      sha = header[1];
      finalLine = Number(header[2]);
      author = void 0;
      time = void 0;
      summary = void 0;
    } else if (line.startsWith("author ")) {
      author = line.slice("author ".length);
    } else if (line.startsWith("author-time ")) {
      time = Number(line.slice("author-time ".length));
    } else if (line.startsWith("summary ")) {
      summary = line.slice("summary ".length);
    } else if (line.startsWith("	")) {
      let info = commits.get(sha);
      if (!info) {
        info = { author: author ?? "Unknown", time: time ?? 0, summary: summary ?? "" };
        commits.set(sha, info);
      }
      result[finalLine - 1] = /^0{40}$/.test(sha) ? { author: "You", time: null, sha: null, summary: "" } : { author: info.author, time: info.time, sha: sha.slice(0, 8), summary: info.summary };
    }
  }
  return result;
}
async function getGitBlame(rootPath, filePath) {
  const rel = relative(rootPath, filePath).split(sep).join("/");
  if (!rel || rel.startsWith("..")) return [];
  try {
    const { stdout } = await run$3("git", ["-C", rootPath, "blame", "--porcelain", "--", rel], {
      maxBuffer: 32 * 1024 * 1024
    });
    return parseBlame(stdout);
  } catch {
    return [];
  }
}
function sortDirEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
const HIDDEN_ENTRIES = /* @__PURE__ */ new Set([".git", ".svn", ".hg", ".DS_Store", "Thumbs.db"]);
async function readDirectoryEntries(dirPath) {
  const dirents = await promises.readdir(dirPath, { withFileTypes: true });
  const entries = dirents.filter((d) => !HIDDEN_ENTRIES.has(d.name)).map((d) => ({
    name: d.name,
    path: join(dirPath, d.name),
    isDirectory: d.isDirectory()
  }));
  const ignored = await getIgnoredNames(dirPath, entries.map((e) => e.name));
  for (const e of entries) {
    if (ignored.has(e.name)) e.ignored = true;
  }
  return sortDirEntries(entries);
}
async function readFileText(filePath) {
  return promises.readFile(filePath, "utf8");
}
async function readFileBase64(filePath) {
  const buf = await promises.readFile(filePath);
  return buf.toString("base64");
}
async function writeFileText(filePath, content) {
  await promises.writeFile(filePath, content, "utf8");
}
const IGNORED_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "out"]);
function hasIgnoredSegment(relPath, ignored) {
  return relPath.split("/").some((seg) => ignored.has(seg));
}
async function listFilesRecursive(rootPath, extraIgnore = []) {
  const ignored = /* @__PURE__ */ new Set([...IGNORED_DIRS, ...extraIgnore]);
  const tracked = await listProjectFiles(rootPath);
  if (tracked) {
    const results2 = [];
    for (const relPath of tracked) {
      if (hasIgnoredSegment(relPath, ignored)) continue;
      results2.push({ name: basename(relPath), path: join(rootPath, relPath), relPath });
    }
    return results2;
  }
  const results = [];
  async function walk(dir) {
    const dirents = await promises.readdir(dir, { withFileTypes: true });
    for (const d of dirents) {
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        if (ignored.has(d.name)) continue;
        await walk(full);
      } else {
        results.push({ name: d.name, path: full, relPath: relative(rootPath, full) });
      }
    }
  }
  await walk(rootPath);
  return results;
}
async function renameEntry(oldPath, newPath) {
  await promises.rename(oldPath, newPath);
}
async function deleteEntry(path) {
  await promises.rm(path, { recursive: true, force: true });
}
async function copyEntry(src, destDir) {
  await promises.cp(src, join(destDir, basename(src)), { recursive: true });
}
async function moveEntry(src, destDir) {
  await promises.rename(src, join(destDir, basename(src)));
}
async function makeDir(path) {
  await promises.mkdir(path, { recursive: true });
}
async function readGitBranch(rootPath) {
  try {
    let gitDir = join(rootPath, ".git");
    const stat2 = await promises.stat(gitDir);
    if (stat2.isFile()) {
      const content = (await promises.readFile(gitDir, "utf8")).trim();
      const m = content.match(/^gitdir:\s*(.+)$/);
      if (m) gitDir = resolve$1(rootPath, m[1]);
    }
    const head = (await promises.readFile(join(gitDir, "HEAD"), "utf8")).trim();
    const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (ref) return ref[1];
    return head.slice(0, 7);
  } catch {
    return null;
  }
}
async function readSettings(filePath) {
  try {
    const raw = await promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
async function writeSettings(filePath, settings) {
  await promises.mkdir(dirname(filePath), { recursive: true });
  await promises.writeFile(filePath, JSON.stringify(settings, null, 2), "utf8");
}
const pExecFile$1 = promisify(execFile);
function assertSafeTool(tool) {
  if (!/^[a-z0-9._-]+$/i.test(tool)) {
    throw new Error(`Unsafe formatter name: ${tool}`);
  }
}
async function resolveBin(rootPath, tool) {
  const base = join(rootPath, "node_modules", ".bin", tool);
  const candidates = process.platform === "win32" ? [`${base}.cmd`, base] : [base];
  for (const candidate of candidates) {
    try {
      await promises.access(candidate);
      return candidate;
    } catch {
    }
  }
  throw new Error(`${tool} is not installed in this project (node_modules/.bin/${tool} not found)`);
}
async function runFormatter(rootPath, tool, args) {
  assertSafeTool(tool);
  const bin = await resolveBin(rootPath, tool);
  const useShell = process.platform === "win32" && bin.endsWith(".cmd");
  try {
    const { stderr } = await pExecFile$1(bin, args, {
      cwd: rootPath,
      shell: useShell,
      maxBuffer: 16 * 1024 * 1024
    });
    return { code: 0, stderr: stderr ?? "" };
  } catch (e) {
    const ex = e;
    return {
      code: typeof ex.code === "number" ? ex.code : 1,
      stderr: ex.stderr ?? ex.message ?? ""
    };
  }
}
async function formatText(rootPath, tool, args, input) {
  assertSafeTool(tool);
  const bin = await resolveBin(rootPath, tool);
  const useShell = process.platform === "win32" && bin.endsWith(".cmd");
  return new Promise((resolve2) => {
    const child = spawn(bin, args, { cwd: rootPath, shell: useShell });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => stdout += d.toString());
    child.stderr.on("data", (d) => stderr += d.toString());
    child.on("error", (e) => resolve2({ stdout: "", stderr: e.message, code: 1 }));
    child.on("close", (code) => resolve2({ stdout, stderr, code: code ?? 1 }));
    child.stdin.on("error", () => {
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}
const pExecFile = promisify(execFile);
const MAX_DIAGNOSTICS = 5e3;
function parseTscOutput(output) {
  const diagnostics = [];
  const line = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
  for (const raw of output.split(/\r?\n/)) {
    if (diagnostics.length >= MAX_DIAGNOSTICS) break;
    const m = line.exec(raw);
    if (!m) continue;
    diagnostics.push({
      file: m[1],
      line: Number(m[2]),
      col: Number(m[3]),
      severity: m[4],
      code: m[5],
      message: m[6]
    });
  }
  return diagnostics;
}
async function exists(path) {
  try {
    await promises.access(path);
    return true;
  } catch {
    return false;
  }
}
async function runDiagnostics(rootPath) {
  const bin = join(rootPath, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  if (!await exists(bin)) {
    throw new Error("TypeScript (tsc) is not installed in this project.");
  }
  const args = ["--noEmit", "--pretty", "false"];
  if (await exists(join(rootPath, "tsconfig.json"))) args.push("-p", "tsconfig.json");
  try {
    const { stdout } = await pExecFile(bin, args, { cwd: rootPath, maxBuffer: 64 * 1024 * 1024 });
    return parseTscOutput(stdout);
  } catch (e) {
    const ex = e;
    if (typeof ex.stdout === "string") return parseTscOutput(ex.stdout);
    throw e;
  }
}
const TIMEOUT_MS = 4e3;
const MAX_LOGS = 2e3;
const SENTINEL = "\0FORGE";
const SHIM = `
const util = require('util');
const Module = require('module');
const TARGET = process.env.FORGE_RUN_TARGET || '';
// A component file (.tsx/.jsx) imports things that can't load standalone: relative paths that
// don't exist next to the temp snippet, CSS/asset imports, ESM-only packages. Left alone, the
// first failing import throws and the process dies before any console.log runs. Stub such
// imports with a permissive proxy so top-level logging still executes. Real packages resolvable
// via NODE_PATH (react, lodash, …) load normally — only genuinely unloadable ids are stubbed.
const STUB_CODES = new Set(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND', 'ERR_REQUIRE_ESM']);
function makeStub() {
  const fn = function () { return stub; };
  const stub = new Proxy(fn, {
    get(_t, prop) {
      if (prop === '__esModule') return true;
      // A private marker so logged stub values can be shown as a readable placeholder instead of a
      // confusing function/proxy dump — they stand in for imports (store hooks, context) we
      // couldn't resolve standalone. (A real value never has this key.)
      if (prop === '__FORGE_STUB__') return true;
      if (typeof prop === 'symbol') return undefined;
      return stub;
    },
    apply() { return stub; },
    construct() { return stub; },
  });
  return stub;
}
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  try {
    return origRequire.apply(this, arguments);
  } catch (e) {
    if (e && STUB_CODES.has(e.code)) return makeStub();
    throw e;
  }
};
const SENTINEL = ${JSON.stringify(SENTINEL)};
const MAX_LOGS = ${MAX_LOGS};
let count = 0;
function emit(obj) {
  try { process.stdout.write(SENTINEL + JSON.stringify(obj) + '\\n'); } catch (e) {}
}
function lineFromStack(stack) {
  if (!stack) return null;
  for (const frame of String(stack).split('\\n')) {
    const idx = frame.indexOf(TARGET);
    if (idx === -1) continue;
    const m = frame.slice(idx + TARGET.length).match(/^:(\\d+):(\\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}
function isStub(a) {
  try { return a != null && a.__FORGE_STUB__ === true; } catch (e) { return false; }
}
function render(args) {
  return args
    .map((a) => {
      if (isStub(a)) return '<unresolved import>';
      return typeof a === 'string' ? a : util.inspect(a, { depth: 2, colors: false, breakLength: Infinity, maxArrayLength: 100, maxStringLength: 1000 });
    })
    .join(' ');
}
function capture(level, args) {
  if (count >= MAX_LOGS) return;
  count++;
  emit({ line: lineFromStack(new Error().stack), level: level, text: render(args) });
}
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => capture(level, args);
}
process.on('uncaughtException', (e) => {
  const stack = e && e.stack ? String(e.stack) : String(e);
  emit({ line: lineFromStack(stack), level: 'error', text: stack.split('\\n')[0] });
  process.exit(0);
});
process.on('unhandledRejection', (e) => {
  const msg = e && e.message ? e.message : String(e);
  emit({ line: null, level: 'error', text: 'Unhandled rejection: ' + msg });
});
`;
const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function decodeVlq(segment) {
  const result = [];
  let shift = 0;
  let value = 0;
  for (const ch of segment) {
    const digit = VLQ_CHARS.indexOf(ch);
    if (digit === -1) continue;
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      result.push(value & 1 ? -(value >> 1) : value >> 1);
      value = 0;
      shift = 0;
    }
  }
  return result;
}
function buildLineMap(mappings) {
  const map = /* @__PURE__ */ new Map();
  let origLine = 0;
  const groups = mappings.split(";");
  for (let genLine = 0; genLine < groups.length; genLine++) {
    if (!groups[genLine]) continue;
    let recorded = false;
    for (const seg of groups[genLine].split(",")) {
      if (!seg) continue;
      const fields = decodeVlq(seg);
      if (fields.length < 3) continue;
      origLine += fields[2];
      if (!recorded) {
        map.set(genLine + 1, origLine + 1);
        recorded = true;
      }
    }
  }
  return map;
}
function transpile(code, languageId) {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      allowJs: true,
      removeComments: false,
      sourceMap: true
    },
    reportDiagnostics: false,
    fileName: languageId === "typescript" ? "snippet.tsx" : "snippet.jsx"
  });
  const out = result.outputText.replace(/\n\/\/# sourceMappingURL=.*\s*$/, "");
  let lineMap = /* @__PURE__ */ new Map();
  if (result.sourceMapText) {
    try {
      lineMap = buildLineMap(JSON.parse(result.sourceMapText).mappings);
    } catch {
    }
  }
  return { code: out, lineMap };
}
function ancestorNodeModules(startDir) {
  const dirs = [];
  let cur = startDir;
  for (; ; ) {
    dirs.push(join(cur, "node_modules"));
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return dirs;
}
function execute(targetPath, shimPath, filePath, reactRender = false) {
  const cwd = isAbsolute(filePath) ? dirname(filePath) : tmpdir();
  const env = {
    ...process.env,
    // Run the bundled Electron binary as a plain Node process.
    ELECTRON_RUN_AS_NODE: "1",
    FORGE_RUN_TARGET: targetPath,
    // Let `require('some-dep')` resolve against the project's installed modules, walking up from
    // the file's own directory the way Node would if the snippet lived there.
    NODE_PATH: isAbsolute(filePath) ? ancestorNodeModules(dirname(filePath)).join(delimiter) : "",
    // Render in production mode so React's dev-only console.error/warn warnings (which our shim
    // would otherwise capture and surface as inline output) stay silent — the component body and
    // the user's own logs still run.
    ...reactRender ? { NODE_ENV: "production" } : {}
  };
  return new Promise((resolve2) => {
    const child = spawn(process.execPath, ["--require", shimPath, targetPath], { cwd, env });
    const logs = [];
    let buffer = "";
    let timedOut = false;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve2({ logs, timedOut });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith(SENTINEL)) continue;
        try {
          logs.push(JSON.parse(line.slice(SENTINEL.length)));
        } catch {
        }
      }
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (e) => {
      logs.push({ line: null, level: "error", text: e.message });
      finish();
    });
    child.on("close", () => {
      if (stderr.trim() && logs.length === 0) {
        logs.push({ line: null, level: "error", text: stderr.trim().split("\n")[0] });
      }
      finish();
    });
  });
}
function isReactFile(filePath, code) {
  return /\.[jt]sx$/.test(filePath) || /\bfrom\s+['"]react['"]/.test(code) || /\brequire\(\s*['"]react['"]\s*\)/.test(code);
}
function hasReactDom(startDir) {
  return ancestorNodeModules(startDir).some((nm) => existsSync(join(nm, "react-dom")));
}
const REACT_RENDER_WRAPPER = `
;(() => {
  try {
    const React = require('react');
    const RDS = require('react-dom/server');
    const m = module.exports || {};
    let fn = typeof m.default === 'function' ? m.default : null;
    if (!fn) {
      for (const k of Object.keys(m)) {
        if (k !== 'default' && typeof m[k] === 'function' && /^[A-Z]/.test(k)) { fn = m[k]; break; }
      }
    }
    if (typeof fn === 'function') RDS.renderToStaticMarkup(React.createElement(fn));
  } catch (__e) {
    // Render threw (e.g. a missing context provider). Logs emitted before the throw were already
    // captured, so swallow it rather than letting it mask them.
  }
})();
`;
function getExportToRun(code) {
  if (/export\s+(async\s+)?function\s+main\s*\(/.test(code)) return "main";
  if (/export\s+(const|let|var)\s+main\s*=/.test(code)) return "main";
  if (/export\s+default/.test(code)) return "__default__";
  const matches = code.match(/export\s+(?:async\s+)?(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
  if (matches && matches.length === 1) {
    const nameMatch = matches[0].match(/(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (nameMatch) return nameMatch[1];
  }
  return null;
}
async function runInline(code, filePath, languageId, runExport = false) {
  let toRun = code;
  let reactRender = false;
  if (isReactFile(filePath, code) && isAbsolute(filePath) && hasReactDom(dirname(filePath))) {
    reactRender = true;
    toRun = `${code}
${REACT_RENDER_WRAPPER}`;
  } else if (runExport) {
    const exportName = getExportToRun(code);
    if (exportName) {
      const invoke = exportName === "__default__" ? "exports.default" : `exports.${exportName}`;
      toRun = `${code}
;(async () => {
  const __forgeFn = ${invoke};
  if (typeof __forgeFn === 'function') {
    try { await __forgeFn(); } catch (__e) {}
  }
})();
`;
    }
  }
  const { code: transpiled, lineMap } = transpile(toRun, languageId);
  const dir = await mkdtemp(join(tmpdir(), "forge-run-"));
  const targetPath = join(dir, "snippet.cjs");
  const shimPath = join(dir, "shim.cjs");
  await writeFile(targetPath, transpiled, "utf8");
  await writeFile(shimPath, SHIM, "utf8");
  try {
    const result = await execute(targetPath, shimPath, filePath, reactRender);
    for (const log of result.logs) {
      if (log.line != null) log.line = lineMap.get(log.line) ?? log.line;
    }
    return result;
  } finally {
    void rm(dir, { recursive: true, force: true });
  }
}
const EXTENSIONS = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
async function isFile(path) {
  try {
    return (await promises.stat(path)).isFile();
  } catch {
    return false;
  }
}
async function probe(noExt) {
  if (await isFile(noExt)) return noExt;
  for (const ext of EXTENSIONS) {
    if (await isFile(noExt + ext)) return noExt + ext;
  }
  for (const ext of EXTENSIONS) {
    const indexed = join(noExt, `index${ext}`);
    if (await isFile(indexed)) return indexed;
  }
  return null;
}
function parseJsonish$1(raw) {
  try {
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}
async function findConfigDir(startDir, rootPath) {
  let dir = startDir;
  for (; ; ) {
    if (await isFile(join(dir, "tsconfig.json"))) return dir;
    if (dir === rootPath) return rootPath;
    const parent = dirname(dir);
    if (parent === dir) return rootPath;
    dir = parent;
  }
}
async function readTsPaths(configDir) {
  const tsconfigPath = join(configDir, "tsconfig.json");
  const raw = await promises.readFile(tsconfigPath, "utf8").catch(() => null);
  const config = raw ? parseJsonish$1(raw) : null;
  const compiler = config?.compilerOptions ?? {};
  let paths = compiler.paths ?? {};
  const baseUrl = compiler.baseUrl ?? ".";
  if (typeof config?.extends === "string" && Object.keys(paths).length === 0) {
    const baseRaw = await promises.readFile(resolve$1(dirname(tsconfigPath), config.extends), "utf8").catch(() => null);
    const base = baseRaw ? parseJsonish$1(baseRaw) : null;
    const baseCompiler = base?.compilerOptions ?? {};
    paths = { ...baseCompiler.paths ?? {}, ...paths };
  }
  return { baseDir: resolve$1(configDir, baseUrl), paths };
}
function tsPathCandidates(spec, paths) {
  const out = [];
  if (paths[spec]) out.push(...paths[spec]);
  for (const key of Object.keys(paths)) {
    const star = key.indexOf("*");
    if (star === -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (spec.startsWith(prefix) && spec.endsWith(suffix) && spec.length >= prefix.length + suffix.length) {
      const captured = spec.slice(prefix.length, spec.length - suffix.length);
      for (const target of paths[key]) out.push(target.replace("*", captured));
    }
  }
  return out;
}
async function resolveInNodeModulesDir(modulesRoot, spec) {
  const pkgDir = join(modulesRoot, "node_modules", spec);
  const pkgJson = parseJsonish$1(await promises.readFile(join(pkgDir, "package.json"), "utf8").catch(() => "") || "{}");
  const entry = pkgJson?.types ?? pkgJson?.typings ?? pkgJson?.main;
  if (entry) {
    const resolved = await probe(join(pkgDir, entry));
    if (resolved) return resolved;
  }
  return probe(pkgDir);
}
async function resolveNodeModule(rootPath, fromFile, spec) {
  let dir = dirname(fromFile);
  for (; ; ) {
    const resolved = await resolveInNodeModulesDir(dir, spec);
    if (resolved) return resolved;
    if (dir === rootPath) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolveInNodeModulesDir(rootPath, spec);
}
async function resolveImport(rootPath, fromFile, spec) {
  if (spec.startsWith(".")) {
    return probe(resolve$1(dirname(fromFile), spec));
  }
  if (isAbsolute(spec)) {
    return probe(spec);
  }
  const configDir = await findConfigDir(dirname(fromFile), rootPath);
  const { baseDir, paths } = await readTsPaths(configDir);
  for (const candidate of tsPathCandidates(spec, paths)) {
    const resolved = await probe(resolve$1(baseDir, candidate));
    if (resolved) return resolved;
  }
  return resolveNodeModule(rootPath, fromFile, spec);
}
const DEFAULT_MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS$1 = 12e4;
function defaultModel(provider) {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4-6";
    case "openai":
      return "gpt-4o";
    default:
      return "";
  }
}
function streamAiChat(cfg, req, onDelta, onDone) {
  switch (cfg.provider) {
    case "anthropic":
      return streamAnthropic(cfg, req, onDelta, onDone);
    case "openai":
      return streamOpenAI(cfg, req, onDelta, onDone);
    default:
      return streamClaudeCli(cfg, req, onDelta, onDone);
  }
}
function buildCliStdin(req) {
  const parts = [];
  if (req.context) parts.push(req.context);
  if (req.history.length) {
    const turns = req.history.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n\n");
    parts.push(`# Conversation so far

${turns}`);
  }
  return parts.join("\n\n---\n\n");
}
function streamClaudeCli(cfg, req, onDelta, onDone) {
  const args = [
    "-p",
    req.question,
    "--append-system-prompt",
    req.system,
    "--max-turns",
    "1",
    "--allowed-tools",
    "",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose"
  ];
  if (cfg.model) args.push("--model", cfg.model);
  const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  let stderr = "";
  let resultError;
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let evt;
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      if (evt.type === "stream_event" && evt.event?.type === "content_block_delta" && evt.event.delta?.type === "text_delta" && typeof evt.event.delta.text === "string") {
        onDelta(evt.event.delta.text);
      } else if (evt.type === "result" && (evt.is_error || evt.subtype !== "success")) {
        resultError = evt.result || `Claude failed (${evt.subtype ?? "error"}).`;
      }
    }
  });
  child.stderr.on("data", (d) => stderr += d.toString());
  const timer = setTimeout(() => {
    resultError = "Claude timed out.";
    child.kill();
  }, REQUEST_TIMEOUT_MS$1);
  child.on("error", (e) => {
    clearTimeout(timer);
    onDone(
      e.code === "ENOENT" ? "Claude Code CLI (`claude`) not found on PATH. Install it or pick an API provider in Settings → AI." : `Could not run claude: ${e.message}`
    );
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code === 0) onDone(resultError);
    else onDone(resultError || stderr.trim() || `claude exited with code ${code}.`);
  });
  const stdin = buildCliStdin(req);
  if (stdin) child.stdin.write(stdin);
  child.stdin.end();
  return { cancel: () => child.kill() };
}
async function readSse(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep2;
    while ((sep2 = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, sep2);
      buf = buf.slice(sep2 + 2);
      let event = "message";
      const dataLines = [];
      for (const raw of block.split("\n")) {
        if (raw.startsWith("event:")) event = raw.slice(6).trim();
        else if (raw.startsWith("data:")) dataLines.push(raw.slice(5).replace(/^ /, ""));
      }
      if (dataLines.length) onEvent(event, dataLines.join("\n"));
    }
  }
}
function streamAnthropic(cfg, req, onDelta, onDone) {
  const ctrl = new AbortController();
  void (async () => {
    if (!cfg.apiKey) {
      onDone("No Anthropic API key set. Add one in Settings → AI.");
      return;
    }
    const messages = [
      ...req.history,
      { role: "user", content: req.context ? `${req.context}

${req.question}` : req.question }
    ];
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS$1);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: req.system,
          messages,
          stream: true,
          ...req.stopSequences?.length ? { stop_sequences: req.stopSequences } : {}
        }),
        signal: ctrl.signal
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        onDone(`Anthropic API error ${res.status}: ${truncate(text)}`);
        return;
      }
      await readSse(res.body, (event, data) => {
        if (event === "content_block_delta") {
          try {
            const d = JSON.parse(data);
            if (d.delta?.type === "text_delta" && d.delta.text) onDelta(d.delta.text);
          } catch {
          }
        } else if (event === "error") {
          try {
            const d = JSON.parse(data);
            onDone(`Anthropic error: ${d.error?.message ?? data}`);
          } catch {
            onDone(`Anthropic error: ${data}`);
          }
        }
      });
      onDone();
    } catch (e) {
      onDone(`Anthropic request failed: ${e.message}`);
    } finally {
      clearTimeout(timer);
    }
  })();
  return { cancel: () => ctrl.abort() };
}
function streamOpenAI(cfg, req, onDelta, onDone) {
  const ctrl = new AbortController();
  void (async () => {
    if (!cfg.apiKey) {
      onDone("No OpenAI API key set. Add one in Settings → AI.");
      return;
    }
    const messages = [
      { role: "system", content: req.system },
      ...req.history,
      { role: "user", content: req.context ? `${req.context}

${req.question}` : req.question }
    ];
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS$1);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          stream: true,
          ...req.stopSequences?.length ? { stop: req.stopSequences } : {}
        }),
        signal: ctrl.signal
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        onDone(`OpenAI API error ${res.status}: ${truncate(text)}`);
        return;
      }
      await readSse(res.body, (_event, data) => {
        if (data === "[DONE]") return;
        try {
          const d = JSON.parse(data);
          const piece = d.choices?.[0]?.delta?.content;
          if (piece) onDelta(piece);
        } catch {
        }
      });
      onDone();
    } catch (e) {
      onDone(`OpenAI request failed: ${e.message}`);
    } finally {
      clearTimeout(timer);
    }
  })();
  return { cancel: () => ctrl.abort() };
}
function truncate(s, max = 300) {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
const SYSTEM_PROMPT$2 = "You write clear, conventional git commit messages.";
const INSTRUCTION = [
  "Write a git commit message for the staged/working changes in the diff above.",
  "Rules:",
  '- Use the imperative mood ("Add", "Fix", "Refactor"), not past tense.',
  "- First line: a concise summary under 72 characters. No trailing period.",
  '- If the change is non-trivial, add a blank line then 1-3 short bullet points ("- …").',
  "- Describe what changed and why, not the mechanics of the diff.",
  "- Do NOT wrap the message in quotes, backticks, or markdown code fences.",
  "- Output ONLY the commit message — no preamble, no explanation."
].join("\n");
function cleanMessage(raw) {
  let m = raw.trim();
  if (m.startsWith("```")) m = m.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "").trim();
  if (m.length > 1 && m.startsWith('"') && m.endsWith('"')) m = m.slice(1, -1).trim();
  return m;
}
async function generateCommitMessage(cfg, rootPath) {
  const diff = await getCommitDiff(rootPath);
  if (!diff.trim()) throw new Error("No changes to describe.");
  const text = await new Promise((resolve2, reject) => {
    let out = "";
    streamAiChat(
      cfg,
      { system: SYSTEM_PROMPT$2, history: [], question: INSTRUCTION, context: diff, maxTokens: 512 },
      (delta) => {
        out += delta;
      },
      (error) => error ? reject(new Error(error)) : resolve2(out)
    );
  });
  const message = cleanMessage(text);
  if (!message) throw new Error("The AI returned an empty message.");
  return message;
}
const SYSTEM_PROMPT$1 = [
  "You are the coding assistant built into the Forge code editor.",
  "Answer the user about the open file and their question. Be concise and practical; lead with the",
  "answer, then brief detail. Use GitHub-flavored markdown (fenced code blocks for code). When you",
  "reference the open file, cite line numbers where it helps. Do not invent files you were not given."
].join(" ");
const active$2 = /* @__PURE__ */ new Map();
const cancelled$2 = /* @__PURE__ */ new Set();
function fileContext(file) {
  if (!file) return void 0;
  return `# Open file: ${file.name}

\`\`\`${file.language}
${file.content}
\`\`\``;
}
function startAssistant(cfg, args, onDelta, onDone) {
  const handle = streamAiChat(
    cfg,
    {
      system: SYSTEM_PROMPT$1,
      history: (args.history ?? []).map((t) => ({ role: t.role, content: t.text })),
      question: args.question,
      context: fileContext(args.file),
      maxTokens: 4096
    },
    onDelta,
    (error) => {
      const wasCancelled = cancelled$2.delete(args.id);
      active$2.delete(args.id);
      onDone(wasCancelled ? void 0 : error);
    }
  );
  active$2.set(args.id, handle);
}
function cancelAssistant(id) {
  const handle = active$2.get(id);
  if (!handle) return;
  cancelled$2.add(id);
  handle.cancel();
}
const PLAN_SYSTEM = [
  "You are the autonomous coding agent built into the Forge code editor.",
  "You are given a development task and a snapshot of the workspace (a file tree and the contents",
  "of the currently open files). Produce a concise, ordered implementation plan.",
  "Respond with ONLY a single fenced ```json code block and no prose before or after it.",
  "The JSON must match exactly this shape:",
  '{"summary": string, "steps": string[], "filesToEdit": [{"path": string, "reason": string}], "commands": string[]}',
  '- "summary": one or two sentences describing the approach.',
  '- "steps": short, actionable steps in order.',
  '- "filesToEdit": ONLY the workspace-relative paths you will actually change or create, each with a short reason. Prefer files visible in the provided tree; you may list a new file that does not exist yet.',
  '- "commands": zero or more verification commands to run afterwards (e.g. "npm run type-check", "npm test"). Use an empty array if none apply.',
  "Keep it tight. Do not invent files that clearly do not belong to this project."
].join(" ");
const EDIT_SYSTEM = [
  "You are the autonomous coding agent built into the Forge code editor.",
  "Implement the approved plan. You are given the task, the plan, and the full current contents of",
  'the target files (a file shown as "(new file)" does not exist yet).',
  "Respond with ONLY a single fenced ```json code block and no prose before or after it.",
  "The JSON must match exactly this shape:",
  '{"patches": [{"path": string, "content": string, "description": string}]}',
  '- "path": workspace-relative path of the file to write.',
  '- "content": the COMPLETE new contents of the file (never a diff or a fragment).',
  '- "description": one line describing the change.',
  "Preserve the existing code style, imports, and formatting conventions of the project.",
  "Only include files you are actually changing. Do not include unchanged files."
].join(" ");
function systemFor(phase) {
  return phase === "plan" ? PLAN_SYSTEM : EDIT_SYSTEM;
}
const active$1 = /* @__PURE__ */ new Map();
const cancelled$1 = /* @__PURE__ */ new Set();
function runAgentCompletion(cfg, args) {
  return new Promise((resolve2, reject) => {
    let text = "";
    const handle = streamAiChat(
      cfg,
      {
        system: systemFor(args.phase),
        history: [],
        question: args.question,
        context: args.context,
        // Edits can rewrite whole files, so allow plenty of output room.
        maxTokens: args.phase === "edit" ? 16384 : 4096
      },
      (delta) => {
        text += delta;
      },
      (error) => {
        const wasCancelled = cancelled$1.delete(args.id);
        active$1.delete(args.id);
        if (wasCancelled) reject(new Error("Agent request cancelled."));
        else if (error) reject(new Error(error));
        else resolve2(text);
      }
    );
    active$1.set(args.id, handle);
  });
}
function cancelAgent(id) {
  const handle = active$1.get(id);
  if (!handle) return;
  cancelled$1.add(id);
  handle.cancel();
}
function parseIni(text) {
  const entries = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      current = { name: header[1].trim(), values: {} };
      entries.push(current);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1 || !current) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key) current.values[key] = value;
  }
  return entries;
}
const run$2 = promisify(execFile);
const CONFIG_PATH = join(homedir(), ".aws", "config");
const CREDENTIALS_PATH$1 = join(homedir(), ".aws", "credentials");
const CONFIG_LABEL = "~/.aws/config";
const CREDENTIALS_LABEL = "~/.aws/credentials";
function awsConfigPaths() {
  return { config: CONFIG_PATH, credentials: CREDENTIALS_PATH$1 };
}
async function readIniFile(path) {
  try {
    return parseIni(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}
async function listProfiles() {
  const [config, credentials] = await Promise.all([
    readIniFile(CONFIG_PATH),
    readIniFile(CREDENTIALS_PATH$1)
  ]);
  const byName = /* @__PURE__ */ new Map();
  for (const { name, values } of config) {
    if (name === "default") {
      byName.set("default", toProfile("default", values, CONFIG_LABEL));
    } else if (name.startsWith("profile ")) {
      const profileName = name.slice("profile ".length).trim();
      if (profileName) byName.set(profileName, toProfile(profileName, values, CONFIG_LABEL));
    }
  }
  for (const { name, values } of credentials) {
    if (byName.has(name)) continue;
    byName.set(name, toProfile(name, values, CREDENTIALS_LABEL));
  }
  return [...byName.values()];
}
function toProfile(name, values, source) {
  const isSso = Boolean(values.sso_session || values.sso_start_url || values.sso_account_id);
  return {
    name,
    kind: isSso ? "sso" : "iam",
    source,
    region: values.region
  };
}
async function validateProfile(name) {
  try {
    const { stdout } = await run$2(
      "aws",
      ["sts", "get-caller-identity", "--profile", name, "--output", "json"],
      { timeout: 15e3, maxBuffer: 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout);
    return { valid: true, accountId: parsed.Account };
  } catch (err2) {
    return { valid: false, error: errorMessage(err2) };
  }
}
function errorMessage(err2) {
  const stderr = err2?.stderr;
  if (typeof stderr === "string" && stderr.trim()) {
    return stderr.trim().split(/\r?\n/)[0];
  }
  return err2 instanceof Error ? err2.message : "Unknown error";
}
let activeProfile = null;
let activeRegion = null;
function setActiveProfile(profile, region = null) {
  activeProfile = profile && profile.trim() ? profile : null;
  activeRegion = region && region.trim() ? region : null;
}
function getActiveProfile() {
  return { profile: activeProfile, region: activeRegion };
}
function getActiveAwsEnv() {
  const env = {};
  if (activeProfile) env.AWS_PROFILE = activeProfile;
  if (activeRegion) {
    env.AWS_REGION = activeRegion;
    env.AWS_DEFAULT_REGION = activeRegion;
  }
  return env;
}
const running = /* @__PURE__ */ new Map();
const DEFAULT_TIMEOUT_MS = 12e4;
const MAX_CAPTURE = 2e5;
function loginShell() {
  if (process.platform === "win32") return { shell: process.env.COMSPEC ?? "cmd.exe", flag: "/c" };
  return { shell: process.env.SHELL ?? "/bin/zsh", flag: "-lc" };
}
function keepTail(s) {
  return s.length > MAX_CAPTURE ? s.slice(s.length - MAX_CAPTURE) : s;
}
function runAgentCommand(args) {
  return new Promise((resolve2) => {
    const { shell: shell2, flag } = loginShell();
    const startedAt = Date.now();
    let child;
    try {
      child = spawn(shell2, [flag, args.command], {
        cwd: args.cwd,
        env: { ...process.env, ...getActiveAwsEnv() }
      });
    } catch (e) {
      resolve2({
        command: args.command,
        exitCode: null,
        stdout: "",
        stderr: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - startedAt,
        timedOut: false
      });
      return;
    }
    running.set(args.id, child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    child.stdout?.on("data", (d) => {
      stdout = keepTail(stdout + d.toString());
    });
    child.stderr?.on("data", (d) => {
      stderr = keepTail(stderr + d.toString());
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(args.id);
      resolve2({
        command: args.command,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut
      });
    };
    child.on("error", (e) => {
      stderr = keepTail(stderr + (e instanceof Error ? e.message : String(e)));
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}
function cancelAgentCommand(id) {
  running.get(id)?.kill("SIGKILL");
  running.delete(id);
}
function extractGqlOperations(text) {
  const ops = [];
  const seen = /* @__PURE__ */ new Set();
  const src = text.replace(/#[^\n]*/g, "");
  const named = /\b(query|mutation|subscription|fragment)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = named.exec(src)) !== null) {
    const type = m[1];
    const name = m[2];
    const key = `${type}:${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      ops.push({ type, name });
    }
  }
  const anon = /\b(query|mutation|subscription)\s*[({]/g;
  while ((m = anon.exec(src)) !== null) {
    const after = src.slice(m.index + m[1].length).trimStart();
    if (/^[A-Za-z_]/.test(after)) continue;
    const key = `${m[1]}:(anonymous)`;
    if (!seen.has(key)) {
      seen.add(key);
      ops.push({ type: m[1], name: "(anonymous)" });
    }
  }
  return ops;
}
const CODE_EXT$1 = /\.(tsx?|jsx?|mjs|cjs)$/i;
const GQL_EXT$1 = /\.(graphql|gql)$/i;
const STYLE_EXT = /\.(css|scss|less|sass)$/i;
function isSourceFile(rel) {
  return CODE_EXT$1.test(rel) || GQL_EXT$1.test(rel) || STYLE_EXT.test(rel);
}
function scriptKind(fileName) {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.(mjs|cjs|js)$/i.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
function isPascalCase$1(name) {
  return /^[A-Z]/.test(name) && /[a-z]/.test(name) && name.length > 1;
}
function hasExportModifier(node) {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);
}
function hasDefaultModifier(node) {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false);
}
function parseSource(fileName, text) {
  const isJsxFile = /\.(tsx|jsx)$/i.test(fileName);
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const imports = [];
  const exportNames = /* @__PURE__ */ new Set();
  const gqlOps = [];
  const gqlSeen = /* @__PURE__ */ new Set();
  let hasJsx = false;
  const addGql = (raw) => {
    for (const op of extractGqlOperations(raw)) {
      const key = `${op.type}:${op.name}`;
      if (!gqlSeen.has(key)) {
        gqlSeen.add(key);
        gqlOps.push(op);
      }
    }
  };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const clause = st.importClause;
      const names = [];
      let namespace = false;
      let def = false;
      if (clause) {
        if (clause.name) def = true;
        const nb = clause.namedBindings;
        if (nb) {
          if (ts.isNamespaceImport(nb)) namespace = true;
          else for (const el of nb.elements) names.push(el.name.text);
        }
      }
      imports.push({ spec: st.moduleSpecifier.text, names, namespace, default: def });
    } else if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        const spec = st.moduleSpecifier.text;
        if (st.exportClause && ts.isNamedExports(st.exportClause)) {
          const names = st.exportClause.elements.map((e) => e.name.text);
          for (const n of names) exportNames.add(n);
          imports.push({ spec, names, namespace: false, default: false });
        } else {
          imports.push({ spec, names: [], namespace: true, default: false });
        }
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const e of st.exportClause.elements) exportNames.add(e.name.text);
      }
    } else if (ts.isExportAssignment(st)) {
      if (!st.isExportEquals) exportNames.add("default");
    } else if (ts.isFunctionDeclaration(st) && hasExportModifier(st)) {
      if (hasDefaultModifier(st)) exportNames.add("default");
      if (st.name) exportNames.add(st.name.text);
    } else if (ts.isClassDeclaration(st) && hasExportModifier(st)) {
      if (hasDefaultModifier(st)) exportNames.add("default");
      if (st.name) exportNames.add(st.name.text);
    } else if (ts.isVariableStatement(st) && hasExportModifier(st)) {
      for (const decl of st.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) exportNames.add(decl.name.text);
      }
    } else if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && hasExportModifier(st)) {
      exportNames.add(st.name.text);
    }
  }
  const visit = (node) => {
    if (!hasJsx && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))) {
      hasJsx = true;
    }
    if (ts.isTaggedTemplateExpression(node)) {
      const tag = node.tag;
      const tagName = ts.isIdentifier(tag) ? tag.text : ts.isPropertyAccessExpression(tag) ? tag.name.text : "";
      if (tagName === "gql" || tagName === "graphql") addGql(node.template.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const jsxCapable = isJsxFile || hasJsx;
  const components = [...exportNames].filter((n) => n !== "default" && isPascalCase$1(n) && jsxCapable);
  if (exportNames.has("default") && jsxCapable) {
    const baseName = (fileName.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
    if (isPascalCase$1(baseName) && !components.includes(baseName)) components.push(baseName);
  }
  const hooks = [...exportNames].filter((n) => /^use[A-Z0-9]/.test(n));
  return { imports, exports: [...exportNames], components, hooks, gqlOps };
}
const APP_SPECIAL = {
  page: "next-page",
  layout: "next-layout",
  route: "next-route",
  loading: "next-special",
  error: "next-special",
  "not-found": "next-special",
  template: "next-special",
  default: "next-special",
  "global-error": "next-special"
};
function nextInfo(rel) {
  const parts = rel.split("/");
  const base = parts[parts.length - 1];
  const appIdx = parts.lastIndexOf("app");
  const special = /^([a-z-]+)\.[tj]sx?$/.exec(base);
  if (appIdx !== -1 && special && APP_SPECIAL[special[1]]) {
    const segs = parts.slice(appIdx + 1, parts.length - 1).filter((p) => !(p.startsWith("(") && p.endsWith(")")));
    const route = "/" + segs.join("/");
    return { kind: APP_SPECIAL[special[1]], route: route.length > 1 ? route.replace(/\/$/, "") : "/" };
  }
  const pagesIdx = parts.lastIndexOf("pages");
  if (pagesIdx !== -1 && /\.[tj]sx?$/.test(base) && !base.startsWith("_")) {
    const segs = parts.slice(pagesIdx + 1, parts.length - 1);
    let file = base.replace(/\.[tj]sx?$/, "");
    if (file === "index") file = "";
    const route = "/" + [...segs, file].filter(Boolean).join("/");
    const kind = parts.includes("api") ? "next-route" : "next-page";
    return { kind, route: route === "" ? "/" : route };
  }
  return null;
}
function classifyKind(rel, parsed) {
  const base = rel.split("/").pop() ?? rel;
  if (GQL_EXT$1.test(base)) return "graphql";
  const nx = nextInfo(rel);
  if (nx) return nx.kind;
  if (/\.(test|spec)\.[tj]sx?$/.test(base) || /(^|\/)__tests__\//.test(rel)) return "test";
  if (/\.config\.[tj]s$/.test(base)) return "config";
  if (STYLE_EXT.test(base)) return "style";
  if (parsed.components.length) return "component";
  if (parsed.hooks.length) return "hook";
  if (parsed.gqlOps.length) return "graphql";
  if (parsed.imports.length || parsed.exports.length) return "module";
  return "other";
}
const PROBE_EXT = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".graphql", ".gql"];
function probeInSet(noExt, fileSet) {
  if (fileSet.has(noExt)) return noExt;
  for (const ext of PROBE_EXT) if (fileSet.has(noExt + ext)) return noExt + ext;
  for (const ext of PROBE_EXT) {
    const indexed = `${noExt}/index${ext}`;
    if (fileSet.has(indexed)) return indexed;
  }
  return null;
}
function parseJsonish(raw) {
  try {
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}
function createResolver(rootPath, fileSet, readText2) {
  const configByDir = /* @__PURE__ */ new Map();
  async function loadConfig(dir) {
    const cached = configByDir.get(dir);
    if (cached !== void 0) return cached;
    const tsconfigPath = `${dir}/tsconfig.json`;
    const raw = await readText2(tsconfigPath);
    let info = null;
    if (raw !== null) {
      const cfg = parseJsonish(raw);
      const compiler = cfg?.compilerOptions ?? {};
      let paths = compiler.paths ?? {};
      const baseUrl = compiler.baseUrl ?? ".";
      if (typeof cfg?.extends === "string" && Object.keys(paths).length === 0) {
        const baseRaw = await readText2(resolve$1(dir, cfg.extends));
        const base = baseRaw ? parseJsonish(baseRaw) : null;
        const baseCompiler = base?.compilerOptions ?? {};
        paths = { ...baseCompiler.paths ?? {}, ...paths };
      }
      info = { baseDir: resolve$1(dir, baseUrl), paths };
    }
    configByDir.set(dir, info);
    return info;
  }
  async function findConfig(fromDir) {
    let dir = fromDir;
    let fallback = null;
    for (; ; ) {
      const cfg = await loadConfig(dir);
      if (cfg && Object.keys(cfg.paths).length > 0) return cfg;
      if (cfg && !fallback) fallback = cfg;
      if (dir === rootPath) break;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return fallback;
  }
  return async function resolve2(fromAbs, spec) {
    if (spec.startsWith(".")) return probeInSet(resolve$1(dirname(fromAbs), spec), fileSet);
    if (isAbsolute(spec)) return probeInSet(spec, fileSet);
    const cfg = await findConfig(dirname(fromAbs));
    if (cfg) {
      for (const cand of tsPathCandidates(spec, cfg.paths)) {
        const hit = probeInSet(resolve$1(cfg.baseDir, cand), fileSet);
        if (hit) return hit;
      }
    }
    return null;
  };
}
function findCycles(adjacency, cap = 200) {
  let index = 0;
  const indices = /* @__PURE__ */ new Map();
  const low = /* @__PURE__ */ new Map();
  const onStack = /* @__PURE__ */ new Set();
  const stack = [];
  const cycles = [];
  for (const start of adjacency.keys()) {
    if (indices.has(start)) continue;
    const work = [{ node: start, i: 0 }];
    indices.set(start, index);
    low.set(start, index);
    index += 1;
    stack.push(start);
    onStack.add(start);
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const neighbours = adjacency.get(frame.node) ?? [];
      if (frame.i < neighbours.length) {
        const next = neighbours[frame.i];
        frame.i += 1;
        if (!indices.has(next)) {
          indices.set(next, index);
          low.set(next, index);
          index += 1;
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, i: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node), indices.get(next)));
        }
      } else {
        if (low.get(frame.node) === indices.get(frame.node)) {
          const scc = [];
          for (; ; ) {
            const w = stack.pop();
            onStack.delete(w);
            scc.push(w);
            if (w === frame.node) break;
          }
          const selfLoop = scc.length === 1 && (adjacency.get(scc[0]) ?? []).includes(scc[0]);
          if (scc.length >= 2 || selfLoop) cycles.push(scc.reverse());
        }
        work.pop();
        const parent = work[work.length - 1];
        if (parent) low.set(parent.node, Math.min(low.get(parent.node), low.get(frame.node)));
      }
      if (cycles.length >= cap) return cycles;
    }
  }
  return cycles;
}
const HIGH_RISK_PATTERNS = [
  { re: /(^|\/)(auth|authentication|authorization|session|permission|rbac|acl)(\/|\.|s\/|$)/, reason: "authentication / authorization code" },
  { re: /(^|\/)middleware\.[tj]sx?$/, reason: "routing middleware" },
  { re: /(^|\/)(router|routes|routing)(\/|\.|$)/, reason: "routing definition" },
  { re: /(generated|__generated__|\.generated\.)/, reason: "generated code (regenerate rather than hand-edit)" },
  { re: /(^|\/)graphql\.[tj]sx?$/, reason: "generated GraphQL types" },
  { re: /packages\/ui\//, reason: "shared UI package" },
  { re: /\/components\/ui\//, reason: "shared UI primitives" }
];
function isPublicApiBarrel(rel, exportsCount) {
  return exportsCount > 0 && /(packages\/[^/]+\/src\/index|(^|\/)src\/index)\.[tj]sx?$/.test(rel);
}
function classifyRisk(rel, usedByCount, exportsCount) {
  const reasons = [];
  const lower = rel.toLowerCase();
  for (const { re, reason } of HIGH_RISK_PATTERNS) {
    if (re.test(lower)) reasons.push(reason);
  }
  if (isPublicApiBarrel(rel, exportsCount)) reasons.push("public API barrel (re-exported widely)");
  if (reasons.length > 0) {
    reasons.push(`${usedByCount} file${usedByCount === 1 ? "" : "s"} depend on it`);
    return { risk: "high", reasons };
  }
  if (usedByCount >= 8) {
    return { risk: "high", reasons: [`${usedByCount} files depend on it`] };
  }
  if (usedByCount >= 3) {
    return { risk: "medium", reasons: [`${usedByCount} files depend on it`] };
  }
  return {
    risk: "low",
    reasons: usedByCount === 0 ? ["local-only (no dependents)"] : [`${usedByCount} file(s) depend on it`]
  };
}
function isEntrypoint(rel, kind, hasGql) {
  if (kind === "next-page" || kind === "next-layout" || kind === "next-route" || kind === "next-special") return true;
  if (kind === "test" || kind === "config" || kind === "graphql") return true;
  if (hasGql) return true;
  const base = rel.split("/").pop() ?? rel;
  if (/^index\.[tj]sx?$/.test(base)) return true;
  if (/^main\.[tj]sx?$/.test(base)) return true;
  if (/\.config\.[tj]sx?$/.test(base)) return true;
  if (/\.d\.ts$/.test(base)) return true;
  if (/(^|\/)middleware\.[tj]sx?$/.test(rel)) return true;
  return false;
}
const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;
const GQL_EXT = /\.(graphql|gql)$/i;
const MAX_FILES = 4e3;
const workspaces = /* @__PURE__ */ new Map();
function readText(path) {
  return promises.readFile(path, "utf8").catch(() => null);
}
function packageName(spec) {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
function parseByExt(rel, text) {
  if (CODE_EXT.test(rel)) return parseSource(rel, text);
  if (GQL_EXT.test(rel)) {
    return { imports: [], exports: [], components: [], hooks: [], gqlOps: extractGqlOperations(text) };
  }
  return { imports: [], exports: [], components: [], hooks: [], gqlOps: [] };
}
async function buildCodeMap(rootPath, settingsPath, force = false) {
  const existing = workspaces.get(rootPath);
  if (!force && existing?.map) return existing.map;
  const startedAt = Date.now();
  const settings = await readSettings(settingsPath).catch(() => ({}));
  const excludes = settings.searchExclude ?? [];
  const allFiles = await listFilesRecursive(rootPath, excludes);
  const fileSet = new Set(allFiles.map((f) => f.path));
  const nodeFiles = allFiles.filter((f) => isSourceFile(f.relPath) && !f.relPath.endsWith(".d.ts")).slice(0, MAX_FILES);
  const truncated = allFiles.filter((f) => isSourceFile(f.relPath) && !f.relPath.endsWith(".d.ts")).length > MAX_FILES;
  const prev = existing?.records ?? /* @__PURE__ */ new Map();
  const records = /* @__PURE__ */ new Map();
  let processed = 0;
  for (const f of nodeFiles) {
    let mtimeMs = 0;
    try {
      mtimeMs = (await promises.stat(f.path)).mtimeMs;
    } catch {
      continue;
    }
    const cached = prev.get(f.relPath);
    if (cached && cached.mtimeMs === mtimeMs) {
      records.set(f.relPath, cached);
    } else {
      const text = await readText(f.path);
      if (text === null) continue;
      const parsed = parseByExt(f.relPath, text);
      const kind = classifyKind(f.relPath, parsed);
      const route = nextInfo(f.relPath)?.route;
      records.set(f.relPath, {
        rel: f.relPath,
        abs: f.path,
        mtimeMs,
        loc: text.length === 0 ? 0 : text.split("\n").length,
        parsed,
        kind,
        route
      });
    }
    processed += 1;
    if (processed % 200 === 0) await new Promise((r) => setImmediate(r));
  }
  const resolve2 = createResolver(rootPath, fileSet, readText);
  const absToRel = /* @__PURE__ */ new Map();
  for (const r of records.values()) absToRel.set(r.abs, r.rel);
  const dependsOn = /* @__PURE__ */ new Map();
  const usedBy = /* @__PURE__ */ new Map();
  const external = /* @__PURE__ */ new Map();
  const usedNames = /* @__PURE__ */ new Map();
  const opaque = /* @__PURE__ */ new Set();
  for (const rel of records.keys()) {
    dependsOn.set(rel, /* @__PURE__ */ new Set());
    usedBy.set(rel, /* @__PURE__ */ new Set());
    external.set(rel, /* @__PURE__ */ new Set());
    usedNames.set(rel, /* @__PURE__ */ new Set());
  }
  for (const rec of records.values()) {
    for (const imp of rec.parsed.imports) {
      const targetAbs = await resolve2(rec.abs, imp.spec);
      const targetRel = targetAbs ? absToRel.get(targetAbs) : void 0;
      if (targetRel && targetRel !== rec.rel) {
        dependsOn.get(rec.rel).add(targetRel);
        usedBy.get(targetRel).add(rec.rel);
        if (imp.namespace) opaque.add(targetRel);
        if (imp.default) usedNames.get(targetRel).add("default");
        for (const n of imp.names) usedNames.get(targetRel).add(n);
      } else if (!imp.spec.startsWith(".") && !targetAbs) {
        external.get(rec.rel).add(packageName(imp.spec));
      }
    }
  }
  const nodes = [];
  for (const rec of records.values()) {
    const deps = [...dependsOn.get(rec.rel)].sort();
    const users = [...usedBy.get(rec.rel)].sort();
    const exts = [...external.get(rec.rel)].sort();
    const { risk, reasons } = classifyRisk(rec.rel, users.length, rec.parsed.exports.length);
    const canTrackNames = !opaque.has(rec.rel) && users.length > 0;
    const used = usedNames.get(rec.rel);
    const unusedExports = canTrackNames ? rec.parsed.exports.filter((e) => !used.has(e)) : [];
    const unused = users.length === 0 && rec.parsed.exports.length > 0 && !isEntrypoint(rec.rel, rec.kind, rec.parsed.gqlOps.length > 0);
    nodes.push({
      path: rec.abs,
      rel: rec.rel,
      name: rec.rel.split("/").pop() ?? rec.rel,
      kind: rec.kind,
      exports: rec.parsed.exports,
      components: rec.parsed.components,
      hooks: rec.parsed.hooks,
      gqlOps: rec.parsed.gqlOps,
      route: rec.route,
      dependsOn: deps,
      usedBy: users,
      externalDeps: exts,
      unusedExports,
      loc: rec.loc,
      risk,
      riskReasons: reasons,
      unused
    });
  }
  nodes.sort((a, b) => a.rel.localeCompare(b.rel));
  const adjacency = /* @__PURE__ */ new Map();
  for (const n of nodes) adjacency.set(n.rel, n.dependsOn);
  const cycles = findCycles(adjacency);
  const edgeCount = nodes.reduce((sum, n) => sum + n.dependsOn.length, 0);
  const gqlCount = nodes.reduce((sum, n) => sum + n.gqlOps.length, 0);
  const componentCount = nodes.reduce((sum, n) => sum + n.components.length, 0);
  const unusedCount = nodes.filter((n) => n.unused).length;
  const map = {
    root: rootPath,
    nodes,
    cycles,
    stats: {
      files: nodes.length,
      edges: edgeCount,
      components: componentCount,
      gqlOps: gqlCount,
      cycles: cycles.length,
      unused: unusedCount
    },
    generatedAt: Date.now(),
    truncated,
    durationMs: Date.now() - startedAt
  };
  workspaces.set(rootPath, { records, map });
  return map;
}
function scriptKindFor(fileName) {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.mjs$|\.cjs$|\.js$/i.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
function parse$1(fileName, code) {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
}
function isPascalCase(name) {
  return /^[A-Z]/.test(name) && /[a-z]/.test(name) && name.length > 1;
}
function isReactComponentFile(fileName) {
  return /\.(tsx|jsx)$/i.test(fileName);
}
function hasModifier(node, kind) {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false);
}
const COMPONENT_HOCS = /* @__PURE__ */ new Set(["memo", "forwardRef", "observer"]);
function unwrapComponentInitializer(expr) {
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return expr;
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : "";
    if (COMPONENT_HOCS.has(name)) {
      for (const arg of expr.arguments) {
        const fn = unwrapComponentInitializer(arg);
        if (fn) return fn;
      }
    }
  }
  return void 0;
}
function unwrapJsx(expr) {
  if (!expr) return void 0;
  let e = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return e;
  if (ts.isConditionalExpression(e)) return unwrapJsx(e.whenTrue) ?? unwrapJsx(e.whenFalse);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return unwrapJsx(e.right);
  }
  return void 0;
}
function findRenderedJsx(node) {
  const body = node.body;
  if (!body) return void 0;
  if (!ts.isBlock(body)) return unwrapJsx(body);
  let found2;
  const visit = (n) => {
    if (found2) return;
    if (ts.isReturnStatement(n)) {
      const jsx = unwrapJsx(n.expression);
      if (jsx) found2 = jsx;
      return;
    }
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
      if (n !== node) return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(body, visit);
  return found2;
}
function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}
function findComponents(fileName, code) {
  const sf = parse$1(fileName, code);
  const baseName = (fileName.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (name, isDefault, node) => {
    if (!isPascalCase(name)) return;
    if (!findRenderedJsx(node)) return;
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ name, isDefaultExport: isDefault, line: lineOf(sf, node), node });
  };
  for (const st of sf.statements) {
    hasModifier(st, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(st, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(st) && st.body) {
      const name = st.name?.text ?? (isDefault ? baseName : "");
      if (name) add(name, isDefault, st);
    } else if (ts.isVariableStatement(st)) {
      for (const decl of st.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const fn = unwrapComponentInitializer(decl.initializer);
        if (fn) add(decl.name.text, false, fn);
      }
    } else if (ts.isExportAssignment(st) && !st.isExportEquals) {
      const e = st.expression;
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) add(baseName, true, e);
      else if (ts.isFunctionDeclaration(e)) {
        add(baseName, true, e);
      } else if (ts.isIdentifier(e)) {
        const match = out.find((c) => c.name === e.text);
        if (match) match.isDefaultExport = true;
      }
    }
  }
  return out;
}
function listComponents(fileName, code) {
  return findComponents(fileName, code).map((c) => ({
    name: c.name,
    isDefaultExport: c.isDefaultExport,
    line: c.line
  }));
}
const TAILWIND_HINT = /\b(flex|grid|(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap|space-[xy])-\d|(w|h)-(\d|full|screen|auto|px)|rounded(-\w+)?|bg-\w+-\d|text-\w+|items-\w+|justify-\w+|border(-\w+)?|shadow(-\w+)?|animate-\w+)\b/;
function detectUiLibrary(fileName, code) {
  const sf = parse$1(fileName, code);
  let usesMui = false;
  let tailwindClasses = false;
  let hasJsx = false;
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      if (st.moduleSpecifier.text.startsWith("@mui/")) usesMui = true;
    }
  }
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      hasJsx = true;
    }
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "className" && node.initializer) {
      const init = node.initializer;
      const text = ts.isStringLiteral(init) ? init.text : ts.isJsxExpression(init) && init.expression ? init.expression.getText(sf) : "";
      if (TAILWIND_HINT.test(text)) tailwindClasses = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (usesMui) return "mui";
  if (tailwindClasses) return "tailwind";
  if (hasJsx) return "plain-react";
  return "unknown";
}
const KIND_SPEC = {
  heading: { mui: { variant: "text", widthPct: 60, heightPx: 32 }, tw: "h-6 w-2/3", plain: { h: 28, wPct: 60, radius: 4 } },
  text: { mui: { variant: "text", widthPct: 80 }, tw: "h-4 w-full", plain: { h: 16, wPct: 80, radius: 4 } },
  button: { mui: { variant: "rounded", widthPx: 100, heightPx: 36 }, tw: "h-9 w-24", plain: { h: 36, wPx: 100, radius: 6 } },
  iconbutton: { mui: { variant: "circular", widthPx: 40, heightPx: 40 }, tw: "h-10 w-10 rounded-full", plain: { h: 40, wPx: 40, radius: "full" } },
  avatar: { mui: { variant: "circular", widthPx: 40, heightPx: 40 }, tw: "h-10 w-10 rounded-full", plain: { h: 40, wPx: 40, radius: "full" } },
  image: { mui: { variant: "rectangular", full: true, heightPx: 140 }, tw: "h-40 w-full", plain: { h: 140, full: true, radius: 8 } },
  chip: { mui: { variant: "rounded", widthPx: 64, heightPx: 24 }, tw: "h-6 w-16", plain: { h: 24, wPx: 64, radius: 12 } },
  input: { mui: { variant: "rounded", full: true, heightPx: 40 }, tw: "h-10 w-full", plain: { h: 40, full: true, radius: 6 } },
  icon: { mui: { variant: "circular", widthPx: 24, heightPx: 24 }, tw: "h-6 w-6 rounded-full", plain: { h: 24, wPx: 24, radius: "full" } },
  block: { mui: { variant: "rectangular", full: true, heightPx: 80 }, tw: "h-20 w-full", plain: { h: 80, full: true, radius: 4 } }
};
const LEAF_TAGS = {
  Button: "button",
  LoadingButton: "button",
  Fab: "iconbutton",
  IconButton: "iconbutton",
  Avatar: "avatar",
  Chip: "chip",
  TextField: "input",
  OutlinedInput: "input",
  FilledInput: "input",
  Input: "input",
  InputBase: "input",
  Select: "input",
  Autocomplete: "input",
  CardMedia: "image",
  Icon: "icon",
  SvgIcon: "icon",
  Link: "text",
  Rating: "input",
  Switch: "input",
  Checkbox: "input",
  Radio: "input",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  p: "paragraph",
  img: "image",
  button: "button",
  input: "input",
  textarea: "input",
  select: "input",
  a: "text",
  label: "text",
  strong: "text",
  em: "text",
  small: "text",
  b: "text",
  code: "text",
  svg: "icon",
  i: "icon"
};
const ALLOWED_ATTRS = /* @__PURE__ */ new Set([
  "className",
  "sx",
  "style",
  "spacing",
  "direction",
  "gap",
  "container",
  "item",
  "columns",
  "columnSpacing",
  "rowSpacing",
  "alignItems",
  "alignContent",
  "justifyContent",
  "justifyItems",
  "flexDirection",
  "flexWrap",
  "wrap",
  "display",
  "elevation",
  "square",
  "component",
  "divider",
  "disablePadding",
  "disableGutters",
  "dense",
  "variant",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "flex",
  "flexGrow",
  "flexShrink",
  "overflow",
  "position",
  "borderRadius",
  "border",
  "boxShadow",
  "colSpan",
  "rowSpan",
  "align",
  "padding",
  "size",
  "fullWidth",
  "orientation",
  "p",
  "px",
  "py",
  "pt",
  "pb",
  "pl",
  "pr",
  "m",
  "mx",
  "my",
  "mt",
  "mb",
  "ml",
  "mr",
  "top",
  "left",
  "right",
  "bottom",
  "zIndex",
  "order",
  "xs",
  "sm",
  "md",
  "lg",
  "xl"
]);
function tagNameOf(node, sf) {
  const name = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return name.getText(sf);
}
function attributesOf(node) {
  return ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
}
function attrValue(attrs, name, sf) {
  for (const p of attrs.properties) {
    if (ts.isJsxAttribute(p) && p.name.getText(sf) === name && p.initializer) {
      const init = p.initializer;
      if (ts.isStringLiteral(init)) return init.text;
      if (ts.isJsxExpression(init) && init.expression) {
        const e = init.expression;
        if (ts.isStringLiteral(e) || ts.isNumericLiteral(e)) return e.text;
        return e.getText(sf);
      }
    }
  }
  return void 0;
}
function preserveAttrs(node, ctx) {
  const out = [];
  let droppedSpread = false;
  for (const p of attributesOf(node).properties) {
    if (ts.isJsxSpreadAttribute(p)) {
      droppedSpread = true;
      continue;
    }
    const name = p.name.getText(ctx.sf);
    if (ALLOWED_ATTRS.has(name)) out.push(p.getText(ctx.sf));
  }
  if (droppedSpread) ctx.warnings.add("Spread props ({...props}) were dropped from the skeleton.");
  return out;
}
function keepTailwindClasses(attrs, sf) {
  const cn = attrValue(attrs, "className", sf);
  if (!cn) return [];
  return cn.split(/\s+/).filter((c) => /^(m[trblxy]?-|space-[xy]-|col-|row-|self-|order-|rounded(-|$)|flex$|grow|shrink)/.test(c));
}
function getMapReturnedJsx(expr) {
  if (!ts.isCallExpression(expr)) return void 0;
  const callee = expr.expression;
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "map") return void 0;
  const cb = expr.arguments[0];
  if (!cb || !ts.isArrowFunction(cb) && !ts.isFunctionExpression(cb)) return void 0;
  const body = cb.body;
  if (!ts.isBlock(body)) return unwrapJsx(body);
  return findRenderedJsx(cb);
}
function repeatCountFor(parentTag) {
  if (parentTag === "TableBody" || parentTag === "tbody") return 4;
  if (parentTag === "List" || parentTag === "ul" || parentTag === "ol") return 4;
  return 3;
}
function convertChild(child, parentTag, ctx) {
  if (ts.isJsxText(child)) {
    return child.text.trim() ? [{ t: "leaf", kind: "text" }] : [];
  }
  if (ts.isJsxExpression(child)) {
    const e = child.expression;
    if (!e) return [];
    const mapped = getMapReturnedJsx(e);
    if (mapped) {
      const inner = convertElement(mapped, ctx);
      return inner ? [{ t: "repeat", count: repeatCountFor(parentTag), child: inner }] : [];
    }
    const nested = unwrapJsx(e);
    if (nested) return convertChildList([nested], parentTag, ctx);
    return [{ t: "leaf", kind: "text" }];
  }
  const node = convertElement(child, ctx);
  return node ? [node] : [];
}
function convertChildList(children, parentTag, ctx) {
  const out = [];
  for (const c of children) out.push(...convertChild(c, parentTag, ctx));
  return out;
}
function convertElement(node, ctx) {
  if (ts.isJsxFragment(node)) {
    return { t: "container", tag: "", attrs: [], children: convertChildList(node.children, "", ctx) };
  }
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return null;
  const tag = tagNameOf(node, ctx.sf);
  const attrs = attributesOf(node);
  const leafKind = LEAF_TAGS[tag] ?? leafKindForTypography(tag, attrs, ctx.sf);
  if (leafKind) {
    if (leafKind === "paragraph") {
      return {
        t: "container",
        tag: "",
        attrs: [],
        children: [
          { t: "leaf", kind: "text" },
          { t: "leaf", kind: "text", keep: ["w-4/5"], muiWidthPct: 60 }
        ]
      };
    }
    const keep = ctx.lib === "tailwind" ? keepTailwindClasses(attrs, ctx.sf) : void 0;
    const imgHeight = leafKind === "image" ? parseImgHeight(attrs, ctx.sf) : void 0;
    return { t: "leaf", kind: leafKind, keep, imgHeight };
  }
  const children = ts.isJsxElement(node) ? convertChildList(node.children, tag, ctx) : [];
  if (children.length === 0 && ts.isJsxSelfClosingElement(node) && /^[A-Z]/.test(tag)) {
    ctx.warnings.add(`Unknown component <${tag}/> rendered as a generic block.`);
    return { t: "leaf", kind: "block" };
  }
  if (/^[A-Z]/.test(tag)) ctx.usedComponents.add(tag.split(".")[0]);
  return { t: "container", tag, attrs: preserveAttrs(node, ctx), children };
}
function leafKindForTypography(tag, attrs, sf) {
  if (tag !== "Typography") return void 0;
  const variant = attrValue(attrs, "variant", sf) ?? "";
  if (/^h[1-6]$/.test(variant)) return "heading";
  if (variant === "subtitle1" || variant === "subtitle2") return "heading";
  return "text";
}
function parseImgHeight(attrs, sf) {
  const h = attrValue(attrs, "height", sf);
  if (h && /^\d+$/.test(h)) return Number(h);
  return void 0;
}
const INDENT = "  ";
function emitMuiLeaf(leaf, keyAttr) {
  const spec = KIND_SPEC[leaf.kind === "paragraph" ? "text" : leaf.kind].mui;
  const parts = [`variant="${spec.variant}"`];
  if (leaf.muiWidthPct != null) parts.push(`width="${leaf.muiWidthPct}%"`);
  else if (spec.full) parts.push('width="100%"');
  else if (spec.widthPct != null) parts.push(`width="${spec.widthPct}%"`);
  else if (spec.widthPx != null) parts.push(`width={${spec.widthPx}}`);
  const height = leaf.imgHeight ?? spec.heightPx;
  if (height != null) parts.push(`height={${height}}`);
  return `<Skeleton ${keyAttr}${parts.join(" ")} />`;
}
function emitTailwindLeaf(leaf, keyAttr) {
  const spec = KIND_SPEC[leaf.kind === "paragraph" ? "text" : leaf.kind];
  const keep = leaf.keep ?? [];
  const keepsWidth = keep.some((c) => c.startsWith("w-"));
  const keepsHeight = keep.some((c) => c.startsWith("h-"));
  const base = new Set(keep);
  for (const c of spec.tw.split(" ")) {
    if (c.startsWith("w-") && keepsWidth || c.startsWith("h-") && keepsHeight) continue;
    base.add(c);
  }
  base.add("animate-pulse");
  base.add("bg-gray-200");
  if (![...base].some((c) => c.startsWith("rounded"))) base.add("rounded");
  const cls = [...base].join(" ");
  return `<div ${keyAttr}className="${cls}" />`;
}
function emitPlainLeaf(leaf, keyAttr) {
  const spec = KIND_SPEC[leaf.kind === "paragraph" ? "text" : leaf.kind].plain;
  const style = [];
  if (spec.full) style.push("width: '100%'");
  else if (spec.wPct != null) style.push(`width: '${spec.wPct}%'`);
  else if (spec.wPx != null) style.push(`width: ${spec.wPx}`);
  style.push(`height: ${leaf.imgHeight ?? spec.h}`);
  style.push(`borderRadius: ${spec.radius === "full" ? 9999 : spec.radius}`);
  style.push("backgroundColor: '#e5e7eb'");
  return `<div ${keyAttr}style={{ ${style.join(", ")} }} />`;
}
function emitLeaf(leaf, lib, keyAttr) {
  if (lib === "mui") return emitMuiLeaf(leaf, keyAttr);
  if (lib === "tailwind") return emitTailwindLeaf(leaf, keyAttr);
  return emitPlainLeaf(leaf, keyAttr);
}
function emitNode(node, indent, lib, keyExpr) {
  const pad = INDENT.repeat(indent);
  const keyAttr = keyExpr ? `key={${keyExpr}} ` : "";
  if (node.t === "leaf") return pad + emitLeaf(node, lib, keyAttr);
  if (node.t === "repeat") {
    const inner = emitNode(node.child, indent + 2, lib, "i");
    return `${pad}{Array.from({ length: ${node.count} }).map((_, i) => (
${inner}
${pad}))}`;
  }
  const attrStr = node.attrs.length ? " " + node.attrs.join(" ") : "";
  const open = node.tag === "" ? "<>" : `<${node.tag}${keyAttr ? " " + keyAttr.trim() : ""}${attrStr}>`;
  const close = node.tag === "" ? "</>" : `</${node.tag}>`;
  if (node.children.length === 0 && node.tag !== "") {
    return `${pad}<${node.tag}${keyAttr ? " " + keyAttr.trim() : ""}${attrStr} />`;
  }
  const kids = node.children.map((c) => emitNode(c, indent + 1, lib)).join("\n");
  return `${pad}${open}
${kids}
${pad}${close}`;
}
function pickComponent(components, name) {
  if (name) return components.find((c) => c.name === name);
  return components.length === 1 ? components[0] : void 0;
}
function muiMaterialImports(sf) {
  const out = /* @__PURE__ */ new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.moduleSpecifier.text !== "@mui/material") continue;
    const bindings = st.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) out.add(el.name.text);
    }
  }
  return out;
}
function buildImports(lib, used, fromMui) {
  if (lib !== "mui") return {};
  const names = [...used].filter((n) => fromMui.has(n)).sort();
  const all = [.../* @__PURE__ */ new Set([...names, "Skeleton"])].sort();
  return {
    importsToAdd: ["Skeleton"],
    fileImports: `import { ${all.join(", ")} } from '@mui/material';`
  };
}
function generateSkeleton(input) {
  const { filePath, code } = input;
  if (!isReactComponentFile(filePath)) {
    throw new Error("Generate Skeleton is only available for React component files.");
  }
  const components = findComponents(filePath, code);
  if (components.length === 0) {
    throw new Error("No React component was found in this file.");
  }
  const target = pickComponent(components, input.componentName);
  if (!target) {
    if (input.componentName) throw new Error(`Component "${input.componentName}" was not found.`);
    throw new Error("This file has multiple components — choose one to generate a skeleton for.");
  }
  const jsx = findRenderedJsx(target.node);
  if (!jsx) throw new Error(`Component "${target.name}" does not render any JSX to base a skeleton on.`);
  const lib = detectUiLibrary(filePath, code);
  const sf = parse$1(filePath, code);
  const ctx = { sf, lib, usedComponents: /* @__PURE__ */ new Set(), warnings: /* @__PURE__ */ new Set() };
  const root = convertElement(jsx, ctx);
  if (!root) throw new Error("Could not analyse the component layout.");
  const skeletonName = `${target.name}Skeleton`;
  const body = emitNode(root, 3, lib);
  const componentCode = `export function ${skeletonName}() {
  return (
${body}
  );
}
`;
  const { importsToAdd, fileImports } = buildImports(lib, ctx.usedComponents, muiMaterialImports(sf));
  const warnings = [...ctx.warnings];
  warnings.push("Generated by static analysis — sizes are estimated and may need small adjustments.");
  if (lib === "plain-react") {
    warnings.push("Plain-React skeletons use inline styles; add a shimmer/pulse CSS class for animation.");
  }
  if (lib === "unknown") {
    warnings.push("UI library could not be detected; generated a best-effort generic skeleton.");
  }
  return {
    componentName: target.name,
    skeletonName,
    uiLibrary: lib,
    generationMode: "static-analysis",
    code: componentCode,
    importsToAdd,
    fileImports,
    warnings,
    confidence: lib === "unknown" ? "low" : "medium"
  };
}
const DIALECT = {
  mui: [
    "Use Material UI. Render every placeholder with the MUI <Skeleton> component",
    '(variant="text" for text/labels, "rounded" for buttons/inputs/chips, "circular" for avatars and',
    'icon buttons, "rectangular" for images/media). Preserve MUI layout components (Box, Stack, Grid,',
    "Card, Table, …) with their spacing/sizing props so the skeleton occupies the same footprint."
  ].join(" "),
  tailwind: [
    'Use Tailwind CSS. Render each placeholder as a <div> with "animate-pulse rounded bg-gray-200"',
    '(dark-mode: also "dark:bg-gray-700") plus width/height utilities that match the real element,',
    "carrying over the original margin/gap/rounded/grid classes so spacing is identical."
  ].join(" "),
  "plain-react": [
    "Use plain React with inline styles. Render each placeholder as a <div> with a light gray",
    "background (backgroundColor: '#e5e7eb'), an explicit width/height, and a borderRadius. Add a",
    "brief comment noting a shimmer/pulse CSS class can be added for animation."
  ].join(" "),
  unknown: [
    "Use plain React with inline styles for placeholders (light gray background, explicit width/height,",
    "borderRadius). Keep any layout wrappers you can infer."
  ].join(" ")
};
const SKELETON_SYSTEM = [
  "You are the skeleton generator built into the Forge code editor. Given a React component, you",
  "produce a loading-skeleton component that visually matches its layout so that swapping the real",
  "component for the skeleton (and back) causes no layout shift.",
  "",
  "Rules:",
  "- Reproduce the outer layout faithfully: same containers, grid columns, flex direction, spacing,",
  "  and repetition counts. A list/table that renders N rows should show a header plus a handful of",
  "  placeholder rows (5–6) with one placeholder per column.",
  "- Replace ALL real content (text, numbers, icons, images, controls) with neutral placeholders.",
  "- The component is likely COMPOSED from other components (e.g. <StatCard title value icon/>,",
  "  <DataTable columns data/>). You will not see their source — infer their visual structure from",
  "  the component name and its props and render a sensible placeholder shape for each (e.g. a stat",
  "  card = a bordered box containing a short label line, a large number block, and a circular icon;",
  "  a data table = a header row plus repeated placeholder rows). Do NOT collapse them to one block.",
  "- Emit NO data, props threading, event handlers, hooks, state, context, or API calls. The skeleton",
  "  must render standalone with zero required props.",
  "- Keep it a single self-contained functional component.",
  "",
  "Respond with ONLY a single fenced ```json code block, no prose before or after, matching exactly:",
  '{"code": string, "importsToAdd": string[], "fileImports": string, "notes": string[]}',
  '- "code": the COMPLETE skeleton component source, e.g. "export function FooSkeleton() { return (…); }".',
  `- "importsToAdd": for MUI only, the named imports from '@mui/material' 
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
the skeleton uses (always`,
  '  include "Skeleton"); otherwise an empty array. Used to merge into an existing import on insert.',
  '- "fileImports": a complete, ready-to-paste import block for a NEW standalone file (React plus',
  "  whatever the skeleton references). Empty string if none are needed.",
  '- "notes": zero or more short caveats worth surfacing to the user (assumptions, guessed structure).'
].join("\n");
function extractJson(reply) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const raw = fenced ? fenced[1] : reply;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("The AI reply did not contain a JSON skeleton.");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("The AI reply was not valid JSON.");
  }
  const obj = parsed;
  if (!obj || typeof obj.code !== "string" || !obj.code.trim()) {
    throw new Error("The AI reply was missing skeleton code.");
  }
  return obj;
}
function complete(cfg, system, question, context) {
  return new Promise((resolve2, reject) => {
    let text = "";
    streamAiChat(
      cfg,
      { system, history: [], question, context, maxTokens: 8192 },
      (delta) => {
        text += delta;
      },
      (error) => error ? reject(new Error(error)) : resolve2(text)
    );
  });
}
async function generateSkeletonWithAi(cfg, input) {
  const { filePath, code } = input;
  if (!isReactComponentFile(filePath)) {
    throw new Error("Generate Skeleton is only available for React component files.");
  }
  const components = findComponents(filePath, code);
  if (components.length === 0) throw new Error("No React component was found in this file.");
  const target = input.componentName ? components.find((c) => c.name === input.componentName) : components.length === 1 ? components[0] : void 0;
  if (!target) {
    if (input.componentName) throw new Error(`Component "${input.componentName}" was not found.`);
    throw new Error("This file has multiple components — choose one to generate a skeleton for.");
  }
  const lib = detectUiLibrary(filePath, code);
  const sf = parse$1(filePath, code);
  const componentSource = target.node.getText(sf);
  const question = [
    `Generate a loading skeleton for the "${target.name}" component below.`,
    `Name the skeleton component "${target.name}Skeleton".`,
    `Detected UI library: ${lib}. ${DIALECT[lib]}`,
    "",
    "Target component source:",
    "```tsx",
    componentSource,
    "```"
  ].join("\n");
  const context = ["Full source of the file (read-only context):", "```tsx", code, "```"].join("\n");
  const reply = await complete(cfg, SKELETON_SYSTEM, question, context);
  const json = extractJson(reply);
  const importsToAdd = lib === "mui" ? [.../* @__PURE__ */ new Set([...json.importsToAdd ?? [], "Skeleton"])].sort() : json.importsToAdd?.length ? json.importsToAdd : void 0;
  const warnings = [
    ...json.notes ?? [],
    "Generated by AI — review the output before applying; sizes and structure are inferred."
  ];
  return {
    componentName: target.name,
    skeletonName: `${target.name}Skeleton`,
    uiLibrary: lib,
    generationMode: "ai",
    code: json.code.trimEnd() + "\n",
    importsToAdd,
    fileImports: json.fileImports?.trim() || void 0,
    warnings,
    confidence: "medium"
  };
}
function detectSkeletonComponents(filePath, code) {
  return listComponents(filePath, code);
}
function runGenerateSkeleton(input) {
  return generateSkeleton(input);
}
function runGenerateSkeletonAi(cfg, input) {
  return generateSkeletonWithAi(cfg, input);
}
const SYSTEM_PROMPT = [
  "You are an inline code completion engine inside a code editor.",
  "You are given the code before the cursor (<prefix>) and after it (<suffix>).",
  "Output ONLY the code that should be inserted at the cursor to continue the prefix naturally.",
  "Do not repeat the prefix or the suffix. Do not explain. Do not wrap the output in markdown",
  "fences or backticks. Output an empty string if no sensible completion exists."
].join(" ");
const STOP_SEQUENCES = ["<|end|>", "\n\n\n"];
const MAX_TOKENS = 256;
const MAX_SUFFIX_CHARS = 1e3;
const active = /* @__PURE__ */ new Map();
const cancelled = /* @__PURE__ */ new Set();
function fimContext(args) {
  const prefix = args.prefix.slice(-4e3);
  const suffix = args.suffix.slice(0, MAX_SUFFIX_CHARS);
  return [
    `Language: ${args.language}`,
    `<prefix>
${prefix}
</prefix>`,
    `<suffix>
${suffix}
</suffix>`
  ].join("\n\n");
}
function clean(text) {
  let out = text;
  const fence = out.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  if (fence) out = fence[1];
  return out.replace(/<\|end\|>/g, "");
}
function startCompletion(cfg, args, onDone) {
  let buf = "";
  const handle = streamAiChat(
    cfg,
    {
      system: SYSTEM_PROMPT,
      history: [],
      question: "Complete the code at the cursor.",
      context: fimContext(args),
      maxTokens: MAX_TOKENS,
      stopSequences: STOP_SEQUENCES
    },
    (delta) => {
      buf += delta;
    },
    (error) => {
      const wasCancelled = cancelled.delete(args.id);
      active.delete(args.id);
      onDone(wasCancelled || error ? "" : clean(buf));
    }
  );
  active.set(args.id, handle);
}
function cancelCompletion(id) {
  const handle = active.get(id);
  if (!handle) return;
  cancelled.add(id);
  handle.cancel();
}
async function readAiCredentials(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return {};
  }
}
async function setAiKey(path, provider, key) {
  const creds = await readAiCredentials(path);
  if (key.trim()) creds[provider] = key.trim();
  else delete creds[provider];
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(creds, null, 2), { encoding: "utf8", mode: 384 });
}
async function aiKeyStatus(path) {
  const creds = await readAiCredentials(path);
  return { anthropic: !!creds.anthropic, openai: !!creds.openai };
}
const VALID_PROVIDERS = ["claude-cli", "anthropic", "openai"];
async function resolveAi(settingsPath, credentialsPath) {
  const settings = await readSettings(settingsPath);
  const provider = VALID_PROVIDERS.includes(settings.aiProvider) ? settings.aiProvider : "claude-cli";
  const model = settings.aiModel?.trim() || defaultModel(provider);
  if (provider === "claude-cli") return { provider, model };
  const creds = await readAiCredentials(credentialsPath);
  return { provider, model, apiKey: provider === "anthropic" ? creds.anthropic : creds.openai };
}
function completionDefaultModel(provider) {
  switch (provider) {
    case "anthropic":
      return "claude-haiku-4-5";
    case "openai":
      return "gpt-4o-mini";
    default:
      return "claude-haiku-4-5";
  }
}
async function resolveCompletionAi(settingsPath, credentialsPath) {
  const settings = await readSettings(settingsPath);
  const provider = VALID_PROVIDERS.includes(settings.aiProvider) ? settings.aiProvider : "claude-cli";
  const model = settings.aiCompletionModel?.trim() || completionDefaultModel(provider);
  if (provider === "claude-cli") return { provider, model };
  const creds = await readAiCredentials(credentialsPath);
  return { provider, model, apiKey: provider === "anthropic" ? creds.anthropic : creds.openai };
}
const run$1 = promisify(execFile);
const MAX_MATCHES = 1e3;
const PREVIEW_LEN = 240;
const PREVIEW_LEAD = 20;
function previewAround(text, matchIndex) {
  if (matchIndex <= PREVIEW_LEAD) return text.slice(0, PREVIEW_LEN);
  const start = matchIndex - PREVIEW_LEAD;
  return `…${text.slice(start, start + PREVIEW_LEN)}`;
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildSearchRegExp(options) {
  let pattern = options.regex ? options.query : escapeRegExp(options.query);
  if (options.wholeWord) pattern = `\\b${pattern}\\b`;
  return new RegExp(pattern, `g${options.caseSensitive ? "" : "i"}`);
}
function pathspecs(include, exclude) {
  const specs = [];
  const split = (s) => s.split(/[,\s]+/).map((g) => g.trim()).filter(Boolean);
  for (const g of include ? split(include) : []) specs.push(`:(glob)${g}`);
  for (const g of exclude ? split(exclude) : []) specs.push(`:(glob,exclude)${g}`);
  return specs;
}
function grepFlags(options) {
  const flags = ["-n", "-I", "--no-color", "--untracked", options.regex ? "-E" : "-F"];
  if (!options.caseSensitive) flags.push("-i");
  if (options.wholeWord) flags.push("-w");
  return flags;
}
async function searchInFiles(rootPath, options) {
  if (!options.query.trim()) return [];
  let re;
  try {
    re = buildSearchRegExp(options);
  } catch {
    return [];
  }
  try {
    const { stdout } = await run$1(
      "git",
      [
        "-C",
        rootPath,
        "grep",
        ...grepFlags(options),
        "-e",
        options.query,
        "--",
        ...pathspecs(options.include, options.exclude)
      ],
      { maxBuffer: 16 * 1024 * 1024 }
    );
    const matches = [];
    for (const line of stdout.split("\n")) {
      if (matches.length >= MAX_MATCHES) break;
      const i1 = line.indexOf(":");
      const i2 = line.indexOf(":", i1 + 1);
      if (i1 < 0 || i2 < 0) continue;
      const path = line.slice(0, i1);
      const ln = Number(line.slice(i1 + 1, i2));
      if (!Number.isFinite(ln)) continue;
      const text = line.slice(i2 + 1);
      re.lastIndex = 0;
      const m = re.exec(text);
      matches.push({
        path,
        name: basename(path),
        line: ln,
        preview: previewAround(text, m ? m.index : 0),
        col: m ? m.index + 1 : 1,
        length: m ? m[0].length : options.query.length
      });
    }
    return matches;
  } catch {
    return [];
  }
}
async function replaceInFiles(rootPath, options, replacement, files) {
  if (!options.query.trim() || files.length === 0) return { files: 0, replacements: 0 };
  const re = buildSearchRegExp(options);
  let changedFiles = 0;
  let replacements = 0;
  for (const rel of files) {
    const abs = join(rootPath, rel);
    let content;
    try {
      content = await promises.readFile(abs, "utf8");
    } catch {
      continue;
    }
    re.lastIndex = 0;
    const count = (content.match(re) ?? []).length;
    if (count === 0) continue;
    re.lastIndex = 0;
    const next = content.replace(re, replacement);
    if (next !== content) {
      await promises.writeFile(abs, next, "utf8");
      changedFiles += 1;
      replacements += count;
    }
  }
  return { files: changedFiles, replacements };
}
const run = promisify(execFile);
async function hydratePathFromLoginShell() {
  if (process.platform === "win32") return;
  const shell2 = process.env.SHELL ?? "/bin/zsh";
  try {
    const { stdout } = await run(
      shell2,
      ["-ilc", 'printf "__FORGE_PATH__%s__FORGE_PATH__" "$PATH"'],
      { timeout: 5e3 }
    );
    const shellPath = /__FORGE_PATH__(.*)__FORGE_PATH__/s.exec(stdout)?.[1]?.trim();
    if (!shellPath) return;
    const merged = process.env.PATH ? process.env.PATH.split(":") : [];
    for (const dir of shellPath.split(":")) {
      if (dir && !merged.includes(dir)) merged.push(dir);
    }
    process.env.PATH = merged.join(":");
  } catch {
  }
}
let worker = null;
let seq = 0;
const pending = /* @__PURE__ */ new Map();
function ensureWorker() {
  if (worker) return worker;
  const w = new Worker(join(__dirname, "language.worker.js"));
  w.on("message", (msg) => {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error ?? "Language service error"));
  });
  const fail = (err2) => {
    for (const p of pending.values()) p.reject(err2);
    pending.clear();
    worker = null;
  };
  w.on("error", fail);
  w.on("exit", (code) => {
    if (code !== 0) fail(new Error(`Language worker exited with code ${code}`));
  });
  worker = w;
  return w;
}
function call(method, args) {
  const w = ensureWorker();
  const id = seq += 1;
  return new Promise((resolve2, reject) => {
    pending.set(id, { resolve: resolve2, reject });
    w.postMessage({ id, method, args });
  });
}
function notify(method, args) {
  ensureWorker().postMessage({ method, args });
}
const languageClient = {
  initializeProject: (root) => call("initializeProject", [root]),
  openDocument: (file, content) => notify("openDocument", [file, content]),
  updateDocument: (file, content) => notify("updateDocument", [file, content]),
  closeDocument: (file) => notify("closeDocument", [file]),
  getDiagnostics: (file) => call("getDiagnostics", [file]),
  getDefinition: (file, line, col) => call("getDefinition", [file, line, col]),
  getReferences: (file, line, col) => call("getReferences", [file, line, col]),
  getHover: (file, line, col) => call("getHover", [file, line, col]),
  getCompletions: (file, line, col) => call("getCompletions", [file, line, col]),
  getCompletionDetails: (file, line, col, label, source, data) => call("getCompletionDetails", [file, line, col, label, source, data]),
  getSignatureHelp: (file, line, col) => call("getSignatureHelp", [file, line, col]),
  renameSymbol: (file, line, col, newName) => call("renameSymbol", [file, line, col, newName]),
  formatDocument: (file) => call("formatDocument", [file]),
  getSemanticTokens: (file) => call("getSemanticTokens", [file]),
  getDocumentSymbols: (file) => call("getDocumentSymbols", [file]),
  getWorkspaceSymbols: (query, file) => call("getWorkspaceSymbols", [query, file])
};
class LspClient {
  proc;
  buffer = Buffer.alloc(0);
  contentLength = -1;
  seq = 0;
  exited = false;
  pending = /* @__PURE__ */ new Map();
  notificationHandlers = /* @__PURE__ */ new Map();
  requestHandlers = /* @__PURE__ */ new Map();
  exitHandler;
  constructor(command, args, options = {}) {
    this.proc = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.proc.stdout.on("data", (chunk) => this.onData(chunk));
    this.proc.stderr.on("data", () => {
    });
    this.proc.on("error", () => this.die(null));
    this.proc.on("exit", (code) => this.die(code));
  }
  get pid() {
    return this.proc.pid;
  }
  get alive() {
    return !this.exited;
  }
  onExit(handler) {
    this.exitHandler = handler;
  }
  onNotification(method, handler) {
    this.notificationHandlers.set(method, handler);
  }
  /** Register a responder for a server→client request (jdtls hangs without these answered). */
  onRequest(method, handler) {
    this.requestHandlers.set(method, handler);
  }
  request(method, params) {
    if (this.exited) return Promise.reject(new Error("language server not running"));
    const id = ++this.seq;
    return new Promise((resolve2, reject) => {
      this.pending.set(id, { resolve: resolve2, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }
  notify(method, params) {
    if (this.exited) return;
    this.send({ jsonrpc: "2.0", method, params });
  }
  dispose() {
    if (this.exited) return;
    try {
      this.proc.kill();
    } catch {
    }
  }
  die(code) {
    if (this.exited) return;
    this.exited = true;
    for (const p of this.pending.values()) p.reject(new Error("language server exited"));
    this.pending.clear();
    this.exitHandler?.(code);
  }
  send(msg) {
    const payload = Buffer.from(JSON.stringify(msg), "utf8");
    const header = Buffer.from(`Content-Length: ${payload.length}\r
\r
`, "ascii");
    try {
      this.proc.stdin.write(Buffer.concat([header, payload]));
    } catch {
      this.die(null);
    }
  }
  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (; ; ) {
      if (this.contentLength < 0) {
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) return;
        const header = this.buffer.subarray(0, headerEnd).toString("ascii");
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        this.contentLength = match ? Number(match[1]) : 0;
        this.buffer = this.buffer.subarray(headerEnd + 4);
      }
      if (this.buffer.length < this.contentLength) return;
      const body = this.buffer.subarray(0, this.contentLength).toString("utf8");
      this.buffer = this.buffer.subarray(this.contentLength);
      this.contentLength = -1;
      try {
        this.dispatch(JSON.parse(body));
      } catch {
      }
    }
  }
  dispatch(msg) {
    if (msg.id !== void 0 && typeof msg.method === "string") {
      const handler = this.requestHandlers.get(msg.method);
      const result = handler ? handler(msg.params) : null;
      this.send({ jsonrpc: "2.0", id: msg.id, result });
      return;
    }
    if (msg.id !== void 0) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? "language server error"));
      else p.resolve(msg.result);
      return;
    }
    if (typeof msg.method === "string") {
      this.notificationHandlers.get(msg.method)?.(msg.params);
    }
  }
}
function resolveJdtlsCommand() {
  const explicit = process.env.FORGE_JDTLS_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const home = process.env.JDTLS_HOME;
  if (home) {
    const launcher = join(home, "bin", "jdtls");
    if (existsSync(launcher)) return launcher;
  }
  return "jdtls";
}
function toLspPosition(line, column) {
  return { line: line - 1, character: column - 1 };
}
function rangeToLocation(file, range) {
  return {
    file,
    line: range.start.line + 1,
    column: range.start.character + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.character + 1
  };
}
function severityOf(n) {
  if (n === 1) return "error";
  if (n === 2) return "warning";
  return "info";
}
function completionKindName(kind) {
  switch (kind) {
    case 2:
    case 4:
      return "method";
    case 3:
      return "function";
    case 5:
    case 10:
      return "property";
    case 6:
      return "var";
    case 7:
    case 22:
      return "class";
    case 8:
      return "interface";
    case 9:
      return "module";
    case 13:
      return "enum";
    case 14:
      return "keyword";
    case 20:
      return "enum member";
    case 21:
      return "const";
    default:
      return "";
  }
}
function markdownOf(hoverContents) {
  if (hoverContents == null) return "";
  if (typeof hoverContents === "string") return hoverContents;
  if (Array.isArray(hoverContents)) {
    return hoverContents.map((c) => typeof c === "string" ? c : c.language ? "```" + c.language + "\n" + c.value + "\n```" : c.value).join("\n\n");
  }
  return hoverContents.value ?? "";
}
class JdtlsService {
  client = null;
  startPromise = null;
  available = true;
  workspaceRoot = null;
  status = "idle";
  statusNotifier;
  docs = /* @__PURE__ */ new Map();
  diagnostics = /* @__PURE__ */ new Map();
  /** Wire a listener (the main process pushes status to the renderer status bar). */
  setStatusNotifier(notifier) {
    this.statusNotifier = notifier;
  }
  getStatus() {
    return this.status;
  }
  setStatus(status2) {
    if (this.status === status2) return;
    this.status = status2;
    this.statusNotifier?.(status2);
  }
  /** Remember the workspace root (cheap — does not spawn jdtls until a Java file opens). */
  setWorkspace(root) {
    if (this.workspaceRoot === root) return;
    this.workspaceRoot = root;
    this.shutdown();
    this.available = true;
    this.setStatus("idle");
  }
  openDocument(file, text) {
    this.docs.set(file, { version: 1, text, open: false });
    void this.ensureStarted().then((ok2) => {
      if (ok2) this.sendDidOpen(file);
    });
  }
  updateDocument(file, text) {
    const doc = this.docs.get(file);
    if (!doc) {
      this.openDocument(file, text);
      return;
    }
    doc.version += 1;
    doc.text = text;
    if (doc.open && this.client?.alive) {
      this.client.notify("textDocument/didChange", {
        textDocument: { uri: this.uri(file), version: doc.version },
        contentChanges: [{ text }]
      });
    }
  }
  closeDocument(file) {
    const doc = this.docs.get(file);
    if (doc?.open && this.client?.alive) {
      this.client.notify("textDocument/didClose", { textDocument: { uri: this.uri(file) } });
    }
    this.docs.delete(file);
    this.diagnostics.delete(file);
  }
  getDiagnostics(file) {
    return this.diagnostics.get(file) ?? [];
  }
  async getCompletions(file, line, column) {
    const res = await this.query("textDocument/completion", file, line, column);
    if (!res) return { items: [] };
    const raw = Array.isArray(res) ? res : res.items ?? [];
    const items = raw.map((item) => ({
      label: typeof item.label === "string" ? item.label : item.label?.label ?? "",
      kind: completionKindName(item.kind),
      insertText: stripSnippet(item.insertText ?? item.textEdit?.newText ?? item.label),
      sortText: item.sortText,
      detail: item.detail
    }));
    return { items };
  }
  async getHover(file, line, column) {
    const res = await this.query("textDocument/hover", file, line, column);
    if (!res || res.contents == null) return null;
    const contents = markdownOf(res.contents);
    if (!contents.trim()) return null;
    return {
      contents,
      range: res.range ? {
        line: res.range.start.line + 1,
        column: res.range.start.character + 1,
        endLine: res.range.end.line + 1,
        endColumn: res.range.end.character + 1
      } : null
    };
  }
  async getDefinition(file, line, column) {
    const res = await this.query("textDocument/definition", file, line, column);
    return this.toLocations(res);
  }
  async getReferences(file, line, column) {
    const res = await this.query("textDocument/references", file, line, column, {
      context: { includeDeclaration: false }
    });
    return this.toLocations(res);
  }
  toLocations(res) {
    if (!res) return [];
    const arr = Array.isArray(res) ? res : [res];
    return arr.map((loc) => {
      const uri = loc.uri ?? loc.targetUri;
      const range = loc.range ?? loc.targetSelectionRange ?? loc.targetRange;
      if (!uri || !range) return null;
      return rangeToLocation(fileURLToPath(uri), range);
    }).filter((l) => l !== null);
  }
  /** Await readiness, ensure the doc is opened server-side, then send a positional request. */
  async query(method, file, line, column, extra = {}) {
    const ok2 = await this.ensureStarted();
    if (!ok2 || !this.client) return null;
    this.sendDidOpen(file);
    try {
      return await this.client.request(method, {
        textDocument: { uri: this.uri(file) },
        position: toLspPosition(line, column),
        ...extra
      });
    } catch {
      return null;
    }
  }
  sendDidOpen(file) {
    const doc = this.docs.get(file);
    if (!doc || doc.open || !this.client?.alive) return;
    doc.open = true;
    this.client.notify("textDocument/didOpen", {
      textDocument: { uri: this.uri(file), languageId: "java", version: doc.version, text: doc.text }
    });
  }
  uri(file) {
    return pathToFileURL(file).toString();
  }
  ensureStarted() {
    if (!this.available || !this.workspaceRoot) return Promise.resolve(false);
    if (this.client?.alive) return Promise.resolve(true);
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.start().catch(() => {
      this.available = false;
      this.shutdown();
      this.setStatus("unavailable");
      return false;
    });
    return this.startPromise;
  }
  async start() {
    const root = this.workspaceRoot;
    if (!root) return false;
    const command = resolveJdtlsCommand();
    if (!command) return false;
    this.setStatus("starting");
    const dataDir = join(
      app.getPath("userData"),
      "jdtls",
      createHash("sha1").update(root).digest("hex").slice(0, 16)
    );
    const client = new LspClient(command, ["-data", dataDir], { cwd: root, env: process.env });
    this.client = client;
    client.onExit(() => {
      this.client = null;
      this.startPromise = null;
      for (const doc of this.docs.values()) doc.open = false;
      this.setStatus(this.available ? "idle" : "unavailable");
    });
    client.onRequest(
      "workspace/configuration",
      (params) => Array.isArray(params?.items) ? params.items.map(() => null) : []
    );
    client.onRequest("client/registerCapability", () => null);
    client.onRequest("client/unregisterCapability", () => null);
    client.onRequest("window/workDoneProgress/create", () => null);
    client.onRequest("workspace/applyEdit", () => ({ applied: false }));
    client.onRequest("window/showMessageRequest", () => null);
    client.onNotification("textDocument/publishDiagnostics", (params) => {
      const file = fileURLToPath(params.uri);
      this.diagnostics.set(
        file,
        (params.diagnostics ?? []).map((d) => ({
          line: d.range.start.line + 1,
          column: d.range.start.character + 1,
          endLine: d.range.end.line + 1,
          endColumn: d.range.end.character + 1,
          severity: severityOf(d.severity),
          code: d.code ?? "",
          message: d.message
        }))
      );
    });
    await client.request("initialize", {
      processId: process.pid,
      clientInfo: { name: "Forge" },
      rootUri: this.uri(root),
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: false },
          completion: { completionItem: { snippetSupport: false } },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: true },
          references: {},
          publishDiagnostics: {}
        },
        workspace: { configuration: true, workspaceFolders: true, applyEdit: false }
      },
      workspaceFolders: [{ uri: this.uri(root), name: "workspace" }],
      initializationOptions: { settings: { java: {} } }
    });
    client.notify("initialized", {});
    this.setStatus("ready");
    for (const file of this.docs.keys()) this.sendDidOpen(file);
    return true;
  }
  shutdown() {
    this.client?.dispose();
    this.client = null;
    this.startPromise = null;
    this.diagnostics.clear();
    for (const doc of this.docs.values()) doc.open = false;
  }
}
function stripSnippet(text) {
  if (!text) return text;
  return text.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\{\d+\}/g, "").replace(/\$\d+/g, "");
}
const jdtlsService = new JdtlsService();
const isJava = (file) => file.endsWith(".java");
function registerLanguageIpc(ipcMain2) {
  ipcMain2.handle(
    IpcChannels.langInit,
    (_e, rootPath) => toResult(() => {
      jdtlsService.setWorkspace(rootPath);
      return languageClient.initializeProject(rootPath);
    })
  );
  ipcMain2.on(
    IpcChannels.langOpenDoc,
    (_e, file, content) => isJava(file) ? jdtlsService.openDocument(file, content) : languageClient.openDocument(file, content)
  );
  ipcMain2.on(
    IpcChannels.langUpdateDoc,
    (_e, file, content) => isJava(file) ? jdtlsService.updateDocument(file, content) : languageClient.updateDocument(file, content)
  );
  ipcMain2.on(
    IpcChannels.langCloseDoc,
    (_e, file) => isJava(file) ? jdtlsService.closeDocument(file) : languageClient.closeDocument(file)
  );
  ipcMain2.handle(
    IpcChannels.langDiagnostics,
    (_e, file) => toResult(
      async () => isJava(file) ? jdtlsService.getDiagnostics(file) : languageClient.getDiagnostics(file)
    )
  );
  ipcMain2.handle(
    IpcChannels.langDefinition,
    (_e, file, line, col) => toResult(
      () => isJava(file) ? jdtlsService.getDefinition(file, line, col) : languageClient.getDefinition(file, line, col)
    )
  );
  ipcMain2.handle(
    IpcChannels.langReferences,
    (_e, file, line, col) => toResult(
      () => isJava(file) ? jdtlsService.getReferences(file, line, col) : languageClient.getReferences(file, line, col)
    )
  );
  ipcMain2.handle(
    IpcChannels.langHover,
    (_e, file, line, col) => toResult(
      () => isJava(file) ? jdtlsService.getHover(file, line, col) : languageClient.getHover(file, line, col)
    )
  );
  ipcMain2.handle(
    IpcChannels.langCompletions,
    (_e, file, line, col) => toResult(
      () => isJava(file) ? jdtlsService.getCompletions(file, line, col) : languageClient.getCompletions(file, line, col)
    )
  );
  ipcMain2.handle(
    IpcChannels.langCompletionDetails,
    (_e, file, line, col, label, source, data) => toResult(
      async () => (
        // jdtls has no completion-resolve wired up; only TS/JS get auto-import details.
        isJava(file) ? null : languageClient.getCompletionDetails(file, line, col, label, source, data)
      )
    )
  );
  ipcMain2.handle(
    IpcChannels.langSignatureHelp,
    (_e, file, line, col) => toResult(async () => isJava(file) ? null : languageClient.getSignatureHelp(file, line, col))
  );
  ipcMain2.handle(
    IpcChannels.langRename,
    (_e, file, line, col, newName) => toResult(
      async () => isJava(file) ? { edits: [] } : languageClient.renameSymbol(file, line, col, newName)
    )
  );
  ipcMain2.handle(
    IpcChannels.langFormat,
    (_e, file) => toResult(async () => isJava(file) ? [] : languageClient.formatDocument(file))
  );
  ipcMain2.handle(
    IpcChannels.langSemanticTokens,
    (_e, file) => toResult(async () => isJava(file) ? { data: [] } : languageClient.getSemanticTokens(file))
  );
  ipcMain2.handle(
    IpcChannels.langDocSymbols,
    (_e, file) => (
      // jdtls symbol support isn't wired up; only TS/JS files surface document symbols.
      toResult(async () => isJava(file) ? [] : languageClient.getDocumentSymbols(file))
    )
  );
  ipcMain2.handle(
    IpcChannels.langWorkspaceSymbols,
    (_e, query, file) => toResult(async () => file && isJava(file) ? [] : languageClient.getWorkspaceSymbols(query, file))
  );
}
function registerAwsIpc(ipcMain2, settingsPath) {
  ipcMain2.handle(IpcChannels.awsListProfiles, () => toResult(() => listProfiles()));
  ipcMain2.handle(
    IpcChannels.awsValidateProfile,
    (_e, name) => toResult(() => validateProfile(name))
  );
  ipcMain2.handle(IpcChannels.awsGetActiveProfile, () => toResult(async () => getActiveProfile()));
  ipcMain2.handle(IpcChannels.awsConfigPaths, () => toResult(async () => awsConfigPaths()));
  ipcMain2.handle(
    IpcChannels.awsSetActiveProfile,
    (_e, name, region) => toResult(async () => {
      setActiveProfile(name, region ?? null);
      const settings = await readSettings(settingsPath);
      await writeSettings(settingsPath, {
        ...settings,
        awsProfile: name ?? void 0,
        awsRegion: region ?? void 0
      });
    })
  );
}
const BLOCK_START = "# >>> forge editor integration >>>";
const BLOCK_END = "# <<< forge editor integration <<<";
function buildBlock(bodyLines) {
  return [BLOCK_START, ...bodyLines, BLOCK_END].join("\n");
}
function hasBlock(content) {
  return content.includes(BLOCK_START) && content.includes(BLOCK_END);
}
function upsertBlock(content, bodyLines) {
  const block = buildBlock(bodyLines);
  if (hasBlock(content)) {
    const re = new RegExp(`${escapeRe(BLOCK_START)}[\\s\\S]*?${escapeRe(BLOCK_END)}`);
    return ensureTrailingNewline(content.replace(re, block));
  }
  const base = content.length === 0 || content.endsWith("\n") ? content : `${content}
`;
  return ensureTrailingNewline(`${base}
${block}`);
}
function removeBlock(content) {
  if (!hasBlock(content)) return content;
  const re = new RegExp(`\\n?${escapeRe(BLOCK_START)}[\\s\\S]*?${escapeRe(BLOCK_END)}\\n?`);
  return content.replace(re, "\n").replace(/\n{3,}/g, "\n\n");
}
function profilePathForShell(shell2, home) {
  const name = (shell2 ?? "").split("/").pop() ?? "";
  if (name.includes("zsh")) return join(home, ".zshrc");
  if (name.includes("bash")) return join(home, ".bashrc");
  return join(home, ".profile");
}
function ensureTrailingNewline(s) {
  return s.endsWith("\n") ? s : `${s}
`;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const PHASE1_ENV_LINES = [
  'export PATH="$HOME/.local/bin:$PATH"',
  "export REACT_EDITOR=forge",
  "export LAUNCH_EDITOR=forge"
];
function resolveIntegrationPaths(home, shell2, appBundle) {
  const binDir = join(home, ".local", "bin");
  return {
    home,
    binDir,
    shimPath: join(binDir, "forge"),
    profilePath: profilePathForShell(shell2, home),
    appBundle
  };
}
function buildShim(appBundle) {
  return [
    "#!/bin/sh",
    "# Forge editor integration. Opens files passed by $EDITOR / REACT_EDITOR / etc.",
    "# Phase 1: non-blocking open via the macOS app association.",
    `exec open -a "${appBundle}" "$@"`,
    ""
  ].join("\n");
}
async function readOrEmpty(path) {
  try {
    return await promises.readFile(path, "utf8");
  } catch {
    return "";
  }
}
async function install(paths, envLines = PHASE1_ENV_LINES) {
  await promises.mkdir(paths.binDir, { recursive: true });
  await promises.writeFile(paths.shimPath, buildShim(paths.appBundle), { mode: 493 });
  await promises.chmod(paths.shimPath, 493);
  const current = await readOrEmpty(paths.profilePath);
  await promises.writeFile(paths.profilePath, upsertBlock(current, envLines), "utf8");
}
async function uninstall(paths) {
  await promises.rm(paths.shimPath, { force: true });
  const current = await readOrEmpty(paths.profilePath);
  if (current) await promises.writeFile(paths.profilePath, removeBlock(current), "utf8");
}
async function status(paths) {
  const shimExists = await promises.stat(paths.shimPath).then(() => true).catch(() => false);
  const profile = await readOrEmpty(paths.profilePath);
  return { installed: shimExists && hasBlock(profile) };
}
function appBundlePath() {
  return app.getPath("exe").replace(/\/Contents\/MacOS\/[^/]+$/, "");
}
function currentPaths() {
  return resolveIntegrationPaths(homedir(), process.env.SHELL, appBundlePath());
}
async function toStatus(paths) {
  const { installed } = await status(paths);
  return { installed, shimPath: paths.shimPath, profilePath: paths.profilePath };
}
function registerEditorIntegrationIpc(ipcMain2) {
  ipcMain2.handle(
    IpcChannels.editorIntegrationStatus,
    () => toResult(() => toStatus(currentPaths()))
  );
  ipcMain2.handle(
    IpcChannels.editorIntegrationInstall,
    () => toResult(async () => {
      const paths = currentPaths();
      await install(paths);
      return toStatus(paths);
    })
  );
  ipcMain2.handle(
    IpcChannels.editorIntegrationUninstall,
    () => toResult(async () => {
      const paths = currentPaths();
      await uninstall(paths);
      return toStatus(paths);
    })
  );
}
const REQUEST_TIMEOUT_MS = 6e4;
const BODYLESS_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD"]);
function registerApiRequestIpc(ipcMain2) {
  ipcMain2.handle(
    IpcChannels.apiRequest,
    (_e, req) => toResult(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const method = req.method ?? "GET";
        const hasBody = !BODYLESS_METHODS.has(method) && req.body != null && req.body !== "";
        const headers = { accept: "*/*", ...req.headers ?? {} };
        if (hasBody && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
          headers["content-type"] = "application/json";
        }
        const res = await fetch(req.url, {
          method,
          headers,
          body: hasBody ? req.body : void 0,
          signal: controller.signal
        });
        const body = await res.text();
        const responseHeaders = {};
        res.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
        return { status: res.status, statusText: res.statusText, body, headers: responseHeaders };
      } finally {
        clearTimeout(timer);
      }
    })
  );
}
class CdpClient extends EventEmitter {
  socket = null;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  connect(url) {
    return new Promise((resolve2, reject) => {
      const socket = new WebSocket(url, { maxPayload: 256 * 1024 * 1024 });
      this.socket = socket;
      socket.on("open", () => resolve2());
      socket.on("error", (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
        this.emit("socket-error", error);
      });
      socket.on("close", () => this.emit("socket-close"));
      socket.on("message", (data) => this.onMessage(data.toString()));
    });
  }
  onMessage(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof msg.id === "number") {
      const call2 = this.pending.get(msg.id);
      if (!call2) return;
      this.pending.delete(msg.id);
      if (msg.error) call2.reject(new Error(msg.error.message ?? "CDP error"));
      else call2.resolve(msg.result);
    } else if (msg.method) {
      this.emit(msg.method, msg.params);
    }
  }
  /** Send a CDP command and resolve with its `result` payload (rejects on a protocol error). */
  send(method, params) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP socket is not connected"));
    }
    const id = this.nextId++;
    return new Promise((resolve2, reject) => {
      this.pending.set(id, { resolve: resolve2, reject });
      socket.send(JSON.stringify({ id, method, params: params ?? {} }), (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }
  close() {
    for (const call2 of this.pending.values()) call2.reject(new Error("CDP connection closed"));
    this.pending.clear();
    try {
      this.socket?.close();
    } catch {
    }
    this.socket = null;
  }
}
var comma = ",".charCodeAt(0);
var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var intToChar = new Uint8Array(64);
var charToInt = new Uint8Array(128);
for (let i = 0; i < chars.length; i++) {
  const c = chars.charCodeAt(i);
  intToChar[i] = c;
  charToInt[c] = i;
}
function decodeInteger(reader, relative2) {
  let value = 0;
  let shift = 0;
  let integer = 0;
  do {
    const c = reader.next();
    integer = charToInt[c];
    value |= (integer & 31) << shift;
    shift += 5;
  } while (integer & 32);
  const shouldNegate = value & 1;
  value >>>= 1;
  if (shouldNegate) {
    value = -2147483648 | -value;
  }
  return relative2 + value;
}
function hasMoreVlq(reader, max) {
  if (reader.pos >= max) return false;
  return reader.peek() !== comma;
}
var StringReader = class {
  constructor(buffer) {
    this.pos = 0;
    this.buffer = buffer;
  }
  next() {
    return this.buffer.charCodeAt(this.pos++);
  }
  peek() {
    return this.buffer.charCodeAt(this.pos);
  }
  indexOf(char) {
    const { buffer, pos } = this;
    const idx = buffer.indexOf(char, pos);
    return idx === -1 ? buffer.length : idx;
  }
};
function decode(mappings) {
  const { length } = mappings;
  const reader = new StringReader(mappings);
  const decoded = [];
  let genColumn = 0;
  let sourcesIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let namesIndex = 0;
  do {
    const semi = reader.indexOf(";");
    const line = [];
    let sorted = true;
    let lastCol = 0;
    genColumn = 0;
    while (reader.pos < semi) {
      let seg;
      genColumn = decodeInteger(reader, genColumn);
      if (genColumn < lastCol) sorted = false;
      lastCol = genColumn;
      if (hasMoreVlq(reader, semi)) {
        sourcesIndex = decodeInteger(reader, sourcesIndex);
        sourceLine = decodeInteger(reader, sourceLine);
        sourceColumn = decodeInteger(reader, sourceColumn);
        if (hasMoreVlq(reader, semi)) {
          namesIndex = decodeInteger(reader, namesIndex);
          seg = [genColumn, sourcesIndex, sourceLine, sourceColumn, namesIndex];
        } else {
          seg = [genColumn, sourcesIndex, sourceLine, sourceColumn];
        }
      } else {
        seg = [genColumn];
      }
      line.push(seg);
      reader.pos++;
    }
    if (!sorted) sort(line);
    decoded.push(line);
    reader.pos = semi + 1;
  } while (reader.pos <= length);
  return decoded;
}
function sort(line) {
  line.sort(sortComparator$1);
}
function sortComparator$1(a, b) {
  return a[0] - b[0];
}
const schemeRegex = /^[\w+.-]+:\/\//;
const urlRegex = /^([\w+.-]+:)\/\/([^@/#?]*@)?([^:/#?]*)(:\d+)?(\/[^#?]*)?(\?[^#]*)?(#.*)?/;
const fileRegex = /^file:(?:\/\/((?![a-z]:)[^/#?]*)?)?(\/?[^#?]*)(\?[^#]*)?(#.*)?/i;
function isAbsoluteUrl(input) {
  return schemeRegex.test(input);
}
function isSchemeRelativeUrl(input) {
  return input.startsWith("//");
}
function isAbsolutePath(input) {
  return input.startsWith("/");
}
function isFileUrl(input) {
  return input.startsWith("file:");
}
function isRelative(input) {
  return /^[.?#]/.test(input);
}
function parseAbsoluteUrl(input) {
  const match = urlRegex.exec(input);
  return makeUrl(match[1], match[2] || "", match[3], match[4] || "", match[5] || "/", match[6] || "", match[7] || "");
}
function parseFileUrl(input) {
  const match = fileRegex.exec(input);
  const path = match[2];
  return makeUrl("file:", "", match[1] || "", "", isAbsolutePath(path) ? path : "/" + path, match[3] || "", match[4] || "");
}
function makeUrl(scheme, user, host, port, path, query, hash) {
  return {
    scheme,
    user,
    host,
    port,
    path,
    query,
    hash,
    type: 7
  };
}
function parseUrl(input) {
  if (isSchemeRelativeUrl(input)) {
    const url2 = parseAbsoluteUrl("http:" + input);
    url2.scheme = "";
    url2.type = 6;
    return url2;
  }
  if (isAbsolutePath(input)) {
    const url2 = parseAbsoluteUrl("http://foo.com" + input);
    url2.scheme = "";
    url2.host = "";
    url2.type = 5;
    return url2;
  }
  if (isFileUrl(input))
    return parseFileUrl(input);
  if (isAbsoluteUrl(input))
    return parseAbsoluteUrl(input);
  const url = parseAbsoluteUrl("http://foo.com/" + input);
  url.scheme = "";
  url.host = "";
  url.type = input ? input.startsWith("?") ? 3 : input.startsWith("#") ? 2 : 4 : 1;
  return url;
}
function stripPathFilename(path) {
  if (path.endsWith("/.."))
    return path;
  const index = path.lastIndexOf("/");
  return path.slice(0, index + 1);
}
function mergePaths(url, base) {
  normalizePath(base, base.type);
  if (url.path === "/") {
    url.path = base.path;
  } else {
    url.path = stripPathFilename(base.path) + url.path;
  }
}
function normalizePath(url, type) {
  const rel = type <= 4;
  const pieces = url.path.split("/");
  let pointer = 1;
  let positive = 0;
  let addTrailingSlash = false;
  for (let i = 1; i < pieces.length; i++) {
    const piece = pieces[i];
    if (!piece) {
      addTrailingSlash = true;
      continue;
    }
    addTrailingSlash = false;
    if (piece === ".")
      continue;
    if (piece === "..") {
      if (positive) {
        addTrailingSlash = true;
        positive--;
        pointer--;
      } else if (rel) {
        pieces[pointer++] = piece;
      }
      continue;
    }
    pieces[pointer++] = piece;
    positive++;
  }
  let path = "";
  for (let i = 1; i < pointer; i++) {
    path += "/" + pieces[i];
  }
  if (!path || addTrailingSlash && !path.endsWith("/..")) {
    path += "/";
  }
  url.path = path;
}
function resolve(input, base) {
  if (!input && !base)
    return "";
  const url = parseUrl(input);
  let inputType = url.type;
  if (base && inputType !== 7) {
    const baseUrl = parseUrl(base);
    const baseType = baseUrl.type;
    switch (inputType) {
      case 1:
        url.hash = baseUrl.hash;
      // fall through
      case 2:
        url.query = baseUrl.query;
      // fall through
      case 3:
      case 4:
        mergePaths(url, baseUrl);
      // fall through
      case 5:
        url.user = baseUrl.user;
        url.host = baseUrl.host;
        url.port = baseUrl.port;
      // fall through
      case 6:
        url.scheme = baseUrl.scheme;
    }
    if (baseType > inputType)
      inputType = baseType;
  }
  normalizePath(url, inputType);
  const queryHash = url.query + url.hash;
  switch (inputType) {
    // This is impossible, because of the empty checks at the start of the function.
    // case UrlType.Empty:
    case 2:
    case 3:
      return queryHash;
    case 4: {
      const path = url.path.slice(1);
      if (!path)
        return queryHash || ".";
      if (isRelative(base || input) && !isRelative(path)) {
        return "./" + path + queryHash;
      }
      return path + queryHash;
    }
    case 5:
      return url.path + queryHash;
    default:
      return url.scheme + "//" + url.user + url.host + url.port + url.path + queryHash;
  }
}
function stripFilename(path) {
  if (!path) return "";
  const index = path.lastIndexOf("/");
  return path.slice(0, index + 1);
}
function resolver(mapUrl, sourceRoot) {
  const from = stripFilename(mapUrl);
  const prefix = sourceRoot ? sourceRoot + "/" : "";
  return (source) => resolve(prefix + (source || ""), from);
}
var COLUMN = 0;
var SOURCES_INDEX = 1;
var SOURCE_LINE = 2;
var SOURCE_COLUMN = 3;
var NAMES_INDEX = 4;
var REV_GENERATED_LINE = 1;
var REV_GENERATED_COLUMN = 2;
function maybeSort(mappings, owned) {
  const unsortedIndex = nextUnsortedSegmentLine(mappings, 0);
  if (unsortedIndex === mappings.length) return mappings;
  if (!owned) mappings = mappings.slice();
  for (let i = unsortedIndex; i < mappings.length; i = nextUnsortedSegmentLine(mappings, i + 1)) {
    mappings[i] = sortSegments(mappings[i], owned);
  }
  return mappings;
}
function nextUnsortedSegmentLine(mappings, start) {
  for (let i = start; i < mappings.length; i++) {
    if (!isSorted(mappings[i])) return i;
  }
  return mappings.length;
}
function isSorted(line) {
  for (let j = 1; j < line.length; j++) {
    if (line[j][COLUMN] < line[j - 1][COLUMN]) {
      return false;
    }
  }
  return true;
}
function sortSegments(line, owned) {
  if (!owned) line = line.slice();
  return line.sort(sortComparator);
}
function sortComparator(a, b) {
  return a[COLUMN] - b[COLUMN];
}
function buildBySources(decoded, memos) {
  const sources = memos.map(() => []);
  for (let i = 0; i < decoded.length; i++) {
    const line = decoded[i];
    for (let j = 0; j < line.length; j++) {
      const seg = line[j];
      if (seg.length === 1) continue;
      const sourceIndex2 = seg[SOURCES_INDEX];
      const sourceLine = seg[SOURCE_LINE];
      const sourceColumn = seg[SOURCE_COLUMN];
      const source = sources[sourceIndex2];
      const segs = source[sourceLine] || (source[sourceLine] = []);
      segs.push([sourceColumn, i, seg[COLUMN]]);
    }
  }
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    for (let j = 0; j < source.length; j++) {
      const line = source[j];
      if (line) line.sort(sortComparator);
    }
  }
  return sources;
}
var found = false;
function binarySearch(haystack, needle, low, high) {
  while (low <= high) {
    const mid = low + (high - low >> 1);
    const cmp = haystack[mid][COLUMN] - needle;
    if (cmp === 0) {
      found = true;
      return mid;
    }
    if (cmp < 0) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  found = false;
  return low - 1;
}
function upperBound(haystack, needle, index) {
  for (let i = index + 1; i < haystack.length; index = i++) {
    if (haystack[i][COLUMN] !== needle) break;
  }
  return index;
}
function lowerBound(haystack, needle, index) {
  for (let i = index - 1; i >= 0; index = i--) {
    if (haystack[i][COLUMN] !== needle) break;
  }
  return index;
}
function memoizedState() {
  return {
    lastKey: -1,
    lastNeedle: -1,
    lastIndex: -1
  };
}
function memoizedBinarySearch(haystack, needle, state, key) {
  const { lastKey, lastNeedle, lastIndex } = state;
  let low = 0;
  let high = haystack.length - 1;
  if (key === lastKey) {
    if (needle === lastNeedle) {
      found = lastIndex !== -1 && haystack[lastIndex][COLUMN] === needle;
      return lastIndex;
    }
    if (needle >= lastNeedle) {
      low = lastIndex === -1 ? 0 : lastIndex;
    } else {
      high = lastIndex;
    }
  }
  state.lastKey = key;
  state.lastNeedle = needle;
  return state.lastIndex = binarySearch(haystack, needle, low, high);
}
function parse(map) {
  return typeof map === "string" ? JSON.parse(map) : map;
}
var LINE_GTR_ZERO = "`line` must be greater than 0 (lines start at line 1)";
var COL_GTR_EQ_ZERO = "`column` must be greater than or equal to 0 (columns start at column 0)";
var LEAST_UPPER_BOUND = -1;
var GREATEST_LOWER_BOUND = 1;
var TraceMap = class {
  constructor(map, mapUrl) {
    const isString = typeof map === "string";
    if (!isString && map._decodedMemo) return map;
    const parsed = parse(map);
    const { version, file, names, sourceRoot, sources, sourcesContent } = parsed;
    this.version = version;
    this.file = file;
    this.names = names || [];
    this.sourceRoot = sourceRoot;
    this.sources = sources;
    this.sourcesContent = sourcesContent;
    this.ignoreList = parsed.ignoreList || parsed.x_google_ignoreList || void 0;
    const resolve2 = resolver(mapUrl, sourceRoot);
    this.resolvedSources = sources.map(resolve2);
    const { mappings } = parsed;
    if (typeof mappings === "string") {
      this._encoded = mappings;
      this._decoded = void 0;
    } else if (Array.isArray(mappings)) {
      this._encoded = void 0;
      this._decoded = maybeSort(mappings, isString);
    } else if (parsed.sections) {
      throw new Error(`TraceMap passed sectioned source map, please use FlattenMap export instead`);
    } else {
      throw new Error(`invalid source map: ${JSON.stringify(parsed)}`);
    }
    this._decodedMemo = memoizedState();
    this._bySources = void 0;
    this._bySourceMemos = void 0;
  }
};
function cast(map) {
  return map;
}
function decodedMappings(map) {
  var _a;
  return (_a = cast(map))._decoded || (_a._decoded = decode(cast(map)._encoded));
}
function originalPositionFor(map, needle) {
  let { line, column, bias } = needle;
  line--;
  if (line < 0) throw new Error(LINE_GTR_ZERO);
  if (column < 0) throw new Error(COL_GTR_EQ_ZERO);
  const decoded = decodedMappings(map);
  if (line >= decoded.length) return OMapping(null, null, null, null);
  const segments = decoded[line];
  const index = traceSegmentInternal(
    segments,
    cast(map)._decodedMemo,
    line,
    column,
    bias
  );
  if (index === -1) return OMapping(null, null, null, null);
  const segment = segments[index];
  if (segment.length === 1) return OMapping(null, null, null, null);
  const { names, resolvedSources } = map;
  return OMapping(
    resolvedSources[segment[SOURCES_INDEX]],
    segment[SOURCE_LINE] + 1,
    segment[SOURCE_COLUMN],
    segment.length === 5 ? names[segment[NAMES_INDEX]] : null
  );
}
function generatedPositionFor(map, needle) {
  const { source, line, column, bias } = needle;
  return generatedPosition(map, source, line, column, bias || GREATEST_LOWER_BOUND, false);
}
function OMapping(source, line, column, name) {
  return { source, line, column, name };
}
function GMapping(line, column) {
  return { line, column };
}
function traceSegmentInternal(segments, memo, line, column, bias) {
  let index = memoizedBinarySearch(segments, column, memo, line);
  if (found) {
    index = (bias === LEAST_UPPER_BOUND ? upperBound : lowerBound)(segments, column, index);
  } else if (bias === LEAST_UPPER_BOUND) index++;
  if (index === -1 || index === segments.length) return -1;
  return index;
}
function generatedPosition(map, source, line, column, bias, all) {
  var _a, _b;
  line--;
  if (line < 0) throw new Error(LINE_GTR_ZERO);
  if (column < 0) throw new Error(COL_GTR_EQ_ZERO);
  const { sources, resolvedSources } = map;
  let sourceIndex2 = sources.indexOf(source);
  if (sourceIndex2 === -1) sourceIndex2 = resolvedSources.indexOf(source);
  if (sourceIndex2 === -1) return all ? [] : GMapping(null, null);
  const bySourceMemos = (_a = cast(map))._bySourceMemos || (_a._bySourceMemos = sources.map(memoizedState));
  const generated = (_b = cast(map))._bySources || (_b._bySources = buildBySources(decodedMappings(map), bySourceMemos));
  const segments = generated[sourceIndex2][line];
  if (segments == null) return all ? [] : GMapping(null, null);
  const memo = bySourceMemos[sourceIndex2];
  const index = traceSegmentInternal(segments, memo, line, column, bias);
  if (index === -1) return GMapping(null, null);
  const segment = segments[index];
  return GMapping(segment[REV_GENERATED_LINE] + 1, segment[REV_GENERATED_COLUMN]);
}
function decodeInlineSourceMap(sourceMapURL) {
  const comma2 = sourceMapURL.indexOf(",");
  if (!sourceMapURL.startsWith("data:") || comma2 === -1) return null;
  const meta = sourceMapURL.slice(5, comma2);
  const payload = sourceMapURL.slice(comma2 + 1);
  try {
    const json = meta.includes("base64") ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload);
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function urlToPath(url) {
  if (!url.startsWith("file://")) return null;
  try {
    return fileURLToPath(url);
  } catch {
    return null;
  }
}
class SourceMapRegistry {
  byScriptId = /* @__PURE__ */ new Map();
  /** Authored absolute path -> scriptIds whose map covers it (for re-binding breakpoints on parse). */
  scriptsByAuthored = /* @__PURE__ */ new Map();
  register(scriptId, url, sourceMapURL) {
    const filePath = urlToPath(url);
    const entry = {
      scriptId,
      url,
      filePath,
      tracer: null,
      authoredByPath: /* @__PURE__ */ new Map(),
      pathByAuthored: /* @__PURE__ */ new Map()
    };
    const rawMap = sourceMapURL ? decodeInlineSourceMap(sourceMapURL) : null;
    if (rawMap) {
      try {
        const tracer = new TraceMap(rawMap, url);
        entry.tracer = tracer;
        const sources = tracer.sources;
        const resolved = tracer.resolvedSources;
        for (let i = 0; i < sources.length; i++) {
          const raw = sources[i];
          if (raw == null) continue;
          const abs = resolved[i] ? urlToPath(resolved[i]) : null;
          const path = abs ?? raw;
          entry.authoredByPath.set(path, raw);
          entry.pathByAuthored.set(raw, path);
          let set = this.scriptsByAuthored.get(path);
          if (!set) this.scriptsByAuthored.set(path, set = /* @__PURE__ */ new Set());
          set.add(scriptId);
        }
      } catch {
        entry.tracer = null;
      }
    }
    this.byScriptId.set(scriptId, entry);
    if (!entry.tracer && filePath) {
      let set = this.scriptsByAuthored.get(filePath);
      if (!set) this.scriptsByAuthored.set(filePath, set = /* @__PURE__ */ new Set());
      set.add(scriptId);
    }
  }
  clear() {
    this.byScriptId.clear();
    this.scriptsByAuthored.clear();
  }
  /** Script ids already parsed whose code maps the given authored file (for breakpoint re-binding). */
  scriptsForAuthored(file) {
    return [...this.scriptsByAuthored.get(file) ?? []];
  }
  /**
   * Map an authored editor line (1-based) to a generated location for `Debugger.setBreakpointByUrl`.
   * Returns one candidate per script that maps the file; empty when no parsed script covers it yet
   * (the caller then sets an identity breakpoint on the file URL, which Node binds on parse).
   */
  authoredToGenerated(file, line) {
    const out = [];
    for (const scriptId of this.scriptsByAuthored.get(file) ?? []) {
      const entry = this.byScriptId.get(scriptId);
      if (!entry) continue;
      if (!entry.tracer) {
        out.push({ url: entry.url, lineNumber: line - 1, columnNumber: 0 });
        continue;
      }
      const source = entry.authoredByPath.get(file);
      if (source == null) continue;
      const gen = generatedPositionFor(entry.tracer, { source, line, column: 0, bias: LEAST_UPPER_BOUND }) ?? generatedPositionFor(entry.tracer, { source, line, column: 0, bias: GREATEST_LOWER_BOUND });
      if (gen && gen.line != null) {
        out.push({ url: entry.url, lineNumber: gen.line - 1, columnNumber: gen.column ?? 0 });
      }
    }
    return out;
  }
  /**
   * Map a paused CDP location (0-based line/column) back to the authored source. Falls back to the
   * script's own file for un-mapped scripts; returns null for scripts with no file URL (native code).
   */
  generatedToAuthored(scriptId, lineNumber, columnNumber) {
    const entry = this.byScriptId.get(scriptId);
    if (!entry) return null;
    if (!entry.tracer) {
      if (!entry.filePath) return null;
      return { file: entry.filePath, line: lineNumber + 1, column: columnNumber + 1 };
    }
    const pos = originalPositionFor(entry.tracer, {
      line: lineNumber + 1,
      column: columnNumber,
      bias: GREATEST_LOWER_BOUND
    });
    if (!pos || pos.source == null || pos.line == null) {
      return entry.filePath ? { file: entry.filePath, line: lineNumber + 1, column: columnNumber + 1 } : null;
    }
    const abs = entry.pathByAuthored.get(pos.source) ?? urlToPath(pos.source) ?? pos.source;
    return { file: abs, line: pos.line, column: (pos.column ?? 0) + 1 };
  }
}
function pathToUrl(filePath) {
  return pathToFileURL(filePath).toString();
}
const requireFrom = createRequire(import.meta.url);
let cachedNodeMajor = null;
function nodeMajor() {
  if (cachedNodeMajor != null) return cachedNodeMajor;
  try {
    const out = execFileSync("node", ["-v"], { encoding: "utf8" }).trim();
    cachedNodeMajor = Number.parseInt(out.replace(/^v/, "").split(".")[0] ?? "0", 10) || 0;
  } catch {
    cachedNodeMajor = 0;
  }
  return cachedNodeMajor;
}
function resolveTsxLoader(cwd) {
  const unpacked = (p) => p.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
  try {
    return unpacked(requireFrom.resolve("tsx", { paths: [cwd] }));
  } catch {
  }
  try {
    return unpacked(requireFrom.resolve("tsx"));
  } catch {
    return null;
  }
}
const INSPECTOR_NOISE = [
  /^Debugger listening on /,
  /^For help, see: https:\/\/nodejs\.org/,
  /^Debugger attached\.?$/,
  /^Waiting for the debugger to disconnect/
];
function describe(obj) {
  if (!obj) return "undefined";
  if (obj.unserializableValue) return obj.unserializableValue;
  if (obj.type === "string") return JSON.stringify(obj.value);
  if (obj.type === "undefined") return "undefined";
  if (obj.subtype === "null") return "null";
  if (obj.value !== void 0 && obj.type !== "object" && obj.type !== "function") {
    return String(obj.value);
  }
  return obj.description ?? obj.className ?? obj.type;
}
function describeForConsole(obj) {
  if (obj.type === "string") return String(obj.value ?? obj.description ?? "");
  return describe(obj);
}
function refFor(obj) {
  if (!obj || !obj.objectId) return "";
  if (obj.subtype === "null") return "";
  return obj.type === "object" || obj.type === "function" ? obj.objectId : "";
}
class NodeDebugSession {
  constructor(callbacks) {
    this.callbacks = callbacks;
  }
  client = new CdpClient();
  registry = new SourceMapRegistry();
  child = null;
  terminated = false;
  /** The artificial entry break from `--inspect-brk` has been auto-resumed past. */
  entryConsumed = false;
  paused = false;
  /** Scope chain per paused call frame, so `getVariables(frameId)` can return its scopes. */
  frameScopes = /* @__PURE__ */ new Map();
  /** Desired breakpoints: authored file -> set of 1-based lines. */
  desired = /* @__PURE__ */ new Map();
  /** CDP breakpoint ids currently set per authored file (so we can replace them). */
  appliedIds = /* @__PURE__ */ new Map();
  buildArgs(program, cwd, args) {
    const ext = extname(program).toLowerCase();
    const isTs = ext === ".ts" || ext === ".mts" || ext === ".cts" || ext === ".tsx";
    const isJsx = ext === ".tsx" || ext === ".jsx";
    const nodeArgs = ["--inspect-brk=127.0.0.1:0", "--enable-source-maps"];
    if (isTs || isJsx) {
      const tsxLoader = resolveTsxLoader(cwd);
      if (tsxLoader) {
        nodeArgs.push("--import", pathToUrl(tsxLoader));
      } else if (isJsx) {
        throw new Error(
          `Cannot debug JSX (${ext}): the tsx loader is unavailable. Reinstall Forge, or install tsx in the project (e.g. \`pnpm add -D tsx\`).`
        );
      } else if (nodeMajor() >= 22) {
        nodeArgs.push("--experimental-strip-types", "--experimental-transform-types");
      } else {
        throw new Error(
          "To debug TypeScript, install tsx (e.g. `pnpm add -D tsx`) or run with Node 22+."
        );
      }
    }
    return [...nodeArgs, program, ...args];
  }
  async start(config, breakpoints) {
    const program = config.program;
    if (!program) throw new Error("No program to debug (open a file or pick a launch configuration).");
    const cwd = config.cwd ?? dirname(program);
    for (const bp of breakpoints) {
      let set = this.desired.get(bp.file);
      if (!set) this.desired.set(bp.file, set = /* @__PURE__ */ new Set());
      set.add(bp.line);
    }
    this.callbacks.onState({ status: "starting" });
    const args = this.buildArgs(program, cwd, config.args ?? []);
    const child = spawn("node", args, {
      cwd,
      env: { ...process.env, ...getActiveAwsEnv(), ...config.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.child = child;
    let wsUrl = null;
    let stderrBuffer = "";
    const tryConnect = (text) => {
      if (wsUrl) return;
      const match = text.match(/ws:\/\/[^\s]+/);
      if (match) {
        wsUrl = match[0];
        void this.connect(wsUrl);
      }
    };
    child.stdout?.on(
      "data",
      (d) => this.callbacks.onOutput({ category: "stdout", text: d.toString() })
    );
    child.stderr?.on("data", (d) => {
      const text = d.toString();
      stderrBuffer += text;
      tryConnect(stderrBuffer);
      for (const line of text.split("\n")) {
        if (!line) continue;
        if (/Waiting for the debugger to disconnect/.test(line)) {
          this.handleExit();
          return;
        }
        if (INSPECTOR_NOISE.some((re) => re.test(line))) continue;
        this.callbacks.onOutput({ category: "stderr", text: line + "\n" });
      }
    });
    child.on("error", (e) => {
      this.callbacks.onOutput({ category: "stderr", text: `Failed to launch: ${e.message}
` });
      this.handleExit();
    });
    child.on("exit", (code) => {
      if (code != null && code !== 0 && !this.terminated) {
        this.callbacks.onOutput({ category: "stderr", text: `Process exited with code ${code}.
` });
      }
      this.handleExit();
    });
  }
  async connect(url) {
    try {
      await this.client.connect(url);
    } catch (e) {
      this.callbacks.onOutput({
        category: "stderr",
        text: `Could not attach debugger: ${e instanceof Error ? e.message : String(e)}
`
      });
      this.handleExit();
      return;
    }
    this.client.on("Debugger.scriptParsed", (p) => this.onScriptParsed(p));
    this.client.on("Debugger.paused", (p) => this.onPaused(p));
    this.client.on("Runtime.consoleAPICalled", (p) => this.onConsole(p));
    this.client.on("Runtime.exceptionThrown", (p) => this.onException(p));
    this.client.on("socket-close", () => this.handleExit());
    await this.client.send("Runtime.enable");
    await this.client.send("Debugger.enable");
    await this.client.send("Debugger.setPauseOnExceptions", { state: "none" });
    await Promise.all([...this.desired.keys()].map((file) => this.applyFile(file)));
    await this.client.send("Runtime.runIfWaitingForDebugger");
  }
  onScriptParsed(p) {
    this.registry.register(p.scriptId, p.url, p.sourceMapURL);
    if (this.desired.size === 0) return;
    const affected = /* @__PURE__ */ new Set();
    for (const file of this.desired.keys()) {
      if (this.registry.scriptsForAuthored(file).includes(p.scriptId)) affected.add(file);
    }
    for (const file of affected) void this.applyFile(file);
  }
  /** Replace every CDP breakpoint for `file` with one per desired line; returns their bound state. */
  async applyFile(file) {
    const old = this.appliedIds.get(file) ?? [];
    await Promise.all(
      old.map((id) => this.client.send("Debugger.removeBreakpoint", { breakpointId: id }).catch(() => {
      }))
    );
    const ids = [];
    const resolved = [];
    const lines = [...this.desired.get(file) ?? []].sort((a, b) => a - b);
    for (const line of lines) {
      const candidates = this.registry.authoredToGenerated(file, line);
      const target = candidates[0] ?? { url: pathToUrl(file), lineNumber: line - 1, columnNumber: 0 };
      try {
        const res = await this.client.send(
          "Debugger.setBreakpointByUrl",
          { url: target.url, lineNumber: target.lineNumber, columnNumber: target.columnNumber }
        );
        ids.push(res.breakpointId);
        resolved.push({ file, line, verified: (res.locations?.length ?? 0) > 0 });
      } catch {
        resolved.push({ file, line, verified: false });
      }
    }
    this.appliedIds.set(file, ids);
    return resolved;
  }
  async setBreakpoints(file, lines) {
    if (lines.length === 0) this.desired.delete(file);
    else this.desired.set(file, new Set(lines));
    if (this.terminated) return lines.map((line) => ({ file, line, verified: false }));
    return this.applyFile(file);
  }
  onPaused(p) {
    if (!this.entryConsumed) {
      this.entryConsumed = true;
      const realStop = (p.hitBreakpoints?.length ?? 0) > 0 || p.reason === "exception";
      if (!realStop) {
        void this.client.send("Debugger.resume");
        this.callbacks.onState({ status: "running" });
        return;
      }
    }
    this.paused = true;
    this.frameScopes.clear();
    const frames = p.callFrames.map((cf) => {
      this.frameScopes.set(cf.callFrameId, cf.scopeChain);
      const loc = this.registry.generatedToAuthored(
        cf.location.scriptId,
        cf.location.lineNumber,
        cf.location.columnNumber ?? 0
      );
      return {
        id: cf.callFrameId,
        name: cf.functionName || "(anonymous)",
        file: loc?.file ?? null,
        line: loc?.line ?? 0,
        column: loc?.column ?? 0
      };
    });
    const top = frames.find((f) => f.file);
    const reason = p.reason === "exception" || p.reason === "promiseRejection" ? "exception" : (p.hitBreakpoints?.length ?? 0) > 0 ? "breakpoint" : "step";
    this.callbacks.onState({ status: "paused" });
    this.callbacks.onStopped({
      reason,
      frames,
      topFile: top?.file ?? null,
      topLine: top?.line ?? 0
    });
  }
  onConsole(p) {
    const text = (p.args ?? []).map(describeForConsole).join(" ");
    this.callbacks.onOutput({ category: "console", text: text + "\n" });
  }
  onException(p) {
    const d = p.exceptionDetails;
    const text = d?.exception ? describe(d.exception) : d?.text ?? "Uncaught exception";
    this.callbacks.onOutput({ category: "stderr", text: text + "\n" });
  }
  resumeState() {
    this.paused = false;
    this.frameScopes.clear();
    this.callbacks.onState({ status: "running" });
  }
  resume() {
    if (!this.paused) return;
    void this.client.send("Debugger.resume");
    this.resumeState();
  }
  pause() {
    void this.client.send("Debugger.pause").catch(() => {
    });
  }
  stepOver() {
    if (!this.paused) return;
    void this.client.send("Debugger.stepOver");
    this.resumeState();
  }
  stepInto() {
    if (!this.paused) return;
    void this.client.send("Debugger.stepInto");
    this.resumeState();
  }
  stepOut() {
    if (!this.paused) return;
    void this.client.send("Debugger.stepOut");
    this.resumeState();
  }
  async getVariables(reference) {
    const scopes = this.frameScopes.get(reference);
    if (scopes) {
      return scopes.filter((s) => s.object.objectId).map((s) => ({
        name: s.name || s.type.charAt(0).toUpperCase() + s.type.slice(1),
        value: s.type,
        type: "scope",
        reference: s.object.objectId ?? ""
      }));
    }
    const res = await this.client.send("Runtime.getProperties", {
      objectId: reference,
      ownProperties: true,
      generatePreview: true
    });
    return (res.result ?? []).filter((d) => d.value || d.get).map((d) => {
      const obj = d.value ?? { type: "function", description: "(...)" };
      return {
        name: d.name,
        value: d.value ? describe(obj) : "(getter)",
        type: obj.subtype ?? obj.type,
        reference: refFor(d.value)
      };
    });
  }
  async evaluate(expression, frameId) {
    const usingFrame = this.paused && frameId && this.frameScopes.has(frameId);
    const res = usingFrame ? await this.client.send(
      "Debugger.evaluateOnCallFrame",
      { callFrameId: frameId, expression, generatePreview: true, silent: true }
    ) : await this.client.send(
      "Runtime.evaluate",
      { expression, includeCommandLineAPI: true, generatePreview: true, silent: true }
    );
    if (res.exceptionDetails) {
      return res.exceptionDetails.exception ? describe(res.exceptionDetails.exception) : res.exceptionDetails.text ?? "Evaluation error";
    }
    return describe(res.result);
  }
  handleExit() {
    if (this.terminated) return;
    this.terminated = true;
    this.paused = false;
    this.frameScopes.clear();
    this.registry.clear();
    this.client.close();
    if (this.child && !this.child.killed) {
      try {
        this.child.kill();
      } catch {
      }
    }
    this.child = null;
    this.callbacks.onState({ status: "terminated" });
  }
  stop() {
    this.handleExit();
  }
}
function registerDebugIpc(ipcMain2) {
  const sessions2 = /* @__PURE__ */ new Map();
  const sessionFor = (sender) => sessions2.get(sender.id);
  const dispose = (id) => {
    sessions2.get(id)?.stop();
    sessions2.delete(id);
  };
  ipcMain2.handle(
    IpcChannels.debugStart,
    (e, config, breakpoints) => toResult(async () => {
      const sender = e.sender;
      dispose(sender.id);
      const session = new NodeDebugSession({
        onState: (event) => {
          if (!sender.isDestroyed()) sender.send(IpcChannels.debugState, event);
          if (event.status === "terminated") sessions2.delete(sender.id);
        },
        onStopped: (event) => {
          if (!sender.isDestroyed()) sender.send(IpcChannels.debugStopped, event);
        },
        onOutput: (event) => {
          if (!sender.isDestroyed()) sender.send(IpcChannels.debugOutput, event);
        }
      });
      sessions2.set(sender.id, session);
      sender.once("destroyed", () => dispose(sender.id));
      await session.start(config, breakpoints);
    })
  );
  ipcMain2.handle(
    IpcChannels.debugStop,
    (e) => toResult(async () => {
      dispose(e.sender.id);
    })
  );
  ipcMain2.on(IpcChannels.debugContinue, (e) => sessionFor(e.sender)?.resume());
  ipcMain2.on(IpcChannels.debugPause, (e) => sessionFor(e.sender)?.pause());
  ipcMain2.on(IpcChannels.debugStepOver, (e) => sessionFor(e.sender)?.stepOver());
  ipcMain2.on(IpcChannels.debugStepInto, (e) => sessionFor(e.sender)?.stepInto());
  ipcMain2.on(IpcChannels.debugStepOut, (e) => sessionFor(e.sender)?.stepOut());
  ipcMain2.handle(
    IpcChannels.debugSetBreakpoints,
    (e, file, lines) => toResult(async () => await sessionFor(e.sender)?.setBreakpoints(file, lines) ?? [])
  );
  ipcMain2.handle(
    IpcChannels.debugEvaluate,
    (e, expression, frameId) => toResult(async () => await sessionFor(e.sender)?.evaluate(expression, frameId) ?? "")
  );
  ipcMain2.handle(
    IpcChannels.debugGetVariables,
    (e, reference) => toResult(async () => await sessionFor(e.sender)?.getVariables(reference) ?? [])
  );
}
let watcher = null;
let debounce = null;
function watchWorkspace(sender, rootPath) {
  watcher?.close();
  watcher = null;
  try {
    watcher = watch(rootPath, { recursive: true }, (_event, filename) => {
      const name = filename?.toString() ?? "";
      if (name.includes("node_modules")) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!sender.isDestroyed()) sender.send(IpcChannels.fsChanged);
      }, 300);
    });
  } catch {
  }
}
const require$1 = createRequire(import.meta.url);
const pty = require$1("node-pty");
const sessions = /* @__PURE__ */ new Map();
const pollers = /* @__PURE__ */ new Map();
const BUSY_POLL_MS = 400;
const FLOW_HIGH_WATER = 1e5;
const FLOW_LOW_WATER = 5e3;
const flow = /* @__PURE__ */ new Map();
function defaultShell() {
  if (process.platform === "win32") return process.env.COMSPEC ?? "powershell.exe";
  return process.env.SHELL ?? "/bin/zsh";
}
function shellName() {
  return (defaultShell().split("/").pop() ?? "sh").replace(/^-/, "");
}
function shellArgs() {
  if (process.platform === "win32") return [];
  return ["-l"];
}
function stopPoller(id) {
  const t = pollers.get(id);
  if (t) {
    clearInterval(t);
    pollers.delete(id);
  }
}
function createTerminal(sender, args) {
  sessions.get(args.id)?.kill();
  flow.set(args.id, { unacked: 0, paused: false });
  const proc = pty.spawn(defaultShell(), shellArgs(), {
    name: "xterm-256color",
    cols: Math.max(args.cols, 2),
    rows: Math.max(args.rows, 1),
    cwd: args.cwd ?? process.env.HOME ?? process.cwd(),
    // getActiveAwsEnv() injects AWS_PROFILE/region for the active connection, so terminals
    // and run-tasks (which write into ptys created here) use the chosen profile.
    env: {
      ...process.env,
      ...getActiveAwsEnv(),
      TERM: "xterm-256color",
      COLORTERM: "truecolor"
    }
  });
  sessions.set(args.id, proc);
  proc.onData((chunk) => {
    if (sender.isDestroyed()) return;
    sender.send(IpcChannels.terminalData, { id: args.id, chunk });
    const f = flow.get(args.id);
    if (f) {
      f.unacked += chunk.length;
      if (!f.paused && f.unacked >= FLOW_HIGH_WATER) {
        f.paused = true;
        proc.pause();
      }
    }
  });
  proc.onExit(({ exitCode }) => {
    if (sessions.get(args.id) === proc) {
      sessions.delete(args.id);
      flow.delete(args.id);
      stopPoller(args.id);
      if (!sender.isDestroyed()) {
        sender.send(IpcChannels.terminalExit, { id: args.id, code: exitCode });
      }
    }
  });
  const shell2 = shellName();
  let busy = false;
  let lastProc = "";
  const poll = setInterval(() => {
    if (sessions.get(args.id) !== proc) return;
    let fg = "";
    try {
      fg = proc.process;
    } catch {
      fg = "";
    }
    const name = fg.replace(/^-/, "");
    const next = name !== "" && name !== shell2;
    if (next !== busy || name !== lastProc) {
      busy = next;
      lastProc = name;
      if (!sender.isDestroyed()) {
        sender.send(IpcChannels.terminalBusy, { id: args.id, busy, proc: name });
      }
    }
  }, BUSY_POLL_MS);
  pollers.set(args.id, poll);
}
function writeTerminal(id, data) {
  sessions.get(id)?.write(data);
}
function ackTerminal(id, charCount) {
  const f = flow.get(id);
  if (!f) return;
  f.unacked = Math.max(0, f.unacked - charCount);
  if (f.paused && f.unacked <= FLOW_LOW_WATER) {
    f.paused = false;
    sessions.get(id)?.resume();
  }
}
function resizeTerminal(id, cols, rows) {
  try {
    sessions.get(id)?.resize(Math.max(cols, 2), Math.max(rows, 1));
  } catch {
  }
}
function killTerminal(id) {
  sessions.get(id)?.kill();
  sessions.delete(id);
  flow.delete(id);
  stopPoller(id);
}
const SETTINGS_PATH = join(homedir(), ".forge", "settings.json");
const CREDENTIALS_PATH = join(homedir(), ".forge", "git-credentials");
const AI_CREDENTIALS_PATH = join(homedir(), ".forge", "ai-credentials");
const isMac = process.platform === "darwin";
let autoSaveState = false;
const pendingOpenFiles = [];
function requestOpenFile(filePath) {
  pendingOpenFiles.push(filePath);
  if (app.isReady()) {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else flushPendingFiles();
  }
}
function flushPendingFiles(target) {
  if (pendingOpenFiles.length === 0) return;
  const win = target ?? BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win || win.isDestroyed()) return;
  const send = () => {
    if (win.isDestroyed()) return;
    for (const path of pendingOpenFiles.splice(0)) win.webContents.send(IpcChannels.openPath, path);
    if (win.isMinimized()) win.restore();
    win.focus();
  };
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
}
function filePathsFromArgv(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).filter((arg) => !arg.startsWith("-") && existsSync(arg) && statSync(arg).isFile());
}
function menuAction(id) {
  BrowserWindow.getFocusedWindow()?.webContents.send(IpcChannels.menuAction, id);
}
const windowWorkspaces = /* @__PURE__ */ new Map();
function broadcastWindows() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IpcChannels.windowsChanged);
  }
}
function buildAppMenu() {
  const fileMenu = {
    label: "File",
    submenu: [
      { label: "New Text File", click: () => menuAction("file.newTextFile") },
      { label: "New File…", click: () => menuAction("file.newFile") },
      { label: "New Window", click: () => createWindow() },
      { type: "separator" },
      { label: "Open File…", click: () => menuAction("file.openFile") },
      { label: "Open Folder…", click: () => menuAction("file.openFolder") },
      { type: "separator" },
      { label: "Save", click: () => menuAction("file.save") },
      { type: "separator" },
      { label: "Auto Save", type: "checkbox", checked: autoSaveState, click: () => menuAction("toggleAutoSave") },
      { label: "Revert File", click: () => menuAction("file.revert") },
      { type: "separator" },
      { label: "Close Editor", click: () => menuAction("file.closeEditor") },
      { label: "Close Folder", click: () => menuAction("file.closeFolder") },
      { type: "separator" },
      { role: "close" }
    ]
  };
  const template = isMac ? [{ role: "appMenu" }, fileMenu, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }] : [{ role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function createWindow(initialFolder) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    // On macOS use a native vibrancy material so the blurred desktop shows through any
    // translucent pixel of the renderer (the frosted-glass look). The window background
    // must be fully transparent for the material to be visible; `visualEffectState:
    // 'active'` keeps the blur lit even when the window is unfocused. Other platforms
    // keep an opaque background (vibrancy is macOS-only).
    backgroundColor: isMac ? "#00000000" : "#0a0a0c",
    ...isMac ? { vibrancy: "under-window", visualEffectState: "active" } : {},
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.on("ready-to-show", () => {
    win.maximize();
    win.show();
  });
  const winId = win.webContents.id;
  win.on("focus", broadcastWindows);
  win.on("blur", broadcastWindows);
  win.on("closed", () => {
    windowWorkspaces.delete(winId);
    broadcastWindows();
  });
  win.webContents.on("did-finish-load", () => {
    flushPendingFiles(win);
    if (initialFolder) win.webContents.send(IpcChannels.openFolderInWindow, initialFolder);
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on("second-instance", (_event, argv) => {
  for (const filePath of filePathsFromArgv(argv)) requestOpenFile(filePath);
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  requestOpenFile(filePath);
});
app.whenReady().then(async () => {
  if (!hasInstanceLock) return;
  for (const filePath of filePathsFromArgv(process.argv)) pendingOpenFiles.push(filePath);
  if (app.isPackaged) await hydratePathFromLoginShell();
  if (isMac && !app.isPackaged) {
    app.dock?.setIcon(join(process.cwd(), "build", "icon.png"));
  }
  buildAppMenu();
  ipcMain.handle(IpcChannels.ping, (_event, msg) => pongOf(msg));
  ipcMain.handle(IpcChannels.openFolder, async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled || res.filePaths.length === 0) return ok(null);
    const rootPath = res.filePaths[0];
    return toResult(async () => ({ rootPath, tree: await readDirectoryEntries(rootPath) }));
  });
  ipcMain.handle(IpcChannels.openFileDialog, async () => {
    const res = await dialog.showOpenDialog({ properties: ["openFile"] });
    if (res.canceled || res.filePaths.length === 0) return ok(null);
    const path = res.filePaths[0];
    return toResult(async () => ({ path, name: basename(path), content: await readFileText(path) }));
  });
  ipcMain.handle(IpcChannels.saveDialog, async (_e, defaultName) => {
    const res = await dialog.showSaveDialog({ defaultPath: defaultName });
    return ok(res.canceled || !res.filePath ? null : res.filePath);
  });
  ipcMain.handle(
    IpcChannels.readDirectory,
    (_e, path) => toResult(() => readDirectoryEntries(path))
  );
  ipcMain.handle(IpcChannels.readFile, (_e, path) => toResult(() => readFileText(path)));
  ipcMain.handle(
    IpcChannels.readFileBase64,
    (_e, path) => toResult(() => readFileBase64(path))
  );
  ipcMain.handle(
    IpcChannels.writeFile,
    (_e, path, content) => toResult(() => writeFileText(path, content))
  );
  ipcMain.handle(
    IpcChannels.listFiles,
    (_e, rootPath) => toResult(async () => {
      const settings = await readSettings(SETTINGS_PATH);
      return listFilesRecursive(rootPath, settings.searchExclude ?? []);
    })
  );
  ipcMain.handle(
    IpcChannels.gitBranch,
    (_e, rootPath) => toResult(() => readGitBranch(rootPath))
  );
  ipcMain.handle(
    IpcChannels.gitChanges,
    (_e, rootPath) => toResult(() => getGitChanges(rootPath))
  );
  ipcMain.handle(
    IpcChannels.gitCommit,
    (_e, rootPath, message) => toResult(() => gitCommit(rootPath, message))
  );
  ipcMain.handle(
    IpcChannels.gitStage,
    (_e, rootPath, path) => toResult(() => gitStage(rootPath, path))
  );
  ipcMain.handle(
    IpcChannels.gitUnstage,
    (_e, rootPath, path) => toResult(() => gitUnstage(rootPath, path))
  );
  ipcMain.handle(
    IpcChannels.gitDiscard,
    (_e, rootPath, path) => toResult(() => gitDiscard(rootPath, path))
  );
  ipcMain.handle(
    IpcChannels.gitStageAll,
    (_e, rootPath) => toResult(() => gitStageAll(rootPath))
  );
  ipcMain.handle(
    IpcChannels.gitUnstageAll,
    (_e, rootPath) => toResult(() => gitUnstageAll(rootPath))
  );
  ipcMain.handle(
    IpcChannels.gitDiscardAll,
    (_e, rootPath) => toResult(() => gitDiscardAll(rootPath))
  );
  ipcMain.handle(
    IpcChannels.gitOriginal,
    (_e, rootPath, path) => toResult(() => getGitOriginalContent(rootPath, path))
  );
  ipcMain.handle(
    IpcChannels.gitStaged,
    (_e, rootPath, path) => toResult(() => getGitStagedContent(rootPath, path))
  );
  ipcMain.handle(
    IpcChannels.gitBlame,
    (_e, rootPath, path) => toResult(() => getGitBlame(rootPath, path))
  );
  ipcMain.handle(
    IpcChannels.gitBranches,
    (_e, rootPath) => toResult(() => getBranches(rootPath))
  );
  ipcMain.handle(
    IpcChannels.gitCheckout,
    (_e, rootPath, name) => toResult(() => checkoutBranch(rootPath, name))
  );
  ipcMain.handle(
    IpcChannels.gitCreateBranch,
    (_e, rootPath, name) => toResult(() => createBranch(rootPath, name))
  );
  ipcMain.handle(IpcChannels.gitPush, (_e, rootPath) => toResult(() => gitPush(rootPath)));
  ipcMain.handle(
    IpcChannels.gitPublishBranch,
    (_e, rootPath) => toResult(() => publishBranch(rootPath))
  );
  ipcMain.handle(IpcChannels.gitPull, (_e, rootPath) => toResult(() => gitPull(rootPath)));
  ipcMain.handle(IpcChannels.gitFetch, (_e, rootPath) => toResult(() => gitFetch(rootPath)));
  ipcMain.handle(
    IpcChannels.gitAheadBehind,
    (_e, rootPath) => toResult(() => getAheadBehind(rootPath))
  );
  ipcMain.handle(
    IpcChannels.gitLog,
    (_e, rootPath, limit) => toResult(() => getGitLog(rootPath, limit))
  );
  ipcMain.handle(
    IpcChannels.gitSearchLog,
    (_e, rootPath, query, limit) => toResult(() => searchGitLog(rootPath, query, limit))
  );
  ipcMain.handle(
    IpcChannels.gitRefsSig,
    (_e, rootPath) => toResult(() => getGitRefsSig(rootPath))
  );
  ipcMain.handle(
    IpcChannels.gitCommitFiles,
    (_e, rootPath, hash) => toResult(() => getCommitFiles(rootPath, hash))
  );
  ipcMain.handle(
    IpcChannels.gitCommitDetail,
    (_e, rootPath, hash) => toResult(() => getCommitDetail(rootPath, hash))
  );
  ipcMain.handle(
    IpcChannels.gitFileAt,
    (_e, rootPath, ref, relPath) => toResult(() => getFileAtRef(rootPath, ref, relPath))
  );
  ipcMain.handle(
    IpcChannels.gitGetUser,
    (_e, rootPath) => toResult(() => getGitUser(rootPath))
  );
  ipcMain.handle(
    IpcChannels.gitSetUser,
    (_e, rootPath, user) => toResult(() => setGitUser(rootPath, user, CREDENTIALS_PATH))
  );
  ipcMain.handle(
    IpcChannels.gitTestCredential,
    (_e, rootPath, username, token) => toResult(() => testGitCredential(rootPath, username, token))
  );
  ipcMain.handle(IpcChannels.gitGhAuth, (_e, rootPath) => toResult(() => ghAuth(rootPath)));
  ipcMain.handle(
    IpcChannels.gitGhAccounts,
    (_e, rootPath) => toResult(() => ghAccounts(rootPath))
  );
  ipcMain.handle(
    IpcChannels.aiCommitMessage,
    (_e, rootPath) => toResult(async () => {
      const cfg = await resolveAi(SETTINGS_PATH, AI_CREDENTIALS_PATH);
      return generateCommitMessage(cfg, rootPath);
    })
  );
  ipcMain.handle(
    IpcChannels.assistantSend,
    (e, args) => toResult(async () => {
      const sender = e.sender;
      const cfg = await resolveAi(SETTINGS_PATH, AI_CREDENTIALS_PATH);
      startAssistant(
        cfg,
        args,
        (delta) => {
          if (!sender.isDestroyed()) sender.send(IpcChannels.assistantChunk, { id: args.id, delta });
        },
        (error) => {
          if (!sender.isDestroyed()) sender.send(IpcChannels.assistantDone, { id: args.id, error });
        }
      );
    })
  );
  ipcMain.on(IpcChannels.assistantCancel, (_e, id) => cancelAssistant(id));
  ipcMain.handle(
    IpcChannels.agentComplete,
    (_e, args) => toResult(async () => {
      const cfg = await resolveAi(SETTINGS_PATH, AI_CREDENTIALS_PATH);
      return runAgentCompletion(cfg, args);
    })
  );
  ipcMain.on(IpcChannels.agentCancel, (_e, id) => cancelAgent(id));
  ipcMain.handle(
    IpcChannels.agentRunCommand,
    (_e, args) => toResult(() => runAgentCommand(args))
  );
  ipcMain.on(IpcChannels.agentCancelCommand, (_e, id) => cancelAgentCommand(id));
  ipcMain.handle(
    IpcChannels.codemapBuild,
    (_e, rootPath, force) => toResult(() => buildCodeMap(rootPath, SETTINGS_PATH, force))
  );
  ipcMain.handle(
    IpcChannels.skeletonDetect,
    (_e, filePath, code) => toResult(async () => detectSkeletonComponents(filePath, code))
  );
  ipcMain.handle(
    IpcChannels.skeletonGenerate,
    (_e, input) => toResult(async () => runGenerateSkeleton(input))
  );
  ipcMain.handle(
    IpcChannels.skeletonGenerateAi,
    (_e, input) => toResult(async () => {
      const cfg = await resolveAi(SETTINGS_PATH, AI_CREDENTIALS_PATH);
      return runGenerateSkeletonAi(cfg, input);
    })
  );
  ipcMain.handle(
    IpcChannels.aiCompletion,
    (_e, args) => toResult(async () => {
      const cfg = await resolveCompletionAi(SETTINGS_PATH, AI_CREDENTIALS_PATH);
      return new Promise((resolve2) => startCompletion(cfg, args, resolve2));
    })
  );
  ipcMain.on(IpcChannels.aiCompletionCancel, (_e, id) => cancelCompletion(id));
  ipcMain.handle(IpcChannels.aiKeyStatus, () => toResult(() => aiKeyStatus(AI_CREDENTIALS_PATH)));
  ipcMain.handle(
    IpcChannels.aiSetKey,
    (_e, provider, key) => toResult(() => setAiKey(AI_CREDENTIALS_PATH, provider, key))
  );
  ipcMain.handle(
    IpcChannels.search,
    (_e, rootPath, options) => toResult(() => searchInFiles(rootPath, options))
  );
  ipcMain.handle(
    IpcChannels.replaceInFiles,
    (_e, rootPath, options, replacement, files) => toResult(() => replaceInFiles(rootPath, options, replacement, files))
  );
  ipcMain.on(
    IpcChannels.watchWorkspace,
    (e, rootPath) => watchWorkspace(e.sender, rootPath)
  );
  ipcMain.on(IpcChannels.menuSyncState, (_e, autoSave) => {
    autoSaveState = autoSave;
    buildAppMenu();
  });
  ipcMain.on(IpcChannels.newWindow, () => createWindow());
  ipcMain.on(IpcChannels.windowReport, (e, rootPath, name) => {
    windowWorkspaces.set(e.sender.id, { rootPath, name });
    broadcastWindows();
  });
  ipcMain.handle(
    IpcChannels.windowList,
    () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => {
      const info = windowWorkspaces.get(w.webContents.id);
      return {
        id: w.webContents.id,
        rootPath: info?.rootPath ?? null,
        name: info?.name ?? "No workspace",
        focused: w.isFocused()
      };
    })
  );
  ipcMain.on(IpcChannels.windowFocus, (_e, id) => {
    const w = BrowserWindow.getAllWindows().find((win) => win.webContents.id === id);
    if (w && !w.isDestroyed()) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
  ipcMain.on(IpcChannels.windowOpenFolder, (_e, path) => createWindow(path));
  ipcMain.handle(
    IpcChannels.rename,
    (_e, oldPath, newPath) => toResult(() => renameEntry(oldPath, newPath))
  );
  ipcMain.handle(IpcChannels.remove, (_e, path) => toResult(() => deleteEntry(path)));
  ipcMain.handle(
    IpcChannels.copyEntry,
    (_e, src, destDir) => toResult(() => copyEntry(src, destDir))
  );
  ipcMain.handle(
    IpcChannels.moveEntry,
    (_e, src, destDir) => toResult(() => moveEntry(src, destDir))
  );
  ipcMain.handle(IpcChannels.mkdir, (_e, path) => toResult(() => makeDir(path)));
  ipcMain.handle(IpcChannels.loadSettings, () => toResult(() => readSettings(SETTINGS_PATH)));
  ipcMain.handle(
    IpcChannels.saveSettings,
    (_e, settings) => toResult(async () => {
      const existing = await readSettings(SETTINGS_PATH);
      await writeSettings(SETTINGS_PATH, { ...existing, ...settings });
    })
  );
  ipcMain.handle(
    IpcChannels.runFormatter,
    (_e, rootPath, tool, args) => toResult(() => runFormatter(rootPath, tool, args))
  );
  ipcMain.handle(
    IpcChannels.formatText,
    (_e, rootPath, tool, args, input) => toResult(() => formatText(rootPath, tool, args, input))
  );
  ipcMain.handle(
    IpcChannels.runDiagnostics,
    (_e, rootPath) => toResult(() => runDiagnostics(rootPath))
  );
  ipcMain.handle(
    IpcChannels.runInline,
    (_e, code, filePath, languageId, runExport) => toResult(() => runInline(code, filePath, languageId, runExport))
  );
  ipcMain.handle(
    IpcChannels.resolveImport,
    (_e, rootPath, fromFile, spec) => toResult(() => resolveImport(rootPath, fromFile, spec))
  );
  ipcMain.handle(
    IpcChannels.terminalCreate,
    (e, args) => toResult(async () => createTerminal(e.sender, args))
  );
  ipcMain.on(IpcChannels.terminalInput, (_e, id, data) => writeTerminal(id, data));
  ipcMain.on(
    IpcChannels.terminalAck,
    (_e, id, charCount) => ackTerminal(id, charCount)
  );
  ipcMain.on(
    IpcChannels.terminalResize,
    (_e, id, cols, rows) => resizeTerminal(id, cols, rows)
  );
  ipcMain.handle(
    IpcChannels.terminalKill,
    (_e, id) => toResult(async () => killTerminal(id))
  );
  ipcMain.handle(
    IpcChannels.openExternal,
    (_e, url) => toResult(() => shell.openExternal(url))
  );
  registerLanguageIpc(ipcMain);
  ipcMain.handle(IpcChannels.jdtlsGetStatus, () => jdtlsService.getStatus());
  jdtlsService.setStatusNotifier((status2) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.jdtlsStatus, status2);
    }
  });
  registerAwsIpc(ipcMain, SETTINGS_PATH);
  registerEditorIntegrationIpc(ipcMain);
  registerApiRequestIpc(ipcMain);
  registerDebugIpc(ipcMain);
  void readSettings(SETTINGS_PATH).then((s) => setActiveProfile(s.awsProfile ?? null, s.awsRegion ?? null));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
