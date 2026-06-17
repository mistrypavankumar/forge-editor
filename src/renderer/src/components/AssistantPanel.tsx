import { useState } from 'react';
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
import { quickActions, seededChat, type QuickAction } from '../data/assistant';
import { FileTypeIcon } from './file-icon';

const ACTION_ICON: Record<QuickAction['icon'], LucideIcon> = {
  explain: FileText,
  bug: Bug,
  refactor: Wand2,
  test: FlaskConical,
  perf: Gauge,
};

export function AssistantPanel(): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const activePath = useEditorStore((s) => s.activePath);
  const tabs = useEditorStore((s) => s.tabs);
  const active = tabs.find((t) => t.path === activePath);

  return (
    <div className="flex h-full flex-col">
      {/* Current file context */}
      <div className="shrink-0 px-3 pt-3">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
          <Sparkles size={14} className="text-accent" />
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

      {/* Quick actions */}
      <div className="grid shrink-0 grid-cols-1 gap-1.5 p-3">
        {quickActions.map((a) => {
          const Icon = ACTION_ICON[a.icon];
          return (
            <button
              key={a.id}
              type="button"
              className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-accent/40 hover:bg-surface-2"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-accent group-hover:bg-accent/10">
                <Icon size={15} strokeWidth={1.75} />
              </span>
              <span className="flex flex-col">
                <span className="text-xs font-medium text-fg">{a.label}</span>
                <span className="text-[11px] text-faint">{a.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Conversation */}
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-2">
        {seededChat.map((m) => (
          <div key={m.id} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
              <Sparkles size={12} />
            </span>
            <p className="text-[13px] leading-relaxed text-muted">{m.text}</p>
          </div>
        ))}
      </div>

      {/* Chat input */}
      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-surface-2 p-2 focus-within:border-accent/50">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask anything about this code…"
            className="max-h-28 flex-1 resize-none bg-transparent px-1 text-[13px] text-fg outline-none placeholder:text-faint"
          />
          <button
            type="button"
            aria-label="Send"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={draft.trim().length === 0}
          >
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
