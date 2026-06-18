import { useCallback, useEffect, useRef } from 'react';
import { FolderOpen } from 'lucide-react';
import type { editor, IDisposable } from 'monaco-editor';
import { getMonaco } from '../editor/monaco-setup';
import { monacoThemeForScheme } from '../editor/editor-schemes';
import { languageFor } from '../editor/language';
import { hunkAtLine, hunkToDecoration, revertHunk } from '../editor/git-gutter';
import { DiffPeek } from '../editor/diff-peek';
import { computeDiff, type DiffHunk } from '../lib/line-diff';
import { commandRegistry } from '../commands/command-registry';
import { commandForKeyEvent, defaultKeybindings, mergeKeybindings } from '../keybindings/keybinding-service';
import { useKeybindingsStore } from '../stores/keybindings-store';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { registerFormatProvider } from '../editor/format-provider';
import { registerLanguageProviders } from '../editor/monaco-providers';
import {
  initLanguageProject,
  openLanguageDocument,
  syncLanguageDocument,
  closeLanguageDocument,
} from '../editor/language-bridge';
import { registerAutoCloseTag } from '../editor/auto-close-tag';
import { registerTabOut } from '../editor/tab-out';
import { setActiveEditor } from '../editor/active-editor';
import { saveAllFiles } from '../lib/save-actions';
import { useFormatterStore } from '../stores/formatter-store';
import type { FormatterId } from '../lib/detect-formatters';
import { FormatterPicker } from './FormatterPicker';
import { relativeTime } from '../lib/relative-time';
import type { BlameLine } from '@shared/ipc-contract';
import { useEditorStore } from '../stores/editor-store';
import { useThemeStore } from '../stores/theme-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { builtInThemes } from '../theme/themes';
import {
  useWorkbenchStatusStore,
  type MarkerInfo,
  type MarkerSeverity,
} from '../stores/workbench-status-store';

