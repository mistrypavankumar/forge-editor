import { beforeEach, describe, expect, it } from 'vitest';
import { useLayoutStore } from './layout-store';

describe('layout-store', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      sidebarVisible: true,
      rightVisible: false,
      bottomVisible: true,
      activity: 'explorer',
      rightTab: 'assistant',
      bottomTab: 'problems',
    });
  });

  it('defaults with sidebar + bottom visible, assistant hidden, explorer active', () => {
    const s = useLayoutStore.getState();
    expect(s.sidebarVisible).toBe(true);
    expect(s.rightVisible).toBe(false);
    expect(s.bottomVisible).toBe(true);
    expect(s.activity).toBe('explorer');
  });

  it('togglePanel flips the targeted panel only', () => {
    useLayoutStore.getState().togglePanel('bottom');
    expect(useLayoutStore.getState().bottomVisible).toBe(false);
    expect(useLayoutStore.getState().sidebarVisible).toBe(true);
    expect(useLayoutStore.getState().rightVisible).toBe(true);
  });

  it('setPanelVisible sets an explicit value', () => {
    useLayoutStore.getState().setPanelVisible('sidebar', false);
    expect(useLayoutStore.getState().sidebarVisible).toBe(false);
  });

  it('setActivity and tab setters update selection', () => {
    useLayoutStore.getState().setActivity('git');
    useLayoutStore.getState().setRightTab('changes');
    useLayoutStore.getState().setBottomTab('terminal');
    const s = useLayoutStore.getState();
    expect(s.activity).toBe('git');
    expect(s.rightTab).toBe('changes');
    expect(s.bottomTab).toBe('terminal');
  });
});
