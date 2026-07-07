import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, ChevronUp, ChevronDown } from 'lucide-react';
import type { editor, IDisposable } from 'monaco-editor';
import { getMonaco } from '../editor/monaco-setup';
import { monacoThemeForScheme } from '../editor/editor-schemes';
import { languageFor } from '../editor/language';
import { hunkAtLine, hunkToDecoration, revertHunk } from '../editor/git-gutter';
import { breakpointDecorations, currentLineDecoration } from '../editor/breakpoint-gutter';
import { debugCommandForKey } from '../keybindings/debug-keys';
import { useDebugStore } from '../stores/debug-store';
import { goToChange, registerHunkSource, unregisterHunkSource } from '../editor/change-nav';
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
  updateLanguageDocument,
  scheduleDiagnostics,
  closeLanguageDocument,
} from '../editor/language-bridge';
import { registerAutoCloseTag } from '../editor/auto-close-tag';
import { registerTabOut } from '../editor/tab-out';
import {
  buildRunDecorations,
  cancelInlineRun,
  isRunnable,
  runInlineNow,
  scheduleInlineRun,
} from '../editor/inline-run';
import { useInlineRunStore } from '../stores/inline-run-store';
import { useSearchStore } from '../stores/search-store';
import { buildReplaceDecorations } from '../editor/replace-preview';
import { setActiveEditor, getActiveEditor } from '../editor/active-editor';
import { saveAllFiles } from '../lib/save-actions';
import { useFormatterStore } from '../stores/formatter-store';
import type { FormatterId } from '../lib/detect-formatters';
import { FormatterPicker } from './FormatterPicker';
import type { BlameLine } from '@shared/ipc-contract';
import { relativeTime } from '../lib/relative-time';
import { useEditorStore } from '../stores/editor-store';
import { useThemeStore } from '../stores/theme-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { builtInThemes } from '../theme/themes';
import {
  useWorkbenchStatusStore,
  type MarkerInfo,
  type MarkerSeverity,
} from '../stores/workbench-status-store';

function severityName(level: number): MarkerSeverity {
  if (level >= 8) return 'error';
  if (level >= 4) return 'warning';
  return 'info';
}

/** "author (time ago)" for the status bar; uncommitted local edits read "author (uncommitted)". */
function formatBlame(b: BlameLine | undefined): string | null {
  if (!b) return null;
  return b.time == null ? `${b.author} (uncommitted)` : `${b.author} (${relativeTime(b.time)})`;
}

/**
 * TS diagnostic codes that mean "declared but never used" — unused locals, parameters, imports,
 * labels, destructured elements, and type parameters. These get faded (Unnecessary tag) rather
 * than squiggled, matching the live Language Service path in language-bridge.ts.
 */
const UNUSED_TS_CODES = new Set([
  'TS6133', 'TS6138', 'TS6192', 'TS6196', 'TS6198', 'TS6199', 'TS6205',
]);

