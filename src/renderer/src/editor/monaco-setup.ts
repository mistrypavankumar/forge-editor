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
        'editor.background': '#1b1b1f',
        'editor.foreground': '#e4e4e7',
        'editorGutter.background': '#1b1b1f',
        'editorLineNumber.foreground': '#52525b',
        'editorLineNumber.activeForeground': '#a1a1aa',
        'editor.lineHighlightBackground': '#232328',
        'editor.lineHighlightBorder': '#00000000',
        'editor.selectionBackground': '#7c6cf64d',
        'editor.inactiveSelectionBackground': '#7c6cf626',
        'editorCursor.foreground': '#8f80f8',
        'editorWidget.background': '#202024',
        'editorWidget.border': '#2a2a31',
        'editorSuggestWidget.background': '#202024',
        'input.background': '#26262c',
        'scrollbarSlider.background': '#3a3a4233',
        'scrollbarSlider.hoverBackground': '#3a3a4255',
        'scrollbarSlider.activeBackground': '#3a3a4288',
      },
    });
    themeDefined = true;
  }
  return monaco;
}
