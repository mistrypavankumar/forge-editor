import { useEditorStore } from '../stores/editor-store';

export function TitleBar(): React.JSX.Element {
  const activePath = useEditorStore((s) => s.activePath);
  const tabs = useEditorStore((s) => s.tabs);
  const active = tabs.find((t) => t.path === activePath);

  return (
    <div className="titlebar">
      <span className="titlebar-text">{active ? `${active.name} — Forge` : 'Forge'}</span>
    </div>
  );
}
