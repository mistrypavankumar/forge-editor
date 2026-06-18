import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTextWith } from './format-text';
import { useWorkspaceStore } from '../stores/workspace-store';

const formatText = vi.fn();

beforeEach(() => {
  formatText.mockReset();
  (window as unknown as { forge: Record<string, unknown> }).forge = { formatText };
  useWorkspaceStore.setState({ rootPath: '/proj' });
});

describe('formatTextWith', () => {
  it('returns prettier formatted stdout', async () => {
    formatText.mockResolvedValue({ ok: true, data: { stdout: 'const x = 1;\n', stderr: '', code: 0 } });
    expect(await formatTextWith('prettier', '/proj/a.ts', 'const x=1;')).toBe('const x = 1;\n');
  });

  it('extracts eslint fixed source from JSON', async () => {
    const stdout = JSON.stringify([{ output: 'const x = 1;\n' }]);
    formatText.mockResolvedValue({ ok: true, data: { stdout, stderr: '', code: 1 } });
    expect(await formatTextWith('eslint', '/proj/a.ts', 'const x=1;')).toBe('const x = 1;\n');
  });

  it('returns null when there is no workspace', async () => {
    useWorkspaceStore.setState({ rootPath: null });
    expect(await formatTextWith('prettier', '/proj/a.ts', 'x')).toBeNull();
    expect(formatText).not.toHaveBeenCalled();
  });

  it('returns null on failure', async () => {
    formatText.mockResolvedValue({ ok: false, error: 'prettier not installed' });
    expect(await formatTextWith('prettier', '/proj/a.ts', 'x')).toBeNull();
  });

  it('never blanks a non-empty buffer when the formatter outputs nothing', async () => {
    formatText.mockResolvedValue({ ok: true, data: { stdout: '', stderr: 'SyntaxError', code: 2 } });
    expect(await formatTextWith('prettier', '/proj/a.ts', 'const x=1;')).toBeNull();
  });
});
