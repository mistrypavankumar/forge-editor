import { useEffect, useRef } from 'react';
import { FolderOpen } from 'lucide-react';
import type { editor, IDisposable } from 'monaco-editor';
import { getMonaco } from '../editor/monaco-setup';
import { useEditorStore } from '../stores/editor-store';
import { useThemeStore } from '../stores/theme-store';
import { builtInThemes } from '../theme/themes';
import {
  useWorkbenchStatusStore,
  type MarkerInfo,
  type MarkerSeverity,
} from '../stores/workbench-status-store';

function languageFor(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', css: 'css', scss: 'scss', less: 'less', html: 'html',
    md: 'markdown', py: 'python', go: 'go', rs: 'rust', sh: 'shell', yml: 'yaml', yaml: 'yaml',
  };
  return map[ext] ?? 'plaintext';
}

function severityName(level: number): MarkerSeverity {
  if (level >= 8) return 'error';
  if (level >= 4) return 'warning';
  return 'info';
}

export function CodeEditor(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const modelsRef = useRef<Map<string, editor.ITextModel>>(new Map());

  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const updateContent = useEditorStore((s) => s.updateContent);
  const reveal = useEditorStore((s) => s.reveal);
  const themeId = useThemeStore((s) => s.currentId);

  useEffect(() => {
    if (!containerRef.current) return;
    const monaco = getMonaco();
    const instance = monaco.editor.create(containerRef.current, {
      theme: 'forge-dark',
      automaticLayout: true,
      minimap: { enabled: true, renderCharacters: false, maxColumn: 80 },
      fontSize: 13,
      fontFamily: "'Fira Code', 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
      fontLigatures: true,
      lineNumbersMinChars: 4,
      padding: { top: 12 },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'all',
      scrollBeyondLastLine: false,
      roundedSelection: true,
      guides: { indentation: false },
      overviewRulerBorder: false,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    });
    editorRef.current = instance;

    // Re-measure once the Fira Code webfont is ready so glyphs align precisely.
    void document.fonts?.ready.then(() => monaco.editor.remeasureFonts());

    const status = useWorkbenchStatusStore.getState();
    const disposables: IDisposable[] = [];

    disposables.push(
      instance.onDidChangeModelContent(() => {
        const model = instance.getModel();
        if (model) updateContent(model.uri.path, instance.getValue());
      }),
    );
    disposables.push(
      instance.onDidChangeCursorPosition((e) => {
        status.setCursor(e.position.lineNumber, e.position.column);
      }),
    );

    const refreshMarkers = (): void => {
      const all = monaco.editor.getModelMarkers({});
      const markers: MarkerInfo[] = all.map((m, i) => {
        const path = m.resource.path;
        return {
          id: `${path}:${m.startLineNumber}:${m.startColumn}:${i}`,
          severity: severityName(m.severity),
          message: m.message,
          path,
          file: path.slice(path.lastIndexOf('/') + 1),
          line: m.startLineNumber,
          col: m.startColumn,
          code: typeof m.code === 'string' ? m.code : undefined,
        };
      });
      status.setMarkers(markers);
    };
    disposables.push(monaco.editor.onDidChangeMarkers(refreshMarkers));
    refreshMarkers();

    return () => {
      disposables.forEach((d) => d.dispose());
      instance.dispose();
    };
  }, [updateContent]);

  // Bind active tab to a per-path model + report its language.
  useEffect(() => {
    const instance = editorRef.current;
    if (!instance) return;
    if (!activePath) {
      instance.setModel(null);
      return;
    }
    const tab = tabs.find((t) => t.path === activePath);
    if (!tab) return;
    const monaco = getMonaco();
    let model = modelsRef.current.get(activePath);
    if (!model) {
      model = monaco.editor.createModel(tab.content, languageFor(tab.name), monaco.Uri.file(activePath));
      modelsRef.current.set(activePath, model);
    }
    instance.setModel(model);
    useWorkbenchStatusStore.getState().setLanguage(languageFor(tab.name));
  }, [activePath, tabs]);

  useEffect(() => {
    const openPaths = new Set(tabs.map((t) => t.path));
    for (const [path, model] of modelsRef.current) {
      if (!openPaths.has(path)) {
        model.dispose();
        modelsRef.current.delete(path);
      }
    }
  }, [tabs]);

  useEffect(() => {
    const theme = builtInThemes[themeId];
    getMonaco().editor.setTheme(theme?.type === 'light' ? 'forge-light' : 'forge-dark');
  }, [themeId]);

  // Reveal a requested line/column (e.g. from a terminal path:line:col link).
  useEffect(() => {
    const instance = editorRef.current;
    if (!instance || !reveal) return;
    const model = instance.getModel();
    if (model && model.uri.path === reveal.path) {
      instance.revealLineInCenter(reveal.line);
      instance.setPosition({ lineNumber: reveal.line, column: reveal.col });
      instance.focus();
      useEditorStore.getState().consumeReveal();
    }
  }, [reveal, activePath, tabs]);

  const hasTabs = tabs.length > 0;

  return (
    <div className="relative h-full w-full bg-bg">
      <div ref={containerRef} className="absolute inset-0" />
      {!hasTabs ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6">
          <div className="text-5xl font-bold tracking-tight text-surface-3">Forge</div>
          <ul className="flex flex-col gap-2.5 text-xs text-faint">
            {[
              ['Open Folder', '⌘O'],
              ['Command Palette', '⌘K'],
              ['Go to File', '⌘P'],
              ['Toggle Terminal', '⌘J'],
            ].map(([label, key]) => (
              <li key={label} className="flex items-center justify-between gap-10">
                <span className="inline-flex items-center gap-2">
                  <FolderOpen size={13} /> {label}
                </span>
                <kbd className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-faint">
                  {key}
                </kbd>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
