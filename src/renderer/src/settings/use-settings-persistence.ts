import { useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/theme-store';
import { useLayoutStore, DEFAULT_SEARCH_EXCLUDE } from '../stores/layout-store';
import { useRecentsStore } from '../stores/recents-store';
import { useTasksStore, type TaskId } from '../stores/tasks-store';
import { useEditorStore } from '../stores/editor-store';
import { useFormatterStore } from '../stores/formatter-store';
import { useKeybindingsStore } from '../stores/keybindings-store';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { useGitUserStore } from '../stores/git-user-store';
import { clearFileCache } from '../lib/quickopen-cache';
import type { FormatterId } from '../lib/detect-formatters';

export function useSettingsPersistence(): void {
  const hydrated = useRef(false);
  const themeId = useThemeStore((s) => s.currentId);
  const editorScheme = useThemeStore((s) => s.editorScheme);
  const glass = useThemeStore((s) => s.glass);
  const glassOpacity = useThemeStore((s) => s.glassOpacity);
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const sidebarSide = useLayoutStore((s) => s.sidebarSide);
  const recents = useRecentsStore((s) => s.recents);
  const taskCommands = useTasksStore((s) => s.overrides);
  const customTasks = useTasksStore((s) => s.custom);
  const autoSave = useEditorStore((s) => s.autoSave);
  const fontSize = useEditorStore((s) => s.fontSize);
  const formatterId = useFormatterStore((s) => s.selectedId);
  const formatOnSave = useFormatterStore((s) => s.formatOnSave);
  const autoFormat = useFormatterStore((s) => s.autoFormat);
  const keybindings = useKeybindingsStore((s) => s.overrides);
  const autoCheckProblems = useDiagnosticsStore((s) => s.autoRun);
  const gitUsers = useGitUserStore((s) => s.users);
  const searchExclude = useLayoutStore((s) => s.searchExclude);
  const searchExcludeSeeded = useLayoutStore((s) => s.searchExcludeSeeded);
  const scmGraphHeight = useLayoutStore((s) => s.scmGraphHeight);

  // Hydrate once on mount.
  useEffect(() => {
    void window.forge.loadSettings().then((res) => {
      if (res.ok) {
        if (res.data.themeId) useThemeStore.getState().setTheme(res.data.themeId);
        if (res.data.editorScheme) useThemeStore.getState().setEditorScheme(res.data.editorScheme);
        if (typeof res.data.glass === 'boolean') useThemeStore.getState().setGlass(res.data.glass);
        if (typeof res.data.glassOpacity === 'number') {
          useThemeStore.getState().setGlassOpacity(res.data.glassOpacity);
        }
        if (typeof res.data.sidebarVisible === 'boolean') {
          useLayoutStore.getState().setPanelVisible('sidebar', res.data.sidebarVisible);
        }
        if (res.data.sidebarSide) useLayoutStore.getState().setSidebarSide(res.data.sidebarSide);
        if (res.data.recents) useRecentsStore.getState().setRecents(res.data.recents);
        if (res.data.taskCommands) {
          useTasksStore.getState().setOverrides(res.data.taskCommands as Partial<Record<TaskId, string>>);
        }
        if (res.data.customTasks) useTasksStore.getState().setCustom(res.data.customTasks);
        if (typeof res.data.autoSave === 'boolean') {
          useEditorStore.getState().setAutoSave(res.data.autoSave);
        }
        if (typeof res.data.fontSize === 'number') {
          useEditorStore.getState().setFontSize(res.data.fontSize);
        }
        if (res.data.formatterId) {
          // Detection (setAvailable) reconciles this later if the formatter isn't in the project.
          useFormatterStore.getState().setSelected(res.data.formatterId as FormatterId);
        }
        if (typeof res.data.formatOnSave === 'boolean') {
          useFormatterStore.getState().setFormatOnSave(res.data.formatOnSave);
        }
        if (typeof res.data.autoFormat === 'boolean') {
          useFormatterStore.getState().setAutoFormat(res.data.autoFormat);
        }
        if (res.data.keybindings) {
          useKeybindingsStore.getState().setOverrides(res.data.keybindings);
        }
        if (typeof res.data.autoCheckProblems === 'boolean') {
          useDiagnosticsStore.getState().setAutoRun(res.data.autoCheckProblems);
        }
        if (res.data.gitUsers) useGitUserStore.getState().setUsers(res.data.gitUsers);
        if (typeof res.data.scmGraphHeight === 'number') {
          useLayoutStore.getState().setScmGraphHeight(res.data.scmGraphHeight);
        }
        // Seed built-in default excludes once: union them with any stored list, then never re-add.
        if (res.data.searchExcludeSeeded) {
          useLayoutStore.getState().setSearchExclude(res.data.searchExclude ?? []);
          useLayoutStore.getState().setSearchExcludeSeeded(true);
        } else {
          const stored = res.data.searchExclude ?? [];
          const merged = [...stored, ...DEFAULT_SEARCH_EXCLUDE.filter((f) => !stored.includes(f))];
          useLayoutStore.getState().setSearchExclude(merged);
          useLayoutStore.getState().setSearchExcludeSeeded(true);
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
      editorScheme,
      glass,
      glassOpacity,
      sidebarVisible,
      sidebarSide,
      recents,
      taskCommands,
      customTasks,
      autoSave,
      fontSize,
      formatterId,
      formatOnSave,
      autoFormat,
      keybindings,
      autoCheckProblems,
      gitUsers,
      searchExclude,
      searchExcludeSeeded,
      scmGraphHeight,
    });
  }, [themeId, editorScheme, glass, glassOpacity, sidebarVisible, sidebarSide, recents, taskCommands, customTasks, autoSave, fontSize, formatterId, formatOnSave, autoFormat, keybindings, autoCheckProblems, gitUsers, searchExclude, searchExcludeSeeded, scmGraphHeight]);

  // Drop the quick-open cache when excludes change so the next search re-lists with them.
  useEffect(() => {
    if (!hydrated.current) return;
    clearFileCache();
  }, [searchExclude]);
}
