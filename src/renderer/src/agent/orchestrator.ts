import type { AgentPhase } from '@shared/ipc-contract';
import { useAgentStore } from '../stores/agent-store';
import type { AgentToolName, FilePatch } from './types';
import { parsePatches, parsePlan, extractErrorLines } from './parse';
import {
  applyFileWrite,
  getOpenEditors,
  joinPath,
  listWorkspaceFiles,
  openDiffTab,
  readWorkspaceFile,
} from './tools';

/**
 * The agent orchestrator: a deterministic, scripted controller that runs the tools and calls the
 * model brain in discrete phases (plan → edit → checks). It intentionally does NOT let the model
 * free-run tool calls — it gathers context, asks for a plan, waits for the user to approve, asks
 * for edits, stores them as drafts, and only writes to disk when the user applies a specific patch.
 * Every tool call and phase transition is recorded in the session timeline.
 */

let reqSeq = 0;
const nextReqId = (): string => `agent-req-${Date.now().toString(36)}-${(reqSeq += 1)}`;

/** The brain request currently in flight (for Stop), or null. */
let currentBrainId: string | null = null;
/** The check command currently in flight (for Stop), or null. */
let currentCommandId: string | null = null;
/** Set when the user pressed Stop, so the async flow bails out after its awaited call returns. */
let aborted = false;

const store = (): ReturnType<typeof useAgentStore.getState> => useAgentStore.getState();

/** Wrap a tool call with timeline tracking (running → ok/error). */
async function track<T>(tool: AgentToolName, detail: string, fn: () => Promise<T> | T): Promise<T> {
  const id = store().startTool(tool, detail);
  try {
    const result = await fn();
    store().finishTool(id, 'ok');
    return result;
  } catch (e) {
    store().finishTool(id, 'error', e instanceof Error ? e.message : String(e));
    throw e;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n… (truncated)` : s;
}

/** Call the main-process brain for one phase; resolves with the raw reply text. */
async function callBrain(phase: AgentPhase, question: string, context?: string): Promise<string> {
  const id = nextReqId();
  currentBrainId = id;
  try {
    const res = await window.forge.agentComplete({ id, phase, question, context });
    if (!res.ok) throw new Error(res.error);
    return res.data;
  } finally {
    if (currentBrainId === id) currentBrainId = null;
  }
}

// ---- Phase 1: plan ----------------------------------------------------------

/** Start a brand-new task: gather workspace context, then ask the brain for a plan. */
export async function startTask(task: string, rootPath: string | null): Promise<void> {
  aborted = false;
  const s = store();
  s.newSession(task, rootPath);
  s.setStatus('planning');
  s.addNote('note', `Planning task: ${task}`);

  if (!rootPath) {
    s.setError('Open a folder before running the agent.');
    return;
  }

  try {
    const files = await track('listFiles', 'index workspace files', () => listWorkspaceFiles(rootPath));
    const open = await track('getOpenEditors', 'read open editors', () => getOpenEditors());
    if (aborted) return;

    const tree = files.join('\n');
    const openContext = open
      .map((o) => `# Open file: ${o.path}${o.active ? ' (active)' : ''}\n\n\`\`\`\n${truncate(o.content, 8000)}\n\`\`\``)
      .join('\n\n');

    const question = [
      `Task:\n${task}`,
      `\nWorkspace files (relative paths, ${files.length} shown):\n${tree}`,
    ].join('\n');

    const reply = await callBrain('plan', question, openContext || undefined);
    if (aborted) return;

    const plan = parsePlan(reply);
    s.setPlan(plan);
    s.addNote('plan', plan.summary || 'Plan ready.');
    s.setStatus('plan-ready');
  } catch (e) {
    if (aborted) return;
    fail(e);
  }
}

// ---- Phase 2: edit ----------------------------------------------------------

