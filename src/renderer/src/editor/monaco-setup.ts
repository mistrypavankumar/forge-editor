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

/**
 * A syntax palette. Each role is a hex color WITHOUT the leading `#` (Monaco's rule format).
 * `buildRules` expands it across both Monaco's Monarch token types and the semantic-token scopes
 * the Language Service emits (class/function/variable/…), so symbol coloring is theme-driven.
 */
interface Palette {
  base: string;
  comment: string;
  commentStyle?: 'italic';
  string: string;
  escape: string;
  regexp: string;
  number: string;
  keyword: string;
  punctuation: string;
  identifier: string;
  /** Classes, interfaces, enums, type aliases, namespaces, type parameters. */
  type: string;
  tag: string;
  attrName: string;
  attrValue: string;
  /** Functions and methods. */
  func: string;
  variable: string;
  /** Readonly variables and enum members. */
  constant: string;
  parameter: string;
  parameterStyle?: 'italic';
  property: string;
}

function buildRules(p: Palette): monaco.editor.ITokenThemeRule[] {
  return [
    { token: '', foreground: p.base },
    { token: 'comment', foreground: p.comment, fontStyle: p.commentStyle },
    { token: 'string', foreground: p.string },
    { token: 'string.escape', foreground: p.escape },
    { token: 'regexp', foreground: p.regexp },
    { token: 'number', foreground: p.number },
    { token: 'keyword', foreground: p.keyword },
    { token: 'operator', foreground: p.punctuation },
    { token: 'delimiter', foreground: p.punctuation },
    { token: 'identifier', foreground: p.identifier },
    { token: 'type', foreground: p.type },
    { token: 'type.identifier', foreground: p.type },
    // JSX / HTML
    { token: 'tag', foreground: p.tag },
    { token: 'metatag', foreground: p.tag },
    { token: 'attribute.name', foreground: p.attrName },
    { token: 'attribute.value', foreground: p.attrValue },
    { token: 'delimiter.html', foreground: '808080' },
    // GraphQL: directives (@include) read as functions; field/argument keys as properties.
    { token: 'annotation', foreground: p.func },
    { token: 'key.identifier', foreground: p.property },
    // Semantic tokens (legend names from SEMANTIC_TOKEN_TYPES)
    { token: 'class', foreground: p.type },
    { token: 'interface', foreground: p.type },
    { token: 'enum', foreground: p.type },
    { token: 'enumMember', foreground: p.constant },
    { token: 'typeParameter', foreground: p.type },
    { token: 'namespace', foreground: p.type },
    { token: 'function', foreground: p.func },
    { token: 'member', foreground: p.func },
    { token: 'variable', foreground: p.variable },
    { token: 'variable.readonly', foreground: p.constant },
    { token: 'parameter', foreground: p.parameter, fontStyle: p.parameterStyle },
    { token: 'property', foreground: p.property },
  ];
}

const DARK_PLUS: Palette = {
  base: 'D4D4D4', comment: '6A9955', commentStyle: 'italic', string: 'CE9178', escape: 'D7BA7D',
  regexp: 'D16969', number: 'B5CEA8', keyword: '569CD6', punctuation: 'D4D4D4', identifier: 'D4D4D4',
  type: '4EC9B0', tag: '569CD6', attrName: '9CDCFE', attrValue: 'CE9178', func: 'DCDCAA',
  variable: '9CDCFE', constant: '4FC1FF', parameter: '9CDCFE', property: '9CDCFE',
};

const LIGHT_PLUS: Palette = {
  base: '000000', comment: '008000', commentStyle: 'italic', string: 'A31515', escape: 'EE0000',
  regexp: '811F3F', number: '098658', keyword: '0000FF', punctuation: '000000', identifier: '001080',
  type: '267F99', tag: '800000', attrName: 'E50000', attrValue: '0451A5', func: '795E26',
  variable: '001080', constant: '0070C1', parameter: '001080', property: '001080',
};

const GITHUB_DARK: Palette = {
  base: 'C9D1D9', comment: '8B949E', string: 'A5D6FF', escape: '79C0FF', regexp: '7EE787',
  number: '79C0FF', keyword: 'FF7B72', punctuation: 'C9D1D9', identifier: 'C9D1D9', type: 'FFA657',
  tag: '7EE787', attrName: '79C0FF', attrValue: 'A5D6FF', func: 'D2A8FF', variable: 'C9D1D9',
  constant: '79C0FF', parameter: 'C9D1D9', property: '79C0FF',
};

