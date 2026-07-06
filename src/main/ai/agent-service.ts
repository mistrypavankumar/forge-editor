import type { AgentCompleteArgs, AgentPhase } from '@shared/ipc-contract';
import { streamAiChat, type AiStreamHandle, type ResolvedAi } from './chat';

/**
 * The AI Agent Workspace Mode brain. Unlike the assistant (a streaming conversational Q&A), the
 * agent runs in discrete, structured phases: it plans, then proposes edits. Each phase is a single
 * completion whose reply must be machine-parseable JSON. We reuse the provider-agnostic
 * {@link streamAiChat} but accumulate the stream into one string and hand it back whole — the
 * renderer parses it and drives the tools itself, so the model never edits files directly.
 */

/** System prompt for the planning phase: produce an ordered plan + the files it will touch. */
const PLAN_SYSTEM = [
  'You are the autonomous coding agent built into the Forge code editor.',
  'You are given a development task and a snapshot of the workspace (a file tree and the contents',
  'of the currently open files). Produce a concise, ordered implementation plan.',
  'Respond with ONLY a single fenced ```json code block and no prose before or after it.',
  'The JSON must match exactly this shape:',
  '{"summary": string, "steps": string[], "filesToEdit": [{"path": string, "reason": string}], "commands": string[]}',
  '- "summary": one or two sentences describing the approach.',
  '- "steps": short, actionable steps in order.',
  '- "filesToEdit": ONLY the workspace-relative paths you will actually change or create, each with a short reason. Prefer files visible in the provided tree; you may list a new file that does not exist yet.',
  '- "commands": zero or more verification commands to run afterwards (e.g. "npm run type-check", "npm test"). Use an empty array if none apply.',
  'Keep it tight. Do not invent files that clearly do not belong to this project.',
].join(' ');

/** System prompt for the edit phase: rewrite each target file in full. */
const EDIT_SYSTEM = [
  'You are the autonomous coding agent built into the Forge code editor.',
  'Implement the approved plan. You are given the task, the plan, and the full current contents of',
  'the target files (a file shown as "(new file)" does not exist yet).',
  'Respond with ONLY a single fenced ```json code block and no prose before or after it.',
  'The JSON must match exactly this shape:',
  '{"patches": [{"path": string, "content": string, "description": string}]}',
  '- "path": workspace-relative path of the file to write.',
  '- "content": the COMPLETE new contents of the file (never a diff or a fragment).',
  '- "description": one line describing the change.',
  'Preserve the existing code style, imports, and formatting conventions of the project.',
  'Only include files you are actually changing. Do not include unchanged files.',
].join(' ');

function systemFor(phase: AgentPhase): string {
  return phase === 'plan' ? PLAN_SYSTEM : EDIT_SYSTEM;
}

/** In-flight completions by id, so {@link cancelAgent} can abort the right stream. */
const active = new Map<string, AiStreamHandle>();
/** Ids the user cancelled — so their abort rejects as a cancel rather than a hard error. */
const cancelled = new Set<string>();

/**
 * Run one agent completion to completion. Resolves with the full accumulated reply text, or rejects
 * with an Error on provider failure / cancellation (the caller maps this onto a `Result`).
 */
export function runAgentCompletion(cfg: ResolvedAi, args: AgentCompleteArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    const handle = streamAiChat(
      cfg,
      {
        system: systemFor(args.phase),
        history: [],
        question: args.question,
        context: args.context,
        // Edits can rewrite whole files, so allow plenty of output room.
        maxTokens: args.phase === 'edit' ? 16_384 : 4096,
      },
      (delta) => {
        text += delta;
      },
      (error) => {
        const wasCancelled = cancelled.delete(args.id);
        active.delete(args.id);
        if (wasCancelled) reject(new Error('Agent request cancelled.'));
        else if (error) reject(new Error(error));
        else resolve(text);
      },
    );
    active.set(args.id, handle);
  });
}

/** Cancel an in-flight agent completion by id; its rejection is reported as a cancellation. */
export function cancelAgent(id: string): void {
  const handle = active.get(id);
  if (!handle) return;
  cancelled.add(id);
  handle.cancel();
}
