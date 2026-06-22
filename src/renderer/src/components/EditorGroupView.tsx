import { useEditorStore } from '../stores/editor-store';
import { EditorTabs } from './EditorTabs';
import { Breadcrumbs } from './Breadcrumbs';
import { CodeEditor } from './CodeEditor';
import { MarkdownPreview } from './MarkdownPreview';
import { DiffView } from './DiffView';

/** One editor column: its tab strip, breadcrumbs, code editor, and preview/diff overlays. */
export function EditorGroupView({ groupId }: { groupId: string }): React.JSX.Element {
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore(
    (s) => (s.groups.find((g) => g.id === groupId) ?? s.groups[0])?.activePath ?? null,
  );
  const mdPreview = useEditorStore((s) => s.mdPreview);
  const activeTab = tabs.find((t) => t.path === activePath);
  const showDiff = !!activeTab && activeTab.original !== undefined;
  const showPreview = mdPreview && !showDiff && !!activeTab && /\.mdx?$/i.test(activeTab.name);

  return (
    <div data-testid="editor-region" className="flex h-full flex-col bg-bg">
      <EditorTabs groupId={groupId} />
      <Breadcrumbs groupId={groupId} />
      <div className="relative min-h-0 flex-1">
        <CodeEditor groupId={groupId} />
        {showPreview && activeTab ? <MarkdownPreview content={activeTab.content} /> : null}
        {showDiff && activeTab ? (
          <DiffView
            original={activeTab.original ?? ''}
            modified={activeTab.content}
            // Use the real file path for language detection — the tab name may carry a "@ hash" suffix.
            name={activeTab.filePath ?? activeTab.name}
          />
        ) : null}
      </div>
    </div>
  );
}
