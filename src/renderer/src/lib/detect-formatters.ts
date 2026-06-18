export type FormatterId = 'eslint' | 'prettier' | 'biome' | 'dprint';

export interface FormatterDef {
  id: FormatterId;
  label: string;
  /** Binary name under node_modules/.bin. */
  tool: string;
  /** argv (excluding the tool) that formats a single file in place. */
  args: (file: string) => string[];
  /** stdin-mode config: argv that reads the buffer from stdin and emits formatted output. */
  stdin: {
    args: (file: string) => string[];
    /** Extract formatted text from stdout (falls back to `input` when unchanged/empty). */
    parse: (stdout: string, input: string) => string;
  };
  /** Root-level config filenames that signal this formatter is configured. */
  configFiles: string[];
}

/** ESLint's JSON output carries the fixed source in `[0].output` (absent when nothing changed). */
function parseEslintJson(stdout: string, input: string): string {
  try {
    const report = JSON.parse(stdout) as Array<{ output?: string }>;
    return report[0]?.output ?? input;
  } catch {
    return input;
  }
}

export const FORMATTERS: Record<FormatterId, FormatterDef> = {
  eslint: {
    id: 'eslint',
    label: 'ESLint',
    tool: 'eslint',
    args: (file) => ['--fix', file],
    stdin: {
      // --fix isn't allowed for piped input; --fix-dry-run + JSON returns the fixed source.
      args: (file) => ['--stdin', '--stdin-filename', file, '--fix-dry-run', '--format', 'json'],
      parse: parseEslintJson,
    },
    configFiles: [
      'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
      '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
      '.eslintrc.yaml', '.eslintrc.yml',
    ],
  },
  prettier: {
    id: 'prettier',
    label: 'Prettier',
    tool: 'prettier',
    args: (file) => ['--write', file],
    stdin: {
      args: (file) => ['--stdin-filepath', file],
      parse: (stdout) => stdout,
    },
    configFiles: [
      '.prettierrc', '.prettierrc.json', '.prettierrc.json5', '.prettierrc.toml',
      '.prettierrc.yaml', '.prettierrc.yml', '.prettierrc.js', '.prettierrc.cjs',
      '.prettierrc.mjs', 'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs',
    ],
  },
  biome: {
    id: 'biome',
    label: 'Biome',
    tool: 'biome',
    args: (file) => ['format', '--write', file],
    stdin: {
      args: (file) => ['format', `--stdin-file-path=${file}`],
      parse: (stdout) => stdout,
    },
    configFiles: ['biome.json', 'biome.jsonc'],
  },
  dprint: {
    id: 'dprint',
    label: 'dprint',
    tool: 'dprint',
    args: (file) => ['fmt', file],
    stdin: {
      args: (file) => ['fmt', '--stdin', file],
      parse: (stdout) => stdout,
    },
    configFiles: ['dprint.json', '.dprint.json', 'dprint.jsonc'],
  },
};

/** Stable display/selection order; ESLint is the built-in default and comes first. */
export const FORMATTER_ORDER: FormatterId[] = ['eslint', 'prettier', 'biome', 'dprint'];

/**
 * Return the formatters available for a project given its root entry names.
 * ESLint is always available (the built-in default); others appear only when a
 * matching config file is present at the repo root.
 */
export function detectFormatters(rootEntryNames: string[]): FormatterId[] {
  const names = new Set(rootEntryNames);
  return FORMATTER_ORDER.filter((id) => {
    if (id === 'eslint') return true;
    return FORMATTERS[id].configFiles.some((f) => names.has(f));
  });
}
