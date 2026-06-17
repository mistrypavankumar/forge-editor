import { commandRegistry } from './command-registry';
import { useThemeStore } from '../stores/theme-store';

export function registerThemeCommands(): void {
  commandRegistry.register({
    id: 'theme.dark',
    title: 'Color Theme: Forge Dark',
    category: 'Preferences',
    run: () => useThemeStore.getState().setTheme('forge-dark'),
  });
  commandRegistry.register({
    id: 'theme.light',
    title: 'Color Theme: Forge Light',
    category: 'Preferences',
    run: () => useThemeStore.getState().setTheme('forge-light'),
  });
  commandRegistry.register({
    id: 'theme.toggle',
    title: 'Toggle Light/Dark Theme',
    category: 'Preferences',
    run: () => {
      const { currentId, setTheme } = useThemeStore.getState();
      setTheme(currentId === 'forge-dark' ? 'forge-light' : 'forge-dark');
    },
  });
}
