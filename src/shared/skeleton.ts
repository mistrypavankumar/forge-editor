/**
 * Shared types for the "Generate Skeleton" feature. These cross the IPC boundary between the
 * renderer (UI) and the main process (which owns the TypeScript parser), so they live in `@shared`
 * and are imported by both `ipc-contract.ts` and the main-process skeleton service.
 */

/** UI library detected in a component file — drives which skeleton dialect we emit. */
export type SkeletonUiLibrary = 'mui' | 'tailwind' | 'plain-react' | 'unknown';

/** How the skeleton was produced. Static analysis is the MVP; visual-match is a later mode; `ai`
 * asks the configured model to write the skeleton (best for composed, props-driven pages). */
export type SkeletonGenerationMode = 'visual-match' | 'static-analysis' | 'ai';

/** Rough confidence in how well the skeleton matches the real component. */
export type SkeletonConfidence = 'high' | 'medium' | 'low';

/** One React component discovered in a file (used to drive the picker when there are several). */
export interface SkeletonComponentInfo {
  /** Component name, e.g. `UserCard`. */
  name: string;
  /** True when the component is the file's default export. */
  isDefaultExport: boolean;
  /** 1-based line of the component's declaration, for display/reveal. */
  line: number;
}

export interface GenerateSkeletonSelection {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  text: string;
}

export interface GenerateSkeletonInput {
  /** Absolute path of the file being analysed (used for extension + naming decisions). */
  filePath: string;
  /** Full source text of the file. */
  code: string;
  /** Which component to target. Omit to auto-pick when the file has exactly one component. */
  componentName?: string;
  selection?: GenerateSkeletonSelection;
  /** `auto` prefers visual, falls back to static; the MVP only implements `static`. `ai` routes to
   * the model-backed generator (see `skeletonGenerateAi` IPC), which reads composed child components
   * by inference rather than collapsing them to a single block. */
  mode?: 'auto' | 'visual' | 'static' | 'ai';
  /** Sample props for visual-match rendering (unused by static mode). */
  sampleProps?: unknown;
}

export interface GenerateSkeletonResult {
  componentName: string;
  skeletonName: string;
  uiLibrary: SkeletonUiLibrary;
  generationMode: SkeletonGenerationMode;
  /** The generated skeleton component source (TSX). */
  code: string;
  /**
   * Named imports the target file is missing for an "Insert Below" apply. For MUI this is typically
   * `['Skeleton']`; the renderer merges these into the existing `@mui/material` import when present.
   */
  importsToAdd?: string[];
  /** A complete import block to prepend when creating a *new* file (already formatted). */
  fileImports?: string;
  warnings?: string[];
  errors?: string[];
  confidence: SkeletonConfidence;
  /** 0–100 when visual-match measured the DOM; omitted for pure static analysis. */
  layoutMatchScore?: number;
}
