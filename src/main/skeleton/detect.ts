import ts from 'typescript';
import type { SkeletonComponentInfo, SkeletonUiLibrary } from '@shared/skeleton';

/**
 * Component discovery + UI-library detection for the skeleton generator. Syntactic only (a single
 * `ts.createSourceFile`, no Program/type-checker), so it's fast and pure — mirrors the approach in
 * `../codemap/scan.ts`. Everything here is exported for unit testing.
 */

export function scriptKindFor(fileName: string): ts.ScriptKind {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.mjs$|\.cjs$|\.js$/i.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function parse(fileName: string, code: string): ts.SourceFile {
  // setParentNodes = true so downstream code can call node.getText(sf) and walk parents.
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
}

/** PascalCase with at least one lowercase letter — excludes ALL_CAPS constants. */
export function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name) && /[a-z]/.test(name) && name.length > 1;
}

export function isReactComponentFile(fileName: string): boolean {
  return /\.(tsx|jsx)$/i.test(fileName);
}

/** A component found in a file, with the AST node whose body renders JSX. */
export interface FoundComponent {
  name: string;
  isDefaultExport: boolean;
  line: number;
  /** Function/arrow/expression node whose returned JSX we generate a skeleton from. */
  node: ts.FunctionLikeDeclarationBase;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false)
  );
}

/** HOCs whose function argument is the component's render function (`memo(fn)`, `forwardRef(fn)`, …). */
const COMPONENT_HOCS = new Set(['memo', 'forwardRef', 'observer']);

/**
 * Resolve a variable initializer to the function-like node whose returned JSX defines the component.
 * Handles a bare arrow/function as well as component HOCs — `forwardRef(fn)`, `memo(fn)`,
 * `React.memo(fn)`, and nested combinations like `memo(forwardRef(fn))`.
 */
function unwrapComponentInitializer(
  expr: ts.Expression,
): ts.FunctionLikeDeclarationBase | undefined {
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return expr;
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    const name = ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : ts.isIdentifier(callee)
        ? callee.text
        : '';
    if (COMPONENT_HOCS.has(name)) {
      for (const arg of expr.arguments) {
        const fn = unwrapComponentInitializer(arg);
        if (fn) return fn;
      }
    }
  }
  return undefined;
}

/** True when an expression is (or wraps) a JSX element/fragment we can turn into a skeleton. */
export function unwrapJsx(expr: ts.Expression | undefined): ts.JsxChild | undefined {
  if (!expr) return undefined;
  let e: ts.Expression = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return e;
  // `cond ? <A/> : <B/>` → prefer the truthy branch (the "loaded" shape).
  if (ts.isConditionalExpression(e)) return unwrapJsx(e.whenTrue) ?? unwrapJsx(e.whenFalse);
  // `flag && <JSX/>`
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return unwrapJsx(e.right);
  }
  return undefined;
}

/** Find the JSX a function-like node renders (arrow-expression body or first `return`). */
export function findRenderedJsx(node: ts.FunctionLikeDeclarationBase): ts.JsxChild | undefined {
  const body = node.body;
  if (!body) return undefined;
  if (!ts.isBlock(body)) return unwrapJsx(body); // arrow with expression body
  let found: ts.JsxChild | undefined;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isReturnStatement(n)) {
      const jsx = unwrapJsx(n.expression);
      if (jsx) found = jsx;
      return;
    }
    // Don't descend into nested function bodies — their returns aren't this component's render.
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
      if (n !== node) return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/**
 * Discover the React components in a file: exported PascalCase functions/arrows and the default
 * export, keeping only those that actually render JSX.
 */
export function findComponents(fileName: string, code: string): FoundComponent[] {
  const sf = parse(fileName, code);
  const baseName = (fileName.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
  const out: FoundComponent[] = [];
  const seen = new Set<string>();

  const add = (name: string, isDefault: boolean, node: ts.FunctionLikeDeclarationBase): void => {
    if (!isPascalCase(name)) return;
    if (!findRenderedJsx(node)) return;
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ name, isDefaultExport: isDefault, line: lineOf(sf, node), node });
  };

  for (const st of sf.statements) {
    const isExported = hasModifier(st, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(st, ts.SyntaxKind.DefaultKeyword);

    if (ts.isFunctionDeclaration(st) && st.body) {
      const name = st.name?.text ?? (isDefault ? baseName : '');
      if (name) add(name, isDefault, st);
    } else if (ts.isVariableStatement(st)) {
      for (const decl of st.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const fn = unwrapComponentInitializer(decl.initializer);
        if (fn) add(decl.name.text, false, fn);
      }
    } else if (ts.isExportAssignment(st) && !st.isExportEquals) {
      // `export default function () {}` / `export default () => <jsx/>`
      const e = st.expression;
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) add(baseName, true, e);
      else if (ts.isFunctionDeclaration(e as unknown as ts.Node)) {
        add(baseName, true, e as unknown as ts.FunctionDeclaration);
      } else if (ts.isIdentifier(e)) {
        // `export default ListPageView` — mark the already-found declaration as the default export.
        const match = out.find((c) => c.name === e.text);
        if (match) match.isDefaultExport = true;
      }
    }
  }
  return out;
}

export function listComponents(fileName: string, code: string): SkeletonComponentInfo[] {
  return findComponents(fileName, code).map((c) => ({
    name: c.name,
    isDefaultExport: c.isDefaultExport,
    line: c.line,
  }));
}

// ---- UI library detection ---------------------------------------------------

const TAILWIND_HINT =
  /\b(flex|grid|(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap|space-[xy])-\d|(w|h)-(\d|full|screen|auto|px)|rounded(-\w+)?|bg-\w+-\d|text-\w+|items-\w+|justify-\w+|border(-\w+)?|shadow(-\w+)?|animate-\w+)\b/;

/**
 * Classify the file's UI library. MUI wins if any `@mui/*` import is present; otherwise Tailwind if
 * className values look like Tailwind utilities; otherwise plain React when JSX is present.
 */
export function detectUiLibrary(fileName: string, code: string): SkeletonUiLibrary {
  const sf = parse(fileName, code);
  let usesMui = false;
  let tailwindClasses = false;
  let hasJsx = false;

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      if (st.moduleSpecifier.text.startsWith('@mui/')) usesMui = true;
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      hasJsx = true;
    }
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === 'className' && node.initializer) {
      const init = node.initializer;
      const text = ts.isStringLiteral(init)
        ? init.text
        : ts.isJsxExpression(init) && init.expression
          ? init.expression.getText(sf)
          : '';
      if (TAILWIND_HINT.test(text)) tailwindClasses = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (usesMui) return 'mui';
  if (tailwindClasses) return 'tailwind';
  if (hasJsx) return 'plain-react';
  return 'unknown';
}
