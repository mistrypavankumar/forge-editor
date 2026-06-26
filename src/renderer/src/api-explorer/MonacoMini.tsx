import { useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';

import { getMonaco } from '../editor/monaco-setup';
import { monacoThemeForScheme } from '../editor/editor-schemes';
import { builtInThemes } from '../theme/themes';
import { useThemeStore } from '../stores/theme-store';

let graphqlRegistered = false;

/**
 * Register a lightweight GraphQL Monarch language so the query editor gets syntax coloring
 * (Monaco ships none). Token names reuse the theme palette scopes already defined in
 * monaco-setup (keyword/type/string/number/comment/annotation/key.identifier), so coloring
 * follows the active editor color scheme. JSON has full support via Monaco's bundled worker.
 */
function ensureGraphqlLanguage(): void {
  if (graphqlRegistered) return;
  const monaco = getMonaco();
  if (monaco.languages.getLanguages().some((l) => l.id === 'graphql')) {
    graphqlRegistered = true;
    return;
  }
  monaco.languages.register({ id: 'graphql', extensions: ['.graphql', '.gql'] });
  monaco.languages.setLanguageConfiguration('graphql', {
    comments: { lineComment: '#' },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
  });
  monaco.languages.setMonarchTokensProvider('graphql', {
    defaultToken: '',
    keywords: [
      'query', 'mutation', 'subscription', 'fragment', 'on', 'type', 'input', 'enum',
      'interface', 'union', 'scalar', 'schema', 'directive', 'extend', 'implements',
      'true', 'false', 'null',
    ],
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/@\s*[A-Za-z_]\w*/, 'annotation'],
        [/\$[A-Za-z_]\w*/, 'variable'],
        // A name immediately followed by ':' is a field/argument key.
        [/[A-Za-z_]\w*(?=\s*:)/, 'key.identifier'],
        [
          /[A-Za-z_]\w*/,
          { cases: { '@keywords': 'keyword', '@default': 'identifier' } },
        ],
        [/"""/, 'string', '@blockString'],
        [/"/, 'string', '@string'],
        [/-?\d+\.\d+([eE][-+]?\d+)?/, 'number'],
        [/-?\d+/, 'number'],
        [/[{}()[\]]/, 'delimiter'],
        [/[:!=|&]/, 'operator'],
      ],
      string: [
        [/[^"\\]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],
      blockString: [
        [/[^"]+/, 'string'],
        [/"""/, 'string', '@pop'],
        [/"/, 'string'],
      ],
    },
  });
  graphqlRegistered = true;
}

/**
 * A small standalone Monaco editor for the API Explorer's query and variables panes.
 * Cmd/Ctrl+Enter runs (scoped to this editor — no global key listener). The Monaco theme
 * follows the app's active editor color scheme, matching the main code editor.
 */
export function MonacoMini({
  value,
  onChange,
  language,
  readOnly = false,
  onRun,
  minHeight = 120,
}: {
  value: string;
  onChange: (next: string) => void;
  language: 'graphql' | 'json';
  readOnly?: boolean;
  onRun?: () => void;
  minHeight?: number;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  const themeId = useThemeStore((s) => s.currentId);
  const editorScheme = useThemeStore((s) => s.editorScheme);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    if (language === 'graphql') ensureGraphqlLanguage();
    const monaco = getMonaco();
    const instance = monaco.editor.create(containerRef.current, {
      value,
      language,
      readOnly,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 12.5,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace",
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      folding: false,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      padding: { top: 8, bottom: 8 },
      tabSize: 2,
      autoClosingBrackets: 'always',
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false },
      overviewRulerLanes: 0,
    });
    editorRef.current = instance;

    const sub = instance.onDidChangeModelContent(() => onChangeRef.current(instance.getValue()));
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current?.());

    return () => {
      sub.dispose();
      instance.getModel()?.dispose();
      instance.dispose();
      editorRef.current = null;
    };
    // Create once; value/readOnly are synced via the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Sync external value changes (template/history load, format) without disrupting typing.
  useEffect(() => {
    const instance = editorRef.current;
    if (instance && value !== instance.getValue()) instance.setValue(value);
  }, [value]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  // Match the main editor's color scheme (Monaco themes are global).
  useEffect(() => {
    const uiType = builtInThemes[themeId]?.type === 'light' ? 'light' : 'dark';
    getMonaco().editor.setTheme(monacoThemeForScheme(editorScheme, uiType));
  }, [themeId, editorScheme]);

  return <div ref={containerRef} className="h-full w-full" style={{ minHeight }} />;
}
