import ts from 'typescript';
import { dirname, join } from 'node:path';

/** TypeScript works with forward-slash paths everywhere; normalize once at the boundary. */
export function toTsPath(p: string): string {
  return p.replace(/\\/g, '/');
}

interface OpenDoc {
  version: number;
  text: string;
}

/**
 * Directory holding TypeScript's standard library (lib.*.d.ts). In dev it's typescript's own
 * lib folder; in a packaged build electron-builder strips *.d.ts from node_modules, so the
 * default path inside the asar is empty and we fall back to the copy shipped as extraResources
 * (Contents/Resources/ts-libs — see electron-builder.yml). Without these files every global
 * type (Array, TemplateStringsArray, …) is undefined and IntelliSense emits nonsense
 * diagnostics — gql`` tagged templates fail with TS2345, and so on.
 */
const STD_LIB_DIR = ((): string => {
  const sentinel = 'lib.es5.d.ts'; // every other lib.*.d.ts references this one
  const fromTs = dirname(ts.getDefaultLibFilePath({}));
  const candidates = [
    fromTs,
    ...(process.resourcesPath ? [join(process.resourcesPath, 'ts-libs')] : []),
    // __dirname is <Resources>/app.asar/out/main; Resources/ts-libs sits three levels up.
    join(__dirname, '..', '..', '..', 'ts-libs'),
  ];
  const found = candidates.find((dir) => ts.sys.fileExists(join(dir, sentinel)));
  if (!found) {
    console.error(
      `[language] TypeScript standard library (lib.*.d.ts) not found. Tried: ${candidates.join(', ')}. ` +
        `IntelliSense diagnostics will be wrong (missing global types).`,
    );
  }
  return found ?? fromTs;
})();

/**
 * One TypeScript Language Service rooted at a workspace folder.
 *
 * It loads the project's tsconfig.json (or a permissive fallback), enumerates the project's
 * source files through that config (which already excludes node_modules/dist/etc.), and keeps an
 * in-memory overlay of "open documents" so IntelliSense reflects unsaved edits. Disk files are
 * read lazily and cached. Module resolution (relative, tsconfig `paths` aliases, node_modules)
 * comes for free from the compiler options we hand the host.
 */
export class Project {
  readonly rootPath: string;
  private options: ts.CompilerOptions;
  private rootFiles = new Set<string>();
  private openDocs = new Map<string, OpenDoc>();
  private diskSnapshots = new Map<string, ts.IScriptSnapshot>();
  private readonly service: ts.LanguageService;

  constructor(rootPath: string, registry: ts.DocumentRegistry) {
    this.rootPath = toTsPath(rootPath);
    const { options, fileNames } = this.loadConfig();
    this.options = options;
    for (const f of fileNames) this.rootFiles.add(toTsPath(f));
    this.service = ts.createLanguageService(this.createHost(), registry);
  }

  /** Read tsconfig.json at the root; fall back to permissive defaults when it's missing. */
  private loadConfig(): { options: ts.CompilerOptions; fileNames: string[] } {
    const configPath = join(this.rootPath, 'tsconfig.json');
    if (ts.sys.fileExists(configPath)) {
      const read = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(
        read.config ?? {},
        ts.sys,
        this.rootPath,
        undefined,
        configPath,
      );
      return {
        options: {
          ...parsed.options,
          // We never emit; keep lib checks cheap and tolerate .jsx/.vue-style extensions.
          noEmit: true,
          skipLibCheck: true,
          allowNonTsExtensions: true,
        },
        fileNames: parsed.fileNames,
      };
    }
    return { options: this.fallbackOptions(), fileNames: [] };
  }

  /** Sensible options for a project with no tsconfig — enough for JS/TS IntelliSense. */
  private fallbackOptions(): ts.CompilerOptions {
    return {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      esModuleInterop: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      allowNonTsExtensions: true,
      noEmit: true,
    };
  }

  private createHost(): ts.LanguageServiceHost {
    return {
      getScriptFileNames: () => [...new Set([...this.rootFiles, ...this.openDocs.keys()])],
      getScriptVersion: (file) => {
        const open = this.openDocs.get(toTsPath(file));
        return open ? `o${open.version}` : 'd0';
      },
      getScriptSnapshot: (file) => {
        const key = toTsPath(file);
        const open = this.openDocs.get(key);
        if (open) return ts.ScriptSnapshot.fromString(open.text);
        const cached = this.diskSnapshots.get(key);
        if (cached) return cached;
        if (!ts.sys.fileExists(file)) return undefined;
        const text = ts.sys.readFile(file);
        if (text === undefined) return undefined;
        const snap = ts.ScriptSnapshot.fromString(text);
        this.diskSnapshots.set(key, snap);
        return snap;
      },
      getCurrentDirectory: () => this.rootPath,
      getCompilationSettings: () => this.options,
      // Resolve lib.*.d.ts from STD_LIB_DIR (TS uses this path's directory to find every lib
      // file), so packaged builds read them from the shipped copy rather than the stripped asar.
      getDefaultLibFileName: (opts) => join(STD_LIB_DIR, ts.getDefaultLibFileName(opts)),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath,
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    };
  }

  /** Make sure `file` is part of the program (needed for files opened outside the tsconfig set). */
  ensureRootFile(file: string): void {
    this.rootFiles.add(toTsPath(file));
  }

  openDocument(file: string, text: string): void {
    const key = toTsPath(file);
    this.rootFiles.add(key);
    this.diskSnapshots.delete(key);
    this.openDocs.set(key, { version: 1, text });
  }

  updateDocument(file: string, text: string): void {
    const key = toTsPath(file);
    const prev = this.openDocs.get(key);
    this.openDocs.set(key, { version: (prev?.version ?? 0) + 1, text });
  }

  closeDocument(file: string): void {
    const key = toTsPath(file);
    this.openDocs.delete(key);
    // Drop any cached disk snapshot so the next read reflects what's now on disk.
    this.diskSnapshots.delete(key);
  }

  /** Invalidate the cached on-disk snapshot for a file changed externally. */
  refreshFile(file: string): void {
    this.diskSnapshots.delete(toTsPath(file));
  }

  getService(): ts.LanguageService {
    return this.service;
  }

  getSourceFile(file: string): ts.SourceFile | undefined {
    const key = toTsPath(file);
    let sf = this.service.getProgram()?.getSourceFile(key);
    if (!sf) {
      this.ensureRootFile(key);
      sf = this.service.getProgram()?.getSourceFile(key);
    }
    return sf;
  }

  dispose(): void {
    this.service.dispose();
  }
}

/** True if `file` lives under `root`. */
export function fileUnderRoot(file: string, root: string): boolean {
  const f = toTsPath(file);
  const r = toTsPath(root);
  return f === r || f.startsWith(`${r}/`);
}

export { dirname };
