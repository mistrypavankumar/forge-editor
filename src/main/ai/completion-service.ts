import type { CompletionArgs } from '@shared/ipc-contract';
import { streamAiChat, type AiStreamHandle, type ResolvedAi } from './chat';

/**
 * Inline ghost-text completion. Claude/GPT aren't native fill-in-the-middle models, so we frame the
 * task with a strict system prompt: emit only the code that belongs at the cursor, no prose, no
 * markdown fences. The prefix/suffix are passed as context and a stop sequence keeps the snippet
 * tight. Tokens are capped low — inline suggestions are short by nature and latency is what matters.
 */
const SYSTEM_PROMPT = [
  'You are an inline code completion engine inside a code editor.',
  'You are given the code before the cursor (<prefix>) and after it (<suffix>).',
  'Output ONLY the code that should be inserted at the cursor to continue the prefix naturally.',
  'Do not repeat the prefix or the suffix. Do not explain. Do not wrap the output in markdown',
  'fences or backticks. Output an empty string if no sensible completion exists.',
].join(' ');

/** Sentinel + blank line: stop once the model drifts past a tight, single-region suggestion. */
const STOP_SEQUENCES = ['<|end|>', '\n\n\n'];
const MAX_TOKENS = 256;
/** Cap context fed to the model so a huge file doesn't blow latency or token cost. */
const MAX_PREFIX_CHARS = 4000;
const MAX_SUFFIX_CHARS = 1000;

/** In-flight completions by id, so {@link cancelCompletion} can abort the right stream. */
const active = new Map<string, AiStreamHandle>();
/** Ids the caller cancelled — their result is dropped (resolved empty) rather than returned. */
const cancelled = new Set<string>();

/** Build the FIM context block fed to the model. */
function fimContext(args: CompletionArgs): string {
  const prefix = args.prefix.slice(-MAX_PREFIX_CHARS);
  const suffix = args.suffix.slice(0, MAX_SUFFIX_CHARS);
  return [
    `Language: ${args.language}`,
    `<prefix>\n${prefix}\n</prefix>`,
    `<suffix>\n${suffix}\n</suffix>`,
  ].join('\n\n');
}

/** Strip stray markdown fences / sentinels the model may emit despite instructions. */
function clean(text: string): string {
  let out = text;
  const fence = out.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  if (fence) out = fence[1];
  return out.replace(/<\|end\|>/g, '');
}

/**
 * Start an inline completion. `onDone` fires once with the suggestion text — empty on cancel, on
 * error, or when the model declines. Inline completions never surface errors to the user; a failed
 * request simply yields no ghost text.
 */
export function startCompletion(
  cfg: ResolvedAi,
  args: CompletionArgs,
  onDone: (text: string) => void,
): void {
  let buf = '';
  const handle = streamAiChat(
    cfg,
    {
      system: SYSTEM_PROMPT,
      history: [],
      question: 'Complete the code at the cursor.',
      context: fimContext(args),
      maxTokens: MAX_TOKENS,
      stopSequences: STOP_SEQUENCES,
    },
    (delta) => {
      buf += delta;
    },
    (error) => {
      const wasCancelled = cancelled.delete(args.id);
      active.delete(args.id);
      onDone(wasCancelled || error ? '' : clean(buf));
    },
  );
  active.set(args.id, handle);
}

/** Cancel an in-flight completion by id; its result is dropped. */
export function cancelCompletion(id: string): void {
  const handle = active.get(id);
  if (!handle) return;
  cancelled.add(id);
  handle.cancel();
}
