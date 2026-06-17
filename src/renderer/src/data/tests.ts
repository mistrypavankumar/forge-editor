export type TestStatus = 'pass' | 'fail' | 'skip';

export interface TestResult {
  id: string;
  name: string;
  file: string;
  status: TestStatus;
  durationMs: number;
}

export const testResults: TestResult[] = [
  { id: 't1', name: 'UserService › findById returns a parsed user', file: 'user-service.test.ts', status: 'pass', durationMs: 4 },
  { id: 't2', name: 'UserService › findById returns null when missing', file: 'user-service.test.ts', status: 'pass', durationMs: 2 },
  { id: 't3', name: 'UserService › create rejects duplicate email', file: 'user-service.test.ts', status: 'pass', durationMs: 6 },
  { id: 't4', name: 'UserService › create persists new user', file: 'user-service.test.ts', status: 'fail', durationMs: 9 },
  { id: 't5', name: 'UserService › list respects the limit', file: 'user-service.test.ts', status: 'pass', durationMs: 3 },
  { id: 't6', name: 'useSession › hydrates from storage', file: 'use-session.test.ts', status: 'skip', durationMs: 0 },
];

export const testSummary = {
  passed: testResults.filter((t) => t.status === 'pass').length,
  failed: testResults.filter((t) => t.status === 'fail').length,
  skipped: testResults.filter((t) => t.status === 'skip').length,
  durationMs: testResults.reduce((sum, t) => sum + t.durationMs, 0),
};
