import { useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/theme-store';
import { useLayoutStore } from '../stores/layout-store';
import { useRecentsStore } from '../stores/recents-store';
import { useTasksStore, type TaskId } from '../stores/tasks-store';
import { useEditorStore } from '../stores/editor-store';

export function useSettingsPersistence(): void {
  const hydrated = useRef(false);
  const themeId = useThemeStore((s) => s.currentId);
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const sidebarSide = useLayoutStore((s) => s.sidebarSide);
  const recents = useRecentsStore((s) => s.recents);
  const taskCommands = useTasksStore((s) => s.overrides);
  const autoSave = useEditorStore((s) => s.autoSave);

  // Hydrate once on mount.
  useEffect(() => {
    void window.forge.loadSettings().then((res) => {
      if (res.ok) {
        if (res.data.themeId) useThemeStore.getState().setTheme(res.data.themeId);
        if (typeof res.data.sidebarVisible === 'boolean') {
          useLayoutStore.getState().setPanelVisible('sidebar', res.data.sidebarVisible);
        }
        if (res.data.sidebarSide) useLayoutStore.getState().setSidebarSide(res.data.sidebarSide);
        if (res.data.recents) useRecentsStore.getState().setRecents(res.data.recents);
        if (res.data.taskCommands) {
          useTasksStore.getState().setOverrides(res.data.taskCommands as Partial<Record<TaskId, string>>);
        }
        if (typeof res.data.autoSave === 'boolean') {
          useEditorStore.getState().setAutoSave(res.data.autoSave);
        }
      }
      hydrated.current = true;
    });
  }, []);

  // Persist on change (after hydration, to avoid clobbering stored values on first render).
  useEffect(() => {
    if (!hydrated.current) return;
    void window.forge.saveSettings({
      themeId,
      sidebarVisible,
      sidebarSide,
      recents,
      taskCommands,
      autoSave,
    });
  }, [themeId, sidebarVisible, sidebarSide, recents, taskCommands, autoSave]);
}
