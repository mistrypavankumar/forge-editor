import { useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import { getMonaco } from '../editor/monaco-setup';
import { languageFor } from '../editor/language';

interface DiffViewProps {
  original: string;
  modified: string;
  name: string;
}

/**
 * Read-only side-by-side diff (HEAD vs staged), used for files opened from the
 * Source Control panel. Theme follows the global Monaco theme set by CodeEditor.
 */
export function DiffView({ original, modified, name }: DiffViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const diffRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const monaco = getMonaco();
    const diff = monaco.editor.createDiffEditor(containerRef.current, {
      automaticLayout: true,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      enableSplitViewResizing: true,
      ignoreTrimWhitespace: false,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace",
      fontLigatures: true,
      lineNumbersMinChars: 4,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: true,
      // Collapse unchanged regions so the actual changes are immediately visible (VS Code-style).
      hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 4, revealLineCount: 20 },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    });
    diffRef.current = diff;
    return () => {
      diff.dispose();
      diffRef.current = null;
    };
  }, []);

  useEffect(() => {
    const diff = diffRef.current;
    if (!diff) return;
    const monaco = getMonaco();
    const lang = languageFor(name);
    const originalModel = monaco.editor.createModel(original, lang);
    const modifiedModel = monaco.editor.createModel(modified, lang);
    diff.setModel({ original: originalModel, modified: modifiedModel });
    return () => {
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [original, modified, name]);

  return <div ref={containerRef} className="absolute inset-0 bg-bg" />;
}
