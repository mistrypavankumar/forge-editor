/**
 * Minimal INI parser for AWS config/credentials files. These files are flat
 * section/key=value with `#`/`;` comments — no nesting, no duplicate-key merging
 * needed for our use. Returns sections in file order so callers can preserve it.
 */
export type IniSection = Record<string, string>;

export interface IniEntry {
  name: string;
  values: IniSection;
}

export function parseIni(text: string): IniEntry[] {
  const entries: IniEntry[] = [];
  let current: IniEntry | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;

    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      current = { name: header[1].trim(), values: {} };
      entries.push(current);
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1 || !current) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key) current.values[key] = value;
  }

  return entries;
}
