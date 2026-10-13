import { describe, expect, it } from 'vitest';
import type { editor } from 'monaco-editor';
import { useEditorStore } from '../stores/editor-store';
import {
  getActiveEditor,
  getVisibleEditor,
  registerEditor,
  setActiveEditor,
  setOverlayEditor,
  unregisterEditor,
} from './active-editor';

const fake = (): editor.IStandaloneCodeEditor => ({}) as editor.IStandaloneCodeEditor;

describe('active-editor', () => {
  it('targets the active group, not the last-focused pane', () => {
    const left = fake();
    const right = fake();
    registerEditor(left, 'g-left');
    registerEditor(right, 'g-right');
    setActiveEditor(left); // last focused the left pane…
    useEditorStore.setState({ activeGroupId: 'g-right' }); // …then clicked a tab on the right
    expect(getActiveEditor()).toBe(right);
    unregisterEditor(left);
    unregisterEditor(right);
  });

  it('prefers a diff overlay for Find, but not for editing commands', () => {
    const code = fake();
    const diff = fake();
    registerEditor(code, 'g');
    useEditorStore.setState({ activeGroupId: 'g' });
    setOverlayEditor('g', diff);
    expect(getVisibleEditor()).toBe(diff);
    expect(getActiveEditor()).toBe(code);
    setOverlayEditor('g', null);
    expect(getVisibleEditor()).toBe(code);
    unregisterEditor(code);
  });
});
