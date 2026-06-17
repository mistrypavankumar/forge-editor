import { useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import { getMonaco } from '../editor/monaco-setup';
import { useEditorStore } from '../stores/editor-store';

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
  const markSaved = useEditorStore((s) => s.markSaved);

  // Create the Monaco instance once.
  useEffect(() => {
    if (!containerRef.current) return;
    const monaco = getMonaco();
    const instance = monaco.editor.create(containerRef.current, {
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 13,
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

  // Cmd/Ctrl+S saves the active tab. (Migrates to the keybinding-service in Phase 2.)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const state = useEditorStore.getState();
        const tab = state.tabs.find((t) => t.path === state.activePath);
        if (!tab) return;
        void window.forge.writeFile(tab.path, tab.content).then((res) => {
          if (res.ok) markSaved(tab.path);
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [markSaved]);

  return (
    <div className="editor-pane">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.path}
            className={`tab${tab.path === activePath ? ' tab-active' : ''}`}
            onClick={() => setActive(tab.path)}
          >
            <span className="tab-name">
              {tab.name}
              {tab.dirty ? ' ●' : ''}
            </span>
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeFile(tab.path);
              }}
            >
              ×
            </span>
          </div>
        ))}
      </div>
      <div className="editor-host" ref={containerRef} />
    </div>
  );
}
