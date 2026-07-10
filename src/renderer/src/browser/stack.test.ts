import { describe, it, expect } from 'vitest';
import { parseStackFrames, cleanFrameFile, resolveErrorSource } from './stack';

describe('parseStackFrames', () => {
  it('parses V8 "at fn (loc)" frames', () => {
    const stack = [
      'TypeError: Cannot read properties of undefined',
      '    at UserCard (webpack-internal:///./src/components/UserCard.tsx:42:18)',
      '    at renderWithHooks (webpack-internal:///./node_modules/react-dom/index.js:1:1)',
    ].join('\n');
    const frames = parseStackFrames(stack);
    expect(frames[0]).toEqual({
      functionName: 'UserCard',
      fileName: 'webpack-internal:///./src/components/UserCard.tsx',
      line: 42,
      column: 18,
    });
  });

  it('parses V8 anonymous "at loc" frames', () => {
    const frames = parseStackFrames('    at http://localhost:3000/src/app.tsx:10:5');
    expect(frames[0]).toEqual({
      fileName: 'http://localhost:3000/src/app.tsx',
      line: 10,
      column: 5,
    });
  });

  it('parses Firefox/Vite "fn@loc" frames', () => {
    const frames = parseStackFrames('handleClick@http://localhost:5173/src/App.tsx?t=1:22:9');
    expect(frames[0].functionName).toBe('handleClick');
    expect(frames[0].fileName).toBe('http://localhost:5173/src/App.tsx?t=1');
    expect(frames[0].line).toBe(22);
  });

  it('returns [] for empty input', () => {
    expect(parseStackFrames(undefined)).toEqual([]);
  });
});

describe('cleanFrameFile', () => {
  it('strips webpack-internal wrappers and bundler groups', () => {
    expect(cleanFrameFile('webpack-internal:///(app-pages-browser)/./src/x.tsx')).toBe('src/x.tsx');
    expect(cleanFrameFile('webpack-internal:///./src/y.tsx')).toBe('src/y.tsx');
  });
  it('drops node_modules frames', () => {
    expect(cleanFrameFile('webpack-internal:///./node_modules/react/index.js')).toBeUndefined();
  });
  it('extracts pathname from http URLs and drops _next chunks', () => {
    expect(cleanFrameFile('http://localhost:5173/src/App.tsx?t=123')).toBe('src/App.tsx');
    expect(cleanFrameFile('http://localhost:3000/_next/static/chunks/main.js')).toBeUndefined();
  });
  it('unwraps Vite /@fs absolute paths', () => {
    expect(cleanFrameFile('http://localhost:5173/@fs/Users/me/app/src/App.tsx')).toBe(
      '/Users/me/app/src/App.tsx',
    );
  });
});

describe('resolveErrorSource', () => {
  const root = '/repo';

  it('prefers the guest-parsed source hint', () => {
    const loc = resolveErrorSource(undefined, { fileName: 'src/a.tsx', lineNumber: 5, columnNumber: 2 }, root);
    expect(loc).toEqual({ path: '/repo/src/a.tsx', line: 5, column: 2 });
  });

  it('walks the stack for the first workspace frame, skipping node_modules', () => {
    const stack = [
      '    at inner (webpack-internal:///./node_modules/react-dom/index.js:1:1)',
      '    at UserCard (webpack-internal:///./src/components/UserCard.tsx:42:18)',
    ].join('\n');
    const loc = resolveErrorSource(stack, undefined, root);
    expect(loc).toEqual({ path: '/repo/src/components/UserCard.tsx', line: 42, column: 18 });
  });

  it('returns null when nothing resolves to a project file', () => {
    expect(resolveErrorSource('    at x (webpack-internal:///./node_modules/z/i.js:1:1)', undefined, root)).toBeNull();
  });
});
