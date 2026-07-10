import { useEditorStore } from '../stores/editor-store';
import { isBinaryContent } from '../lib/is-binary';
import { isImagePath } from '../lib/is-image';
import { EditorTabs } from './EditorTabs';
import { Breadcrumbs } from './Breadcrumbs';
import { CodeEditor } from './CodeEditor';
import { BinaryFileView } from './BinaryFileView';
import { ImageView } from './ImageView';
import { MarkdownPreview } from './MarkdownPreview';
import { DiffView } from './DiffView';
import { ApiExplorerEditor } from '../api-explorer';
import { CodebaseMapView } from './CodebaseMapView';
import { BrowserView } from '../browser';
import { cn } from '../lib/cn';

/** One editor column: its tab strip, breadcrumbs, code editor, and preview/diff overlays. */
export function EditorGroupView({ groupId }: { groupId: string }): React.JSX.Element {
  const tabs = useEditorStore((s) => s.tabs);
  const group = useEditorStore((s) => s.groups.find((g) => g.id === groupId) ?? s.groups[0]);
  const activePath = group?.activePath ?? null;
  const mdPreview = useEditorStore((s) => s.mdPreview);
  const activeTab = tabs.find((t) => t.path === activePath);
  // Whether this group has a browser tab open at all (regardless of which tab is active). The
  // webview is kept mounted whenever one exists — see the persistent-mount note below.
  const hasBrowserTab = !!group && tabs.some((t) => t.kind === 'browser' && group.paths.includes(t.path));
  const showApiExplorer = !!activeTab && activeTab.kind === 'api-explorer';
  const showCodemap = !!activeTab && activeTab.kind === 'codemap';
  const showBrowser = !!activeTab && activeTab.kind === 'browser';
  const showDiff =
    !!activeTab && !showApiExplorer && !showCodemap && !showBrowser && activeTab.original !== undefined;
  // Images render in the image viewer (from raw bytes), never the text editor or binary guard.
  const showImage = !!activeTab && !showDiff && isImagePath(activeTab.name);
  // Don't feed undecodable bytes to Monaco — diffs are always git text, so only guard plain tabs.
  const showBinary = !!activeTab && !showDiff && !showImage && isBinaryContent(activeTab.content);
  const showPreview =
    mdPreview && !showDiff && !showImage && !showBinary && !!activeTab && /\.mdx?$/i.test(activeTab.name);

  return (
    <div data-testid="editor-region" className="flex h-full flex-col bg-bg">
      <EditorTabs groupId={groupId} />
      {/* Keep the browser mounted while its tab exists — switching to another tab only hides it, so
          the embedded webview keeps its page and never reloads on the way back. */}
      {hasBrowserTab ? (
        <div className={cn('min-h-0 flex-1', !showBrowser && 'hidden')}>
          <BrowserView />
        </div>
      ) : null}
      {showBrowser ? null : showApiExplorer ? (
        <div className="min-h-0 flex-1">
          <ApiExplorerEditor />
        </div>
      ) : showCodemap ? (
        <div className="min-h-0 flex-1">
          <CodebaseMapView />
        </div>
      ) : (
        <>
          <Breadcrumbs groupId={groupId} />
          <div className="relative min-h-0 flex-1">
            {showImage && activeTab ? (
              <ImageView path={activeTab.filePath ?? activeTab.path} name={activeTab.name} />
            ) : showBinary && activeTab ? (
              <BinaryFileView name={activeTab.name} />
            ) : (
              <CodeEditor groupId={groupId} />
            )}
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
        </>
      )}
    </div>
  );
}
