import ts from 'typescript';
import type {
  GenerateSkeletonInput,
  GenerateSkeletonResult,
  SkeletonUiLibrary,
} from '@shared/skeleton';
import {
  detectUiLibrary,
  findComponents,
  findRenderedJsx,
  isReactComponentFile,
  parse,
  unwrapJsx,
  type FoundComponent,
} from './detect';

/**
 * Static-analysis skeleton generator. Parses a component's rendered JSX, preserves layout
 * containers, and replaces content elements (text/buttons/avatars/images/…) with loading-skeleton
 * placeholders in the appropriate dialect (MUI `<Skeleton>`, Tailwind `animate-pulse` blocks, or
 * inline-styled blocks for plain React). Deterministic and pure — no rendering, no network.
 */

// ---- Element classification -------------------------------------------------

type LeafKind =
  | 'heading'
  | 'text'
  | 'paragraph'
  | 'button'
  | 'iconbutton'
  | 'avatar'
  | 'image'
  | 'chip'
  | 'input'
  | 'icon'
  | 'block';

interface KindSpec {
  mui: { variant: 'text' | 'rounded' | 'rectangular' | 'circular'; widthPct?: number; widthPx?: number; full?: boolean; heightPx?: number };
  tw: string;
  plain: { h: number; wPx?: number; wPct?: number; full?: boolean; radius: number | 'full' };
}

const KIND_SPEC: Record<Exclude<LeafKind, 'paragraph'>, KindSpec> = {
  heading: { mui: { variant: 'text', widthPct: 60, heightPx: 32 }, tw: 'h-6 w-2/3', plain: { h: 28, wPct: 60, radius: 4 } },
  text: { mui: { variant: 'text', widthPct: 80 }, tw: 'h-4 w-full', plain: { h: 16, wPct: 80, radius: 4 } },
  button: { mui: { variant: 'rounded', widthPx: 100, heightPx: 36 }, tw: 'h-9 w-24', plain: { h: 36, wPx: 100, radius: 6 } },
  iconbutton: { mui: { variant: 'circular', widthPx: 40, heightPx: 40 }, tw: 'h-10 w-10 rounded-full', plain: { h: 40, wPx: 40, radius: 'full' } },
  avatar: { mui: { variant: 'circular', widthPx: 40, heightPx: 40 }, tw: 'h-10 w-10 rounded-full', plain: { h: 40, wPx: 40, radius: 'full' } },
  image: { mui: { variant: 'rectangular', full: true, heightPx: 140 }, tw: 'h-40 w-full', plain: { h: 140, full: true, radius: 8 } },
  chip: { mui: { variant: 'rounded', widthPx: 64, heightPx: 24 }, tw: 'h-6 w-16', plain: { h: 24, wPx: 64, radius: 12 } },
  input: { mui: { variant: 'rounded', full: true, heightPx: 40 }, tw: 'h-10 w-full', plain: { h: 40, full: true, radius: 6 } },
  icon: { mui: { variant: 'circular', widthPx: 24, heightPx: 24 }, tw: 'h-6 w-6 rounded-full', plain: { h: 24, wPx: 24, radius: 'full' } },
  block: { mui: { variant: 'rectangular', full: true, heightPx: 80 }, tw: 'h-20 w-full', plain: { h: 80, full: true, radius: 4 } },
};

/** Tags we keep verbatim as layout/structure and recurse into. */
const CONTAINER_TAGS = new Set([
  // MUI layout
  'Box', 'Stack', 'Grid', 'Grid2', 'Container', 'Paper', 'Card', 'CardHeader', 'CardContent',
  'CardActions', 'CardActionArea', 'Table', 'TableContainer', 'TableHead', 'TableBody', 'TableRow',
  'TableCell', 'TableFooter', 'List', 'ListItem', 'ListItemButton', 'ListItemAvatar', 'ListItemIcon',
  'ListItemText', 'Divider', 'Toolbar', 'AppBar', 'Accordion', 'AccordionSummary', 'AccordionDetails',
  // HTML layout
  'div', 'section', 'main', 'header', 'footer', 'article', 'aside', 'nav', 'ul', 'ol', 'li', 'table',
  'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'form', 'figure', 'figcaption', 'dl', 'dd', 'dt',
]);

