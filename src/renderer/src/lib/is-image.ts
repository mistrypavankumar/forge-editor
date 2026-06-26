/** Image file extensions Forge renders in the built-in image viewer, mapped to their MIME type. */
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  icns: 'image/x-icns',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

function ext(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** True when a file name should open in the image viewer rather than the text editor. */
export function isImagePath(name: string): boolean {
  return ext(name) in IMAGE_MIME;
}

/** The MIME type for an image file name, or null if it isn't a recognized image. */
export function imageMime(name: string): string | null {
  return IMAGE_MIME[ext(name)] ?? null;
}