/** Approve the plan and ask the brain to produce concrete, reviewable file patches (drafts). */
export async function approvePlan(): Promise<void> {
  aborted = false;
  const s = store();
  const session = s.session;
  if (!session?.plan || !session.rootPath) return;
  const rootPath = session.rootPath;
  s.setError(null);
  s.setStatus('editing');
  s.addNote('note', 'Plan approved — drafting edits.');

  try {
    // Load current contents of the planned target files as grounding.
    const targets = session.plan.filesToEdit;
    const currentByRel = new Map<string, string | null>();
    for (const t of targets) {
      const abs = joinPath(rootPath, t.path);
      const content = await track('readFile', `read ${t.path}`, () => readWorkspaceFile(abs));
      currentByRel.set(t.path, content);
      if (aborted) return;
    }

    const fileContext = targets
      .map((t) => {
        const cur = currentByRel.get(t.path);
        const header = cur === null ? `# File: ${t.path} (new file)` : `# File: ${t.path}`;
        return `${header}\n\n\`\`\`\n${truncate(cur ?? '', 12000)}\n\`\`\``;
      })
      .join('\n\n');

    const question = [
      `Task:\n${session.task}`,
      `\nApproved plan:\n${session.plan.summary}`,
      session.plan.steps.length ? `\nSteps:\n${session.plan.steps.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '',
    ].join('\n');

    const reply = await callBrain('edit', question, fileContext || undefined);
    if (aborted) return;

    const raw = parsePatches(reply);
    const patches: FilePatch[] = [];
    for (const p of raw) {
      const abs = joinPath(rootPath, p.path);
      // Prefer the content we already read; otherwise read now to compute before/isNew.
      let before = currentByRel.get(p.path);
      if (before === undefined) before = await readWorkspaceFile(abs);
      const isNew = before === null;
      const beforeText = before ?? '';
      if (beforeText === p.content) continue; // no-op edit — skip
      patches.push({
        path: p.path,
        absPath: abs,
        before: beforeText,
        after: p.content,
        isNew,
        description: p.description,
        state: 'pending',
      });
      store().startTool('writeFileDraft', `draft ${p.path}`);
    }

    if (patches.length === 0) {
      s.addNote('note', 'The model proposed no changes.');
      s.setStatus('done');
      return;
    }

    s.setPatches(patches);
    s.addNote('note', `${patches.length} file change${patches.length === 1 ? '' : 's'} ready for review.`);
    s.setStatus('review');
  } catch (e) {
    if (aborted) return;
    fail(e);
  }
}

// ---- Review / apply ---------------------------------------------------------

/** Open a proposed patch as a read-only diff tab in the editor. */
export function previewPatch(path: string): void {
  const patch = store().session?.patches.find((p) => p.path === path);
  if (!patch) return;
  store().startTool('showDiff', `diff ${path}`);
  const name = path.split('/').pop() ?? path;
  openDiffTab(patch.absPath, name, patch.before, patch.after);
}

/** Apply a single patch to disk. */
export async function applyPatch(path: string): Promise<void> {
  const patch = store().session?.patches.find((p) => p.path === path);
  if (!patch || patch.state === 'applied') return;
  const id = store().startTool('applyPatch', `apply ${path}`);
  try {
    await applyFileWrite(patch.absPath, patch.after);
    store().finishTool(id, 'ok');
    store().setPatchState(path, 'applied');
  } catch (e) {
    store().finishTool(id, 'error', e instanceof Error ? e.message : String(e));
    store().setError(e instanceof Error ? e.message : String(e));
  }
}

/** Reject a single patch (drops the draft; nothing is written). */
export function rejectPatch(path: string): void {
  store().setPatchState(path, 'rejected');
  store().addNote('note', `Rejected change to ${path}.`);
}

/** Apply every still-pending patch. */
export async function applyAll(): Promise<void> {
  const patches = store().session?.patches ?? [];
  for (const p of patches) {
    if (p.state === 'pending') await applyPatch(p.path);
  }
  const remaining = (store().session?.patches ?? []).some((p) => p.state === 'pending');
  if (!remaining) store().addNote('note', 'All changes applied.');
}

// ---- Checks -----------------------------------------------------------------

/** Run a set of check commands, capturing output and extracting error lines. */
export async function runChecks(checks: { label: string; command: string }[]): Promise<void> {
  const session = store().session;
  if (!session?.rootPath || checks.length === 0) return;
  const rootPath = session.rootPath;
  aborted = false;
  store().setStatus('checking');

  for (const check of checks) {
    if (aborted) break;
    const checkId = store().startCheck(check.label, check.command);
    const toolId = store().startTool('runCommand', `run ${check.command}`);
    const reqId = nextReqId();
    currentCommandId = reqId;
    try {
      const res = await window.forge.agentRunCommand({
        id: reqId,
        command: check.command,
        cwd: rootPath,
      });
      currentCommandId = null;
      if (!res.ok) throw new Error(res.error);
      const r = res.data;
      const combined = `${r.stdout}\n${r.stderr}`.trim();
      const passed = r.exitCode === 0 && !r.timedOut;
      store().finishTool(toolId, 'ok');
      store().finishCheck(checkId, {
        status: r.timedOut ? 'error' : passed ? 'pass' : 'fail',
        exitCode: r.exitCode,
        output: combined,
        errors: passed ? [] : extractErrorLines(combined),
        durationMs: r.durationMs,
      });
      store().addNote(
        'check',
        `${check.label}: ${r.timedOut ? 'timed out' : passed ? 'passed' : `failed (exit ${r.exitCode})`}`,
      );
    } catch (e) {
      currentCommandId = null;
      const msg = e instanceof Error ? e.message : String(e);
      store().finishTool(toolId, 'error', msg);
      store().finishCheck(checkId, {
        status: 'error',
        exitCode: null,
        output: msg,
        errors: [msg],
        durationMs: 0,
      });
    }
  }

  if (!aborted) store().setStatus(store().session?.patches.length ? 'review' : 'done');
}

// ---- Control ----------------------------------------------------------------

/** Stop the agent: abort any in-flight brain request and running command, and mark it cancelled. */
export function stopAgent(): void {
  aborted = true;
  if (currentBrainId) {
    window.forge.agentCancel(currentBrainId);
    currentBrainId = null;
  }
  if (currentCommandId) {
    window.forge.agentCancelCommand(currentCommandId);
    currentCommandId = null;
  }
  store().addNote('note', 'Agent stopped.');
  store().setStatus('cancelled');
}

function fail(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  store().addNote('error', msg);
  store().setError(msg);
}
