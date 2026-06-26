import { describe, expect, it } from 'vitest';
import { languageFor } from './language';

describe('languageFor', () => {
  it('maps common extensions', () => {
    expect(languageFor('app.ts')).toBe('typescript');
    expect(languageFor('component.tsx')).toBe('typescript');
    expect(languageFor('styles.css')).toBe('css');
    expect(languageFor('schema.graphql')).toBe('graphql');
    expect(languageFor('README.md')).toBe('markdown');
    expect(languageFor('Main.java')).toBe('java');
  });

  it('detects dotenv files by name, not extension', () => {
    expect(languageFor('.env')).toBe('dotenv');
    expect(languageFor('.env.local')).toBe('dotenv');
    expect(languageFor('.env.example')).toBe('dotenv');
    expect(languageFor('.env.production')).toBe('dotenv');
    expect(languageFor('production.env')).toBe('dotenv');
    // works with a full path, not just a basename
    expect(languageFor('apps/scm/.env.example')).toBe('dotenv');
  });

  it('does not mistake similar names for dotenv', () => {
    expect(languageFor('.environment')).toBe('plaintext');
    expect(languageFor('environment.ts')).toBe('typescript');
  });

  it('detects makefiles by name and extension', () => {
    expect(languageFor('Makefile')).toBe('makefile');
    expect(languageFor('makefile')).toBe('makefile');
    expect(languageFor('GNUmakefile')).toBe('makefile');
    expect(languageFor('Makefile.local')).toBe('makefile');
    expect(languageFor('build.mk')).toBe('makefile');
    expect(languageFor('common.mak')).toBe('makefile');
    // works with a full path, not just a basename
    expect(languageFor('packages/core/Makefile')).toBe('makefile');
  });

  it('falls back to plaintext for unknown extensions', () => {
    expect(languageFor('notes.xyz')).toBe('plaintext');
    expect(languageFor('Dockerfile')).toBe('plaintext');
  });
});
