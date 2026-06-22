import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerCoreCommands } from './commands/core-commands';
import { registerPaletteCommands } from './commands/palette-commands';
import { registerThemeCommands } from './commands/theme-commands';
// Inter is the UI font for all chrome (everything except the code editor, which uses mono).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/fira-code/400.css';
import '@xterm/xterm/css/xterm.css';
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
