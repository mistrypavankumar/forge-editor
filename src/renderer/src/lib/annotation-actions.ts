import { getActiveEditor } from '../editor/active-editor';
import { useAnnotationStore } from '../stores/annotation-store';
import { composite } from './annotation-draw';

/**
 * Capture the active editor pane and open the markup overlay over it. Reads the Monaco
 * container's on-screen rect, has main grab those pixels to a PNG, then freezes it in the store.
 */
export async function startAnnotation(): Promise<void> {
  const editor = getActiveEditor();
  const node = editor?.getContainerDomNode();
  if (!node) return;
  const r = node.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;

  const res = await window.forge.capturePage({
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
  });
  if (!res.ok) return;

  const dataUrl = res.data;
  const img = new Image();
  img.onload = () => {
    useAnnotationStore.getState().begin({
      image: dataUrl,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    });
  };
  img.src = dataUrl;
}

/**
 * Composite the frozen screenshot + annotations to a PNG and put it on the system clipboard.
 * Resolves true on success so the caller can flash a confirmation.
 */
export async function copyAnnotationToClipboard(): Promise<boolean> {
  const { image, shapes, naturalWidth, naturalHeight, rect } = useAnnotationStore.getState();
  if (!image || !rect) return false;

  const dataUrl = await renderToDataUrl(image, shapes, naturalWidth, naturalHeight, rect.width, rect.height);
  if (!dataUrl) return false;
  const res = await window.forge.clipboardWriteImage(dataUrl);
  return res.ok;
}

function renderToDataUrl(
  src: string,
  shapes: ReturnType<typeof useAnnotationStore.getState>['shapes'],
  naturalWidth: number,
  naturalHeight: number,
  displayWidth: number,
  displayHeight: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = composite(img, shapes, naturalWidth, naturalHeight, displayWidth, displayHeight);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
