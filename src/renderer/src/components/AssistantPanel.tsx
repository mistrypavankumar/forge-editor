import { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Bug,
  Wand2,
  FlaskConical,
  Gauge,
  ArrowUp,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';
import { FileTypeIcon } from './file-icon';

interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'explain', label: 'Explain this file', icon: FileText },
  { id: 'bugs', label: 'Find possible bugs', icon: Bug },
  { id: 'refactor', label: 'Refactor safely', icon: Wand2 },
  { id: 'tests', label: 'Generate tests', icon: FlaskConical },
  { id: 'perf', label: 'Improve performance', icon: Gauge },
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

let msgSeq = 0;
const nextId = (): string => `m-${++msgSeq}`;

const NO_PROVIDER = 'No AI provider is connected yet. Configure one in Settings to chat with context.';

export function AssistantPanel(): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activePath = useEditorStore((s) => s.activePath);
  const tabs = useEditorStore((s) => s.tabs);
  const active = tabs.find((t) => t.path === activePath);

  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const post = (userText: string): void => {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', text: userText },
      { id: nextId(), role: 'assistant', text: NO_PROVIDER },
    ]);
  };

  const send = (): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    post(text);
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
            onClick={() => post(a.label)}
            className="group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2"
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
            Ask about the current file, or pick a quick action above.
          </p>
        ) : (
          messages.map((m) =>
            m.role === 'assistant' ? (
              <div key={m.id} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
                  <Sparkles size={12} />
                </span>
                <p className="text-[13px] leading-relaxed text-muted">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-lg rounded-br-sm bg-surface-2 px-3 py-1.5 text-[13px] text-fg">
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
          <button
            type="button"
            aria-label="Send"
            onClick={send}
            disabled={draft.trim().length === 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
