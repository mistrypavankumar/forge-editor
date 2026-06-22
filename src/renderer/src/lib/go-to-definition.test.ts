import { describe, expect, it } from 'vitest';
import { importSpecForName, moduleSpecAtColumn, localDeclarationLine } from './go-to-definition';

describe('importSpecForName', () => {
  const text = [
    "import type { Metadata } from 'next';",
    "import { PUBLIC_CONFIG } from '@daxwell/configs/public';",
    "import { Auth0BffSignInView } from '@daxwell/auth/client/views/auth0/auth0-sign-in-view';",
    "import React, { useState } from 'react';",
    "import * as fs from 'node:fs';",
  ].join('\n');

  it('resolves named imports', () => {
    expect(importSpecForName(text, 'PUBLIC_CONFIG')).toBe('@daxwell/configs/public');
    expect(importSpecForName(text, 'Auth0BffSignInView')).toBe(
      '@daxwell/auth/client/views/auth0/auth0-sign-in-view',
    );
    expect(importSpecForName(text, 'useState')).toBe('react');
  });

  it('resolves type, default, and namespace imports', () => {
    expect(importSpecForName(text, 'Metadata')).toBe('next');
    expect(importSpecForName(text, 'React')).toBe('react');
    expect(importSpecForName(text, 'fs')).toBe('node:fs');
  });

  it('returns null for non-imported names', () => {
    expect(importSpecForName(text, 'Page')).toBeNull();
  });
});

describe('moduleSpecAtColumn', () => {
  const line = "import { PUBLIC_CONFIG } from '@daxwell/configs/public';";
  it('returns the specifier when the column is inside the string', () => {
    const col = line.indexOf('configs') + 1;
    expect(moduleSpecAtColumn(line, col)).toBe('@daxwell/configs/public');
  });
  it('returns null on non-import lines', () => {
    expect(moduleSpecAtColumn('const x = "hello";', 12)).toBeNull();
  });
});

describe('localDeclarationLine', () => {
  const text = ['import x from "y";', '', 'export default function Page() {', '  return null;', '}'].join('\n');
  it('finds the line of a declaration', () => {
    expect(localDeclarationLine(text, 'Page')).toBe(3);
  });
  it('returns null when there is no declaration', () => {
    expect(localDeclarationLine(text, 'Missing')).toBeNull();
  });
});