const MONOKAI: Palette = {
  base: 'F8F8F2', comment: '75715E', commentStyle: 'italic', string: 'E6DB74', escape: 'AE81FF',
  regexp: 'E6DB74', number: 'AE81FF', keyword: 'F92672', punctuation: 'F8F8F2', identifier: 'F8F8F2',
  type: '66D9EF', tag: 'F92672', attrName: 'A6E22E', attrValue: 'E6DB74', func: 'A6E22E',
  variable: 'F8F8F2', constant: 'AE81FF', parameter: 'FD971F', parameterStyle: 'italic', property: 'F8F8F2',
};

// Diff-editor highlight colours. vs-dark's inherited defaults are nearly invisible on Forge's very
// dark background, so we set vivid green (added) / red (removed) line + inline backgrounds.
const DIFF_DARK: Record<string, string> = {
  'diffEditor.insertedLineBackground': '#2EA04328',
  'diffEditor.removedLineBackground': '#F8514928',
  'diffEditor.insertedTextBackground': '#2EA04345',
  'diffEditor.removedTextBackground': '#F8514945',
  'diffEditorGutter.insertedLineBackground': '#2EA04366',
  'diffEditorGutter.removedLineBackground': '#F8514966',
  'diffEditorOverview.insertedForeground': '#2EA043AA',
  'diffEditorOverview.removedForeground': '#F85149AA',
  'diffEditor.diagonalFill': '#2D3A5277',
};

const DIFF_LIGHT: Record<string, string> = {
  'diffEditor.insertedLineBackground': '#2EA04322',
  'diffEditor.removedLineBackground': '#F8514922',
  'diffEditor.insertedTextBackground': '#2EA04340',
  'diffEditor.removedTextBackground': '#F8514940',
  'diffEditorGutter.insertedLineBackground': '#2EA04355',
  'diffEditorGutter.removedLineBackground': '#F8514955',
  'diffEditor.diagonalFill': '#d0d0d8',
};

const FORGE_DARK_COLORS: Record<string, string> = {
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
};

const FORGE_LIGHT_COLORS: Record<string, string> = {
  'editor.background': '#ffffff',
  'editor.foreground': '#18181b',
  'editorLineNumber.foreground': '#a0a0a8',
  'editorLineNumber.activeForeground': '#52525b',
  'editor.lineHighlightBackground': '#f4f4f6',
  'editor.selectionBackground': '#6366f133',
  'editorCursor.foreground': '#6366f1',
  'editorWidget.background': '#f7f7f8',
  'editorWidget.border': '#e3e3e7',
};

const GITHUB_DARK_COLORS: Record<string, string> = {
  'editor.background': '#0d1117',
  'editor.foreground': '#c9d1d9',
  'editorGutter.background': '#0d1117',
  'editorLineNumber.foreground': '#484f58',
  'editorLineNumber.activeForeground': '#c9d1d9',
  'editor.lineHighlightBackground': '#161b22',
  'editor.selectionBackground': '#3392FF44',
  'editorCursor.foreground': '#58a6ff',
  'editorWidget.background': '#161b22',
  'editorWidget.border': '#30363d',
};

const MONOKAI_COLORS: Record<string, string> = {
  'editor.background': '#272822',
  'editor.foreground': '#F8F8F2',
  'editorGutter.background': '#272822',
  'editorLineNumber.foreground': '#90908a',
  'editorLineNumber.activeForeground': '#f8f8f2',
  'editor.lineHighlightBackground': '#3e3d32',
  'editor.selectionBackground': '#49483E',
  'editorCursor.foreground': '#f8f8f0',
  'editorWidget.background': '#3e3d32',
  'editorWidget.border': '#75715e',
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

    monaco.editor.defineTheme('forge-dark', {
      base: 'vs-dark', inherit: true, rules: buildRules(DARK_PLUS),
      colors: { ...DIFF_DARK, ...FORGE_DARK_COLORS },
    });
    monaco.editor.defineTheme('forge-light', {
      base: 'vs', inherit: true, rules: buildRules(LIGHT_PLUS),
      colors: { ...DIFF_LIGHT, ...FORGE_LIGHT_COLORS },
    });
    // Original minimal look: base vs-dark token colors, Forge chrome.
    monaco.editor.defineTheme('forge-minimal-dark', {
      base: 'vs-dark', inherit: true, rules: [], colors: { ...DIFF_DARK, ...FORGE_DARK_COLORS },
    });
    monaco.editor.defineTheme('github-dark', {
      base: 'vs-dark', inherit: true, rules: buildRules(GITHUB_DARK),
      colors: { ...DIFF_DARK, ...GITHUB_DARK_COLORS },
    });
    monaco.editor.defineTheme('monokai', {
      base: 'vs-dark', inherit: true, rules: buildRules(MONOKAI),
      colors: { ...DIFF_DARK, ...MONOKAI_COLORS },
    });
    configured = true;
  }
  return monaco;
}
