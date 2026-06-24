import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AssistantSendArgs } from '@shared/ipc-contract';

/**
 * The Assistant chat is backed by the user's own Claude Code CLI (`claude`) in headless,
 * streaming mode — no API key, no extra dependency. We stream true token deltas
 * (`--include-partial-messages`) so the reply types out live in the panel. Tools are disabled and
 * turns capped so it stays a pure, predictable Q&A grounded in the context we pass it (it can't
 * wander the repo or edit files). We let `claude` use the user's configured default model.
 */
const SYSTEM_PROMPT = [
  'You are the coding assistant built into the Forge code editor.',
  'Answer the user about the open file and their question. Be concise and practical; lead with the',
  'answer, then brief detail. Use GitHub-flavored markdown (fenced code blocks for code). When you',
  'reference the open file, cite line numbers where it helps. Do not invent files you were not given.',
].join(' ');

/** Hard cap on the file content we inline into the prompt, so a huge file can't blow it up. */
const MAX_FILE_CHARS = 60 * 1024;
/** Abort a stalled request rather than leaving a `claude` process running forever. */
const TIMEOUT_MS = 120_000;

/** In-flight requests by id, so {@link cancelAssistant} can kill the right process. */
const active = new Map<string, ChildProcessWithoutNullStreams>();
/** Ids the user cancelled — so their (non-zero) exit reports as success, not an error. */
const cancelled = new Set<string>();

/** Build the context blob fed to `claude` on stdin: the open file, then the prior conversation. */
function buildStdin(args: AssistantSendArgs): string {
  const parts: string[] = [];
  if (args.file) {
    const content =
      args.file.content.length > MAX_FILE_CHARS
        ? `${args.file.content.slice(0, MAX_FILE_CHARS)}\n…[file truncated]`
        : args.file.content;
    parts.push(`# Open file: ${args.file.name}\n\n\`\`\`${args.file.language}\n${content}\n\`\`\``);
  }
  if (args.history?.length) {
    const turns = args.history
      .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`)
      .join('\n\n');
    parts.push(`# Conversation so far\n\n${turns}`);
  }
  return parts.join('\n\n---\n\n');
}

/**
 * Spawn `claude` for one assistant turn. `onDelta` fires for each streamed text fragment;
 * `onDone` fires exactly once at the end with an error string on failure (undefined on
 * success or cancellation).
 */
export function startAssistant(
  args: AssistantSendArgs,
  onDelta: (delta: string) => void,
  onDone: (error?: string) => void,
): void {
  const child = spawn(
    'claude',
    [
      '-p',
      args.question,
      '--append-system-prompt',
      SYSTEM_PROMPT,
      '--max-turns',
      '1',
      '--allowed-tools',
      '',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  active.set(args.id, child);

  let buf = '';
  let stderr = '';
  let resultError: string | undefined;

  // stream-json emits one JSON object per line. We forward only assistant *text* deltas — thinking
  // deltas (delta.type === 'thinking_delta') are intentionally skipped so reasoning stays hidden.
  child.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString();
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let evt: {
        type?: string;
        event?: { type?: string; delta?: { type?: string; text?: string } };
        is_error?: boolean;
        subtype?: string;
        result?: string;
      };
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      if (
        evt.type === 'stream_event' &&
        evt.event?.type === 'content_block_delta' &&
        evt.event.delta?.type === 'text_delta' &&
        typeof evt.event.delta.text === 'string'
      ) {
        onDelta(evt.event.delta.text);
      } else if (evt.type === 'result' && (evt.is_error || evt.subtype !== 'success')) {
        resultError = evt.result || `Assistant failed (${evt.subtype ?? 'error'}).`;
      }
    }
  });

  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

  const timer = setTimeout(() => {
    resultError = 'Assistant timed out.';
    child.kill();
  }, TIMEOUT_MS);

  child.on('error', (e) => {
    clearTimeout(timer);
    active.delete(args.id);
    cancelled.delete(args.id);
    onDone(
      (e as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'Claude Code CLI (`claude`) not found on PATH. Install it to use the assistant.'
        : `Could not run claude: ${e.message}`,
    );
  });

  child.on('close', (code) => {
    clearTimeout(timer);
    active.delete(args.id);
    if (cancelled.delete(args.id)) {
      onDone(); // user-initiated cancel — not an error
      return;
    }
    if (code === 0) onDone(resultError);
    else onDone(resultError || stderr.trim() || `claude exited with code ${code}.`);
  });

  const stdin = buildStdin(args);
  if (stdin) child.stdin.write(stdin);
  child.stdin.end();
}

/** Cancel an in-flight assistant request (kills its `claude` process); no-op if already finished. */
export function cancelAssistant(id: string): void {
  const child = active.get(id);
  if (!child) return;
  cancelled.add(id);
  child.kill();
}
