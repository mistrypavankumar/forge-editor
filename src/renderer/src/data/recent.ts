export interface RecentFile {
  id: string;
  name: string;
  dir: string;
}

export const recentFiles: RecentFile[] = [
  { id: 'rf1', name: 'user-service.ts', dir: 'src/services' },
  { id: 'rf2', name: 'page.tsx', dir: 'src/app' },
  { id: 'rf3', name: 'db.ts', dir: 'src/lib' },
];
