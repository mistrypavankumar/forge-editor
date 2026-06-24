import type { AssistantSendArgs } from '@shared/ipc-contract';
import { streamAiChat, type AiStreamHandle, type ResolvedAi } from './chat';

/**
 * The Assistant chat streams from whichever provider the user configured (the local `claude` CLI
 * by default, or the Anthropic / OpenAI APIs). Tools are off and the answer is grounded only in
 * the context we pass it (the open file + prior turns), so it can't wander the repo or edit files.
 */
const SYSTEM_PROMPT = [
  'You are the coding assistant built into the Forge code editor.',
  'Answer the user about the open file and their question. Be concise and practical; lead with the',
  'answer, then brief detail. Use GitHub-flavored markdown (fenced code blocks for code). When you',
  'reference the open file, cite line numbers where it helps. Do not invent files you were not given.',
].join(' ');

/** In-flight requests by id, so {@link cancelAssistant} can abort the right stream. */
const active = new Map<string, AiStreamHandle>();
/** Ids the user cancelled — so their abort reports as success, not an error. */
const cancelled = new Set<string>();

/** Build the file-context block fed to the model, or undefined when no file is open. */
function fileContext(file: AssistantSendArgs['file']): string | undefined {
  if (!file) return undefined;
  return `# Open file: ${file.name}\n\n\`\`\`${file.language}\n${file.content}\n\`\`\``;
}

/**
 * Start an assistant completion using the resolved provider config. `onDelta` fires per streamed
 * fragment; `onDone` fires once at the end (error string on failure, undefined on success/cancel).
 */
export function startAssistant(
  cfg: ResolvedAi,
  args: AssistantSendArgs,
  onDelta: (delta: string) => void,
  onDone: (error?: string) => void,
): void {
  const handle = streamAiChat(
    cfg,
    {
      system: SYSTEM_PROMPT,
      history: (args.history ?? []).map((t) => ({ role: t.role, content: t.text })),
      question: args.question,
      context: fileContext(args.file),
      maxTokens: 4096,
    },
    onDelta,
    (error) => {
      const wasCancelled = cancelled.delete(args.id);
      active.delete(args.id);
      onDone(wasCancelled ? undefined : error);
    },
  );
  active.set(args.id, handle);
}

/** Cancel an in-flight assistant request by id; the resulting error is suppressed. */
export function cancelAssistant(id: string): void {
  const handle = active.get(id);
  if (!handle) return;
  cancelled.add(id);
  handle.cancel();
}