/** Content elements → skeleton placeholders (never recursed into). */
const LEAF_TAGS: Record<string, LeafKind> = {
  Button: 'button', LoadingButton: 'button', Fab: 'iconbutton', IconButton: 'iconbutton',
  Avatar: 'avatar', Chip: 'chip', TextField: 'input', OutlinedInput: 'input', FilledInput: 'input',
  Input: 'input', InputBase: 'input', Select: 'input', Autocomplete: 'input', CardMedia: 'image',
  Icon: 'icon', SvgIcon: 'icon', Link: 'text', Rating: 'input', Switch: 'input', Checkbox: 'input',
  Radio: 'input',
  h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
  p: 'paragraph', img: 'image', button: 'button', input: 'input', textarea: 'input', select: 'input',
  a: 'text', label: 'text', strong: 'text', em: 'text', small: 'text', b: 'text', code: 'text',
  svg: 'icon', i: 'icon',
};

/** Attributes worth preserving on a container — layout/spacing/style only. Everything else (event
 * handlers, data bindings, content props) is dropped so no business logic leaks into the skeleton. */
const ALLOWED_ATTRS = new Set([
  'className', 'sx', 'style', 'spacing', 'direction', 'gap', 'container', 'item', 'columns',
  'columnSpacing', 'rowSpacing', 'alignItems', 'alignContent', 'justifyContent', 'justifyItems',
  'flexDirection', 'flexWrap', 'wrap', 'display', 'elevation', 'square', 'component', 'divider',
  'disablePadding', 'disableGutters', 'dense', 'variant', 'width', 'height', 'minWidth', 'maxWidth',
  'minHeight', 'maxHeight', 'flex', 'flexGrow', 'flexShrink', 'overflow', 'position', 'borderRadius',
  'border', 'boxShadow', 'colSpan', 'rowSpan', 'align', 'padding', 'size', 'fullWidth', 'orientation',
  'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr',
  'top', 'left', 'right', 'bottom', 'zIndex', 'order', 'xs', 'sm', 'md', 'lg', 'xl',
]);

// ---- Skeleton IR ------------------------------------------------------------

interface LeafNode {
  t: 'leaf';
  kind: LeafKind;
  /** Original className tokens worth carrying over in Tailwind mode (margins, rounding, sizing). */
  keep?: string[];
  /** Explicit image height (px) parsed from the source, when available. */
  imgHeight?: number;
  /** Overrides the MUI text width for this leaf (e.g. a paragraph's shorter last line). */
  muiWidthPct?: number;
}
interface ContainerNode {
  t: 'container';
  tag: string; // '' means a fragment
  attrs: string[];
  children: SkelNode[];
}
interface RepeatNode {
  t: 'repeat';
  count: number;
  child: SkelNode;
}
type SkelNode = LeafNode | ContainerNode | RepeatNode;

interface BuildCtx {
  sf: ts.SourceFile;
  lib: SkeletonUiLibrary;
  /** PascalCase container tags encountered — assumed to be library components needing imports. */
  usedComponents: Set<string>;
  warnings: Set<string>;
}

function tagNameOf(node: ts.JsxElement | ts.JsxSelfClosingElement, sf: ts.SourceFile): string {
  const name = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return name.getText(sf);
}

function attributesOf(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
): ts.JsxAttributes {
  return ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
}

function attrValue(attrs: ts.JsxAttributes, name: string, sf: ts.SourceFile): string | undefined {
  for (const p of attrs.properties) {
    if (ts.isJsxAttribute(p) && p.name.getText(sf) === name && p.initializer) {
      const init = p.initializer;
      if (ts.isStringLiteral(init)) return init.text;
      if (ts.isJsxExpression(init) && init.expression) {
        const e = init.expression;
        if (ts.isStringLiteral(e) || ts.isNumericLiteral(e)) return e.text;
        return e.getText(sf);
      }
    }
  }
  return undefined;
}

/** Keep only layout-relevant attributes, verbatim. Drops handlers, refs, keys and content props. */
function preserveAttrs(node: ts.JsxElement | ts.JsxSelfClosingElement, ctx: BuildCtx): string[] {
  const out: string[] = [];
  let droppedSpread = false;
  for (const p of attributesOf(node).properties) {
    if (ts.isJsxSpreadAttribute(p)) {
      droppedSpread = true;
      continue;
    }
    const name = p.name.getText(ctx.sf);
    if (ALLOWED_ATTRS.has(name)) out.push(p.getText(ctx.sf));
  }
  if (droppedSpread) ctx.warnings.add('Spread props ({...props}) were dropped from the skeleton.');
  return out;
}

