// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseIni } from './ini';

describe('parseIni', () => {
  it('parses sections, keys, and trims whitespace', () => {
    const entries = parseIni(`
[default]
region = us-east-1
output = json

[profile Dev]
sso_session = corp
`);
    expect(entries).toEqual([
      { name: 'default', values: { region: 'us-east-1', output: 'json' } },
      { name: 'profile Dev', values: { sso_session: 'corp' } },
    ]);
  });

  it('ignores comments and blank lines, and keys before any section', () => {
    const entries = parseIni(`# a comment
; another
stray = ignored
[only]
k = v`);
    expect(entries).toEqual([{ name: 'only', values: { k: 'v' } }]);
  });

  it('keeps "=" inside values', () => {
    const entries = parseIni('[x]\nurl = https://a.b/?q=1');
    expect(entries[0].values.url).toBe('https://a.b/?q=1');
  });
});
