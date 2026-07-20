import { create } from 'zustand';
import type { Recipe } from '@shared/ipc-contract';
import { BUILTIN_RECIPES } from '../lib/recipes';

/**
 * Recipes for the Recipes prompt-builder. Built-ins live in code and are always present; the
 * user's own recipes are held here and persisted to settings (see use-settings-persistence).
 * `all()` returns built-ins followed by custom ones — the order the panel renders.
 */
interface RecipesState {
  custom: Recipe[];
  /** Built-ins + custom, in list order. */
  all: () => Recipe[];
  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (id: string, patch: Partial<Omit<Recipe, 'id'>>) => void;
  removeRecipe: (id: string) => void;
  /** Replace the custom set wholesale (used when hydrating from settings). */
  setCustom: (recipes: Recipe[]) => void;
}

export const useRecipesStore = create<RecipesState>((set, get) => ({
  custom: [],
  all: () => [...BUILTIN_RECIPES, ...get().custom],
  addRecipe: (recipe) => set((s) => ({ custom: [...s.custom, recipe] })),
  updateRecipe: (id, patch) =>
    set((s) => ({ custom: s.custom.map((r) => (r.id === id ? { ...r, ...patch, id } : r)) })),
  removeRecipe: (id) => set((s) => ({ custom: s.custom.filter((r) => r.id !== id) })),
  setCustom: (recipes) => set({ custom: recipes }),
}));

/** Generate a unique id for a new custom recipe (built-ins use the `builtin:` prefix). */
export const newRecipeId = (): string => `recipe-${Math.random().toString(36).slice(2, 10)}`;
