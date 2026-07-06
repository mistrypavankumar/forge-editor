import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import type { SkeletonUiLibrary } from '@shared/skeleton';
import { useSkeletonStore } from '../stores/skeleton-store';
import {
  applyCreateNewFile,
  applyInsertBelow,
  copySkeletonCode,
  generateSkeletonFor,
  improveWithAi,
} from '../skeleton/actions';

/**
 * Preview modal for Generate Skeleton. Renders the current phase of the skeleton store:
 * detecting/generating (spinner), picking (component chooser), error (friendly message), or ready
 * (metadata + code preview + apply actions). Preview-first — no file is touched until the user acts.
 */

const LIBRARY_LABEL: Record<SkeletonUiLibrary, string> = {
  mui: 'Material UI',
  tailwind: 'Tailwind CSS',
  'plain-react': 'Plain React',
  unknown: 'Unknown',
};

export function SkeletonPreview(): React.JSX.Element | null {
  const open = useSkeletonStore((s) => s.open);
  const phase = useSkeletonStore((s) => s.phase);
  const candidates = useSkeletonStore((s) => s.candidates);
  const result = useSkeletonStore((s) => s.result);
  const error = useSkeletonStore((s) => s.error);
  const aiBusy = useSkeletonStore((s) => s.aiBusy);
  const aiError = useSkeletonStore((s) => s.aiError);
  const close = useSkeletonStore((s) => s.close);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Clear the transient status line whenever a new result arrives.
  useEffect(() => setStatus(null), [result]);

  if (!open) return null;

  const insert = (): void => {
    const r = applyInsertBelow();
    if (r.ok) {
      setStatus({ kind: 'ok', text: 'Inserted below the component (unsaved — review, then save).' });
    } else setStatus({ kind: 'err', text: r.error ?? 'Insert failed.' });
  };

  const createFile = async (): Promise<void> => {
    const r = await applyCreateNewFile();
    if (r.ok) setStatus({ kind: 'ok', text: `Created ${r.path?.split('/').pop() ?? 'file'} and opened it.` });
    else setStatus({ kind: 'err', text: r.error ?? 'Create failed.' });
  };

  const copy = async (): Promise<void> => {
    const ok = await copySkeletonCode();
    setStatus({ kind: ok ? 'ok' : 'err', text: ok ? 'Copied to clipboard.' : 'Copy failed.' });
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-start justify-center bg-black/50 pt-[8vh] backdrop-blur-sm"
      onMouseDown={close}
    >
      <div
        className="flex max-h-[80vh] w-[720px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/50"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[13px]">
          <span className="font-medium text-fg">Generate Skeleton</span>
          <button
            type="button"
            title="Close"
            onClick={close}
            className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {(phase === 'detecting' || phase === 'generating') && (
            <div className="flex items-center gap-2 px-4 py-10 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" />
              {phase === 'detecting' ? 'Analysing component…' : 'Generating skeleton…'}
            </div>
          )}

          {phase === 'error' && (
            <div className="px-4 py-8 text-sm text-fg">{error}</div>
          )}

          {phase === 'picking' && (
            <div className="p-4">
              <p className="mb-3 text-sm text-muted">
                This file has multiple components. Choose one to generate a skeleton for:
              </p>
              <div className="flex flex-col gap-1">
                {candidates.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => void generateSkeletonFor(c.name)}
                    className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-left text-sm text-fg hover:bg-surface-3"
                  >
                    <span className="font-mono">{c.name}</span>
                    <span className="text-xs text-faint">
                      {c.isDefaultExport ? 'default export' : `line ${c.line}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === 'ready' && result && (
            <div className="p-4">
              <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                <span>
                  Component: <span className="text-fg">{result.componentName}</span>
                </span>
                <span>
                  UI library: <span className="text-fg">{LIBRARY_LABEL[result.uiLibrary]}</span>
                </span>
                <span>
                  Mode:{' '}
                  <span className="text-fg">
                    {result.generationMode === 'ai' ? 'AI' : 'Static Analysis'}
                  </span>
                </span>
                <span>
                  Layout match:{' '}
                  <span className="text-fg">
                    {result.generationMode === 'ai' ? 'Inferred' : 'Estimated'}
                  </span>
                </span>
              </div>

              {candidates.length > 1 && (
                <button
                  type="button"
                  onClick={() => useSkeletonStore.getState().showPicker(candidates)}
                  className="mb-3 text-xs text-accent hover:underline"
                >
                  ← Change component
                </button>
              )}

              {result.warnings && result.warnings.length > 0 && (
                <ul className="mb-3 space-y-1 rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
                  {result.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              )}

              <div className="relative">
                <pre className="max-h-[38vh] overflow-auto rounded-md border border-line bg-surface-1 p-3 font-mono text-xs leading-relaxed text-fg">
                  {result.code}
                </pre>
                {aiBusy && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-surface-1/80 text-sm text-muted backdrop-blur-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Improving with AI…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {phase === 'ready' && result && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
            <span
              className={`text-xs ${aiError || status?.kind === 'err' ? 'text-red-400' : 'text-emerald-400'}`}
            >
              {aiError ?? status?.text ?? ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void improveWithAi()}
                disabled={aiBusy}
                title="Regenerate this skeleton with the configured AI model — best for composed, props-driven pages"
                className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
              >
                <Sparkles size={13} />
                {result.generationMode === 'ai' ? 'Regenerate with AI' : 'Improve with AI'}
              </button>
              <button
                type="button"
                onClick={() => void copy()}
                disabled={aiBusy}
                className="rounded-md border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
              >
                Copy Code
              </button>
              <button
                type="button"
                onClick={() => void createFile()}
                disabled={aiBusy}
                className="rounded-md border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-3 disabled:opacity-50"
              >
                Create New File
              </button>
              <button
                type="button"
                onClick={insert}
                disabled={aiBusy}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                Insert Below Component
              </button>
            </div>
          </div>
        )}

        {(phase === 'error' || phase === 'picking') && (
          <div className="flex justify-end border-t border-line px-4 py-2.5">
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-3"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
