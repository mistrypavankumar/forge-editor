/** Map a file name to a Monaco language id. */
export function languageFor(name: string): string {
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
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    graphql: 'graphql',
    gql: 'graphql',
  };
  return map[ext] ?? 'plaintext';
}
