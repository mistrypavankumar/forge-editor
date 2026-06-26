import { describe, it, expect } from 'vitest';
import {
  BLOCK_START,
  BLOCK_END,
  buildBlock,
  upsertBlock,
  removeBlock,
  hasBlock,
  profilePathForShell,
} from './shell-profile';

const BODY = ['export PATH="$HOME/.local/bin:$PATH"', 'export REACT_EDITOR=forge'];

describe('buildBlock', () => {
  it('wraps body lines in markers', () => {
    expect(buildBlock(BODY)).toBe(
      `${BLOCK_START}\nexport PATH="$HOME/.local/bin:$PATH"\nexport REACT_EDITOR=forge\n${BLOCK_END}`,
    );
  });
});

describe('upsertBlock', () => {
  it('appends a block to content without one, ending in a newline', () => {
    const out = upsertBlock('# my profile\nexport FOO=1\n', BODY);
    expect(out.startsWith('# my profile\nexport FOO=1\n')).toBe(true);
    expect(hasBlock(out)).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('replaces an existing block in place without duplicating it', () => {
    const first = upsertBlock('export FOO=1\n', BODY);
    const second = upsertBlock(first, ['export REACT_EDITOR=forge', 'export EDITOR=forge']);
    expect(second.match(new RegExp(BLOCK_START, 'g'))?.length).toBe(1);
    expect(second).toContain('export EDITOR=forge');
    expect(second).not.toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(second).toContain('export FOO=1');
  });
});

describe('removeBlock', () => {
  it('strips the block and preserves surrounding content', () => {
    const withBlock = upsertBlock('export FOO=1\n', BODY);
    const out = removeBlock(withBlock);
    expect(hasBlock(out)).toBe(false);
    expect(out).toContain('export FOO=1');
  });

  it('is a no-op when there is no block', () => {
    expect(removeBlock('export FOO=1\n')).toBe('export FOO=1\n');
  });
});

describe('profilePathForShell', () => {
  it('maps zsh to ~/.zshrc', () => {
    expect(profilePathForShell('/bin/zsh', '/Users/x')).toBe('/Users/x/.zshrc');
  });
  it('maps bash to ~/.bashrc', () => {
    expect(profilePathForShell('/bin/bash', '/Users/x')).toBe('/Users/x/.bashrc');
  });
  it('falls back to ~/.profile for unknown/undefined shells', () => {
    expect(profilePathForShell(undefined, '/Users/x')).toBe('/Users/x/.profile');
  });
});
