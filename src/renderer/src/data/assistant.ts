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

export const cannedReplies: Record<QuickAction['icon'], string> = {
  explain:
    '`UserService` wraps `db.users` and validates every row with a Zod schema before returning it. Public surface: `findById`, `create`, `list`.',
  bug: 'Likely defect on line 23: `create()` passes `input` to `db.users.insert`, but the schema now requires `createdAt`. Add it before inserting.',
  refactor:
    'Safe refactor: extract a `toUser(row)` helper for the repeated `userSchema.parse(...)`. Impact preview shows 3 call sites — see the Context tab.',
  test: 'I can scaffold 5 tests covering findById (hit/miss), create (dup/success), and list (limit). 4 already exist in user-service.test.ts.',
  perf: '`list()` parses every row individually. For large pages, validate once with `z.array(userSchema)` to cut per-row overhead.',
};

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
