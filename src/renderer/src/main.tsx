import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerCoreCommands } from './commands/core-commands';
import { registerPaletteCommands } from './commands/palette-commands';
import { registerThemeCommands } from './commands/theme-commands';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';
import 'allotment/dist/style.css';
import './styles/global.css';

registerCoreCommands();
registerPaletteCommands();
registerThemeCommands();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
