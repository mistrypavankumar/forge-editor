import { describe, expect, it } from 'vitest';
import { isTabOutChar } from './tab-out';

describe('isTabOutChar', () => {
  it('matches closing brackets and quotes', () => {
    for (const ch of [')', ']', '}', '>', '"', "'", '`']) {
      expect(isTabOutChar(ch)).toBe(true);
    }
  });

  it('does not match opening brackets or regular characters', () => {
    for (const ch of ['(', '[', '{', '<', 'a', ' ', ';']) {
      expect(isTabOutChar(ch)).toBe(false);
    }
  });
});
