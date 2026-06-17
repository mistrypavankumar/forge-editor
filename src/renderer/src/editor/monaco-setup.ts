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

let themeDefined = false;

export function getMonaco(): typeof monaco {
  if (!themeDefined) {
    monaco.editor.defineTheme('forge-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0a0a0c',
        'editor.foreground': '#ededf0',
        'editorGutter.background': '#0a0a0c',
        'editorLineNumber.foreground': '#52525b',
        'editorLineNumber.activeForeground': '#b2b2bb',
        'editor.lineHighlightBackground': '#16161b',
        'editor.lineHighlightBorder': '#00000000',
        'editor.selectionBackground': '#6366f140',
        'editor.inactiveSelectionBackground': '#6366f124',
        'editorCursor.foreground': '#818cf8',
        'editorWidget.background': '#1a1a1e',
        'editorWidget.border': '#26262c',
        'editorSuggestWidget.background': '#1a1a1e',
        'input.background': '#1a1a1e',
        'scrollbarSlider.background': '#6a6a7333',
        'scrollbarSlider.hoverBackground': '#6a6a7355',
        'scrollbarSlider.activeBackground': '#6a6a7388',
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
    themeDefined = true;
  }
  return monaco;
}
