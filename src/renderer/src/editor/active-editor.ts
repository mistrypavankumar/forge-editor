import type { editor } from 'monaco-editor';

let active: editor.IStandaloneCodeEditor | null = null;

/** CodeEditor registers its instance here so commands can drive Monaco actions. */
export function setActiveEditor(instance: editor.IStandaloneCodeEditor | null): void {
  active = instance;
}

export function getActiveEditor(): editor.IStandaloneCodeEditor | null {
  return active;
}
