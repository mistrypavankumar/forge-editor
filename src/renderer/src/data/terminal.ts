export type TerminalLineKind = 'cmd' | 'out' | 'ok' | 'err' | 'muted';

export interface TerminalLine {
  id: string;
  kind: TerminalLineKind;
  text: string;
}

export const terminalHistory: TerminalLine[] = [
  { id: 'l1', kind: 'cmd', text: 'npm run dev' },
  { id: 'l2', kind: 'muted', text: '> forge@0.0.0 dev' },
  { id: 'l3', kind: 'ok', text: '  VITE ready in 412 ms' },
  { id: 'l4', kind: 'out', text: '  ➜  Local:   http://localhost:5173/' },
  { id: 'l5', kind: 'cmd', text: 'npm run test' },
  { id: 'l6', kind: 'err', text: '  ✗ UserService › create persists new user' },
  { id: 'l7', kind: 'muted', text: '  Tests: 4 passed, 1 failed, 1 skipped' },
  { id: 'l8', kind: 'cmd', text: 'git status' },
  { id: 'l9', kind: 'out', text: '  On branch feat/user-service' },
  { id: 'l10', kind: 'muted', text: '  4 files changed' },
];

export interface QuickTask {
  id: string;
  label: string;
  command: string;
}

export const quickTasks: QuickTask[] = [
  { id: 'dev', label: 'Dev', command: 'npm run dev' },
  { id: 'test', label: 'Test', command: 'npm run test' },
  { id: 'build', label: 'Build', command: 'npm run build' },
  { id: 'lint', label: 'Lint', command: 'npm run lint' },
];

export const outputLines: TerminalLine[] = [
  { id: 'o1', kind: 'muted', text: '[tsserver] Project loaded: forge' },
  { id: 'o2', kind: 'ok', text: '[tsserver] 0 errors after incremental check' },
  { id: 'o3', kind: 'muted', text: '[vite] hmr update /src/services/user-service.ts' },
  { id: 'o4', kind: 'muted', text: '[eslint] 2 warnings, 0 errors' },
];
