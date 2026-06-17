import { describe, expect, it } from 'vitest';
import { err, ok, toResult } from './result';

describe('result', () => {
  it('ok wraps data', () => {
    expect(ok(5)).toEqual({ ok: true, data: 5 });
  });

  it('err wraps an error message', () => {
    expect(err('boom')).toEqual({ ok: false, error: 'boom' });
  });

  it('toResult returns ok on success', async () => {
    expect(await toResult(async () => 'hi')).toEqual({ ok: true, data: 'hi' });
  });

  it('toResult returns err on throw', async () => {
    const r = await toResult(async () => {
      throw new Error('nope');
    });
    expect(r).toEqual({ ok: false, error: 'nope' });
  });
});