export function CodeEditor({ groupId = 'main' }: { groupId?: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const modelsRef = useRef<Map<string, editor.ITextModel>>(new Map());
  const decoRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const runDecoRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  // Inline find/replace preview: matched text struck through + the replacement as green ghost text.
  const replaceDecoRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  // Debugger gutter: breakpoint dots, and the highlight on the paused execution line.
  const bpDecoRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const dbgLineDecoRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const peekRef = useRef<DiffPeek | null>(null);
  const hunksRef = useRef<DiffHunk[]>([]);
  const blameRef = useRef<BlameLine[]>([]);
  const originalRef = useRef<Map<string, string | null>>(new Map());
  const diffTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const tabs = useEditorStore((s) => s.tabs);
  // Stable key of the open file set — changes only when tabs are added/removed/renamed, NOT on
  // content edits (which rebuild `tabs` every keystroke). Used to gate the diagnostics projection.
  const openPathsKey = useEditorStore((s) => s.tabs.map((t) => t.path).join('\n'));
  const activePath = useEditorStore(
    (s) => (s.groups.find((g) => g.id === groupId) ?? s.groups[0])?.activePath ?? null,
  );
  const updateContent = useEditorStore((s) => s.updateContent);
  const reveal = useEditorStore((s) => s.reveal);
  const pendingRevert = useEditorStore((s) => s.pendingRevert);
  const fontSize = useEditorStore((s) => s.fontSize);
  const projectDiagnostics = useDiagnosticsStore((s) => s.diagnostics);
  const themeId = useThemeStore((s) => s.currentId);
  const editorScheme = useThemeStore((s) => s.editorScheme);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const syncTick = useWorkspaceStore((s) => s.syncTick);
  const inlineRunEnabled = useInlineRunStore((s) => s.enabled);
  const inlineRunByPath = useInlineRunStore((s) => s.byPath);
  const replacePreview = useSearchStore((s) => s.preview);
  const breakpoints = useDebugStore((s) => s.breakpoints);
  const bpVerified = useDebugStore((s) => s.verified);
  const pausedLocation = useDebugStore((s) => s.pausedLocation);
  // Number of git-change hunks in the active file — drives the floating next/prev-change buttons.
  const [changeCount, setChangeCount] = useState(0);

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
      setChangeCount(0);
      return;
    }
    const monaco = getMonaco();
    const hunks = computeDiff(original.split(/\r?\n/), model.getLinesContent());
    hunksRef.current = hunks;
    setChangeCount(hunks.length);
    collection.set(hunks.map((h) => hunkToDecoration(h, monaco)));
    if (hunks.length === 0) peekRef.current?.close();
  }, []);

  // Show who last changed the cursor's current line in the status bar (bottom-right).
  // Recomputed on cursor move and after blame is (re)fetched; blame data lives in blameRef.
  const refreshBlame = useCallback(() => {
    const line = editorRef.current?.getPosition()?.lineNumber ?? 1;
    useWorkbenchStatusStore.getState().setBlame(formatBlame(blameRef.current[line - 1]));
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
      // Cmd/Ctrl+click jumps to the first definition instead of opening a peek list. TS returns
      // multiple definitions for shorthand object properties (the local value AND the matching
      // property in the target type) and merged/overloaded declarations; default 'peek' makes
      // those feel like "nothing happened". 'goto' navigates to the first (the value decl).
      gotoLocation: { multipleDefinitions: 'goto', multipleTypeDefinitions: 'goto' },
      // Render Copilot-style AI ghost text (Tab to accept). The provider itself is gated behind
      // the AI "inline suggestions" toggle, so this just lets the suggestions show when on.
      inlineSuggest: { enabled: true },
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
    // Become the active editor on mount if this is the focused group; thereafter, focus drives it
    // (so commands like save/format/reveal target whichever split pane the user is editing).
    if (useEditorStore.getState().activeGroupId === groupId) setActiveEditor(instance);
    decoRef.current = instance.createDecorationsCollection();
    // Separate collection for the live console.log output (kept apart from the git gutter).
    runDecoRef.current = instance.createDecorationsCollection();
    // Collection for the inline find/replace preview (old→new decorations).
    replaceDecoRef.current = instance.createDecorationsCollection();
    // Debugger gutter collections: breakpoint dots and the paused-line highlight.
    bpDecoRef.current = instance.createDecorationsCollection();
    dbgLineDecoRef.current = instance.createDecorationsCollection();
    // Publish this editor's live hunks so the global next/prev-change commands can navigate it.
    registerHunkSource(instance, () => hunksRef.current);
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

    // Focusing this pane makes it the active editor + active group.
    disposables.push(
      instance.onDidFocusEditorText(() => {
        setActiveEditor(instance);
        useEditorStore.getState().setActiveGroup(groupId);
      }),
    );

    // Monaco swallows some app shortcuts when focused (e.g. Cmd+K is a Monaco chord
    // prefix), so they never reach the window listener. Resolve app bindings here first
    // and intercept before Monaco acts, keeping shortcuts working while editing.
    const isMac = window.forge.isMac;
    disposables.push(
      instance.onKeyDown((e) => {
        const bindings = mergeKeybindings(defaultKeybindings, useKeybindingsStore.getState().overrides);
        // App chords (with a modifier) resolve first; bare debugger F-keys (F5/F9/F10/F11) fall
        // through to the debug map so they work while the editor has focus.
        const id = commandForKeyEvent(e.browserEvent, isMac, bindings) ?? debugCommandForKey(e.browserEvent);
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

    // "Generate Skeleton" — only meaningful for React files; run() shows a friendly message
    // in the preview modal for anything else, so we can offer it whenever there's a model.
    instance.addAction({
      id: 'forge.generateSkeleton',
      label: 'Generate Skeleton',
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1.5,
      run: () => {
        const uri = instance.getModel()?.uri.path ?? '';
        if (!/\.(tsx|jsx)$/i.test(uri)) return;
        void commandRegistry.run('forge.generateSkeleton');
      },
    });

    disposables.push(
      instance.onDidChangeModelContent(() => {
        const model = instance.getModel();
        if (model) {
          updateContent(model.uri.path, instance.getValue());
          // Sync the buffer to the LS immediately (keeps completions in step with typing),
          // then refresh diagnostics on a debounce (the expensive part).
          updateLanguageDocument(model);
          scheduleDiagnostics(monaco, model);
          // Re-run the buffer (debounced) so the inline console.log output follows the edits.
          if (useInlineRunStore.getState().enabled && isRunnable(model)) scheduleInlineRun(model);
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

    // Click the change gutter (the colored bar in the lines-decorations strip) to open the diff
    // peek. The glyph margin is reserved for breakpoints (handled below).
    disposables.push(
      instance.onMouseDown((e) => {
        // Left-click only — otherwise a right-click on a changed line's gutter would preventDefault
        // here and swallow the context menu (the "right-click sometimes doesn't work" case).
        if (!e.event.leftButton) return;
        if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS) return;
        const line = e.target.position?.lineNumber;
        if (!line || !hunksRef.current.some((h) => hunkAtLine(h, line))) return;
        e.event.preventDefault();
        peekRef.current?.openAt(line);
      }),
    );

    // Click the glyph margin to toggle a breakpoint on that line (VS Code-style).
    disposables.push(
      instance.onMouseDown((e) => {
        if (!e.event.leftButton) return;
        if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
        const line = e.target.position?.lineNumber;
        const model = instance.getModel();
        if (!line || !model) return;
        e.event.preventDefault();
        useDebugStore.getState().toggleBreakpoint(model.uri.path, line);
      }),
    );
    disposables.push(
      instance.onDidChangeCursorPosition((e) => {
        status.setCursor(e.position.lineNumber, e.position.column);
        refreshBlame();
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
      unregisterHunkSource(instance);
      if (getActiveEditor() === instance) setActiveEditor(null);
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
      // Models are keyed by URI globally, so a file open in both split panes shares one buffer
      // (edits sync, one dirty state). Reuse the existing model when the other pane already made it.
      const uri = monaco.Uri.file(activePath);
      const existing = monaco.editor.getModel(uri);
      model = existing ?? monaco.editor.createModel(tab.content, languageFor(tab.name), uri);
      modelsRef.current.set(activePath, model);
      // Register the buffer with the Language Service (idempotent). Also covers models pre-created
      // for a go-to-definition preview, which exist in Monaco but were never LS-registered.
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

  // Drop the previous file's blame right away on a file switch so it can't flash on the
  // newly-opened one. Keyed only on the file (not syncTick), so a resync never blanks the bar.
  useEffect(() => {
    blameRef.current = [];
    refreshBlame();
  }, [activePath, rootPath, refreshBlame]);

  // Fetch per-line git blame for the active file; show the cursor line's blame in the status bar.
  // Refetched on workspace sync (after saves/commits) WITHOUT clearing first, so the bar holds the
  // previous value until fresh data arrives instead of blinking to empty every sync tick.
  useEffect(() => {
    if (!activePath || !rootPath || !activePath.startsWith('/')) return;
    let cancelled = false;
    void window.forge.gitBlame(rootPath, activePath).then((res) => {
      if (cancelled) return;
      blameRef.current = res.ok ? res.data : [];
      refreshBlame();
    });
    return () => {
      cancelled = true;
    };
  }, [activePath, rootPath, syncTick, refreshBlame]);

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
    // `tabs` is the shared document list, so a model is disposed only once the file is closed in
    // every group. Both split instances run this; guard against double-dispose.
    const openPaths = new Set(tabs.map((t) => t.path));
    for (const [path, model] of modelsRef.current) {
      if (!openPaths.has(path)) {
        if (!model.isDisposed()) {
          closeLanguageDocument(path);
          cancelInlineRun(path);
          useInlineRunStore.getState().clear(path);
          model.dispose();
        }
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

  // Render the live console.log output as end-of-line decorations whenever the captured results,
  // the active file, or the feature toggle change.
  useEffect(() => {
    const instance = editorRef.current;
    const collection = runDecoRef.current;
    if (!instance || !collection) return;
    const model = instance.getModel();
    if (!model || !inlineRunEnabled || !isRunnable(model)) {
      collection.clear();
      return;
    }
    const state = useInlineRunStore.getState().get(model.uri.path);
    collection.set(buildRunDecorations(getMonaco(), model, state));
  }, [inlineRunEnabled, inlineRunByPath, activePath]);

  // Render the inline find/replace preview for the open file: matched text struck through with the
  // replacement as green ghost text. Recomputes when the query/replacement changes, the file
  // changes, or the buffer is edited (`tabs` rebuilds on each keystroke). Clears when no replace
  // query is live (`replacePreview` null).
  useEffect(() => {
    const instance = editorRef.current;
    const collection = replaceDecoRef.current;
    if (!instance || !collection) return;
    const model = instance.getModel();
    if (!model || !replacePreview) {
      collection.clear();
      return;
    }
    collection.set(buildReplaceDecorations(getMonaco(), model, replacePreview));
  }, [replacePreview, activePath, tabs]);

  // Kick off a run when the feature is switched on, or when switching to a runnable file.
  useEffect(() => {
    if (!inlineRunEnabled) return;
    const model = editorRef.current?.getModel();
    if (model && isRunnable(model)) runInlineNow(model);
  }, [inlineRunEnabled, activePath]);

  // Render the active file's breakpoint dots in the glyph margin.
  useEffect(() => {
    const instance = editorRef.current;
    const collection = bpDecoRef.current;
    if (!instance || !collection) return;
    const model = instance.getModel();
    if (!model) {
      collection.clear();
      return;
    }
    const lines = breakpoints[model.uri.path] ?? [];
    collection.set(breakpointDecorations(getMonaco(), lines, bpVerified[model.uri.path]));
  }, [breakpoints, bpVerified, activePath]);

  // Highlight (and reveal) the line execution is paused on, when it's in this file.
  useEffect(() => {
    const instance = editorRef.current;
    const collection = dbgLineDecoRef.current;
    if (!instance || !collection) return;
    const model = instance.getModel();
    if (!model || !pausedLocation || model.uri.path !== pausedLocation.file) {
      collection.clear();
      return;
    }
    collection.set([currentLineDecoration(getMonaco(), pausedLocation.line)]);
    instance.revealLineInCenter(pausedLocation.line);
  }, [pausedLocation, activePath]);

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
        const unused = UNUSED_TS_CODES.has(d.code);
        return {
          // Unused code fades (Hint + Unnecessary tag) instead of showing an error/warning squiggle.
          severity: unused
            ? monaco.MarkerSeverity.Hint
            : d.severity === 'error'
              ? monaco.MarkerSeverity.Error
              : monaco.MarkerSeverity.Warning,
          message: `${d.message} (${d.code})`,
          startLineNumber: d.line,
          startColumn: word ? word.startColumn : d.col,
          endLineNumber: d.line,
          endColumn: word ? word.endColumn : d.col + 1,
          tags: unused ? [monaco.MarkerTag.Unnecessary] : undefined,
        };
      });
      monaco.editor.setModelMarkers(model, 'forge-tsc', markers);
    }
    // Gate on the open-file set (openPathsKey), never raw `tabs` — otherwise this rebuilds the
    // marker map from every project diagnostic on each keystroke (laggy with thousands of errors).
  }, [projectDiagnostics, rootPath, openPathsKey]);

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
  const isMac = window.forge.isMac;
  const nextChangeHint = isMac ? '⌥F5' : 'Alt+F5';
  const prevChangeHint = isMac ? '⌥⇧F5' : 'Alt+Shift+F5';

  const onPickFormatter = (id: FormatterId): void => {
    useFormatterStore.getState().setSelected(id);
    void editorRef.current?.getAction('editor.action.formatDocument')?.run();
  };

  return (
    <div className="relative h-full w-full bg-bg">
      <div ref={containerRef} className="absolute inset-0" />
      <FormatterPicker onPick={onPickFormatter} />
      {changeCount > 0 ? (
        <div className="absolute right-5 top-3 z-10 flex items-center overflow-hidden rounded-full border border-line bg-surface-2/90 text-muted shadow-md backdrop-blur">
          <button
            type="button"
            onClick={() => goToChange(editorRef.current, -1)}
            title={`Previous change (${prevChangeHint})`}
            aria-label="Go to previous change"
            className="flex h-7 w-7 items-center justify-center hover:bg-surface-3 hover:text-fg"
          >
            <ChevronUp size={15} />
          </button>
          <span
            className="px-1 font-mono text-[11px] tabular-nums text-faint"
            title={`${changeCount} change${changeCount === 1 ? '' : 's'} from HEAD`}
          >
            {changeCount}
          </span>
          <button
            type="button"
            onClick={() => goToChange(editorRef.current, 1)}
            title={`Next change (${nextChangeHint})`}
            aria-label="Go to next change"
            className="flex h-7 w-7 items-center justify-center hover:bg-surface-3 hover:text-fg"
          >
            <ChevronDown size={15} />
          </button>
        </div>
      ) : null}
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
