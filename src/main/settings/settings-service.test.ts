// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSettings, writeSettings } from './settings-service';

describe('settings-service', () => {
  it('returns empty settings when the file is missing', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'forge-')), 'settings.json');
    expect(await readSettings(file)).toEqual({});
  });

  it('writes then reads settings, creating the directory', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'forge-')), 'nested', 'settings.json');
    await writeSettings(file, { themeId: 'forge-light', sidebarVisible: false });
    expect(await readSettings(file)).toEqual({ themeId: 'forge-light', sidebarVisible: false });
  });
});
