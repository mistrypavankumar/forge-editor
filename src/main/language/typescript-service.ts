import ts from 'typescript';
import { dirname } from 'node:path';
import type {
  LsCompletionItem,
  LsCompletions,
  LsDiagnostic,
  LsHover,
  LsLocation,
  LsRenameResult,
  LsSemanticTokens,
  LsSignatureHelp,
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
 * Owns one {@link Project} per initialized workspace root and routes feature requests to the
 * right one. Positions crossing IPC are 1-based line / 1-based column (Monaco-native) so the
 * renderer needs no conversion; we translate to/from TS character offsets here.
 */
class LanguageServiceManager {
  private projects = new Map<string, Project>();
  private lastRoot: string | null = null;

  initializeProject(rootPath: string): void {
    const key = toTsPath(rootPath);
    if (!this.projects.has(key)) {
      this.projects.set(key, new Project(rootPath, registry));
    }
    this.lastRoot = key;
  }

  /** Pick the project that owns `file` (longest matching root), else the most recent, else create. */
  private projectFor(file: string): Project {
    const f = toTsPath(file);
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
      {
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
        includeCompletionsForImportStatements: true,
      },
    );
    if (!completions) return { items: [] };
    const items: LsCompletionItem[] = completions.entries.map((e) => ({
      label: e.name,
      kind: e.kind,
      insertText: e.insertText ?? e.name,
      sortText: e.sortText,
      detail: e.kindModifiers || undefined,
    }));
    return { items };
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
}

export const languageManager = new LanguageServiceManager();