/** Carry over margin/positioning/rounding classes so Tailwind skeletons keep original spacing. */
function keepTailwindClasses(attrs: ts.JsxAttributes, sf: ts.SourceFile): string[] {
  const cn = attrValue(attrs, 'className', sf);
  if (!cn) return [];
  return cn
    .split(/\s+/)
    .filter((c) => /^(m[trblxy]?-|space-[xy]-|col-|row-|self-|order-|rounded(-|$)|flex$|grow|shrink)/.test(c));
}

function getMapReturnedJsx(expr: ts.Expression): ts.JsxChild | undefined {
  if (!ts.isCallExpression(expr)) return undefined;
  const callee = expr.expression;
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'map') return undefined;
  const cb = expr.arguments[0];
  if (!cb || (!ts.isArrowFunction(cb) && !ts.isFunctionExpression(cb))) return undefined;
  const body = cb.body;
  if (!ts.isBlock(body)) return unwrapJsx(body);
  return findRenderedJsx(cb);
}

function repeatCountFor(parentTag: string): number {
  if (parentTag === 'TableBody' || parentTag === 'tbody') return 4;
  if (parentTag === 'List' || parentTag === 'ul' || parentTag === 'ol') return 4;
  return 3;
}

/** Convert one JSX child into zero or more skeleton nodes. `parentTag` drives repeat counts. */
function convertChild(child: ts.JsxChild, parentTag: string, ctx: BuildCtx): SkelNode[] {
  if (ts.isJsxText(child)) {
    return child.text.trim() ? [{ t: 'leaf', kind: 'text' }] : [];
  }
  if (ts.isJsxExpression(child)) {
    const e = child.expression;
    if (!e) return [];
    const mapped = getMapReturnedJsx(e);
    if (mapped) {
      const inner = convertElement(mapped, ctx);
      return inner ? [{ t: 'repeat', count: repeatCountFor(parentTag), child: inner }] : [];
    }
    // A nested JSX expression (e.g. a conditional rendering JSX) — recurse into its JSX if any.
    const nested = unwrapJsx(e);
    if (nested) return convertChildList([nested], parentTag, ctx);
    // Otherwise it's a dynamic value like {user.name} → a single text line.
    return [{ t: 'leaf', kind: 'text' }];
  }
  const node = convertElement(child, ctx);
  return node ? [node] : [];
}

function convertChildList(children: readonly ts.JsxChild[], parentTag: string, ctx: BuildCtx): SkelNode[] {
  const out: SkelNode[] = [];
  for (const c of children) out.push(...convertChild(c, parentTag, ctx));
  return out;
}

/** Convert a JSX element/fragment into a skeleton IR node (or null to drop it). */
function convertElement(node: ts.JsxChild, ctx: BuildCtx): SkelNode | null {
  if (ts.isJsxFragment(node)) {
    return { t: 'container', tag: '', attrs: [], children: convertChildList(node.children, '', ctx) };
  }
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return null;

  const tag = tagNameOf(node, ctx.sf);
  const attrs = attributesOf(node);
  const leafKind = LEAF_TAGS[tag] ?? leafKindForTypography(tag, attrs, ctx.sf);

  if (leafKind) {
    if (leafKind === 'paragraph') {
      // A paragraph → two skeleton lines (full + shorter). Grouped in a fragment so no extra DOM
      // box is introduced (keeps the rendered height identical to the real paragraph).
      return {
        t: 'container',
        tag: '',
        attrs: [],
        children: [
          { t: 'leaf', kind: 'text' },
          { t: 'leaf', kind: 'text', keep: ['w-4/5'], muiWidthPct: 60 },
        ],
      };
    }
    const keep = ctx.lib === 'tailwind' ? keepTailwindClasses(attrs, ctx.sf) : undefined;
    const imgHeight = leafKind === 'image' ? parseImgHeight(attrs, ctx.sf) : undefined;
    return { t: 'leaf', kind: leafKind, keep, imgHeight };
  }

  // Not a known content leaf → treat as a layout container, preserving it and recursing.
  const children = ts.isJsxElement(node) ? convertChildList(node.children, tag, ctx) : [];
  // Unknown self-closing PascalCase component with no children → render a generic block.
  if (children.length === 0 && ts.isJsxSelfClosingElement(node) && /^[A-Z]/.test(tag)) {
    ctx.warnings.add(`Unknown component <${tag}/> rendered as a generic block.`);
    return { t: 'leaf', kind: 'block' };
  }
  if (/^[A-Z]/.test(tag)) ctx.usedComponents.add(tag.split('.')[0]);
  return { t: 'container', tag, attrs: preserveAttrs(node, ctx), children };
}

