import { beforeEach, describe, expect, it } from 'vitest';
import { useLayoutStore } from './layout-store';

describe('layout-store', () => {
  beforeEach(() => {
    useLayoutStore.setState({ sidebarVisible: true, panelVisible: false });
  });

  it('defaults to sidebar visible and panel hidden', () => {
    const s = useLayoutStore.getState();
    expect(s.sidebarVisible).toBe(true);
    expect(s.panelVisible).toBe(false);
  });

  it('togglePanel flips the targeted panel only', () => {
    useLayoutStore.getState().togglePanel('panel');
    expect(useLayoutStore.getState().panelVisible).toBe(true);
    expect(useLayoutStore.getState().sidebarVisible).toBe(true);
  });

  it('setPanelVisible sets an explicit value', () => {
    useLayoutStore.getState().setPanelVisible('sidebar', false);
    expect(useLayoutStore.getState().sidebarVisible).toBe(false);
  });
});
