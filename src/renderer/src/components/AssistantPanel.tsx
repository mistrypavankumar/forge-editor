import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import {
  FileText,
  Bug,
  Wand2,
  FlaskConical,
  Gauge,
  ArrowUp,
  Square,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';
import { useAssistantStore } from '../stores/assistant-store';
import { languageFor } from '../editor/language';
import { FileTypeIcon } from './file-icon';

type ContextFile = { name: string; language: string; content: string } | null;

interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** The full instruction sent to the assistant (the button shows `label` as the user's message). */
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'explain',
    label: 'Explain this file',
    icon: FileText,
    prompt:
      'Explain what this file does, its main responsibilities, and how its parts fit together.',
  },
  {
    id: 'bugs',
    label: 'Find possible bugs',
    icon: Bug,
    prompt:
      'Review this file for likely bugs, edge cases, and correctness issues. List the most important ones with line references and suggested fixes.',
  },
  {
    id: 'refactor',
    label: 'Refactor safely',
    icon: Wand2,
    prompt:
      'Suggest safe refactors that improve readability and structure without changing behavior. Show concrete before/after snippets.',
  },
  {
    id: 'tests',
    label: 'Generate tests',
    icon: FlaskConical,
    prompt:
      'Propose unit tests for this file: list the key cases to cover and provide example test code matching the project conventions.',
  },
  {
    id: 'perf',
    label: 'Improve performance',
    icon: Gauge,
    prompt:
      'Identify performance issues or inefficiencies in this file and suggest concrete improvements.',
  },
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** True while the reply is still streaming in. */
  streaming?: boolean;
  /** True when the turn ended in an error (renders the bubble in the danger color). */
  error?: boolean;
}

let seq = 0;
const nextId = (): string => `m-${++seq}`;

// Render an assistant reply as markdown (headings, lists, fenced code, inline code, tables).
// Memoized so a streaming delta only re-parses the message that changed, not every bubble.
const AssistantMarkdown = memo(function AssistantMarkdown({
  content,
}: {
  content: string;
}): React.JSX.Element {
  const html = useMemo(() => marked.parse(content, { async: false }) as string, [content]);
  return (
    // Assistant output rendered in the editor's own webview; reuses the shared .md-body theme.
    <div className="md-body md-chat min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: html }} />
  );
});

export function AssistantPanel(): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The in-flight request id + the assistant message it streams into (null when idle).
  const pendingRef = useRef<{ reqId: string; msgId: string } | null>(null);

  const activePath = useEditorStore((s) => s.activePath);
  const tabs = useEditorStore((s) => s.tabs);
  const active = tabs.find((t) => t.path === activePath);

  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Subscribe once: route streamed chunks + the done event to the message they belong to.
  useEffect(() => {
    const offChunk = window.forge.onAssistantChunk((e) => {
      const p = pendingRef.current;
      if (!p || e.id !== p.reqId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === p.msgId ? { ...m, text: m.text + e.delta } : m)),
      );
    });
    const offDone = window.forge.onAssistantDone((e) => {
      const p = pendingRef.current;
      if (!p || e.id !== p.reqId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== p.msgId) return m;
          if (e.error) {
            return {
              ...m,
              streaming: false,
              error: !m.text,
              text: m.text ? `${m.text}\n\n⚠️ ${e.error}` : e.error,
            };
          }
          return { ...m, streaming: false, text: m.text || '(no response)' };
        }),
      );
      pendingRef.current = null;
      setBusy(false);
    });
    return () => {
      offChunk();
      offDone();
    };
  }, []);

  // `fileOverride`: omit to use the active editor tab (default); pass a file (or null) to override
  // the attached context — used by "Ask AI to Fix", which attaches the resolved error source file.
  const run = (displayText: string, promptText: string, fileOverride?: ContextFile): void => {
    if (busy) return;
    const reqId = `req-${nextId()}`;
    const asstId = nextId();
    // Snapshot the conversation so far as context (before appending this turn).
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', text: displayText },
      { id: asstId, role: 'assistant', text: '', streaming: true },
    ]);
    pendingRef.current = { reqId, msgId: asstId };
    setBusy(true);
    const file =
      fileOverride !== undefined
        ? fileOverride
        : active
          ? { name: active.name, language: languageFor(active.name), content: active.content }
          : null;
    void window.forge.assistantSend({ id: reqId, question: promptText, file, history }).then((res) => {
      if (res.ok) return;
      // Spawn failed before any streaming started.
      setMessages((prev) =>
        prev.map((m) => (m.id === asstId ? { ...m, streaming: false, error: true, text: res.error } : m)),
      );
      pendingRef.current = null;
      setBusy(false);
    });
  };

  const send = (): void => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    run(text, text);
  };

  // Consume a prompt seeded from elsewhere (e.g. "Ask AI to Fix") once, as a chat turn.
  const seed = useAssistantStore((s) => s.seed);
  useEffect(() => {
    if (!seed || busy) return;
    useAssistantStore.getState().setSeed(null);
    run(seed.displayText, seed.promptText, seed.file);
    // `run` closes over the current render's state; deps intentionally track only the seed/busy gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, busy]);

  const stop = (): void => {
    const p = pendingRef.current;
    if (p) window.forge.assistantCancel(p.reqId);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3">
        <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
          <Sparkles size={13} className="text-accent" />
          <span className="text-[11px] text-faint">Context</span>
          {active ? (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
              <FileTypeIcon name={active.name} />
              {active.name}
            </span>
          ) : (
            <span className="ml-auto text-xs text-faint">No file open</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1 p-3">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => run(a.label, a.prompt)}
            disabled={!active || busy}
            title={!active ? 'Open a file to use this action' : undefined}
            className="group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-faint transition-colors group-hover:bg-accent/15 group-hover:text-accent">
              <a.icon size={14} strokeWidth={1.75} />
            </span>
            <span className="text-[13px] text-muted group-hover:text-fg">{a.label}</span>
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-auto border-t border-line-soft px-3 py-3"
      >
        {messages.length === 0 ? (
          <p className="px-1 pt-2 text-[12px] leading-relaxed text-faint">
            Ask about your code — answers stream from Claude. Pick a quick action above or type a
            question below.
          </p>
        ) : (
          messages.map((m) =>
            m.role === 'assistant' ? (
              <div key={m.id} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
                  <Sparkles size={12} />
                </span>
                {m.streaming && !m.text ? (
                  <p className="animate-pulse text-[13px] leading-relaxed text-faint">Thinking…</p>
                ) : m.error ? (
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-danger">
                    {m.text}
                  </p>
                ) : (
                  <div className="min-w-0 flex-1">
                    <AssistantMarkdown content={m.text} />
                    {m.streaming ? (
                      <span className="ml-0.5 animate-pulse text-muted">▍</span>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-surface-2 px-3 py-1.5 text-[13px] text-fg">
                  {m.text}
                </p>
              </div>
            ),
          )
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-surface-2 p-2 focus-within:border-accent/50">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask anything about this code…"
            className="max-h-28 flex-1 resize-none bg-transparent px-1 text-[13px] text-fg outline-none placeholder:text-faint"
          />
          {busy ? (
            <button
              type="button"
              aria-label="Stop"
              onClick={stop}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-3 text-muted transition-colors hover:text-fg"
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send"
              onClick={send}
              disabled={draft.trim().length === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
