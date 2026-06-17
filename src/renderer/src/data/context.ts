export interface ContextItem {
  id: string;
  label: string;
  meta: string;
}

export interface ContextGroup {
  title: string;
  items: ContextItem[];
}

export const contextGroups: ContextGroup[] = [
  {
    title: 'Related files',
    items: [
      { id: 'r1', label: 'user.ts', meta: 'src/types' },
      { id: 'r2', label: 'db.ts', meta: 'src/lib' },
    ],
  },
  {
    title: 'Used by',
    items: [
      { id: 'u1', label: 'auth-controller.ts', meta: 'src/app/api' },
      { id: 'u2', label: 'profile-page.tsx', meta: 'src/app/profile' },
    ],
  },
  {
    title: 'Depends on',
    items: [
      { id: 'd1', label: 'zod', meta: 'package' },
      { id: 'd2', label: 'db.users', meta: 'data layer' },
    ],
  },
  {
    title: 'Related tests',
    items: [{ id: 't1', label: 'user-service.test.ts', meta: '5 tests · 1 failing' }],
  },
  {
    title: 'API / database references',
    items: [
      { id: 'a1', label: 'users', meta: 'table · 3 queries' },
      { id: 'a2', label: 'POST /api/users', meta: 'route' },
    ],
  },
];

export type ImpactRisk = 'low' | 'medium' | 'high';

export interface ImpactItem {
  id: string;
  path: string;
  risk: ImpactRisk;
  reason: string;
}

/** "Impact before change" — what a refactor of this file would touch. */
export const impactBeforeChange: ImpactItem[] = [
  { id: 'i1', path: 'auth-controller.ts', risk: 'high', reason: 'Calls create() directly' },
  { id: 'i2', path: 'profile-page.tsx', risk: 'medium', reason: 'Renders findById() result' },
  { id: 'i3', path: 'user-service.test.ts', risk: 'low', reason: 'Tests will re-run' },
];