function leafKindForTypography(tag: string, attrs: ts.JsxAttributes, sf: ts.SourceFile): LeafKind | undefined {
  if (tag !== 'Typography') return undefined;
  const variant = attrValue(attrs, 'variant', sf) ?? '';
  if (/^h[1-6]$/.test(variant)) return 'heading';
  if (variant === 'subtitle1' || variant === 'subtitle2') return 'heading';
  return 'text';
}

function parseImgHeight(attrs: ts.JsxAttributes, sf: ts.SourceFile): number | undefined {
  const h = attrValue(attrs, 'height', sf);
  if (h && /^\d+$/.test(h)) return Number(h);
  return undefined;
}

// ---- Emit -------------------------------------------------------------------

const INDENT = '  ';

function emitMuiLeaf(leaf: LeafNode, keyAttr: string): string {
  const spec = KIND_SPEC[leaf.kind === 'paragraph' ? 'text' : leaf.kind].mui;
  const parts = [`variant="${spec.variant}"`];
  if (leaf.muiWidthPct != null) parts.push(`width="${leaf.muiWidthPct}%"`);
  else if (spec.full) parts.push('width="100%"');
  else if (spec.widthPct != null) parts.push(`width="${spec.widthPct}%"`);
  else if (spec.widthPx != null) parts.push(`width={${spec.widthPx}}`);
  const height = leaf.imgHeight ?? spec.heightPx;
  if (height != null) parts.push(`height={${height}}`);
  return `<Skeleton ${keyAttr}${parts.join(' ')} />`;
}

function emitTailwindLeaf(leaf: LeafNode, keyAttr: string): string {
  const spec = KIND_SPEC[leaf.kind === 'paragraph' ? 'text' : leaf.kind];
  const keep = leaf.keep ?? [];
  const keepsWidth = keep.some((c) => c.startsWith('w-'));
  const keepsHeight = keep.some((c) => c.startsWith('h-'));
  const base = new Set<string>(keep);
  for (const c of spec.tw.split(' ')) {
    // Don't fight a preserved dimension — the source's explicit w-/h- wins.
    if ((c.startsWith('w-') && keepsWidth) || (c.startsWith('h-') && keepsHeight)) continue;
    base.add(c);
  }
  base.add('animate-pulse');
  base.add('bg-gray-200');
  if (![...base].some((c) => c.startsWith('rounded'))) base.add('rounded');
  const cls = [...base].join(' ');
  return `<div ${keyAttr}className="${cls}" />`;
}

function emitPlainLeaf(leaf: LeafNode, keyAttr: string): string {
  const spec = KIND_SPEC[leaf.kind === 'paragraph' ? 'text' : leaf.kind].plain;
  const style: string[] = [];
  if (spec.full) style.push("width: '100%'");
  else if (spec.wPct != null) style.push(`width: '${spec.wPct}%'`);
  else if (spec.wPx != null) style.push(`width: ${spec.wPx}`);
  style.push(`height: ${leaf.imgHeight ?? spec.h}`);
  style.push(`borderRadius: ${spec.radius === 'full' ? 9999 : spec.radius}`);
  style.push("backgroundColor: '#e5e7eb'");
  return `<div ${keyAttr}style={{ ${style.join(', ')} }} />`;
}

function emitLeaf(leaf: LeafNode, lib: SkeletonUiLibrary, keyAttr: string): string {
  if (lib === 'mui') return emitMuiLeaf(leaf, keyAttr);
  if (lib === 'tailwind') return emitTailwindLeaf(leaf, keyAttr);
  return emitPlainLeaf(leaf, keyAttr);
}

