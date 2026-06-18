import { beforeEach, describe, expect, it } from 'vitest';
import { useKeybindingsStore } from './keybindings-store';
import { mergeKeybindings, defaultKeybindings } from '../keybindings/keybinding-service';

describe('keybindings-store', () => {
  beforeEach(() => useKeybindingsStore.setState({ overrides: {} }));

  it('sets and removes overrides', () => {
    useKeybindingsStore.getState().setOverride('mod+e', 'file.save');
    expect(useKeybindingsStore.getState().overrides['mod+e']).toBe('file.save');
    useKeybindingsStore.getState().removeOverride('mod+e');
    expect(useKeybindingsStore.getState().overrides['mod+e']).toBeUndefined();
  });

  it('overrides win when merged over defaults', () => {
    useKeybindingsStore.getState().setOverride('mod+s', 'file.saveAll');
    const merged = mergeKeybindings(defaultKeybindings, useKeybindingsStore.getState().overrides);
    expect(merged['mod+s']).toBe('file.saveAll');
  });
});
