/** Map a file name to a Monaco language id. */
export function languageFor(name: string): string {
  // Env files are matched by name, not extension: `.env` has no extension, while `.env.local`
  // / `.env.example` / `prod.env` would otherwise be read as `local` / `example` / `env`.
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1).toLowerCase();
  if (base === '.env' || base.startsWith('.env.') || base.endsWith('.env')) return 'dotenv';
  // Makefiles are matched by name (they have no extension): `Makefile`, `GNUmakefile`,
  // `Makefile.local`, plus the `.mk` / `.mak` / `.make` extensions used for includes.
  if (base === 'makefile' || base === 'gnumakefile' || base.startsWith('makefile.')) return 'makefile';

  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    md: 'markdown',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    graphql: 'graphql',
    gql: 'graphql',
    mk: 'makefile',
    mak: 'makefile',
    make: 'makefile',
  };
  return map[ext] ?? 'plaintext';
}
