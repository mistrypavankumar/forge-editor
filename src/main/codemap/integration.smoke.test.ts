import { describe, it, expect } from 'vitest';
import { buildCodeMap } from './codemap-service';

// End-to-end smoke test: analyze THIS repo and assert the pipeline produces a sane graph.
describe('buildCodeMap (integration, this repo)', () => {
  it('scans the workspace and links real dependencies', async () => {
    const map = await buildCodeMap(process.cwd(), '/nonexistent-settings.json', true);
    expect(map.stats.files).toBeGreaterThan(50);
    expect(map.stats.edges).toBeGreaterThan(50);

    // A known file with known imports.
    const appShell = map.nodes.find((n) => n.rel.endsWith('components/AppShell.tsx'));
    expect(appShell).toBeDefined();
    expect(appShell!.dependsOn.some((d) => d.endsWith('stores/layout-store.ts'))).toBe(true);

    // layout-store should be widely used (reverse edge resolved).
    const layout = map.nodes.find((n) => n.rel.endsWith('stores/layout-store.ts'));
    expect(layout!.usedBy.length).toBeGreaterThan(3);

    // Components detected.
    expect(appShell!.kind).toBe('component');
    expect(appShell!.components).toContain('AppShell');
  }, 30_000);
});
