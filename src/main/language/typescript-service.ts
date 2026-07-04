import ts from 'typescript';
import { dirname, join } from 'node:path';
import type {
  LsCompletionDetail,
  LsCompletionItem,
  LsCompletions,
  LsDiagnostic,
  LsHover,
  LsLocation,
  LsRenameResult,
  LsSemanticTokens,
  LsSignatureHelp,
  LsSymbol,
  LsTextEdit,
} from '@shared/ipc-contract';
import { Project, fileUnderRoot, toTsPath } from './project-service';

/** A single document registry is shared across all projects so common lib files are parsed once. */
const registry = ts.createDocumentRegistry();

const FORMAT_SETTINGS: ts.FormatCodeSettings = {
  convertTabsToSpaces: true,
  tabSize: 2,
  indentSize: 2,
  insertSpaceAfterCommaDelimiter: true,
  insertSpaceAfterSemicolonInForStatements: true,
  insertSpaceBeforeAndAfterBinaryOperators: true,
  insertSpaceAfterKeywordsInControlFlowStatements: true,
  insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
  insertSpaceBeforeFunctionParenthesis: false,
  placeOpenBraceOnNewLineForFunctions: false,
  placeOpenBraceOnNewLineForControlBlocks: false,
  semicolons: ts.SemicolonPreference.Insert,
};

/**
 * Completion preferences shared by the suggestion list and its lazy detail resolve. Both calls MUST
 * pass the same options or TS won't reproduce the auto-import entry on resolve. `includeCompletions
 * ForModuleExports` is what surfaces not-yet-imported symbols; the module-specifier prefs make the
 * generated `import` use the project's `@/…` aliases and omit file extensions.
 */
const COMPLETION_PREFERENCES: ts.UserPreferences = {
  includeCompletionsForModuleExports: true,
  includeCompletionsWithInsertText: true,
  includeCompletionsForImportStatements: true,
  importModuleSpecifierPreference: 'shortest',
  importModuleSpecifierEnding: 'minimal',
};

/**
 * Owns one {@link Project} per initialized workspace root and routes feature requests to the
 * right one. Positions crossing IPC are 1-based line / 1-based column (Monaco-native) so the
 * renderer needs no conversion; we translate to/from TS character offsets here.
 */
class LanguageServiceManager {
  private projects = new Map<string, Project>();
  private lastRoot: string | null = null;
  /** dir-of-file → nearest tsconfig dir (or null). Avoids re-walking the tree on every request. */
  private configDirCache = new Map<string, string | null>();

  /** Create a project rooted at `rootPath` if one doesn't exist yet. */
  private ensureProject(rootPath: string): string {
    const key = toTsPath(rootPath);
    if (!this.projects.has(key)) {
      this.projects.set(key, new Project(rootPath, registry));
    }
    return key;
  }

  initializeProject(rootPath: string): void {
    this.lastRoot = this.ensureProject(rootPath);
  }

  /**
   * Nearest directory containing a tsconfig.json, walking up from `file` toward the workspace root.
   * In a monorepo the alias-defining config lives in the app/package folder (e.g.
   * `apps/scm/tsconfig.json` with `@/* → ./src/*`), not at the opened root, so a single
   * root-level project resolves none of those `@/…` imports. Bounded by the workspace root when the
   * file lives under it.
   */
  private nearestConfigDir(file: string): string | null {
    const startDir = toTsPath(dirname(file));
    const cached = this.configDirCache.get(startDir);
    if (cached !== undefined) return cached;
    const bound = this.lastRoot && fileUnderRoot(file, this.lastRoot) ? this.lastRoot : null;
    let dir = startDir;
    let result: string | null = null;
    for (;;) {
      if (ts.sys.fileExists(join(dir, 'tsconfig.json'))) {
        result = dir;
        break;
      }
      if (bound && dir === bound) break;
      const parent = toTsPath(dirname(dir));
      if (parent === dir) break; // filesystem root
      dir = parent;
    }
    this.configDirCache.set(startDir, result);
    return result;
  }

  /** Pick the project that owns `file` (longest matching root), else the most recent, else create. */
  private projectFor(file: string): Project {
    const f = toTsPath(file);
    // Make sure a project rooted at the file's nearest tsconfig exists, so monorepo apps/packages
    // get their own alias-aware program rather than falling back to the workspace-root config.
    const configDir = this.nearestConfigDir(f);
    if (configDir) this.ensureProject(configDir);
    let best: Project | null = null;
    for (const project of this.projects.values()) {
      if (fileUnderRoot(f, project.rootPath)) {
        if (!best || project.rootPath.length > best.rootPath.length) best = project;
      }
    }
    if (best) return best;
    if (this.lastRoot) {
      const recent = this.projects.get(this.lastRoot);
      if (recent) return recent;
    }
    // Single-file / no-workspace case: spin up an ad-hoc project rooted at the file's folder.
    const root = toTsPath(dirname(f));
    this.initializeProject(root);
    return this.projects.get(root)!;
  }

