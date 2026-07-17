import { getActiveEditor } from '../editor/active-editor';
import { useAnnotationStore } from '../stores/annotation-store';
import { composite } from './annotation-draw';

/**
 * The editor renders on a transparent background so the window's vibrancy shows through, which
 * means `capturePage` returns a PNG whose code area is transparent. Resolve the current theme's
 * solid base color (`--bg`) so the frozen capture can be painted over something opaque instead of
 * reading as blank. Falls back to the dark base if the variable is unset.
 */
function resolveOpaqueBackground(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  return v || '#080b12';
}

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

  const background = resolveOpaqueBackground();

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
      background,
    });
  };
  img.src = dataUrl;
}

/**
 * Composite the frozen screenshot + annotations to a PNG and put it on the system clipboard.
 * Resolves true on success so the caller can flash a confirmation.
 */
export async function copyAnnotationToClipboard(): Promise<boolean> {
  const { image, shapes, naturalWidth, naturalHeight, rect, background } = useAnnotationStore.getState();
  if (!image || !rect) return false;

  const dataUrl = await renderToDataUrl(
    image,
    shapes,
    naturalWidth,
    naturalHeight,
    rect.width,
    rect.height,
    background,
  );
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
  background: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = composite(img, shapes, naturalWidth, naturalHeight, displayWidth, displayHeight, background);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
