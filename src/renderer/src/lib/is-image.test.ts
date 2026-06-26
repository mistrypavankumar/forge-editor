import { describe, it, expect } from 'vitest';
import { isImagePath, imageMime } from './is-image';

describe('isImagePath', () => {
  it('recognizes raster and vector image extensions, case-insensitively', () => {
    for (const name of ['logo.png', 'photo.JPG', 'anim.gif', 'icon.ico', 'art.svg', 'pic.webp']) {
      expect(isImagePath(name)).toBe(true);
    }
  });

  it('rejects non-image files', () => {
    for (const name of ['index.ts', 'README.md', 'data.json', 'noext', '.gitignore']) {
      expect(isImagePath(name)).toBe(false);
    }
  });
});

describe('imageMime', () => {
  it('maps extensions to MIME types', () => {
    expect(imageMime('a.png')).toBe('image/png');
    expect(imageMime('a.jpeg')).toBe('image/jpeg');
    expect(imageMime('a.svg')).toBe('image/svg+xml');
    expect(imageMime('a.ico')).toBe('image/x-icon');
  });

  it('returns null for non-images', () => {
    expect(imageMime('a.txt')).toBeNull();
  });
});
