import { describe, expect, it } from 'vitest';
import {
  commandForKeyEvent,
  defaultKeybindings,
  eventToKeystroke,
  mergeKeybindings,
  resolveCommandId,
} from './keybinding-service';

const ev = (over: Partial<Parameters<typeof eventToKeystroke>[0]>) => ({
  key: 's',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe('keybinding-service', () => {
  it('maps meta to mod on mac', () => {
    expect(eventToKeystroke(ev({ key: 's', metaKey: true }), true)).toBe('mod+s');
  });

  it('maps ctrl to mod off mac', () => {
    expect(eventToKeystroke(ev({ key: 's', ctrlKey: true }), false)).toBe('mod+s');
  });

  it('includes shift and lowercases the key', () => {
    expect(eventToKeystroke(ev({ key: 'P', metaKey: true, shiftKey: true }), true)).toBe(
      'mod+shift+p',
    );
  });

  it('default bindings include save and command palette', () => {
    expect(defaultKeybindings['mod+s']).toBe('file.save');
    expect(defaultKeybindings['mod+shift+p']).toBe('workbench.commandPalette');
  });

  it('overrides win over defaults', () => {
    const merged = mergeKeybindings({ 'mod+s': 'file.save' }, { 'mod+s': 'file.other' });
    expect(merged['mod+s']).toBe('file.other');
  });

  it('resolveCommandId looks up a binding', () => {
    expect(resolveCommandId('mod+s', { 'mod+s': 'file.save' })).toBe('file.save');
    expect(resolveCommandId('mod+x', { 'mod+s': 'file.save' })).toBeUndefined();
  });

  it('commandForKeyEvent resolves Cmd+K to the command palette', () => {
    expect(commandForKeyEvent(ev({ key: 'k', metaKey: true }), true, defaultKeybindings)).toBe(
      'workbench.commandPalette',
    );
  });

  it('commandForKeyEvent ignores keys with no modifier', () => {
    expect(commandForKeyEvent(ev({ key: 'k' }), true, defaultKeybindings)).toBeUndefined();
  });
});
