import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Allotment } from 'allotment';
import { X, Save, FileCog, KeyRound } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { getMonaco } from '../editor/monaco-setup';
import { useAwsStore } from '../stores/aws-store';
import { cn } from '../lib/cn';

interface PaneSpec {
  /** Absolute on-disk path. */
  path: string;
  title: string;
  icon: typeof FileCog;
  /** Monaco URI scheme key, kept distinct from file:// models so there's no global registry clash. */
  uriKey: string;
}

/**
 * Side-by-side editor for ~/.aws/config and ~/.aws/credentials, so the two files that
 * define a connection can be edited together without tab-switching. Each pane is an
 * independent Monaco editor with its own save (⌘S in a pane, or the toolbar buttons).
 */
export function AwsCredentialsEditor(): React.JSX.Element | null {
  const open = useAwsStore((s) => s.editOpen);
  const close = useAwsStore((s) => s.closeEdit);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  // editors[i] / specs[i] are paired by index (0 = config, 1 = credentials).
  const editorsRef = useRef<editor.IStandaloneCodeEditor[]>([]);
  const specsRef = useRef<PaneSpec[]>([]);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState<[boolean, boolean]>([false, false]);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Build the two editors once the overlay is mounted and its paths/contents are loaded.
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    const disposers: Array<() => void> = [];

    void (async () => {
      const paths = await window.forge.awsConfigPaths();
      if (!paths.ok || disposed) return;
      const specs: PaneSpec[] = [
        { path: paths.data.config, title: 'config', icon: FileCog, uriKey: 'aws-config' },
        { path: paths.data.credentials, title: 'credentials', icon: KeyRound, uriKey: 'aws-credentials' },
      ];
      specsRef.current = specs;

      const contents = await Promise.all(
        specs.map(async (s) => {
          const res = await window.forge.readFile(s.path);
          return res.ok ? res.data : '';
        }),
      );
      if (disposed) return;
      // Wait a frame so the pane containers exist after `ready` flips.
      setReady(true);
      requestAnimationFrame(() => {
        if (disposed) return;
        const monaco = getMonaco();
        const containers = [leftRef.current, rightRef.current];
        editorsRef.current = specs.map((spec, i) => {
          const container = containers[i];
          if (!container) throw new Error('AWS editor container missing');
          const uri = monaco.Uri.parse(`${spec.uriKey}:/${spec.title}`);
          const model =
            monaco.editor.getModel(uri) ?? monaco.editor.createModel(contents[i], 'ini', uri);
          model.setValue(contents[i]);
          const instance = monaco.editor.create(container, {
            model,
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace",
            fontLigatures: true,
            scrollBeyondLastLine: false,
            padding: { top: 10 },
            lineNumbersMinChars: 3,
            renderLineHighlight: 'all',
          });
          instance.onDidChangeModelContent(() =>
            setDirty((d) => {
              const next: [boolean, boolean] = [d[0], d[1]];
              next[i] = true;
              return next;
            }),
          );
          instance.addAction({
            id: 'aws.saveCredentials',
            label: 'Save AWS File',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
            run: () => void saveOne(i),
          });
          return instance;
        });
      });
    })();

    return () => {
      disposed = true;
      for (const instance of editorsRef.current) {
        instance.getModel()?.dispose();
        instance.dispose();
      }
      editorsRef.current = [];
      disposers.forEach((d) => d());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveOne = async (i: number): Promise<void> => {
    const instance = editorsRef.current[i];
    const spec = specsRef.current[i];
    if (!instance || !spec) return;
    const res = await window.forge.writeFile(spec.path, instance.getValue());
    if (res.ok) {
      setDirty((d) => {
        const next: [boolean, boolean] = [d[0], d[1]];
        next[i] = false;
        return next;
      });
    }
  };

  const saveAll = async (): Promise<void> => {
    await Promise.all(editorsRef.current.map((_, i) => saveOne(i)));
  };

  if (!open) return null;

  const anyDirty = dirty[0] || dirty[1];
  const specs = specsRef.current;

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex h-[80vh] w-[90vw] max-w-[1200px] flex-col overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-[13px] font-medium text-fg">Edit AWS Credentials</span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={!anyDirty}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px]',
                anyDirty
                  ? 'bg-accent text-white hover:bg-accent/90'
                  : 'cursor-default bg-surface-3 text-faint',
              )}
            >
              <Save size={13} /> Save All
            </button>
            <button
              type="button"
              title="Close"
              onClick={close}
              className="rounded p-1 text-faint hover:bg-surface-3 hover:text-fg"
            >
              <X size={16} />
            </button>
          </span>
        </div>

        <div className="min-h-0 flex-1">
          <Allotment proportionalLayout>
            <Allotment.Pane minSize={280}>
              <Pane spec={specs[0]} dirty={dirty[0]} containerRef={leftRef} ready={ready} />
            </Allotment.Pane>
            <Allotment.Pane minSize={280}>
              <Pane spec={specs[1]} dirty={dirty[1]} containerRef={rightRef} ready={ready} />
            </Allotment.Pane>
          </Allotment>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Pane({
  spec,
  dirty,
  containerRef,
  ready,
}: {
  spec: PaneSpec | undefined;
  dirty: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  ready: boolean;
}): React.JSX.Element {
  const Icon = spec?.icon ?? FileCog;
  return (
    <div className="flex h-full flex-col border-l border-line first:border-l-0">
      <div className="flex items-center gap-1.5 border-b border-line bg-surface px-3 py-1.5 text-[12px] text-muted">
        <Icon size={13} className="text-faint" />
        {spec?.title ?? '…'}
        {dirty ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        {ready ? <div ref={containerRef} className="absolute inset-0" /> : null}
      </div>
    </div>
  );
}