  openDocument(file: string, text: string): void {
    this.projectFor(file).openDocument(file, text);
  }

  updateDocument(file: string, text: string): void {
    this.projectFor(file).updateDocument(file, text);
  }

  closeDocument(file: string): void {
    this.projectFor(file).closeDocument(file);
  }

  // ---- conversions -------------------------------------------------------

  private offsetAt(sf: ts.SourceFile, line: number, column: number): number {
    const lineCount = sf.getLineStarts().length;
    const safeLine = Math.max(0, Math.min(line - 1, lineCount - 1));
    try {
      return ts.getPositionOfLineAndCharacter(sf, safeLine, Math.max(0, column - 1));
    } catch {
      return 0;
    }
  }

  private spanToLocation(project: Project, file: string, span: ts.TextSpan): LsLocation | null {
    const sf = project.getSourceFile(file);
    if (!sf) return null;
    const start = sf.getLineAndCharacterOfPosition(span.start);
    const end = sf.getLineAndCharacterOfPosition(span.start + span.length);
    return {
      file,
      line: start.line + 1,
      column: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
    };
  }

  // ---- features ----------------------------------------------------------

  getDiagnostics(file: string): LsDiagnostic[] {
    const project = this.projectFor(file);
    const service = project.getService();
    const sf = project.getSourceFile(file);
    if (!sf) return [];
    const raw = [
      ...service.getSyntacticDiagnostics(toTsPath(file)),
      ...service.getSemanticDiagnostics(toTsPath(file)),
    ];
    const out: LsDiagnostic[] = [];
    for (const d of raw) {
      const start = d.start ?? 0;
      const length = d.length ?? 1;
      const s = sf.getLineAndCharacterOfPosition(start);
      const e = sf.getLineAndCharacterOfPosition(start + length);
      out.push({
        line: s.line + 1,
        column: s.character + 1,
        endLine: e.line + 1,
        endColumn: e.character + 1,
        severity:
          d.category === ts.DiagnosticCategory.Error
            ? 'error'
            : d.category === ts.DiagnosticCategory.Warning
              ? 'warning'
              : 'info',
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        // Preserve TS's own "unused" / "deprecated" hints so the editor can fade (rather than
        // red-squiggle) unused code like TS6133 "declared but its value is never read".
        reportsUnnecessary: d.reportsUnnecessary ? true : undefined,
        reportsDeprecated: d.reportsDeprecated ? true : undefined,
      });
    }
    return out;
  }

  getDefinition(file: string, line: number, column: number): LsLocation[] {
    const project = this.projectFor(file);
    const sf = project.getSourceFile(file);
    if (!sf) return [];
    const defs = project.getService().getDefinitionAtPosition(toTsPath(file), this.offsetAt(sf, line, column));
    if (!defs) return [];
    return defs
      .map((d) => this.spanToLocation(project, d.fileName, d.textSpan))
      .filter((l): l is LsLocation => l !== null);
  }

  getReferences(file: string, line: number, column: number): LsLocation[] {
    const project = this.projectFor(file);
    const sf = project.getSourceFile(file);
    if (!sf) return [];
    const refs = project.getService().getReferencesAtPosition(toTsPath(file), this.offsetAt(sf, line, column));
    if (!refs) return [];
    return refs
      .map((r) => this.spanToLocation(project, r.fileName, r.textSpan))
      .filter((l): l is LsLocation => l !== null);
  }

  getHover(file: string, line: number, column: number): LsHover | null {
    const project = this.projectFor(file);
    const sf = project.getSourceFile(file);
    if (!sf) return null;
    const info = project.getService().getQuickInfoAtPosition(toTsPath(file), this.offsetAt(sf, line, column));
    if (!info) return null;
    const signature = ts.displayPartsToString(info.displayParts);
    const docs = ts.displayPartsToString(info.documentation);
    const contents = ['```typescript', signature, '```', ...(docs ? ['', docs] : [])].join('\n');
    const range = this.spanToLocation(project, file, info.textSpan);
    return {
      contents,
      range: range
        ? { line: range.line, column: range.column, endLine: range.endLine, endColumn: range.endColumn }
        : null,
    };
  }

