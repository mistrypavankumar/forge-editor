import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { getMonaco } from '../editor/monaco-setup';
import { useEditorStore } from '../stores/editor-store';
import { useThemeStore } from '../stores/theme-store';
import { builtInThemes } from '../theme/themes';
import { FileTypeIcon } from './file-icon';

function languageFor(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', css: 'css', scss: 'scss', less: 'less', html: 'html',
    md: 'markdown', py: 'python', go: 'go', rs: 'rust', sh: 'shell', yml: 'yaml', yaml: 'yaml',
  };
  return map[ext] ?? 'plaintext';
}

export function EditorPane(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const modelsRef = useRef<Map<string, editor.ITextModel>>(new Map());

  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const setActive = useEditorStore((s) => s.setActive);
  const closeFile = useEditorStore((s) => s.closeFile);
  const updateContent = useEditorStore((s) => s.updateContent);
  const themeId = useThemeStore((s) => s.currentId);

  // Create the Monaco instance once.
  useEffect(() => {
    if (!containerRef.current) return;
    const monaco = getMonaco();
    const instance = monaco.editor.create(containerRef.current, {
      theme: 'forge-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 13,
      fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
      fontLigatures: true,
      lineNumbersMinChars: 3,
      padding: { top: 10 },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      renderLineHighlight: 'all',
      scrollBeyondLastLine: false,
    });
    editorRef.current = instance;
    const sub = instance.onDidChangeModelContent(() => {
      const model = instance.getModel();
      if (model) updateContent(model.uri.path, instance.getValue());
    });
    return () => {
      sub.dispose();
      instance.dispose();
    };
  }, [updateContent]);

  // Bind the active tab to a Monaco model (one model per path, preserving undo history).
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
      model = monaco.editor.createModel(
        tab.content,
        languageFor(tab.name),
        monaco.Uri.file(activePath),
      );
      modelsRef.current.set(activePath, model);
    }
    instance.setModel(model);
  }, [activePath, tabs]);

  // Dispose models for tabs that have been closed.
  useEffect(() => {
    const openPaths = new Set(tabs.map((t) => t.path));
    for (const [path, model] of modelsRef.current) {
      if (!openPaths.has(path)) {
        model.dispose();
        modelsRef.current.delete(path);
      }
    }
  }, [tabs]);

  // Keep the Monaco theme in sync with the app theme.
  useEffect(() => {
    const theme = builtInThemes[themeId];
    getMonaco().editor.setTheme(theme?.type === 'light' ? 'forge-light' : 'forge-dark');
  }, [themeId]);

  const hasTabs = tabs.length > 0;

  return (
    <div className="editor-pane">
      {hasTabs && (
        <div className="tab-bar">
          {tabs.map((tab) => (
            <div
              key={tab.path}
              className={`tab${tab.path === activePath ? ' tab-active' : ''}`}
              onClick={() => setActive(tab.path)}
            >
              <span className="tab-icon">
                <FileTypeIcon name={tab.name} />
              </span>
              <span className="tab-name">{tab.name}</span>
              <button
                type="button"
                className={`tab-close${tab.dirty ? ' tab-close-dirty' : ''}`}
                aria-label={`Close ${tab.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(tab.path);
                }}
              >
                {tab.dirty ? <span className="dirty-dot" /> : <X size={14} strokeWidth={2} />}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="editor-body">
        <div className="editor-host" ref={containerRef} />
        {!hasTabs && (
          <div className="editor-empty">
            <div className="editor-empty-mark">Forge</div>
            <ul className="editor-empty-hints">
              <li>
                <span>Open Folder</span>
                <kbd>⌘O</kbd>
              </li>
              <li>
                <span>Find in File</span>
                <kbd>⌘F</kbd>
              </li>
              <li>
                <span>Save</span>
                <kbd>⌘S</kbd>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
