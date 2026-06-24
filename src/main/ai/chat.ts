import { spawn } from 'node:child_process';

/** The configured AI backend. `claude-cli` is the default and needs no API key. */
export type AiProvider = 'claude-cli' | 'anthropic' | 'openai';

/** A resolved, ready-to-use AI configuration (provider + concrete model + key for API providers). */
export interface ResolvedAi {
  provider: AiProvider;
  /** Concrete model id. Empty string for `claude-cli` means "use the CLI's configured default". */
  model: string;
  /** API key for `anthropic`/`openai`; absent for `claude-cli`. */
  apiKey?: string;
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A provider-agnostic chat request. Callers supply the persona (`system`), prior turns
 * (`history`), the new `question`, and optional bulky read-only `context` (a file, a diff) to
 * ground the answer. Each provider maps this onto its own wire format.
 */
export interface AiChatRequest {
  system: string;
  history: AiMessage[];
  question: string;
  context?: string;
  maxTokens?: number;
}

/** Handle to an in-flight stream; `cancel()` aborts it (the caller suppresses the resulting error). */
export interface AiStreamHandle {
  cancel(): void;
}

const DEFAULT_MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 120_000;

/** Per-provider default model when the user hasn't set an explicit override. */
export function defaultModel(provider: AiProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-6';
    case 'openai':
      return 'gpt-4o';
    default:
      return ''; // claude-cli: let the CLI use the user's configured default
  }
}

/** Dispatch a streaming chat to the configured provider. */
export function streamAiChat(
  cfg: ResolvedAi,
  req: AiChatRequest,
  onDelta: (delta: string) => void,
  onDone: (error?: string) => void,
): AiStreamHandle {
  switch (cfg.provider) {
    case 'anthropic':
      return streamAnthropic(cfg, req, onDelta, onDone);
    case 'openai':
      return streamOpenAI(cfg, req, onDelta, onDone);
    default:
      return streamClaudeCli(cfg, req, onDelta, onDone);
  }
}

// ---- claude-cli provider (the user's local `claude` CLI, streaming JSON) --------------------

function buildCliStdin(req: AiChatRequest): string {
  const parts: string[] = [];
  if (req.context) parts.push(req.context);
  if (req.history.length) {
    const turns = req.history
      .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
      .join('\n\n');
    parts.push(`# Conversation so far\n\n${turns}`);
  }
  return parts.join('\n\n---\n\n');
}

function streamClaudeCli(
  cfg: ResolvedAi,
  req: AiChatRequest,
  onDelta: (delta: string) => void,
  onDone: (error?: string) => void,
): AiStreamHandle {
  const args = [
    '-p',
    req.question,
    '--append-system-prompt',
    req.system,
    '--max-turns',
    '1',
    '--allowed-tools',
    '',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
  ];
  if (cfg.model) args.push('--model', cfg.model);

  const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  let stderr = '';
  let resultError: string | undefined;

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
      // Only assistant text deltas — thinking deltas (delta.type === 'thinking_delta') are skipped.
      if (
        evt.type === 'stream_event' &&
        evt.event?.type === 'content_block_delta' &&
        evt.event.delta?.type === 'text_delta' &&
        typeof evt.event.delta.text === 'string'
      ) {
        onDelta(evt.event.delta.text);
      } else if (evt.type === 'result' && (evt.is_error || evt.subtype !== 'success')) {
        resultError = evt.result || `Claude failed (${evt.subtype ?? 'error'}).`;
      }
    }
  });
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

  const timer = setTimeout(() => {
    resultError = 'Claude timed out.';
    child.kill();
  }, REQUEST_TIMEOUT_MS);

  child.on('error', (e) => {
    clearTimeout(timer);
    onDone(
      (e as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'Claude Code CLI (`claude`) not found on PATH. Install it or pick an API provider in Settings → AI.'
        : `Could not run claude: ${e.message}`,
    );
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (code === 0) onDone(resultError);
    else onDone(resultError || stderr.trim() || `claude exited with code ${code}.`);
  });

  const stdin = buildCliStdin(req);
  if (stdin) child.stdin.write(stdin);
  child.stdin.end();

  return { cancel: () => child.kill() };
}

// ---- Shared SSE reader for the HTTP providers -----------------------------------------------

/**
 * Read an SSE response body, invoking `onEvent(eventName, dataString)` per `event:`/`data:` block.
 * Resolves when the stream ends; rejects on transport error (including AbortError on cancel).
 */
async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      let event = 'message';
      const dataLines: string[] = [];
      for (const raw of block.split('\n')) {
        if (raw.startsWith('event:')) event = raw.slice(6).trim();
        else if (raw.startsWith('data:')) dataLines.push(raw.slice(5).replace(/^ /, ''));
      }
      if (dataLines.length) onEvent(event, dataLines.join('\n'));
    }
  }
}

// ---- Anthropic provider (Messages API) ------------------------------------------------------

function streamAnthropic(
  cfg: ResolvedAi,
  req: AiChatRequest,
  onDelta: (delta: string) => void,
  onDone: (error?: string) => void,
): AiStreamHandle {
  const ctrl = new AbortController();
  void (async () => {
    if (!cfg.apiKey) {
      onDone('No Anthropic API key set. Add one in Settings → AI.');
      return;
    }
    const messages: AiMessage[] = [
      ...req.history,
      { role: 'user', content: req.context ? `${req.context}\n\n${req.question}` : req.question },
    ];
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: req.system,
          messages,
          stream: true,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        onDone(`Anthropic API error ${res.status}: ${truncate(text)}`);
        return;
      }
      await readSse(res.body, (event, data) => {
        if (event === 'content_block_delta') {
          try {
            const d = JSON.parse(data) as { delta?: { type?: string; text?: string } };
            if (d.delta?.type === 'text_delta' && d.delta.text) onDelta(d.delta.text);
          } catch {
            /* ignore malformed event */
          }
        } else if (event === 'error') {
          try {
            const d = JSON.parse(data) as { error?: { message?: string } };
            onDone(`Anthropic error: ${d.error?.message ?? data}`);
          } catch {
            onDone(`Anthropic error: ${data}`);
          }
        }
      });
      onDone();
    } catch (e) {
      onDone(`Anthropic request failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  })();
  return { cancel: () => ctrl.abort() };
}

// ---- OpenAI provider (Chat Completions API) -------------------------------------------------

function streamOpenAI(
  cfg: ResolvedAi,
  req: AiChatRequest,
  onDelta: (delta: string) => void,
  onDone: (error?: string) => void,
): AiStreamHandle {
  const ctrl = new AbortController();
  void (async () => {
    if (!cfg.apiKey) {
      onDone('No OpenAI API key set. Add one in Settings → AI.');
      return;
    }
    const messages = [
      { role: 'system', content: req.system },
      ...req.history,
      { role: 'user', content: req.context ? `${req.context}\n\n${req.question}` : req.question },
    ];
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          stream: true,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        onDone(`OpenAI API error ${res.status}: ${truncate(text)}`);
        return;
      }
      await readSse(res.body, (_event, data) => {
        if (data === '[DONE]') return;
        try {
          const d = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
          const piece = d.choices?.[0]?.delta?.content;
          if (piece) onDelta(piece);
        } catch {
          /* ignore keep-alive / malformed chunk */
        }
      });
      onDone();
    } catch (e) {
      onDone(`OpenAI request failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  })();
  return { cancel: () => ctrl.abort() };
}

function truncate(s: string, max = 300): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
