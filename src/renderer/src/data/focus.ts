export type FocusRole = 'page' | 'component' | 'hook' | 'service' | 'backend' | 'test';
export type FocusStatus = 'modified' | 'issue' | 'clean';

export interface FocusFile {
  id: string;
  name: string;
  path: string;
  role: FocusRole;
  status?: FocusStatus;
}

export interface FocusGroup {
  title: string;
  files: FocusFile[];
}

export const focusTask = 'Carrier Rate Offering';

export const focusGroups: FocusGroup[] = [
  {
    title: 'Related Frontend',
    files: [
      { id: 'f1', name: 'page.tsx', path: 'app/carrier-rate-offering', role: 'page', status: 'modified' },
      { id: 'f2', name: 'carrier-rate-offering-form.tsx', path: 'components', role: 'component', status: 'modified' },
      { id: 'f3', name: 'useCarrierRateOffering.ts', path: 'hooks', role: 'hook' },
    ],
  },
  {
    title: 'Related Services',
    files: [
      { id: 'f4', name: 'carrier-rate-offering.service.ts', path: 'src/services', role: 'service', status: 'modified' },
      { id: 'f5', name: 'permissions.service.ts', path: 'src/services', role: 'service' },
    ],
  },
  {
    title: 'Related Backend',
    files: [
      { id: 'f6', name: 'CarrierRateOffering.java', path: 'server/domain', role: 'backend' },
      { id: 'f7', name: 'PermissionService.java', path: 'server/security', role: 'backend' },
    ],
  },
  {
    title: 'Related Tests',
    files: [
      { id: 'f8', name: 'carrier-rate-offering.test.ts', path: 'src/services', role: 'test', status: 'issue' },
    ],
  },
];
