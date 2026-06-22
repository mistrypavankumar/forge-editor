import { useWorkspaceStore } from '../stores/workspace-store';
import { FORMATTERS, type FormatterId } from './detect-formatters';

/**
 * Format a buffer's text with a formatter in stdin mode and return the result.
 * Returns null when there's no workspace, the formatter fails, or the output is empty
 * (e.g. a syntax error) — callers should leave the buffer untouched in that case.
 */
export async function formatTextWith(
  formatterId: FormatterId,
  filePath: string,
  input: string,
): Promise<string | null> {
  const rootPath = useWorkspaceStore.getState().rootPath;
  if (!rootPath) return null;
  const def = FORMATTERS[formatterId];
  const res = await window.forge.formatText(rootPath, def.tool, def.stdin.args(filePath), input);
  if (!res.ok) return null;
  const formatted = def.stdin.parse(res.data.stdout, input);
  // Guard against tools that print nothing on parse errors — never blank the document.
  if (!formatted && input) return null;
  return formatted;
}
