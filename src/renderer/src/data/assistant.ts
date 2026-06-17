export interface QuickAction {
  id: string;
  label: string;
  hint: string;
  icon: 'explain' | 'bug' | 'refactor' | 'test' | 'perf';
}

export const quickActions: QuickAction[] = [
  { id: 'explain', label: 'Explain this file', hint: 'Summarize purpose and flow', icon: 'explain' },
  { id: 'bugs', label: 'Find possible bugs', hint: 'Scan for likely defects', icon: 'bug' },
  { id: 'refactor', label: 'Refactor safely', hint: 'Preview impact first', icon: 'refactor' },
  { id: 'tests', label: 'Generate tests', hint: 'Cover the public API', icon: 'test' },
  { id: 'perf', label: 'Improve performance', hint: 'Find hot paths', icon: 'perf' },
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export const seededChat: ChatMessage[] = [
  {
    id: 'm1',
    role: 'assistant',
    text: 'This file defines `UserService` — a thin data layer over `db.users`, validating every row with a Zod schema before it leaves the service.',
  },
  {
    id: 'm2',
    role: 'assistant',
    text: 'Heads up: `create()` inserts `input` directly, but the schema now requires `createdAt`. That mismatch is the failing test and the error on line 23.',
  },
];
