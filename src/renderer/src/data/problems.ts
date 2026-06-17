import { SAMPLE_FILE_PATH } from './sample-code';

export type Severity = 'error' | 'warning' | 'info';

export interface Problem {
  id: string;
  severity: Severity;
  message: string;
  file: string;
  fileLabel: string;
  line: number;
  col: number;
  code: string;
}

export const problems: Problem[] = [
  {
    id: 'p1',
    severity: 'error',
    message: "Argument of type 'NewUser' is not assignable to parameter; property 'createdAt' is missing.",
    file: SAMPLE_FILE_PATH,
    fileLabel: 'user-service.ts',
    line: 23,
    col: 32,
    code: 'ts(2345)',
  },
  {
    id: 'p2',
    severity: 'warning',
    message: "'limit' is declared but its default may shadow a wider range — consider validating bounds.",
    file: SAMPLE_FILE_PATH,
    fileLabel: 'user-service.ts',
    line: 28,
    col: 18,
    code: 'ts(6133)',
  },
  {
    id: 'p3',
    severity: 'warning',
    message: 'Unexpected console statement.',
    file: '/forge/src/app/page.tsx',
    fileLabel: 'page.tsx',
    line: 14,
    col: 5,
    code: 'no-console',
  },
  {
    id: 'p4',
    severity: 'info',
    message: 'Prefer `const` assertion for the returned literal.',
    file: '/forge/src/hooks/use-session.ts',
    fileLabel: 'use-session.ts',
    line: 31,
    col: 10,
    code: 'ts(7053)',
  },
];

export function problemsForFile(path: string | null): Problem[] {
  if (!path) return [];
  return problems.filter((p) => p.file === path);
}

export function problemCounts(): { errors: number; warnings: number; infos: number } {
  return {
    errors: problems.filter((p) => p.severity === 'error').length,
    warnings: problems.filter((p) => p.severity === 'warning').length,
    infos: problems.filter((p) => p.severity === 'info').length,
  };
}
