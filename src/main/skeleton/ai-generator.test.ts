import { describe, expect, it } from 'vitest';
import { extractJson } from './ai-generator';

/**
 * The AI generation path is network-bound, but the reply parser is pure and is the most likely
 * point of failure (models wrap JSON in prose or fences inconsistently). These cover the shapes we
 * tolerate and the errors we surface to the preview.
 */
describe('extractJson', () => {
  it('parses a ```json fenced block', () => {
    const reply = 'Here you go:\n```json\n{"code": "export function XSkeleton() { return null; }"}\n```\nDone.';
    expect(extractJson(reply).code).toContain('XSkeleton');
  });

  it('parses a bare object with surrounding prose', () => {
    const reply = 'Sure! {"code": "x", "notes": ["guessed the table"]} — hope that helps';
    const out = extractJson(reply);
    expect(out.code).toBe('x');
    expect(out.notes).toEqual(['guessed the table']);
  });

  it('parses an unlabeled ``` fence', () => {
    const reply = '```\n{"code": "y", "importsToAdd": ["Skeleton"]}\n```';
    expect(extractJson(reply).importsToAdd).toEqual(['Skeleton']);
  });

  it('throws when there is no JSON object', () => {
    expect(() => extractJson('I could not generate a skeleton.')).toThrow(/did not contain a JSON/i);
  });

  it('throws on malformed JSON', () => {
    expect(() => extractJson('```json\n{"code": "x",}\n```')).toThrow(/not valid JSON/i);
  });

  it('throws when the code field is missing or empty', () => {
    expect(() => extractJson('{"notes": ["hi"]}')).toThrow(/missing skeleton code/i);
    expect(() => extractJson('{"code": "   "}')).toThrow(/missing skeleton code/i);
  });
});
