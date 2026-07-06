import type { AgentPlan } from './types';

/**
 * Parsing for the agent brain's replies. Models are asked to return a single fenced ```json block,
 * but in practice they sometimes add stray prose, omit the fence, or wrap the object differently.
 * These helpers extract and normalize the JSON defensively so a slightly-off reply still works.
 */

/** A single proposed patch as it comes back from the model (before we resolve on-disk state). */
export interface RawPatch {
  path: string;
  content: string;
  description: string;
}

/**
 * Pull the first JSON object out of a model reply. Prefers a fenced ```json block; otherwise falls
 * back to the outermost `{ … }` span. Throws when no object-looking span is present.
 */
export function extractJson(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fence ? fence[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('The model did not return a JSON object.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim());
}

/** Parse + normalize a planning reply into an {@link AgentPlan}. Throws on unusable input. */
export function parsePlan(text: string): AgentPlan {
  const obj = extractJson(text) as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const steps = asStringArray(obj.steps);
  const commands = asStringArray(obj.commands);
  const filesToEdit = Array.isArray(obj.filesToEdit)
    ? obj.filesToEdit
        .map((f) => {
          const rec = (f ?? {}) as Record<string, unknown>;
          const path = typeof rec.path === 'string' ? rec.path.trim() : '';
          const reason = typeof rec.reason === 'string' ? rec.reason.trim() : '';
          return { path, reason };
        })
        .filter((f) => f.path.length > 0)
    : [];
  if (!summary && steps.length === 0 && filesToEdit.length === 0) {
    throw new Error('The plan reply had no summary, steps, or files.');
  }
  return { summary, steps, filesToEdit, commands };
}

/** Parse + normalize an edit reply into a list of {@link RawPatch}. Throws when none are present. */
export function parsePatches(text: string): RawPatch[] {
  const obj = extractJson(text) as Record<string, unknown>;
  const list = Array.isArray(obj.patches) ? obj.patches : [];
  const patches: RawPatch[] = [];
  for (const item of list) {
    const rec = (item ?? {}) as Record<string, unknown>;
    const path = typeof rec.path === 'string' ? rec.path.trim() : '';
    const content = typeof rec.content === 'string' ? rec.content : '';
    const description = typeof rec.description === 'string' ? rec.description.trim() : '';
    if (path.length > 0) patches.push({ path, content, description });
  }
  if (patches.length === 0) throw new Error('The edit reply contained no file patches.');
  return patches;
}

/**
 * Extract compiler/linter-style `file:line[:col]: message` locations from command output, for the
 * check result cards. Recognizes the common TypeScript, ESLint, and generic `path:line:col` forms.
 * Returns a de-duplicated, capped list.
 */
export function extractErrorLines(output: string): string[] {
  const lines = output.split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  // tsc:   src/foo.ts(12,5): error TS2345: ...
  // eslint/generic: src/foo.ts:12:5: 'x' is not defined
  const patterns = [
    /^\s*(.+?\.[a-zA-Z]+)\((\d+),(\d+)\):\s*(.+)$/,
    /^\s*(.+?\.[a-zA-Z]+):(\d+):(\d+):?\s*(.+)$/,
    /\b(error|Error)\b.*$/,
  ];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    for (const re of patterns) {
      const m = re.exec(line);
      if (m) {
        const norm = line.trim();
        if (!seen.has(norm)) {
          seen.add(norm);
          out.push(norm);
        }
        break;
      }
    }
    if (out.length >= 50) break;
  }
  return out;
}
