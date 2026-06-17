import { FileExplorer } from './FileExplorer';

/** Secondary, traditional collapsible tree — backed by the real file system. */
export function StructureTreeView(): React.JSX.Element {
  return <FileExplorer />;
}