  getCompletions(file: string, line: number, column: number): LsCompletions {
    const project = this.projectFor(file);
    const sf = project.getSourceFile(file);
    if (!sf) return { items: [] };
    const completions = project.getService().getCompletionsAtPosition(
      toTsPath(file),
      this.offsetAt(sf, line, column),
      COMPLETION_PREFERENCES,
    );
    if (!completions) return { items: [] };
    const items: LsCompletionItem[] = completions.entries.map((e) => {
      // `source` (a module path) marks an auto-import candidate; carry it plus the opaque `data`
      // so the lazy resolve can ask TS for the import edit. `sourceDisplay` is the human-readable form.
      const source = e.source ?? (e.sourceDisplay ? ts.displayPartsToString(e.sourceDisplay) : undefined);
      return {
        label: e.name,
        kind: e.kind,
        insertText: e.insertText ?? e.name,
        sortText: e.sortText,
        detail: source ?? (e.kindModifiers || undefined),
        source,
        data: e.data,
        hasAction: e.hasAction,
      };
    });
    return { items };
  }

  /**
   * Resolve one completion entry: its signature/JSDoc plus any code-action edits. For an
   * auto-import candidate the code action's text changes include the new `import …` statement, which
   * we hand back as `additionalEdits` for the renderer to apply alongside the inserted symbol.
   */
  getCompletionDetails(
    file: string,
    line: number,
    column: number,
    label: string,
    source?: string,
    data?: unknown,
  ): LsCompletionDetail | null {
    const project = this.projectFor(file);
    const sf = project.getSourceFile(file);
    if (!sf) return null;
    const details = project.getService().getCompletionEntryDetails(
      toTsPath(file),
      this.offsetAt(sf, line, column),
      label,
      FORMAT_SETTINGS,
      source,
      COMPLETION_PREFERENCES,
      data as ts.CompletionEntryData | undefined,
    );
    if (!details) return null;
    const additionalEdits: LsTextEdit[] = [];
    for (const action of details.codeActions ?? []) {
      for (const change of action.changes) {
        const targetSf = project.getSourceFile(change.fileName) ?? sf;
        for (const tc of change.textChanges) {
          const start = targetSf.getLineAndCharacterOfPosition(tc.span.start);
          const end = targetSf.getLineAndCharacterOfPosition(tc.span.start + tc.span.length);
          additionalEdits.push({
            file: change.fileName,
            line: start.line + 1,
            column: start.character + 1,
            endLine: end.line + 1,
            endColumn: end.character + 1,
            newText: tc.newText,
          });
        }
      }
    }
    const detail = ts.displayPartsToString(details.displayParts);
    const documentation = ts.displayPartsToString(details.documentation);
    return {
      detail: detail || undefined,
      documentation: documentation || undefined,
      additionalEdits,
    };
  }

  getSignatureHelp(file: string, line: number, column: number): LsSignatureHelp | null {
    const project = this.projectFor(file);
    const sf = project.getSourceFile(file);
    if (!sf) return null;
    const help = project.getService().getSignatureHelpItems(toTsPath(file), this.offsetAt(sf, line, column), {});
    if (!help) return null;
    return {
      activeSignature: help.selectedItemIndex,
      activeParameter: help.argumentIndex,
      signatures: help.items.map((item) => {
        const prefix = ts.displayPartsToString(item.prefixDisplayParts);
        const suffix = ts.displayPartsToString(item.suffixDisplayParts);
        const separator = ts.displayPartsToString(item.separatorDisplayParts);
        const params = item.parameters.map((p) => ({
          label: ts.displayPartsToString(p.displayParts),
          documentation: ts.displayPartsToString(p.documentation) || undefined,
        }));
        return {
          label: prefix + params.map((p) => p.label).join(separator) + suffix,
          documentation: ts.displayPartsToString(item.documentation) || undefined,
          parameters: params,
        };
      }),
    };
  }

  renameSymbol(file: string, line: number, column: number, newName: string): LsRenameResult {
    const project = this.projectFor(file);
    const service = project.getService();
    const sf = project.getSourceFile(file);
    if (!sf) return { edits: [] };
    const position = this.offsetAt(sf, line, column);
    const info = service.getRenameInfo(toTsPath(file), position, { allowRenameOfImportPath: true });
    if (!info.canRename) return { edits: [] };
    const locations = service.findRenameLocations(toTsPath(file), position, false, false, {});
    if (!locations) return { edits: [] };
    const edits: LsTextEdit[] = [];
    for (const loc of locations) {
      const range = this.spanToLocation(project, loc.fileName, loc.textSpan);
      if (!range) continue;
      edits.push({
        file: loc.fileName,
        line: range.line,
        column: range.column,
        endLine: range.endLine,
        endColumn: range.endColumn,
        newText: (loc.prefixText ?? '') + newName + (loc.suffixText ?? ''),
      });
    }
    return { edits };
  }

