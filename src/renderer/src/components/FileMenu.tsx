import { useState } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { commandRegistry } from '../commands/command-registry';
import { ContextMenu } from './ui/ContextMenu';

export function FileMenu(): React.JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const autoSave = useEditorStore((s) => s.autoSave);
  const setAutoSave = useEditorStore((s) => s.setAutoSave);

  const run = (id: string): void => void commandRegistry.run(id);

  return (
    <>
      <button
        type="button"
        className="rounded-md px-2 py-1 text-[13px] text-muted hover:bg-surface-3 hover:text-fg"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 4 });
        }}
      >
        File
      </button>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'New Text File', onSelect: () => run('file.newTextFile') },
            { label: 'New File…', dividerAfter: true, onSelect: () => run('file.newFile') },
            { label: 'Open File…', onSelect: () => run('file.openFile') },
            { label: 'Open Folder…', dividerAfter: true, onSelect: () => run('file.openFolder') },
            { label: 'Save', dividerAfter: true, onSelect: () => run('file.save') },
            { label: 'Auto Save', checked: autoSave, onSelect: () => setAutoSave(!autoSave) },
            { label: 'Revert File', dividerAfter: true, onSelect: () => run('file.revert') },
            { label: 'Close Editor', onSelect: () => run('file.closeEditor') },
            { label: 'Close Folder', dividerAfter: true, onSelect: () => run('file.closeFolder') },
            { label: 'Close Window', onSelect: () => window.close() },
          ]}
        />
      ) : null}
    </>
  );
}
