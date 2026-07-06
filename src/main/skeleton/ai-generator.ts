import type { GenerateSkeletonInput, GenerateSkeletonResult, SkeletonUiLibrary } from '@shared/skeleton';
import { streamAiChat, type ResolvedAi } from '../ai/chat';
import { detectUiLibrary, findComponents, isReactComponentFile, parse } from './detect';

/**
 * AI-backed skeleton generator ("Improve with AI" — the Step 5 mode). Where the static analyzer
 * collapses every custom/props-driven child component to a single generic block, this hands the
 * component to the configured model and asks it to infer the nested structure (stat cards, data
 * tables, toolbars) and emit a dimension-faithful loading skeleton. Non-deterministic and network-
 * bound, so the flow stays preview-first: nothing is written until the user picks an apply action.
 */

const DIALECT: Record<SkeletonUiLibrary, string> = {
  mui: [
    'Use Material UI. Render every placeholder with the MUI <Skeleton> component',
    '(variant="text" for text/labels, "rounded" for buttons/inputs/chips, "circular" for avatars and',
    'icon buttons, "rectangular" for images/media). Preserve MUI layout components (Box, Stack, Grid,',
    'Card, Table, …) with their spacing/sizing props so the skeleton occupies the same footprint.',
  ].join(' '),
  tailwind: [
    'Use Tailwind CSS. Render each placeholder as a <div> with "animate-pulse rounded bg-gray-200"',
    '(dark-mode: also "dark:bg-gray-700") plus width/height utilities that match the real element,',
    'carrying over the original margin/gap/rounded/grid classes so spacing is identical.',
  ].join(' '),
  'plain-react': [
    'Use plain React with inline styles. Render each placeholder as a <div> with a light gray',
    "background (backgroundColor: '#e5e7eb'), an explicit width/height, and a borderRadius. Add a",
    'brief comment noting a shimmer/pulse CSS class can be added for animation.',
  ].join(' '),
  unknown: [
    'Use plain React with inline styles for placeholders (light gray background, explicit width/height,',
    'borderRadius). Keep any layout wrappers you can infer.',
  ].join(' '),
};

const SKELETON_SYSTEM = [
  'You are the skeleton generator built into the Forge code editor. Given a React component, you',
  'produce a loading-skeleton component that visually matches its layout so that swapping the real',
  'component for the skeleton (and back) causes no layout shift.',
  '',
  'Rules:',
  '- Reproduce the outer layout faithfully: same containers, grid columns, flex direction, spacing,',
  '  and repetition counts. A list/table that renders N rows should show a header plus a handful of',
  '  placeholder rows (5–6) with one placeholder per column.',
  '- Replace ALL real content (text, numbers, icons, images, controls) with neutral placeholders.',
  '- The component is likely COMPOSED from other components (e.g. <StatCard title value icon/>,',
  '  <DataTable columns data/>). You will not see their source — infer their visual structure from',
  '  the component name and its props and render a sensible placeholder shape for each (e.g. a stat',
  '  card = a bordered box containing a short label line, a large number block, and a circular icon;',
  '  a data table = a header row plus repeated placeholder rows). Do NOT collapse them to one block.',
  '- Emit NO data, props threading, event handlers, hooks, state, context, or API calls. The skeleton',
  '  must render standalone with zero required props.',
  '- Keep it a single self-contained functional component.',
  '',
  'Respond with ONLY a single fenced ```json code block, no prose before or after, matching exactly:',
  '{"code": string, "importsToAdd": string[], "fileImports": string, "notes": string[]}',
  '- "code": the COMPLETE skeleton component source, e.g. "export function FooSkeleton() { return (…); }".',
  '- "importsToAdd": for MUI only, the named imports from \'@mui/material\' the skeleton uses (always',
  '  include "Skeleton"); otherwise an empty array. Used to merge into an existing import on insert.',
  '- "fileImports": a complete, ready-to-paste import block for a NEW standalone file (React plus',
  '  whatever the skeleton references). Empty string if none are needed.',
  '- "notes": zero or more short caveats worth surfacing to the user (assumptions, guessed structure).',
].join('\n');

interface AiSkeletonJson {
  code: string;
  importsToAdd?: string[];
  fileImports?: string;
  notes?: string[];
}

/** Pull the JSON object out of the model reply — tolerant of a ```json fence or bare object.
 * Exported for unit testing (the generation path itself is network-bound). */
export function extractJson(reply: string): AiSkeletonJson {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const raw = fenced ? fenced[1] : reply;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('The AI reply did not contain a JSON skeleton.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error('The AI reply was not valid JSON.');
  }
  const obj = parsed as AiSkeletonJson;
  if (!obj || typeof obj.code !== 'string' || !obj.code.trim()) {
    throw new Error('The AI reply was missing skeleton code.');
  }
  return obj;
}

/** Accumulate a one-shot completion into its full reply text (or reject on provider failure). */
function complete(cfg: ResolvedAi, system: string, question: string, context: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    streamAiChat(
      cfg,
      { system, history: [], question, context, maxTokens: 8192 },
      (delta) => {
        text += delta;
      },
      (error) => (error ? reject(new Error(error)) : resolve(text)),
    );
  });
}

/**
 * Generate a skeleton for `input`'s target component using the configured model. Reuses the static
 * analyzer's detection (component discovery + UI-library classification) for grounding, then asks the
 * model to author the skeleton. Throws with a friendly message on unsupported files or model failure.
 */
export async function generateSkeletonWithAi(
  cfg: ResolvedAi,
  input: GenerateSkeletonInput,
): Promise<GenerateSkeletonResult> {
  const { filePath, code } = input;
  if (!isReactComponentFile(filePath)) {
    throw new Error('Generate Skeleton is only available for React component files.');
  }
  const components = findComponents(filePath, code);
  if (components.length === 0) throw new Error('No React component was found in this file.');
  const target = input.componentName
    ? components.find((c) => c.name === input.componentName)
    : components.length === 1
      ? components[0]
      : undefined;
  if (!target) {
    if (input.componentName) throw new Error(`Component "${input.componentName}" was not found.`);
    throw new Error('This file has multiple components — choose one to generate a skeleton for.');
  }

  const lib = detectUiLibrary(filePath, code);
  const sf = parse(filePath, code);
  const componentSource = target.node.getText(sf);

  const question = [
    `Generate a loading skeleton for the "${target.name}" component below.`,
    `Name the skeleton component "${target.name}Skeleton".`,
    `Detected UI library: ${lib}. ${DIALECT[lib]}`,
    '',
    'Target component source:',
    '```tsx',
    componentSource,
    '```',
  ].join('\n');

  // Ground the model with the whole file so it can see imports (which children are custom) and any
  // sibling helpers, while `question` points it at the specific component to skeletonize.
  const context = ['Full source of the file (read-only context):', '```tsx', code, '```'].join('\n');

  const reply = await complete(cfg, SKELETON_SYSTEM, question, context);
  const json = extractJson(reply);

  const importsToAdd =
    lib === 'mui'
      ? [...new Set([...(json.importsToAdd ?? []), 'Skeleton'])].sort()
      : json.importsToAdd?.length
        ? json.importsToAdd
        : undefined;

  const warnings = [
    ...(json.notes ?? []),
    'Generated by AI — review the output before applying; sizes and structure are inferred.',
  ];

  return {
    componentName: target.name,
    skeletonName: `${target.name}Skeleton`,
    uiLibrary: lib,
    generationMode: 'ai',
    code: json.code.trimEnd() + '\n',
    importsToAdd,
    fileImports: json.fileImports?.trim() || undefined,
    warnings,
    confidence: 'medium',
  };
}
