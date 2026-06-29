import { useEffect, useRef, useState } from 'react';
import { Trash2, Bug } from 'lucide-react';
import { useDebugStore, type DebugOutputLine } from '../stores/debug-store';
import { IconButton } from './ui/IconButton';
import { EmptyState } from './ui/EmptyState';
import { cn } from '../lib/cn';

const LINE_CLASS: Record<DebugOutputLine['category'], string> = {
  stdout: 'text-fg/90',
  stderr: 'text-danger',
  console: 'text-fg/90',
  eval: 'text-accent',
  system: 'italic text-faint',
};

export function DebugConsolePanel(): React.JSX.Element {
  const output = useDebugStore((s) => s.output);
  const status = useDebugStore((s) => s.status);
  const clearOutput = useDebugStore((s) => s.clearOutput);
  const evaluate = useDebugStore((s) => s.evaluate);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stick to the bottom as new output streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output]);

  const active = status !== 'inactive' && status !== 'terminated';

  if (output.length === 0 && !active) {
    return <EmptyState icon={Bug} title="No active debug session. Press F5 to start debugging." />;
  }

  const submit = (): void => {
    if (!input.trim()) return;
    void evaluate(input);
    setInput('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 shrink-0 items-center justify-end border-b border-line-soft px-2">
        <IconButton label="Clear console" className="h-6 w-6" onClick={clearOutput}>
          <Trash2 size={13} />
        </IconButton>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[12px] leading-relaxed">
        {output.map((line) => (
          <div key={line.id} className={cn('whitespace-pre-wrap break-words', LINE_CLASS[line.category])}>
            {line.text.replace(/\n$/, '')}
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line-soft px-3 py-1.5">
        <span className="font-mono text-[12px] text-faint">{'>'}</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          disabled={!active}
          placeholder={
            active ? 'Evaluate an expression…' : 'Start a session to evaluate expressions'
          }
          className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-fg outline-none placeholder:text-faint disabled:opacity-60"
        />
      </div>
    </div>
  );
}