function emitNode(node: SkelNode, indent: number, lib: SkeletonUiLibrary, keyExpr?: string): string {
  const pad = INDENT.repeat(indent);
  const keyAttr = keyExpr ? `key={${keyExpr}} ` : '';

  if (node.t === 'leaf') return pad + emitLeaf(node, lib, keyAttr);

  if (node.t === 'repeat') {
    const inner = emitNode(node.child, indent + 2, lib, 'i');
    return (
      `${pad}{Array.from({ length: ${node.count} }).map((_, i) => (\n` +
      `${inner}\n` +
      `${pad}))}`
    );
  }

  // container
  const attrStr = node.attrs.length ? ' ' + node.attrs.join(' ') : '';
  const open = node.tag === '' ? '<>' : `<${node.tag}${keyAttr ? ' ' + keyAttr.trim() : ''}${attrStr}>`;
  const close = node.tag === '' ? '</>' : `</${node.tag}>`;
  if (node.children.length === 0 && node.tag !== '') {
    // Self-close empty containers (but a fragment keeps <> </>).
    return `${pad}<${node.tag}${keyAttr ? ' ' + keyAttr.trim() : ''}${attrStr} />`;
  }
  const kids = node.children.map((c) => emitNode(c, indent + 1, lib)).join('\n');
  return `${pad}${open}\n${kids}\n${pad}${close}`;
}

// ---- Public entrypoint ------------------------------------------------------

function pickComponent(components: FoundComponent[], name?: string): FoundComponent | undefined {
  if (name) return components.find((c) => c.name === name);
  return components.length === 1 ? components[0] : undefined;
}

/** Named identifiers imported from '@mui/material' in the source file. */
function muiMaterialImports(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.moduleSpecifier.text !== '@mui/material') continue;
    const bindings = st.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) out.add(el.name.text);
    }
  }
  return out;
}

function buildImports(
  lib: SkeletonUiLibrary,
  used: Set<string>,
  fromMui: Set<string>,
): { importsToAdd?: string[]; fileImports?: string } {
  if (lib !== 'mui') return {};
  // Only re-emit layout components that genuinely come from '@mui/material' — local/other-package
  // components (e.g. a project's ResponsivePageContainer) must not be pulled into the MUI import.
  const names = [...used].filter((n) => fromMui.has(n)).sort();
  const all = [...new Set([...names, 'Skeleton'])].sort();
  return {
    importsToAdd: ['Skeleton'],
    fileImports: `import { ${all.join(', ')} } from '@mui/material';`,
  };
}

/**
 * Generate a loading skeleton for a component in `input.code`. Static analysis only (the MVP): parses
 * the file, picks the target component, and emits a matching skeleton. Throws with a friendly message
 * on unsupported files / missing components; the caller surfaces `warnings`/`errors` in the preview.
 */
export function generateSkeleton(input: GenerateSkeletonInput): GenerateSkeletonResult {
  const { filePath, code } = input;
  if (!isReactComponentFile(filePath)) {
    throw new Error('Generate Skeleton is only available for React component files.');
  }
  const components = findComponents(filePath, code);
  if (components.length === 0) {
    throw new Error('No React component was found in this file.');
  }
  const target = pickComponent(components, input.componentName);
  if (!target) {
    if (input.componentName) throw new Error(`Component "${input.componentName}" was not found.`);
    throw new Error('This file has multiple components — choose one to generate a skeleton for.');
  }

  const jsx = findRenderedJsx(target.node);
  if (!jsx) throw new Error(`Component "${target.name}" does not render any JSX to base a skeleton on.`);

  const lib = detectUiLibrary(filePath, code);
  const sf = parse(filePath, code);
  const ctx: BuildCtx = { sf, lib, usedComponents: new Set(), warnings: new Set() };
  const root = convertElement(jsx, ctx);
  if (!root) throw new Error('Could not analyse the component layout.');

  const skeletonName = `${target.name}Skeleton`;
  const body = emitNode(root, 3, lib);
  const componentCode =
    `export function ${skeletonName}() {\n` +
    `  return (\n` +
    `${body}\n` +
    `  );\n` +
    `}\n`;

  const { importsToAdd, fileImports } = buildImports(lib, ctx.usedComponents, muiMaterialImports(sf));

  const warnings = [...ctx.warnings];
  warnings.push('Generated by static analysis — sizes are estimated and may need small adjustments.');
  if (lib === 'plain-react') {
    warnings.push('Plain-React skeletons use inline styles; add a shimmer/pulse CSS class for animation.');
  }
  if (lib === 'unknown') {
    warnings.push('UI library could not be detected; generated a best-effort generic skeleton.');
  }

  return {
    componentName: target.name,
    skeletonName,
    uiLibrary: lib,
    generationMode: 'static-analysis',
    code: componentCode,
    importsToAdd,
    fileImports,
    warnings,
    confidence: lib === 'unknown' ? 'low' : 'medium',
  };
}
