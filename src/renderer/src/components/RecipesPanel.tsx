import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import {
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  Square,
  Copy,
  Check,
  CornerDownLeft,
  RefreshCw,
  AlignLeft,
  Reply,
  Mail,
  SpellCheck,
  Wand2,
  FileText,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import type { Recipe, RecipeControl } from '@shared/ipc-contract';
import { useRecipesStore, newRecipeId } from '../stores/recipes-store';
import {
  RECIPE_SYSTEM_PROMPT,
  LENGTH_OPTIONS,
  TONE_OPTIONS,
  composeRecipePrompt,
  isBuiltinRecipe,
} from '../lib/recipes';
import { getActiveEditor } from '../editor/active-editor';
import { useEditorStore } from '../stores/editor-store';
import { cn } from '../lib/cn';

// Lucide icons a recipe may reference by name; unknown/omitted names fall back to Wand2.
const ICONS: Record<string, LucideIcon> = {
  RefreshCw,
  AlignLeft,
  Reply,
  Mail,
  SpellCheck,
  Wand2,
  FileText,
  MessageSquare,
  Sparkles,
};
const iconFor = (name?: string): LucideIcon => (name && ICONS[name]) || Wand2;

/** Read the active editor's current selection text (empty string when nothing is selected). */
function readSelection(): string {
  const ed = getActiveEditor();
  const sel = ed?.getSelection();
  const model = ed?.getModel();
  if (!ed || !sel || !model || sel.isEmpty()) return '';
  return model.getValueInRange(sel);
}

/** Replace the active editor's selection with `text` (inserts at the cursor when nothing selected). */
function applyToEditor(text: string): boolean {
  const ed = getActiveEditor();
  const sel = ed?.getSelection();
  if (!ed || !sel) return false;
  ed.executeEdits('forge.recipes', [{ range: sel, text, forceMoveMarkers: true }]);
  ed.focus();
  return true;
}

const RecipeMarkdown = memo(function RecipeMarkdown({ content }: { content: string }) {
  const html = useMemo(() => marked.parse(content, { async: false }) as string, [content]);
  return <div className="md-body md-chat min-w-0" dangerouslySetInnerHTML={{ __html: html }} />;
});

let seq = 0;
const nextId = (): string => `rx-${++seq}`;

export function RecipesPanel(): React.JSX.Element {
  const recipes = useRecipesStore((s) => s.custom);
  const allRecipes = useMemo(() => useRecipesStore.getState().all(), [recipes]);

  const [selectedId, setSelectedId] = useState(allRecipes[0]?.id ?? '');
  const selected = allRecipes.find((r) => r.id === selectedId) ?? allRecipes[0];

  const [input, setInput] = useState('');
  const [length, setLength] = useState(LENGTH_OPTIONS[1].id); // "Short and concise"
  const [tone, setTone] = useState(TONE_OPTIONS[0].id); // "Professional"
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null);
  const pendingRef = useRef<string | null>(null);

  const activePath = useEditorStore((s) => s.activePath);

  // Prefill the input from the editor selection when the panel first opens (only if still empty).
  useEffect(() => {
    if (!input) {
      const sel = readSelection();
      if (sel) setInput(sel);
    }
    // Run once on mount; the "Use selection" button re-pulls on demand afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stream chunks/done for the in-flight recipe run into the output pane.
  useEffect(() => {
    const offChunk = window.forge.onAssistantChunk((e) => {
      if (e.id !== pendingRef.current) return;
      setOutput((prev) => prev + e.delta);
    });
    const offDone = window.forge.onAssistantDone((e) => {
      if (e.id !== pendingRef.current) return;
      if (e.error) setError(e.error);
      pendingRef.current = null;
      setBusy(false);
    });
    return () => {
      offChunk();
      offDone();
    };
  }, []);

  const run = (): void => {
    if (!selected || busy) return;
    const text = input.trim();
    if (!text) return;
    const reqId = `recipe-${nextId()}`;
    pendingRef.current = reqId;
    setBusy(true);
    setOutput('');
    setError(null);
    setCopied(false);
    const question = composeRecipePrompt(selected, text, { length, tone });
    void window.forge
      .assistantSend({ id: reqId, question, file: null, systemOverride: RECIPE_SYSTEM_PROMPT })
      .then((res) => {
        if (res.ok || reqId !== pendingRef.current) return;
        setError(res.error);
        pendingRef.current = null;
        setBusy(false);
      });
  };

  const stop = (): void => {
    if (pendingRef.current) window.forge.assistantCancel(pendingRef.current);
  };

  const copyOutput = (): void => {
    void navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (editing) {
    return (
      <RecipeEditor
        recipe={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(id) => {
          setSelectedId(id);
          setEditing(null);
        }}
      />
    );
  }

  const usesLength = selected?.controls.includes('length');
  const usesTone = selected?.controls.includes('tone');

  return (
    <div className="flex h-full flex-col">
      {/* Recipe picker */}
      <div className="shrink-0 border-b border-line-soft p-3">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={13} className="text-accent" />
          <span className="text-[11px] font-medium text-faint">Recipes</span>
          <button
            type="button"
            onClick={() => setEditing('new')}
            title="New recipe"
            className="ml-auto flex h-5 w-5 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Plus size={13} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allRecipes.map((r) => {
            const Icon = iconFor(r.icon);
            const active = r.id === selected?.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] transition-colors',
                  active
                    ? 'border-accent/50 bg-accent/15 text-fg'
                    : 'border-line bg-surface-2 text-muted hover:text-fg',
                )}
              >
                <Icon size={12} strokeWidth={1.75} className={active ? 'text-accent' : 'text-faint'} />
                {r.label}
              </button>
            );
          })}
        </div>
        {selected && !isBuiltinRecipe(selected.id) ? (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(selected)}
              className="inline-flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-fg"
            >
              <Pencil size={11} /> Edit
            </button>
            <button
              type="button"
              onClick={() => {
                useRecipesStore.getState().removeRecipe(selected.id);
                setSelectedId(useRecipesStore.getState().all()[0]?.id ?? '');
              }}
              className="inline-flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-danger"
            >
              <Trash2 size={11} /> Delete
            </button>
          </div>
        ) : null}
      </div>

      {/* Instruction / input */}
      <div className="shrink-0 space-y-2 p-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-faint">Instructions</label>
          <button
            type="button"
            onClick={() => {
              const sel = readSelection();
              if (sel) setInput(sel);
            }}
            title="Pull the current editor selection"
            className="inline-flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-accent"
          >
            <RefreshCw size={10} /> Use selection
          </button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            activePath
              ? 'Select text in the editor, or type/paste it here…'
              : 'Type or paste the text to work on…'
          }
          rows={5}
          className="max-h-48 min-h-[64px] w-full resize-y rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[13px] leading-relaxed text-fg outline-none placeholder:text-faint focus:border-accent/50"
        />

        {(usesLength || usesTone) && (
          <div className="flex gap-2">
            {usesLength && (
              <Dropdown label="Length" value={length} onChange={setLength} options={LENGTH_OPTIONS} />
            )}
            {usesTone && (
              <Dropdown label="Tone" value={tone} onChange={setTone} options={TONE_OPTIONS} />
            )}
          </div>
        )}

        <div className="flex justify-end">
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-fg"
            >
              <Square size={11} fill="currentColor" /> Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={run}
              disabled={!input.trim() || !selected}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ArrowUp size={13} /> Generate
            </button>
          )}
        </div>
      </div>

      {/* Output */}
      <div className="min-h-0 flex-1 overflow-auto border-t border-line-soft">
        {error ? (
          <p className="whitespace-pre-wrap break-words p-3 text-[13px] leading-relaxed text-danger">
            ⚠️ {error}
          </p>
        ) : output ? (
          <div className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={copyOutput}
                className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-muted transition-colors hover:text-fg"
              >
                {copied ? <Check size={11} className="text-accent" /> : <Copy size={11} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => applyToEditor(output)}
                title="Replace the editor selection with this result"
                className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-muted transition-colors hover:text-fg"
              >
                <CornerDownLeft size={11} /> Insert in editor
              </button>
              {busy ? <span className="ml-auto animate-pulse text-[11px] text-faint">Writing…</span> : null}
            </div>
            <RecipeMarkdown content={output} />
          </div>
        ) : busy ? (
          <p className="animate-pulse p-3 text-[13px] text-faint">Working…</p>
        ) : (
          <p className="p-3 text-[12px] leading-relaxed text-faint">
            Pick a recipe, add your text, and press Generate. The result appears here — copy it or
            insert it back into the editor.
          </p>
        )}
      </div>
    </div>
  );
}

function Dropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-fg outline-none focus:border-accent/50"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Inline add/edit form for a custom recipe (name, instruction, which tuning controls it shows). */
function RecipeEditor({
  recipe,
  onClose,
  onSaved,
}: {
  recipe: Recipe | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}): React.JSX.Element {
  const [label, setLabel] = useState(recipe?.label ?? '');
  const [instruction, setInstruction] = useState(recipe?.instruction ?? '');
  const [controls, setControls] = useState<RecipeControl[]>(recipe?.controls ?? ['length', 'tone']);

  const toggle = (c: RecipeControl): void =>
    setControls((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const canSave = label.trim().length > 0 && instruction.trim().length > 0;

  const save = (): void => {
    if (!canSave) return;
    const store = useRecipesStore.getState();
    if (recipe) {
      store.updateRecipe(recipe.id, { label: label.trim(), instruction: instruction.trim(), controls });
      onSaved(recipe.id);
    } else {
      const id = newRecipeId();
      store.addRecipe({ id, label: label.trim(), instruction: instruction.trim(), controls, icon: 'Wand2' });
      onSaved(id);
    }
  };

  return (
    <div className="flex h-full flex-col p-3">
      <h3 className="mb-3 text-[12px] font-medium text-fg">
        {recipe ? 'Edit recipe' : 'New recipe'}
      </h3>
      <div className="space-y-3 overflow-auto">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-faint">Name</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Make it friendlier"
            className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent/50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-faint">Instruction</span>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="What should the AI do with the text? e.g. Rewrite this to sound more friendly."
            rows={4}
            className="w-full resize-y rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[13px] leading-relaxed text-fg outline-none focus:border-accent/50"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-faint">Show controls</span>
          <div className="flex gap-2">
            {(['length', 'tone'] as RecipeControl[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className={cn(
                  'flex-1 rounded-lg border px-2 py-1.5 text-[12px] capitalize transition-colors',
                  controls.includes(c)
                    ? 'border-accent/50 bg-accent/15 text-fg'
                    : 'border-line bg-surface-2 text-muted hover:text-fg',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-auto flex justify-end gap-2 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-fg"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}
