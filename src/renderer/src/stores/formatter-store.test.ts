import { describe, it, expect, beforeEach } from 'vitest';
import { useFormatterStore } from './formatter-store';

describe('formatter-store', () => {
  beforeEach(() => {
    useFormatterStore.setState({
      selectedId: 'eslint',
      available: ['eslint'],
      formatOnSave: false,
      autoFormat: false,
      lastError: null,
    });
  });

  it('defaults to eslint with format-on-save off', () => {
    const s = useFormatterStore.getState();
    expect(s.selectedId).toBe('eslint');
    expect(s.formatOnSave).toBe(false);
  });

  it('keeps the selection when it stays available', () => {
    useFormatterStore.getState().setSelected('prettier');
    useFormatterStore.getState().setAvailable(['eslint', 'prettier']);
    expect(useFormatterStore.getState().selectedId).toBe('prettier');
  });

  it('falls back to the first available formatter when the selection disappears', () => {
    useFormatterStore.getState().setSelected('prettier');
    useFormatterStore.getState().setAvailable(['eslint']);
    expect(useFormatterStore.getState().selectedId).toBe('eslint');
  });

  it('toggles format-on-save and auto-format and records errors', () => {
    useFormatterStore.getState().setFormatOnSave(true);
    expect(useFormatterStore.getState().formatOnSave).toBe(true);
    useFormatterStore.getState().setAutoFormat(true);
    expect(useFormatterStore.getState().autoFormat).toBe(true);
    useFormatterStore.getState().setError('boom');
    expect(useFormatterStore.getState().lastError).toBe('boom');
  });
});
