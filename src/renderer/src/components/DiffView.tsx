import { useEffect, useRef } from 'react';
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

  // Create the editor and set its model together, recreating the whole thing when the file or its
  // content changes. Setting the model in a separate effect left the diff editor briefly modelless,
  // so hideUnchangedRegions initialized against no model and never cleanly recomputed — the
  // original side then painted its collapsed bands on top of a full-file rendering. A fresh editor
  // per change avoids any stale unchanged-region view zones.
  useEffect(() => {
    if (!containerRef.current) return;
    const monaco = getMonaco();
    const lang = languageFor(name);
    const originalModel = monaco.editor.createModel(original, lang);
    const modifiedModel = monaco.editor.createModel(modified, lang);
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
    diff.setModel({ original: originalModel, modified: modifiedModel });

    // 'JetBrains Mono' is a webfont that loads asynchronously. If the editor measured its char/line
    // metrics before the font arrived, the stale line height desyncs the hideUnchangedRegions view
    // zones from the rendered lines. Remeasure once the font is in, then relayout. (CodeEditor and
    // TerminalView do the same.)
    let disposed = false;
    void document.fonts?.ready.then(() => {
      if (disposed) return;
      monaco.editor.remeasureFonts();
      diff.layout();
    });

    return () => {
      disposed = true;
      diff.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [original, modified, name]);

  // Fully opaque background (not the translucent `bg-bg` glass tint): this overlays the
  // always-mounted CodeEditor, so it must occlude it — otherwise the editor and its inline-run
  // decorations bleed through the window transparency.
  return <div ref={containerRef} className="absolute inset-0" style={{ background: 'var(--bg)' }} />;
}
