import { commandRegistry } from './command-registry';
import { startAnnotation } from '../lib/annotation-actions';

/** Command for the annotation / screenshot-markup overlay. */
export function registerScreenshotCommands(): void {
  commandRegistry.register({
    id: 'forge.annotate.capture',
    title: 'Annotate & Screenshot',
    category: 'Editor',
    run: () => startAnnotation(),
  });
}
