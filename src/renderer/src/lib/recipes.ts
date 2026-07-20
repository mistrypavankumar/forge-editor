import type { Recipe } from '@shared/ipc-contract';

/**
 * Writing-assistant persona for the Recipes prompt-builder. Sent as `systemOverride` on the
 * assistant stream so recipe output is prose the user can drop straight into an email / doc,
 * rather than the coding-assistant's explain-and-cite answers.
 */
export const RECIPE_SYSTEM_PROMPT = [
  'You are a writing assistant built into the Forge editor.',
  'Transform the user-provided text exactly as instructed.',
  'Output ONLY the resulting text — no preamble, no explanation, no surrounding quotes or code',
  'fences — unless the instruction explicitly asks for a specific structure.',
  'Preserve the original language of the input. Honor any length and tone guidance given.',
].join(' ');

/** A selectable tuning value: the id stored/echoed and the human phrasing sent to the model. */
export interface RecipeOption {
  id: string;
  label: string;
  /** Instruction fragment appended to the prompt (empty = no constraint, e.g. "Match input"). */
  directive: string;
}

export const LENGTH_OPTIONS: RecipeOption[] = [
  { id: 'auto', label: 'Match input', directive: '' },
  { id: 'short', label: 'Short and concise', directive: 'Keep it short and concise.' },
  { id: 'medium', label: 'Medium length', directive: 'Use a medium length.' },
  { id: 'long', label: 'Detailed', directive: 'Be thorough and detailed.' },
];

export const TONE_OPTIONS: RecipeOption[] = [
  { id: 'professional', label: 'Professional', directive: 'Use a professional tone.' },
  { id: 'casual', label: 'Casual', directive: 'Use a casual, relaxed tone.' },
  { id: 'friendly', label: 'Friendly', directive: 'Use a warm, friendly tone.' },
  { id: 'formal', label: 'Formal', directive: 'Use a formal tone.' },
  { id: 'confident', label: 'Confident', directive: 'Use a confident, assertive tone.' },
  { id: 'empathetic', label: 'Empathetic', directive: 'Use an empathetic, understanding tone.' },
];

/** The shipped recipes, mirroring the reference design (Rephrase, Summarize, Reply, Create Email). */
export const BUILTIN_RECIPES: Recipe[] = [
  {
    id: 'builtin:rephrase',
    label: 'Rephrase',
    icon: 'RefreshCw',
    instruction: 'Rephrase the following text so it reads clearly and naturally, preserving its meaning.',
    controls: ['length', 'tone'],
  },
  {
    id: 'builtin:summarize',
    label: 'Summarize',
    icon: 'AlignLeft',
    instruction: 'Summarize the following text, capturing its key points.',
    controls: ['length'],
  },
  {
    id: 'builtin:reply',
    label: 'Reply',
    icon: 'Reply',
    instruction: 'Write a reply to the following message.',
    controls: ['length', 'tone'],
  },
  {
    id: 'builtin:email',
    label: 'Create Email',
    icon: 'Mail',
    instruction:
      'Write a well-structured email based on the following notes or request. Include a suitable subject line.',
    controls: ['length', 'tone'],
  },
  {
    id: 'builtin:grammar',
    label: 'Fix Grammar',
    icon: 'SpellCheck',
    instruction:
      'Correct grammar, spelling, and punctuation in the following text without changing its meaning or tone.',
    controls: [],
  },
];

/** True for recipes that ship in code (can be reset but not deleted like custom ones). */
export const isBuiltinRecipe = (id: string): boolean => id.startsWith('builtin:');

const optionDirective = (options: RecipeOption[], id: string | undefined): string =>
  options.find((o) => o.id === id)?.directive ?? '';

/**
 * Compose the full user prompt from a recipe, the selected tuning values, and the input text.
 * Only controls the recipe declares are applied, so an unused Tone selection never leaks in.
 */
export function composeRecipePrompt(
  recipe: Recipe,
  input: string,
  choices: { length?: string; tone?: string },
): string {
  const directives: string[] = [];
  if (recipe.controls.includes('length')) {
    const d = optionDirective(LENGTH_OPTIONS, choices.length);
    if (d) directives.push(d);
  }
  if (recipe.controls.includes('tone')) {
    const d = optionDirective(TONE_OPTIONS, choices.tone);
    if (d) directives.push(d);
  }
  const guidance = directives.length ? `\n\n${directives.join(' ')}` : '';
  return `${recipe.instruction}${guidance}\n\nText:\n${input.trim()}`;
}
