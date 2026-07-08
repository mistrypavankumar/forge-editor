import type { editor } from 'monaco-editor';

let active: editor.IStandaloneCodeEditor | null = null;
// Every mounted editor, in mount order. Commands that drive Monaco actions (Find, Go to
// Line, Format, next/prev change…) look up the "active" editor here. Tracking the full set
// of live editors lets getActiveEditor() fall back to a real editor when nothing has been
// explicitly focused yet — or when the previously-active one was disposed — so those
// commands work without first clicking into the editor text. Previously `active` was a lone
// ref that stayed null until a focus event and was cleared on dispose, so opening a file and
// immediately pressing Cmd+F (without clicking in) silently no-oped until a window reload.
const live = new Set<editor.IStandaloneCodeEditor>();

/** CodeEditor registers each instance on mount so it can serve as a fallback active editor. */
export function registerEditor(instance: editor.IStandaloneCodeEditor): void {
  live.add(instance);
}

/** CodeEditor unregisters on dispose; clears `active` if it pointed at this instance. */
export function unregisterEditor(instance: editor.IStandaloneCodeEditor): void {
  live.delete(instance);
  if (active === instance) active = null;
}

/** Mark the editor the user is currently interacting with (called on mount + focus). */
export function setActiveEditor(instance: editor.IStandaloneCodeEditor | null): void {
  active = instance;
}

export function getActiveEditor(): editor.IStandaloneCodeEditor | null {
  // Prefer the explicitly-focused editor, but only if it's still alive.
  if (active && live.has(active)) return active;
  // Otherwise fall back to the most-recently-mounted live editor (Set preserves insertion
  // order), so keyboard-driven commands target a real editor even before any focus event.
  let last: editor.IStandaloneCodeEditor | null = null;
  for (const e of live) last = e;
  return last;
}
