/**
 * The module specifier an imported `name` comes from, or null. Scans `import … from '…'`
 * statements (default, named, and namespace imports). Pure for testing.
 */
export function importSpecForName(text: string, name: string): string | null {
  const importRe = /import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(text)) !== null) {
    const clause = m[2];
    const spec = m[3];
    // namespace: * as Foo
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (ns && ns[1] === name) return spec;
    // named: { A, B as C }
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      const parts = named[1].split(',').map((p) => p.trim()).filter(Boolean);
      for (const part of parts) {
        const local = part.split(/\s+as\s+/).pop()?.trim();
        if (local === name) return spec;
      }
    }
    // default: leading identifier before `{` or `,`
    const def = /^\s*(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+[\w$]*/, ''));
    if (def && def[1] === name) return spec;
  }
  return null;
}

/** If `column` (1-based) falls inside a string literal on an import line, return that specifier. */
export function moduleSpecAtColumn(lineText: string, column: number): string | null {
  if (!/^\s*(import|export)\b/.test(lineText) && !/\brequire\s*\(/.test(lineText)) return null;
  const re = /['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineText)) !== null) {
    const start = m.index + 1; // inside the opening quote (0-based)
    const end = start + m[1].length;
    // column is 1-based; the char index under the cursor is column-1
    if (column - 1 >= m.index && column - 1 <= end + 1) return m[1];
  }
  return null;
}

/** Line (1-based) of a top-level declaration of `name` in the same file, or null. Pure. */
export function localDeclarationLine(text: string, name: string): number | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const decl = new RegExp(
    `\\b(?:function|const|let|var|class|interface|type|enum)\\s+${escaped}\\b`,
  );
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (decl.test(lines[i])) return i + 1;
  }
  return null;
}
