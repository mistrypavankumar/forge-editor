export type RecentStatus = 'modified' | 'clean' | 'issue';

export interface RecentFile {
  id: string;
  name: string;
  path: string;
  status: RecentStatus;
  when: string;
}

export const recentFiles: RecentFile[] = [
  { id: 'rf1', name: 'user-service.ts', path: 'apps/scm/src/services', status: 'issue', when: '2m ago' },
  { id: 'rf2', name: 'carrier-rate-offering-form.tsx', path: 'apps/scm/components', status: 'modified', when: '14m ago' },
  { id: 'rf3', name: 'page.tsx', path: 'apps/scm/app/carrier-rate-offering', status: 'modified', when: '22m ago' },
  { id: 'rf4', name: 'user.ts', path: 'apps/scm/src/types', status: 'modified', when: '1h ago' },
  { id: 'rf5', name: 'README.md', path: '.', status: 'clean', when: 'yesterday' },
  { id: 'rf6', name: 'pnpm-workspace.yaml', path: '.', status: 'clean', when: 'yesterday' },
];
