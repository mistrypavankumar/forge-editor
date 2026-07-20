import { describe, expect, it } from 'vitest';
import type { Recipe } from '@shared/ipc-contract';
import { composeRecipePrompt, BUILTIN_RECIPES, isBuiltinRecipe } from './recipes';

const rephrase = BUILTIN_RECIPES.find((r) => r.id === 'builtin:rephrase') as Recipe;
const summarize = BUILTIN_RECIPES.find((r) => r.id === 'builtin:summarize') as Recipe;

describe('composeRecipePrompt', () => {
  it('appends the instruction and the input text', () => {
    const out = composeRecipePrompt(rephrase, '  hello world  ', {});
    expect(out.startsWith(rephrase.instruction)).toBe(true);
    expect(out).toContain('Text:\nhello world');
  });

  it('applies only the controls the recipe declares', () => {
    // summarize declares length only, so a tone choice must not leak into the prompt.
    const out = composeRecipePrompt(summarize, 'text', { length: 'short', tone: 'formal' });
    expect(out).toContain('Keep it short and concise.');
    expect(out).not.toContain('formal');
  });

  it('omits guidance for the "auto"/match-input length (empty directive)', () => {
    const out = composeRecipePrompt(summarize, 'text', { length: 'auto' });
    expect(out).toBe(`${summarize.instruction}\n\nText:\ntext`);
  });

  it('includes both length and tone when the recipe supports them', () => {
    const out = composeRecipePrompt(rephrase, 'text', { length: 'long', tone: 'friendly' });
    expect(out).toContain('Be thorough and detailed.');
    expect(out).toContain('Use a warm, friendly tone.');
  });
});

describe('isBuiltinRecipe', () => {
  it('recognizes shipped recipes by id prefix', () => {
    expect(isBuiltinRecipe('builtin:rephrase')).toBe(true);
    expect(isBuiltinRecipe('recipe-abc123')).toBe(false);
  });
});
