import { describe, it, expect, beforeEach } from 'vitest';
import type { BrowserConsoleEvent } from '@shared/ipc-contract';
import {
  useBrowserDebugStore,
  selectGuestConfig,
  DEFAULT_DEBUG_CONFIG,
  DEFAULT_MAX_EVENTS,
} from './browser-debug-store';

const evt = (id: string): BrowserConsoleEvent => ({
  id,
  level: 'error',
  message: 'e ' + id,
  url: 'http://localhost/x',
  timestamp: 0,
});

describe('browser-debug-store', () => {
  beforeEach(() => {
    useBrowserDebugStore.setState({
      enabled: true,
      config: DEFAULT_DEBUG_CONFIG,
      redactSensitiveHeaders: true,
      maxEvents: DEFAULT_MAX_EVENTS,
      allowExternalCapture: false,
      console: [],
      network: [],
    });
  });

  it('selectGuestConfig disables capture flags when the master switch is off', () => {
    const on = selectGuestConfig({ enabled: true, config: { ...DEFAULT_DEBUG_CONFIG, captureConsole: true, captureNetwork: true } });
    expect(on.captureConsole).toBe(true);
    expect(on.captureNetwork).toBe(true);
    const off = selectGuestConfig({ enabled: false, config: { ...DEFAULT_DEBUG_CONFIG, captureConsole: true, captureNetwork: true } });
    expect(off.captureConsole).toBe(false);
    expect(off.captureNetwork).toBe(false);
    // Non-capture knobs are preserved regardless.
    expect(off.maxBodyKb).toBe(DEFAULT_DEBUG_CONFIG.maxBodyKb);
  });

  it('applySettings hydrates persisted preferences', () => {
    useBrowserDebugStore.getState().applySettings({
      enabled: false,
      captureNetwork: false,
      maxBodyKb: 128,
      redactSensitiveHeaders: false,
      maxEvents: 42,
      allowExternalCapture: true,
    });
    const s = useBrowserDebugStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.config.captureNetwork).toBe(false);
    expect(s.config.captureConsole).toBe(true); // untouched key keeps its default
    expect(s.config.maxBodyKb).toBe(128);
    expect(s.redactSensitiveHeaders).toBe(false);
    expect(s.maxEvents).toBe(42);
    expect(s.allowExternalCapture).toBe(true);
  });

  it('caps retained events at maxEvents (oldest dropped)', () => {
    useBrowserDebugStore.setState({ maxEvents: 3 }); // bypass the setter's min-10 clamp for the test
    for (let i = 0; i < 5; i++) useBrowserDebugStore.getState().addConsole(evt(String(i)));
    const ids = useBrowserDebugStore.getState().console.map((e) => e.id);
    expect(ids).toEqual(['2', '3', '4']);
  });

  it('setMaxEvents enforces a sensible minimum', () => {
    useBrowserDebugStore.getState().setMaxEvents(3);
    expect(useBrowserDebugStore.getState().maxEvents).toBe(10);
  });
});
