import type { editor } from 'monaco-editor';
import { useEditorStore } from '../stores/editor-store';

let active: editor.IStandaloneCodeEditor | null = null;
// Every mounted editor, in mount order. Commands that drive Monaco actions (Find, Go to
// Line, Format, next/prev change…) look up the "active" editor here. Tracking the full set
// of live editors lets getActiveEditor() fall back to a real editor when nothing has been
// explicitly focused yet — or when the previously-active one was disposed — so those
// commands work without first clicking into the editor text. Previously `active` was a lone
// ref that stayed null until a focus event and was cleared on dispose, so opening a file and
// immediately pressing Cmd+F (without clicking in) silently no-oped until a window reload.
const live = new Set<editor.IStandaloneCodeEditor>();
// The CodeEditor mounted in each editor group. The active group (which also changes on a tab
// click, not just on focusing editor text) decides the target, so in split mode a command
// never lands on the other pane just because that was the last one focused.
const byGroup = new Map<string, editor.IStandaloneCodeEditor>();
// Editors drawn over a group's CodeEditor (the read-only diff view). The CodeEditor stays
// mounted underneath, so without this, Find opened its widget in the hidden editor.
const overlays = new Map<string, editor.IStandaloneCodeEditor>();

/** CodeEditor registers each instance on mount so it can serve as a fallback active editor. */
export function registerEditor(instance: editor.IStandaloneCodeEditor, groupId: string): void {
  live.add(instance);
  byGroup.set(groupId, instance);
}

/** CodeEditor unregisters on dispose; clears `active` if it pointed at this instance. */
export function unregisterEditor(instance: editor.IStandaloneCodeEditor): void {
  live.delete(instance);
  if (active === instance) active = null;
  for (const [gid, e] of byGroup) if (e === instance) byGroup.delete(gid);
}

/** Mark the editor the user is currently interacting with (called on mount + focus). */
export function setActiveEditor(instance: editor.IStandaloneCodeEditor | null): void {
  active = instance;
}

/** Register (or clear, with null) the editor currently covering a group's CodeEditor. */
export function setOverlayEditor(groupId: string, instance: editor.IStandaloneCodeEditor | null): void {
  if (instance) overlays.set(groupId, instance);
  else overlays.delete(groupId);
}

export function getActiveEditor(): editor.IStandaloneCodeEditor | null {
  // Prefer the CodeEditor of the active group.
  const grouped = byGroup.get(useEditorStore.getState().activeGroupId);
  if (grouped && live.has(grouped)) return grouped;
  // Then the explicitly-focused editor, but only if it's still alive.
  if (active && live.has(active)) return active;
  // Otherwise fall back to the most-recently-mounted live editor (Set preserves insertion
  // order), so keyboard-driven commands target a real editor even before any focus event.
  let last: editor.IStandaloneCodeEditor | null = null;
  for (const e of live) last = e;
  return last;
}

/**
 * The editor the user actually sees in the active group: an overlay (diff view) when one is
 * shown, else the active CodeEditor. Used by view-only actions like Find; editing commands
 * keep using getActiveEditor() so they never act on the diff's throwaway models.
 */
export function getVisibleEditor(): editor.IStandaloneCodeEditor | null {
  return overlays.get(useEditorStore.getState().activeGroupId) ?? getActiveEditor();
}
