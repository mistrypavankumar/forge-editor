/**
 * AI Agent Workspace Mode — domain types (renderer side).
 *
 * A single agent run is an {@link AgentSession}: the user's task, the ordered lifecycle
 * ({@link AgentStatus}), the proposed {@link AgentPlan}, the draft {@link FilePatch}es (kept in
 * memory, never written to disk until the user applies them), any {@link AgentCheck} runs, and a
 * chronological {@link TimelineEntry} log of the tool calls the agent made on the user's behalf.
 */

/** The agent lifecycle. Advances forward; `error`/`cancelled` are terminal for the current attempt. */
export type AgentStatus =
  | 'idle'
  | 'planning'
  | 'plan-ready'
  | 'editing'
  | 'review'
  | 'checking'
  | 'done'
  | 'error'
  | 'cancelled';

/** The internal tool interface the orchestrator drives (surfaced in the activity timeline). */
export type AgentToolName =
  | 'listFiles'
  | 'readFile'
  | 'searchFiles'
  | 'getOpenEditors'
  | 'getDiagnostics'
  | 'writeFileDraft'
  | 'showDiff'
  | 'applyPatch'
  | 'runCommand';

export type ToolStatus = 'running' | 'ok' | 'error';

/** One tool invocation, recorded live and then resolved to `ok`/`error`. */
export interface AgentToolCall {
  id: string;
  tool: AgentToolName;
  /** One-line human summary, e.g. `read src/foo.ts` or `search "pagination" (12 hits)`. */
  detail: string;
  status: ToolStatus;
  /** epoch ms when the call started. */
  at: number;
  error?: string;
}

/** A non-tool note in the timeline (a phase transition, the model's plan summary, an error). */
export interface AgentNote {
  id: string;
  kind: 'note' | 'plan' | 'error' | 'check';
  text: string;
  at: number;
}

export type TimelineEntry =
  | ({ type: 'tool' } & AgentToolCall)
  | ({ type: 'note' } & AgentNote);

/** A file the plan intends to change or create. */
export interface PlanFile {
  /** Workspace-relative path. */
  path: string;
  reason: string;
}

/** The model's proposed approach, shown for approval before any edits are drafted. */
export interface AgentPlan {
  summary: string;
  steps: string[];
  filesToEdit: PlanFile[];
  /** Optional verification commands (e.g. `npm run type-check`). */
  commands: string[];
}

export type PatchState = 'pending' | 'applied' | 'rejected';

/** A proposed edit to a single file. Held in memory; `after` is written to disk only on apply. */
export interface FilePatch {
  /** Workspace-relative path (for display). */
  path: string;
  /** Absolute path on disk. */
  absPath: string;
  /** Current on-disk content (empty string for a new file). */
  before: string;
  /** Proposed new content. */
  after: string;
  /** True when the file did not exist before this patch (a creation). */
  isNew: boolean;
  description: string;
  state: PatchState;
}

export type CheckStatus = 'running' | 'pass' | 'fail' | 'error';

/** The result of running one check command (typecheck / lint / test / build). */
export interface AgentCheck {
  id: string;
  label: string;
  command: string;
  status: CheckStatus;
  exitCode: number | null;
  /** Combined stdout+stderr tail, for the expandable output view. */
  output: string;
  /** Extracted `file:line: message` style lines when the command failed. */
  errors: string[];
  durationMs: number;
}

/** One complete agent run. Persisted (best-effort) so a task survives a reload. */
export interface AgentSession {
  id: string;
  task: string;
  status: AgentStatus;
  /** Workspace root the task is scoped to. */
  rootPath: string | null;
  plan: AgentPlan | null;
  patches: FilePatch[];
  checks: AgentCheck[];
  timeline: TimelineEntry[];
  /** Set when the current attempt failed; cleared on the next action. */
  error: string | null;
  createdAt: number;
  updatedAt: number;
}
