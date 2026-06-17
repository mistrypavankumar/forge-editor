export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed';

export interface FileChange {
  id: string;
  path: string;
  name: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
}

export const fileChanges: FileChange[] = [
  { id: 'c1', path: 'src/services/user-service.ts', name: 'user-service.ts', status: 'modified', additions: 12, deletions: 3 },
  { id: 'c2', path: 'src/types/user.ts', name: 'user.ts', status: 'modified', additions: 4, deletions: 1 },
  { id: 'c3', path: 'src/services/user-service.test.ts', name: 'user-service.test.ts', status: 'added', additions: 38, deletions: 0 },
  { id: 'c4', path: 'src/lib/legacy-auth.ts', name: 'legacy-auth.ts', status: 'deleted', additions: 0, deletions: 56 },
];

export type DiffKind = 'add' | 'del' | 'ctx';

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

export const sampleDiff: DiffLine[] = [
  { kind: 'ctx', text: '  async create(input: NewUser): Promise<User> {' },
  { kind: 'del', text: '    const created = await db.users.insert(input);' },
  { kind: 'add', text: '    const payload = { ...input, createdAt: new Date() };' },
  { kind: 'add', text: '    const created = await db.users.insert(payload);' },
  { kind: 'ctx', text: '    return userSchema.parse(created);' },
  { kind: 'ctx', text: '  }' },
];

export const commitSuggestion =
  'fix(user-service): set createdAt when persisting new users';

export const changeSummary = {
  files: fileChanges.length,
  additions: fileChanges.reduce((s, c) => s + c.additions, 0),
  deletions: fileChanges.reduce((s, c) => s + c.deletions, 0),
};