function formatBlame(b: BlameLine | undefined): string | null {
  if (!b) return null;
  return b.time == null ? `${b.author} (uncommitted)` : `${b.author} (${relativeTime(b.time)})`;
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
  const decoRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const peekRef = useRef<DiffPeek | null>(null);
  const hunksRef = useRef<DiffHunk[]>([]);
  const blameRef = useRef<BlameLine[]>([]);
  const originalRef = useRef<Map<string, string | null>>(new Map());
  const diffTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const updateContent = useEditorStore((s) => s.updateContent);
  const reveal = useEditorStore((s) => s.reveal);
  const pendingRevert = useEditorStore((s) => s.pendingRevert);
  const fontSize = useEditorStore((s) => s.fontSize);
  const projectDiagnostics = useDiagnosticsStore((s) => s.diagnostics);
  const themeId = useThemeStore((s) => s.currentId);
  const editorScheme = useThemeStore((s) => s.editorScheme);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const syncTick = useWorkspaceStore((s) => s.syncTick);

  // Recompute the git change gutter for the active model against its HEAD content.
  const recomputeDiff = useCallback(() => {
    const instance = editorRef.current;
    const collection = decoRef.current;
    if (!instance || !collection) return;
    const model = instance.getModel();
    const original = model ? originalRef.current.get(model.uri.path) : null;
    if (!model || original == null) {
      collection.clear();
      hunksRef.current = [];
      return;
    }
    const monaco = getMonaco();
    const hunks = computeDiff(original.split(/\r?\n/), model.getLinesContent());
    hunksRef.current = hunks;
    collection.set(hunks.map((h) => hunkToDecoration(h, monaco)));
    if (hunks.length === 0) peekRef.current?.close();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const monaco = getMonaco();
    registerFormatProvider(monaco);
    // LS-backed IDE intelligence (definitions, hover, refs, rename, completion, signature help).
    registerLanguageProviders(monaco);
    const instance = monaco.editor.create(containerRef.current, {
      theme: 'forge-dark',
      // Color class/function/variable names from the TS worker's semantic tokens (Dark+ look).
      'semanticHighlighting.enabled': true,
      automaticLayout: true,
      minimap: { enabled: true, renderCharacters: false, maxColumn: 80 },
      fontSize: useEditorStore.getState().fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace",
      fontLigatures: true,
      // Type-over: typing a closing bracket/quote skips an existing one instead of duplicating.
      autoClosingOvertype: 'always',
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
      glyphMargin: true,
      lineDecorationsWidth: 14,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    });
    editorRef.current = instance;
    setActiveEditor(instance);
    decoRef.current = instance.createDecorationsCollection();
    peekRef.current = new DiffPeek(instance, monaco, {
      getHunks: () => hunksRef.current,
      fileName: () => {
        const s = useEditorStore.getState();
        return s.tabs.find((t) => t.path === s.activePath)?.name ?? '';
      },
      languageId: () => {
        const s = useEditorStore.getState();
        const t = s.tabs.find((tab) => tab.path === s.activePath);
        return t ? languageFor(t.name) : 'plaintext';
      },
      onRevert: (h) => {
        revertHunk(instance, h, monaco);
        recomputeDiff();
      },
    });

    // Re-measure once the Fira Code webfont is ready so glyphs align precisely.
    void document.fonts?.ready.then(() => monaco.editor.remeasureFonts());

    const status = useWorkbenchStatusStore.getState();
    const disposables: IDisposable[] = [];

    // Monaco swallows some app shortcuts when focused (e.g. Cmd+K is a Monaco chord
    // prefix), so they never reach the window listener. Resolve app bindings here first
    // and intercept before Monaco acts, keeping shortcuts working while editing.
    const isMac = window.forge.isMac;
    disposables.push(
      instance.onKeyDown((e) => {
        const bindings = mergeKeybindings(defaultKeybindings, useKeybindingsStore.getState().overrides);
        const id = commandForKeyEvent(e.browserEvent, isMac, bindings);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        void commandRegistry.run(id);
      }),
    );

    // "Format Document With…" — open the formatter picker; the chosen formatter becomes
    // the default and the native format action (above provider) runs with it.
    instance.addAction({
      id: 'forge.formatDocumentWith',
      label: 'Format Document With…',
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1.4,
      run: () => useFormatterStore.getState().setPickerOpen(true),
    });

    disposables.push(
      instance.onDidChangeModelContent(() => {
        const model = instance.getModel();
        if (model) {
          updateContent(model.uri.path, instance.getValue());
          // Push the live buffer to the Language Service (debounced) + refresh inline diagnostics.
          syncLanguageDocument(monaco, model);
        }
        clearTimeout(diffTimer.current);
        diffTimer.current = setTimeout(recomputeDiff, 250);
      }),
    );

    // Auto Save on focus loss: persist dirty files when the editor text loses focus.
    disposables.push(
      instance.onDidBlurEditorText(() => {
        if (useEditorStore.getState().autoSave) void saveAllFiles();
      }),
    );

    // Auto-close HTML/XML tags as you type.
    disposables.push(registerAutoCloseTag(instance, monaco));

    // Tab jumps out of a closing bracket/quote when the cursor sits right before one.
    disposables.push(registerTabOut(instance));

    // Cmd/Ctrl+Click "Go to Definition" is handled by the LS-backed definition provider plus the
    // editor opener registered in registerLanguageProviders(), which routes the target file into
    // this tab system and reveals/highlights the symbol (see the `reveal` effect below).

    // Click the change gutter (colored bar / deletion marker) to open the diff peek.
    disposables.push(
      instance.onMouseDown((e) => {
        const { GUTTER_LINE_DECORATIONS, GUTTER_GLYPH_MARGIN } = monaco.editor.MouseTargetType;
        if (e.target.type !== GUTTER_LINE_DECORATIONS && e.target.type !== GUTTER_GLYPH_MARGIN) {
          return;
        }
        const line = e.target.position?.lineNumber;
        if (!line || !hunksRef.current.some((h) => hunkAtLine(h, line))) return;
        e.event.preventDefault();
        peekRef.current?.openAt(line);
      }),
    );
    disposables.push(
      instance.onDidChangeCursorPosition((e) => {
        status.setCursor(e.position.lineNumber, e.position.column);
        status.setBlame(formatBlame(blameRef.current[e.position.lineNumber - 1]));
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
      clearTimeout(diffTimer.current);
      peekRef.current?.dispose();
      disposables.forEach((d) => d.dispose());
      setActiveEditor(null);
      instance.dispose();
    };
  }, [updateContent, recomputeDiff]);

  // Bind active tab to a per-path model + report its language.
  useEffect(() => {
    const instance = editorRef.current;
    if (!instance) return;
    peekRef.current?.close();
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
      // Register the new buffer with the Language Service and run a first diagnostics pass.
      openLanguageDocument(monaco, model);
    }
    instance.setModel(model);
    instance.updateOptions({ readOnly: tab.readOnly ?? false });
    useWorkbenchStatusStore.getState().setLanguage(languageFor(tab.name));
  }, [activePath, tabs]);

  // Fetch the active file's committed (HEAD) content to drive the change gutter.
  // Re-runs on workspace sync (syncTick) so the gutter settles after commits/stages.
  useEffect(() => {
    if (!activePath) return;
    if (!rootPath) {
      originalRef.current.set(activePath, null);
      recomputeDiff();
      return;
    }
    let cancelled = false;
    void window.forge.gitOriginal(rootPath, activePath).then((res) => {
      if (cancelled) return;
      originalRef.current.set(activePath, res.ok ? res.data : null);
      recomputeDiff();
    });
    return () => {
      cancelled = true;
    };
  }, [activePath, rootPath, syncTick, recomputeDiff]);

  // Fetch per-line git blame for the active file; show the cursor line's blame
  // in the status bar. Refetched on workspace sync (after saves/commits).
  useEffect(() => {
    const setBlame = useWorkbenchStatusStore.getState().setBlame;
    if (!activePath || !rootPath || !activePath.startsWith('/')) {
      blameRef.current = [];
      setBlame(null);
      return;
    }
    let cancelled = false;
    void window.forge.gitBlame(rootPath, activePath).then((res) => {
      if (cancelled) return;
      blameRef.current = res.ok ? res.data : [];
      const line = editorRef.current?.getPosition()?.lineNumber ?? 1;
      setBlame(formatBlame(blameRef.current[line - 1]));
    });
    return () => {
      cancelled = true;
    };
  }, [activePath, rootPath, syncTick]);

  // Reload non-dirty open buffers when the workspace changes on disk (external
  // edits, discard, checkout). Dirty buffers are left alone to protect unsaved work.
  useEffect(() => {
    if (!rootPath) return;
    let cancelled = false;
    for (const tab of useEditorStore.getState().tabs) {
      if (tab.dirty || tab.readOnly || !tab.path.startsWith('/')) continue;
      const model = modelsRef.current.get(tab.path);
      if (!model) continue;
      void window.forge.readFile(tab.path).then((res) => {
        if (cancelled || !res.ok || res.data === model.getValue()) return;
        model.setValue(res.data);
        useEditorStore.getState().markSaved(tab.path);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [syncTick, rootPath]);

  useEffect(() => {
    const openPaths = new Set(tabs.map((t) => t.path));
    for (const [path, model] of modelsRef.current) {
      if (!openPaths.has(path)) {
        closeLanguageDocument(path);
        model.dispose();
        modelsRef.current.delete(path);
      }
    }
  }, [tabs]);

  // Apply the editor syntax scheme: an explicit choice, or 'auto' to follow the interface theme.
  useEffect(() => {
    const uiType = builtInThemes[themeId]?.type === 'light' ? 'light' : 'dark';
    getMonaco().editor.setTheme(monacoThemeForScheme(editorScheme, uiType));
  }, [themeId, editorScheme]);

  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize });
  }, [fontSize]);

  // Spin up (or switch to) the main-process TypeScript Language Service for this workspace, then
  // (re-)register every already-open buffer so the project sees their live, possibly-dirty content.
  useEffect(() => {
    if (!rootPath) return;
    initLanguageProject(rootPath);
    const monaco = getMonaco();
    for (const model of modelsRef.current.values()) {
      if (!model.isDisposed()) openLanguageDocument(monaco, model);
    }
  }, [rootPath]);

  // Project the workspace-wide `tsc` diagnostics onto open files as markers, so they show
  // as inline squiggles with hover tooltips (Monaco's own TS worker is single-file only).
  // Group by file once (O(diagnostics)) instead of re-filtering per open model.
  useEffect(() => {
    const monaco = getMonaco();
    const byFile = new Map<string, typeof projectDiagnostics>();
    for (const d of projectDiagnostics) {
      const list = byFile.get(d.file);
      if (list) list.push(d);
      else byFile.set(d.file, [d]);
    }
    for (const [path, model] of modelsRef.current) {
      const rel = rootPath && path.startsWith(`${rootPath}/`) ? path.slice(rootPath.length + 1) : path;
      const fileDiags = byFile.get(rel) ?? [];
      const markers = fileDiags.map((d) => {
        const word = model.getWordAtPosition({ lineNumber: d.line, column: d.col });
        return {
          severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: `${d.message} (${d.code})`,
          startLineNumber: d.line,
          startColumn: word ? word.startColumn : d.col,
          endLineNumber: d.line,
          endColumn: word ? word.endColumn : d.col + 1,
        };
      });
      monaco.editor.setModelMarkers(model, 'forge-tsc', markers);
    }
  }, [projectDiagnostics, rootPath, tabs]);

  // Reveal a requested line/column (terminal path:line:col links, and Go to Definition targets).
  // When the reveal carries an end position, briefly highlight the target symbol.
  useEffect(() => {
    const instance = editorRef.current;
    if (!instance || !reveal) return;
    const model = instance.getModel();
    if (model && model.uri.path === reveal.path) {
      instance.revealLineInCenter(reveal.line);
      instance.setPosition({ lineNumber: reveal.line, column: reveal.col });
      instance.focus();
      if (reveal.endLine != null && reveal.endColumn != null) {
        const monaco = getMonaco();
        const collection = instance.createDecorationsCollection([
          {
            range: new monaco.Range(reveal.line, reveal.col, reveal.endLine, reveal.endColumn),
            options: { className: 'forge-goto-highlight', isWholeLine: false },
          },
        ]);
        setTimeout(() => collection.clear(), 1200);
      }
      useEditorStore.getState().consumeReveal();
    }
  }, [reveal, activePath, tabs]);

  // Revert: replace the model's content with the on-disk version, then clear dirty.
  useEffect(() => {
    if (!pendingRevert) return;
    const model = modelsRef.current.get(pendingRevert.path);
    if (model) {
      model.setValue(pendingRevert.content);
      useEditorStore.getState().markSaved(pendingRevert.path);
    }
    useEditorStore.getState().consumeRevert();
  }, [pendingRevert]);

  const hasTabs = tabs.length > 0;

  const onPickFormatter = (id: FormatterId): void => {
    useFormatterStore.getState().setSelected(id);
    void editorRef.current?.getAction('editor.action.formatDocument')?.run();
  };

  return (
    <div className="relative h-full w-full bg-bg">
      <div ref={containerRef} className="absolute inset-0" />
      <FormatterPicker onPick={onPickFormatter} />
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