  /**
   * Whole-file semantic classification, delta-encoded for Monaco. TS classifier v2020 encodes
   * each span as `((tokenType + 1) << 8) | modifierBits`; the type/modifier order matches our
   * shared legend, so indices pass straight through. Drives the teal classes / gold functions /
   * blue variables of the Dark+ look (Monaco's browser worker can't be relied on for this).
   */
  getSemanticTokens(file: string): LsSemanticTokens {
    const project = this.projectFor(file);
    const sf = project.getSourceFile(file);
    if (!sf) return { data: [] };
    let spans: number[];
    try {
      const text = sf.getFullText();
      const result = project
        .getService()
        .getEncodedSemanticClassifications(
          toTsPath(file),
          { start: 0, length: text.length },
          ts.SemanticClassificationFormat.TwentyTwenty,
        );
      spans = result.spans;
    } catch {
      return { data: [] };
    }
    const data: number[] = [];
    let prevLine = 0;
    let prevChar = 0;
    // spans is a flat sequence of [start, length, classification] triples.
    for (let i = 0; i + 2 < spans.length; i += 3) {
      const start = spans[i];
      const length = spans[i + 1];
      const classification = spans[i + 2];
      const tokenType = (classification >> 8) - 1;
      if (tokenType < 0) continue;
      const modifiers = classification & 255;
      const lc = sf.getLineAndCharacterOfPosition(start);
      const deltaLine = lc.line - prevLine;
      const deltaChar = deltaLine === 0 ? lc.character - prevChar : lc.character;
      data.push(deltaLine, deltaChar, length, tokenType, modifiers);
      prevLine = lc.line;
      prevChar = lc.character;
    }
    return { data };
  }

  formatDocument(file: string): LsTextEdit[] {
    const project = this.projectFor(file);
    const sf = project.getSourceFile(file);
    if (!sf) return [];
    const changes = project.getService().getFormattingEditsForDocument(toTsPath(file), FORMAT_SETTINGS);
    return changes.map((c) => {
      const start = sf.getLineAndCharacterOfPosition(c.span.start);
      const end = sf.getLineAndCharacterOfPosition(c.span.start + c.span.length);
      return {
        file,
        line: start.line + 1,
        column: start.character + 1,
        endLine: end.line + 1,
        endColumn: end.character + 1,
        newText: c.newText,
      };
    });
  }

  /**
   * Flat list of the declarations in `file` (functions, classes, interfaces, methods, exported
   * consts, …), walked from TS's navigation tree. Nested members carry their parent as
   * `containerName`. The tree's synthetic root (the module itself) is skipped.
   */
  getDocumentSymbols(file: string): LsSymbol[] {
    const project = this.projectFor(file);
    const sf = project.getSourceFile(file);
    if (!sf) return [];
    const tree = project.getService().getNavigationTree(toTsPath(file));
    if (!tree) return [];
    const out: LsSymbol[] = [];
    const walk = (node: ts.NavigationTree, container?: string): void => {
      const span = node.spans[0];
      if (span && node.text && node.text !== '<global>') {
        const pos = sf.getLineAndCharacterOfPosition(span.start);
        out.push({ name: node.text, kind: node.kind, containerName: container, file, line: pos.line + 1, column: pos.character + 1 });
      }
      node.childItems?.forEach((child) => walk(child, node.text));
    };
    // The root node represents the whole file; its children are the top-level declarations.
    tree.childItems?.forEach((child) => walk(child, undefined));
    return out;
  }

  /**
   * Project-wide symbol search (TS "navigate to"), ranked by TS's own matcher. `file` anchors which
   * project to query so a monorepo searches the right program; falls back to the last-initialized
   * project. Empty query returns nothing (navigateTo needs at least one character).
   */
  getWorkspaceSymbols(query: string, file?: string): LsSymbol[] {
    if (!query.trim()) return [];
    const project = file
      ? this.projectFor(file)
      : this.lastRoot
        ? this.projects.get(this.lastRoot)
        : undefined;
    if (!project) return [];
    const items = project.getService().getNavigateToItems(query, 100, undefined, false);
    const out: LsSymbol[] = [];
    for (const item of items) {
      const loc = this.spanToLocation(project, item.fileName, item.textSpan);
      if (!loc) continue;
      out.push({
        name: item.name,
        kind: item.kind,
        containerName: item.containerName || undefined,
        file: item.fileName,
        line: loc.line,
        column: loc.column,
      });
    }
    return out;
  }
}

export const languageManager = new LanguageServiceManager();
