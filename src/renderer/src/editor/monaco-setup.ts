import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

let configured = false;

export function getMonaco(): typeof monaco {
  if (!configured) {
    // Diagnostics now come from the main-process TypeScript Language Service (project-aware,
    // resolves tsconfig aliases + node_modules). Silence the browser worker entirely so we don't
    // get duplicate or misleading single-file squiggles.
    const tsDiagnostics = { noSemanticValidation: true, noSyntaxValidation: true };
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(tsDiagnostics);
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(tsDiagnostics);
  }
  if (!configured) {
    monaco.editor.defineTheme('forge-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#080B12',
        'editor.foreground': '#E6EDF7',
        'editorGutter.background': '#080B12',
        'editorLineNumber.foreground': '#4a576d',
        'editorLineNumber.activeForeground': '#A8B3C7',
        'editor.lineHighlightBackground': '#0D111B',
        'editor.lineHighlightBorder': '#00000000',
        'editor.selectionBackground': '#7C5CFF40',
        'editor.inactiveSelectionBackground': '#7C5CFF22',
        'editorCursor.foreground': '#8B73FF',
        'editorWidget.background': '#161F2E',
        'editorWidget.border': '#2D3A52',
        'editorSuggestWidget.background': '#161F2E',
        'input.background': '#111827',
        'scrollbarSlider.background': '#6b768a33',
        'scrollbarSlider.hoverBackground': '#6b768a55',
        'scrollbarSlider.activeBackground': '#6b768a88',
      },
    });
    monaco.editor.defineTheme('forge-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#18181b',
        'editorLineNumber.foreground': '#a0a0a8',
        'editorLineNumber.activeForeground': '#52525b',
        'editor.lineHighlightBackground': '#f4f4f6',
        'editor.selectionBackground': '#6366f133',
        'editorCursor.foreground': '#6366f1',
        'editorWidget.background': '#f7f7f8',
        'editorWidget.border': '#e3e3e7',
      },
    });
    configured = true;
  }
  return monaco;
}
