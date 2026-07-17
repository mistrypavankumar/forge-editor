# Graph Report - .  (2026-07-17)

## Corpus Check
- 333 files · ~226,179 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2489 nodes · 6297 edges · 120 communities (106 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 88 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Main Process Core & Constants
- AI Skeleton Generation
- Java Language Service
- App Shell & UI Components
- Codebase Map & Graph Analysis
- AI Agent Service
- Git Service
- Formatter & Breadcrumbs
- Source Control & Navigator UI
- Command Registration & App Root
- IPC Contract & Preload API
- Branch Picker & Codemap UI
- Editor Tabs & File Tree
- Bottom Panel & Debug Console
- Filesystem Service
- Command Registry & Palette
- Git Operations
- Browser View & Inspector
- Runtime Dependencies
- Dev Dependencies
- Agent Orchestrator
- Browser Debug Actions
- Browser Debug Panel UI
- Search & Replace
- IPC Registration
- TypeScript Language Service
- API Explorer State & Auth
- Terminal & Command Execution
- Editor Integration Installer
- Code Editor Component
- TS Config (renderer)
- AWS Credentials Service
- Language Worker Bridge
- Source Control Panel & Git Graph
- Config & Credentials Helpers
- Source Map Decoding
- JDTLS Java Client
- Monaco Language Providers
- Browser Network Classification
- File Explorer & FS Actions
- Design Specs & Plans (Docs)
- Skeleton Component Detection
- API Explorer Editor
- GraphQL Schema Introspection
- Node Debug Session
- Agent Types
- Codemap Build & Classification
- Debug & Search Panels
- Core Editor Commands
- AI Streaming & Commit Messages
- Build Config (Vite/TS)
- Debug Frame Inspection
- Folder Icons & Workspace Switcher
- Task Runner & Terminal Panel
- Monaco Themes & Setup
- Shell Profile Integration
- Import Sorting
- Java LSP Client
- Landing & Workspace Actions
- URL & Path Parsing
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 116
- Community 118

## God Nodes (most connected - your core abstractions)
1. `cn()` - 116 edges
2. `useEditorStore` - 73 edges
3. `useWorkspaceStore` - 72 edges
4. `CodeEditor()` - 48 edges
5. `useLayoutStore` - 36 edges
6. `openFilePath()` - 29 edges
7. `BrowserView()` - 27 edges
8. `JdtlsService` - 26 edges
9. `toTsPath()` - 26 edges
10. `CommandRegistry` - 26 edges

## Surprising Connections (you probably didn't know these)
- `getCommitDiff()` --indirect_call--> `file()`  [INFERRED]
  index.js → src/renderer/src/lib/derive-project-map.test.ts
- `hasIgnoredSegment()` --indirect_call--> `seg()`  [INFERRED]
  index.js → src/main/debug/source-maps.test.ts
- `buildLineMap()` --indirect_call--> `seg()`  [INFERRED]
  index.js → src/main/debug/source-maps.test.ts
- `runAgentCompletion()` --indirect_call--> `handle()`  [INFERRED]
  index.js → src/main/language/language.worker.ts
- `registerDebugIpc()` --indirect_call--> `lines()`  [INFERRED]
  index.js → src/renderer/src/lib/line-diff.test.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Command Registry Spine (spec, plan, editor)** — readme_command_spine, docs_superpowers_specs_2026_06_17_forge_code_editor_design_command_registry, docs_superpowers_plans_2026_06_17_forge_phase2a_command_spine_plan [INFERRED 0.85]
- **Main/Renderer separation over typed IPC** — readme_main_renderer_separation, readme_ipc_contract, docs_forge_workflow_intelligence_doc [INFERRED 0.75]
- **Editor integration (forge shim replacing wrapper)** — docs_superpowers_specs_2026_06_26_forge_editor_integration_design_spec, docs_superpowers_plans_2026_06_26_forge_editor_integration_plan, docs_superpowers_specs_2026_06_26_forge_editor_integration_design_cli_shim, readme_forge_open_wrapper [INFERRED 0.85]

## Communities (120 total, 14 thin omitted)

### Community 0 - "Main Process Core & Constants"
Cohesion: 0.03
Nodes (77): active, active$1, active$2, AI_CREDENTIALS_PATH, ALLOWED_ATTRS, APP_SPECIAL, assertSafeTool(), BODYLESS_METHODS (+69 more)

### Community 1 - "AI Skeleton Generation"
Cohesion: 0.05
Nodes (80): AiSkeletonJson, complete(), DIALECT, extractJson(), generateSkeletonWithAi(), NOTE: keep this phrased so it does NOT contain an `import … from '…'`-shaped sub, SKELETON_SYSTEM, COMPONENT_HOCS (+72 more)

### Community 2 - "Java Language Service"
Cohesion: 0.06
Nodes (21): ackTerminal(), completionKindName(), describe(), describeForConsole(), isJava(), JdtlsService, LspClient, markdownOf() (+13 more)

### Community 3 - "App Shell & UI Components"
Cohesion: 0.06
Nodes (49): ensureGraphqlLanguage(), MonacoMini(), useBrowserDebugStore, ActivitySidebar(), Item, TOP, AppShell(), Feature (+41 more)

### Community 4 - "Codebase Map & Graph Analysis"
Cohesion: 0.06
Nodes (49): buildCodeMap(), FileRecord, packageName(), parseByExt(), readText(), Workspace, workspaces, classifyRisk() (+41 more)

### Community 5 - "AI Agent Service"
Cohesion: 0.06
Nodes (49): active, cancelAgent(), cancelled, EDIT_SYSTEM, PLAN_SYSTEM, runAgentCompletion(), systemFor(), completionDefaultModel() (+41 more)

### Community 6 - "Git Service"
Cohesion: 0.08
Nodes (55): applyCredential(), checkoutBranch(), clearStaleIndexLock(), createBranch(), currentUserRefs(), defaultLocalBranch(), defaultRemoteBranch(), defaultRemoteRef() (+47 more)

### Community 7 - "Formatter & Breadcrumbs"
Cohesion: 0.09
Nodes (34): Breadcrumbs(), buildCrumbs(), Crumb, FormatterPicker(), FormatterPickerProps, FormatterSegment(), FORMAT_LANGUAGES, detectFormatters() (+26 more)

### Community 8 - "Source Control & Navigator UI"
Cohesion: 0.07
Nodes (38): ChangesView(), relDir(), STATUS_STYLE, dirOf(), FocusView(), ModernFileIcon(), ModernFileIconProps, NavigatorTabs() (+30 more)

### Community 9 - "Command Registration & App Root"
Cohesion: 0.08
Nodes (36): App(), openAgent(), registerAgentCommands(), isActive(), isPaused(), registerDebugCommands(), registerScreenshotCommands(), registerSkeletonCommands() (+28 more)

### Community 10 - "IPC Contract & Preload API"
Cohesion: 0.06
Nodes (43): assertSafeTool(), formatText(), pExecFile, resolveBin(), runFormatter(), api, Window, GitUserState (+35 more)

### Community 11 - "Branch Picker & Codemap UI"
Cohesion: 0.08
Nodes (30): relForPath(), useCodemapStore, BranchPicker(), BranchPickerProps, BranchStatePill(), SyncArrow(), SyncOp, backdrop() (+22 more)

### Community 12 - "Editor Tabs & File Tree"
Cohesion: 0.08
Nodes (26): BinaryFileView(), EditorGroupView(), EditorTabs(), relativeTo(), FileTypeIcon(), FolderIcon(), FileTree(), FileTreeProps (+18 more)

### Community 13 - "Bottom Panel & Debug Console"
Cohesion: 0.11
Nodes (27): BrowserDebugPanel(), AwsCredentialsEditor(), PaneSpec, BottomPanel(), DebugConsolePanel(), LINE_CLASS, basename(), CopyProblemButton() (+19 more)

### Community 14 - "Filesystem Service"
Cohesion: 0.10
Nodes (33): copyEntry(), deleteEntry(), hasIgnoredSegment(), HIDDEN_ENTRIES, IGNORED_DIRS, listFilesRecursive(), makeDir(), moveEntry() (+25 more)

### Community 15 - "Command Registry & Palette"
Cohesion: 0.10
Nodes (24): Command, CommandRegistry, registerPaletteCommands(), FileMenu(), highlight(), Kind, literalPositions(), Palette() (+16 more)

### Community 16 - "Git Operations"
Cohesion: 0.07
Nodes (36): applyCredential(), checkoutBranch(), createBranch(), currentUserRefs(), defaultLocalBranch(), defaultRemoteBranch(), defaultRemoteRef(), fetchJson() (+28 more)

### Community 17 - "Browser View & Inspector"
Cohesion: 0.11
Nodes (23): acceptDebugEvent(), BrowserView(), ConfidencePill(), Field(), InspectorPanel(), isConsoleEvent(), isNetworkEvent(), normalizeUrl() (+15 more)

### Community 18 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (35): allotment, @fontsource/fira-code, @fontsource/inter, @fontsource/jetbrains-mono, graphql, @iconify-json/vscode-icons, lucide-react, marked (+27 more)

### Community 19 - "Dev Dependencies"
Cohesion: 0.06
Nodes (35): electron, electron-builder, @electron/rebuild, electron-vite, eslint, eslint-plugin-react-hooks, jsdom, devDependencies (+27 more)

### Community 20 - "Agent Orchestrator"
Cohesion: 0.16
Nodes (26): applyAll(), applyPatch(), approvePlan(), callBrain(), fail(), nextReqId(), previewPatch(), rejectPatch() (+18 more)

### Community 21 - "Browser Debug Actions"
Cohesion: 0.14
Nodes (28): askAiToFixConsole(), askAiToFixNetwork(), askAssistant(), getNodes(), gqlUsageFiles(), HTTP_METHODS, isAiConfigured(), openAt() (+20 more)

### Community 22 - "Browser Debug Panel UI"
Cohesion: 0.12
Nodes (24): copyCurl(), copyText(), searchInProject(), consoleSignature(), capRows(), ConsoleDetail(), ConsoleTab(), DebugSubTab (+16 more)

### Community 23 - "Search & Replace"
Cohesion: 0.11
Nodes (21): buildSearchRegExp(), escapeRegExp(), grepFlags(), pathspecs(), previewAround(), replaceInFiles(), run, searchInFiles() (+13 more)

### Community 24 - "IPC Registration"
Cohesion: 0.14
Nodes (18): electron, isPortOpen(), probePorts(), registerDebugIpc(), BODYLESS_METHODS, registerApiRequestIpc(), registerBrowserIpc(), CaptureRect (+10 more)

### Community 25 - "TypeScript Language Service"
Cohesion: 0.27
Nodes (3): fileUnderRoot(), toTsPath(), LanguageServiceManager

### Community 26 - "API Explorer State & Auth"
Cohesion: 0.13
Nodes (21): AUTH_TYPES, AuthEditor(), RunArgs, ApiExplorerState, DEFAULT_AUTH, RequestSnapshot, RequestTab, SidebarTab (+13 more)

### Community 27 - "Terminal & Command Execution"
Cohesion: 0.11
Nodes (25): cancelAgentCommand(), keepTail(), loginShell(), runAgentCommand(), running, getActiveAwsEnv(), ackTerminal(), createTerminal() (+17 more)

### Community 28 - "Editor Integration Installer"
Cohesion: 0.20
Nodes (21): buildShim(), install(), IntegrationPaths, PHASE1_ENV_LINES, readOrEmpty(), resolveIntegrationPaths(), status(), uninstall() (+13 more)

### Community 29 - "Code Editor Component"
Cohesion: 0.15
Nodes (22): CodeEditor(), formatBlame(), severityName(), UNUSED_TS_CODES, live, registerEditor(), setActiveEditor(), unregisterEditor() (+14 more)

### Community 30 - "TS Config (renderer)"
Cohesion: 0.08
Nodes (24): DOM, DOM.Iterable, src/renderer/src, compilerOptions, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, jsx (+16 more)

### Community 31 - "AWS Credentials Service"
Cohesion: 0.16
Nodes (19): awsConfigPaths(), CONFIG_PATH, CREDENTIALS_PATH, errorMessage(), getActiveProfile(), listProfiles(), readIniFile(), run (+11 more)

### Community 32 - "Language Worker Bridge"
Cohesion: 0.11
Nodes (19): call(), ensureWorker(), notify(), Pending, WorkerReply, handle(), WorkerRequest, COMPLETION_PREFERENCES (+11 more)

### Community 33 - "Source Control Panel & Git Graph"
Cohesion: 0.13
Nodes (21): absoluteDate(), AVATAR_COLORS, avatarStyle(), ChangeRow(), CommitHoverCard(), initials(), REF_STYLE, SourceControlPanel() (+13 more)

### Community 34 - "Config & Credentials Helpers"
Cohesion: 0.09
Nodes (24): aiKeyStatus(), awsConfigPaths(), completionDefaultModel(), defaultModel(), err(), errorMessage(), getActiveProfile(), listProfiles() (+16 more)

### Community 35 - "Source Map Decoding"
Cohesion: 0.11
Nodes (19): binarySearch(), cast(), decode(), decodedMappings(), decodeInlineSourceMap(), decodeInteger(), extractJson(), generatedPosition() (+11 more)

### Community 36 - "JDTLS Java Client"
Cohesion: 0.20
Nodes (6): JdtlsService, rangeToLocation(), HintCounts, JavaStatusState, JdtlsStatus, LsLocation

### Community 37 - "Monaco Language Providers"
Cohesion: 0.11
Nodes (20): buildHint(), countsCache, escapeRegExp(), FEATURE_SELECTOR, ForgeCompletion, ForgeHint, identifierColumn(), IMPL_KINDS (+12 more)

### Community 38 - "Browser Network Classification"
Cohesion: 0.17
Nodes (20): RFC-1918, ASSET_EXT, BrowserGraphQLEvent, classifyNetwork(), extensionOf(), GraphQLBodyOp, GraphQLOperationType, looksLikeGraphQL() (+12 more)

### Community 39 - "File Explorer & FS Actions"
Cohesion: 0.19
Nodes (19): basename(), FileExplorer(), relativeTo(), DraftRow(), StructureTreeView(), beginCreate(), commitCreate(), deleteEntry() (+11 more)

### Community 40 - "Design Specs & Plans (Docs)"
Cohesion: 0.10
Nodes (22): Browser Component Inspector, Main-world inspector script, Embedded webview guest panel, Phase 0 — Scaffold Plan, Phase 1 — Editing Core Plan, Phase 2a — Command Spine Plan, Phase 2b — Themes & Persistence Plan, Editor Integration Plan (+14 more)

### Community 41 - "Skeleton Component Detection"
Cohesion: 0.11
Nodes (22): detectSkeletonComponents(), detectUiLibrary(), emitLeaf(), emitMuiLeaf(), emitNode(), emitPlainLeaf(), emitTailwindLeaf(), findComponents() (+14 more)

### Community 42 - "API Explorer Editor"
Cohesion: 0.19
Nodes (18): ApiExplorerEditor(), BODY_MODES, HTTP_METHODS, rowsToHeaders(), shortLabel(), extractOperationName(), formatGraphql(), parseVariables() (+10 more)

### Community 43 - "GraphQL Schema Introspection"
Cohesion: 0.16
Nodes (20): buildArgNode(), buildOperation(), buildSelectionSet(), capitalize(), indent(), introspect(), IntrospectArgs, listOperations() (+12 more)

### Community 44 - "Node Debug Session"
Cohesion: 0.20
Nodes (4): NodeDebugSession, SessionCallbacks, ResolvedBreakpoint, SourceBreakpoint

### Community 45 - "Agent Types"
Cohesion: 0.18
Nodes (16): AgentCheck, AgentNote, AgentPlan, AgentSession, AgentStatus, AgentToolCall, AgentToolName, CheckStatus (+8 more)

### Community 46 - "Codemap Build & Classification"
Cohesion: 0.11
Nodes (20): buildCodeMap(), classifyKind(), classifyRisk(), createResolver(), extractGqlOperations(), findCycles(), hasDefaultModifier(), hasExportModifier() (+12 more)

### Community 47 - "Debug & Search Panels"
Cohesion: 0.18
Nodes (13): DebugControls(), DebugPanel(), VarRow(), DebugToolbar(), PlaceholderPanel(), highlightMatches(), SearchPanel(), PanelHeader() (+5 more)

### Community 48 - "Core Editor Commands"
Cohesion: 0.23
Nodes (18): checkProblems(), closeActiveEditor(), findInEditor(), findInFiles(), gotoLine(), isUntitled(), newTextFile(), registerCoreCommands() (+10 more)

### Community 49 - "AI Streaming & Commit Messages"
Cohesion: 0.12
Nodes (18): buildCliStdin(), clean(), cleanMessage(), complete(), fileContext(), fimContext(), generateCommitMessage(), getCommitDiff() (+10 more)

### Community 50 - "Build Config (Vite/TS)"
Cohesion: 0.12
Nodes (17): electron.vite.config.ts, src/main, compilerOptions, baseUrl, esModuleInterop, lib, module, moduleResolution (+9 more)

### Community 51 - "Debug Frame Inspection"
Cohesion: 0.15
Nodes (14): CallFrame, describe(), describeForConsole(), INSPECTOR_NOISE, nodeMajor(), PausedEvent, PropertyDescriptor, refFor() (+6 more)

### Community 52 - "Folder Icons & Workspace Switcher"
Cohesion: 0.16
Nodes (15): FolderCategory, ModernFolderIcon(), ModernFolderIconProps, dirOf(), WorkspaceSwitcher(), WorkspaceSwitcherProps, Bucket, DerivedGroup (+7 more)

### Community 53 - "Task Runner & Terminal Panel"
Cohesion: 0.25
Nodes (13): RunPanel(), TaskConfig(), TerminalPanel(), runInTerminal(), CustomTask, defaultCommand(), RunnableTask, runnableTasks() (+5 more)

### Community 54 - "Monaco Themes & Setup"
Cohesion: 0.11
Nodes (16): buildRules(), DARK_PLUS, DIFF_DARK, DIFF_LIGHT, FORGE_DARK_COLORS, FORGE_LIGHT_COLORS, GITHUB_DARK, GITHUB_DARK_COLORS (+8 more)

### Community 55 - "Shell Profile Integration"
Cohesion: 0.15
Nodes (17): appBundlePath(), buildBlock(), buildShim(), currentPaths(), ensureTrailingNewline(), escapeRe(), hasBlock(), install() (+9 more)

### Community 56 - "Import Sorting"
Cohesion: 0.12
Nodes (17): buildBySources(), buildImports(), constructor(), getIgnoredNames(), isSorted(), maybeSort(), memoizedState(), nextUnsortedSegmentLine() (+9 more)

### Community 57 - "Java LSP Client"
Cohesion: 0.17
Nodes (3): Json, LspClient, Pending

### Community 58 - "Landing & Workspace Actions"
Cohesion: 0.26
Nodes (14): dirOf(), Landing(), applyFile(), applyFolder(), base(), openFileDialog(), openFolderDialog(), openFolderPath() (+6 more)

### Community 59 - "URL & Path Parsing"
Cohesion: 0.15
Nodes (16): call(), ensureWorker(), isAbsolutePath(), isAbsoluteUrl(), isFileUrl(), isRelative(), isSchemeRelativeUrl(), makeUrl() (+8 more)

### Community 60 - "Community 60"
Cohesion: 0.17
Nodes (9): AuthoredLocation, decodeInlineSourceMap(), GeneratedLocation, ScriptEntry, SourceMapRegistry, inlineMap(), seg(), vlq() (+1 more)

### Community 61 - "Community 61"
Cohesion: 0.23
Nodes (10): formatClock(), WellnessBreakOverlay(), playWellnessChime(), ALL_EXERCISE_IDS, exerciseById(), WELLNESS_EXERCISES, WellnessExercise, useWellnessBreaks() (+2 more)

### Community 62 - "Community 62"
Cohesion: 0.27
Nodes (4): DiffPeek, Monaco, PeekOptions, DiffHunk

### Community 63 - "Community 63"
Cohesion: 0.16
Nodes (12): completionKindName(), Json, LSP_SYMBOL_KIND, markdownOf(), resolveJdtlsCommand(), severityOf(), stripSnippet(), toLspPosition() (+4 more)

### Community 64 - "Community 64"
Cohesion: 0.17
Nodes (12): formatBytes(), formatTime(), CodeBlock(), CopyButton(), findMatches(), JsonTokenType, MatchRange, ResponseTab (+4 more)

### Community 65 - "Community 65"
Cohesion: 0.24
Nodes (12): componentUsages(), GqlOperationMatch, isCatchAll(), isDynamic(), isNonUrlSegment(), matchComponents(), matchRouteFile(), normalizePathname() (+4 more)

### Community 66 - "Community 66"
Cohesion: 0.19
Nodes (11): AssistantMarkdown, AssistantPanel(), ChatMessage, ContextFile, nextId(), QUICK_ACTIONS, QuickAction, DiffView() (+3 more)

### Community 67 - "Community 67"
Cohesion: 0.15
Nodes (5): lang, makeMonaco(), notCancelled, Position, Range

### Community 68 - "Community 68"
Cohesion: 0.23
Nodes (13): buildRunDecorations(), debounceTimers, isRunnable(), Monaco, oneLine(), RUN_LANG_IDS, runInlineNow(), runNow() (+5 more)

### Community 69 - "Community 69"
Cohesion: 0.21
Nodes (14): attributesOf(), attrValue(), convertChild(), convertChildList(), convertElement(), findRenderedJsx(), getMapReturnedJsx(), keepTailwindClasses() (+6 more)

### Community 70 - "Community 70"
Cohesion: 0.31
Nodes (7): commandForKeyEvent(), defaultKeybindings, eventToKeystroke(), KeyEventLike, mergeKeybindings(), resolveCommandId(), useKeybindings()

### Community 71 - "Community 71"
Cohesion: 0.23
Nodes (7): sessionRestoreSettled(), isPersistable(), persist(), snapshot(), useSessionPersistence(), EditorSession, ForgeSettings

### Community 72 - "Community 72"
Cohesion: 0.23
Nodes (9): broadcastWindows(), buildAppMenu(), CdpClient, createWindow(), flushPendingFiles(), menuAction(), requestOpenFile(), watchWorkspace() (+1 more)

### Community 73 - "Community 73"
Cohesion: 0.15
Nodes (12): author, description, license, main, name, pnpm, onlyBuiltDependencies, type (+4 more)

### Community 74 - "Community 74"
Cohesion: 0.19
Nodes (3): OpenDoc, Project, STD_LIB_DIR

### Community 75 - "Community 75"
Cohesion: 0.26
Nodes (9): CollectionGroup(), Collections(), RequestRow(), HistoryList(), Sidebar(), sameSnapshot(), selectActiveRequestDirty(), snapshotRequest() (+1 more)

### Community 76 - "Community 76"
Cohesion: 0.21
Nodes (10): isSensitiveHeader(), maskHeaderValue(), ParseResult, SENSITIVE_HEADER_KEYS, COMMON_HEADER_VALUES, COMMON_HEADERS, HeadersEditor(), GraphQLError (+2 more)

### Community 77 - "Community 77"
Cohesion: 0.27
Nodes (8): BrowserDebugState, ConsoleFilter, DEFAULT_DEBUG_CONFIG, selectGuestConfig(), BrowserConsoleEvent, BrowserDebugConfig, BrowserDebugSettings, BrowserNetworkEvent

### Community 78 - "Community 78"
Cohesion: 0.20
Nodes (10): createTerminal(), defaultShell(), getActiveAwsEnv(), keepTail(), killTerminal(), loginShell(), runAgentCommand(), shellArgs() (+2 more)

### Community 79 - "Community 79"
Cohesion: 0.18
Nodes (11): scripts, build, dev, dist, dist:mac, lint, postinstall, preview (+3 more)

### Community 80 - "Community 80"
Cohesion: 0.35
Nodes (10): ancestorNodeModules(), buildLineMap(), decodeVlq(), execute(), getExportToRun(), hasReactDom(), isReactFile(), runInline() (+2 more)

### Community 81 - "Community 81"
Cohesion: 0.35
Nodes (10): debounceTimers, isTsModel(), LANG_IDS, openLanguageDocument(), refreshDiagnostics(), registeredPaths, scheduleDiagnostics(), toMarkerSeverity() (+2 more)

### Community 82 - "Community 82"
Cohesion: 0.33
Nodes (8): FieldMatch, fuzzyMatch, fuzzyMatchFields(), fuzzyMatchPositions(), fuzzyMatchTerms(), FuzzyResult, isLower(), isUpper()

### Community 83 - "Community 83"
Cohesion: 0.27
Nodes (10): filePathsFromArgv(), findConfigDir(), isFile(), parseJsonish$1(), probe(), readGitBranch(), readTsPaths(), resolveImport() (+2 more)

### Community 84 - "Community 84"
Cohesion: 0.38
Nodes (9): byteLength(), detectOperationType(), extractGraphqlErrors(), applyAuth(), buildBody(), enabledRows(), hasHeader(), now() (+1 more)

### Community 85 - "Community 85"
Cohesion: 0.33
Nodes (8): AwsConnectionPicker(), basename(), describe(), isValid(), AwsState, AwsStatus, AwsProfile, AwsValidation

### Community 86 - "Community 86"
Cohesion: 0.36
Nodes (8): blankInterpolations(), collectDuplicateFields(), computeGraphqlProblems(), extractGqlTemplates(), GqlProblem, GqlSeverity, GqlTemplate, refreshGraphqlDiagnostics()

### Community 87 - "Community 87"
Cohesion: 0.25
Nodes (9): ancestorNodeModules(), buildLineMap(), decodeVlq(), execute(), getExportToRun(), hasReactDom(), isReactFile(), runInline() (+1 more)

### Community 88 - "Community 88"
Cohesion: 0.36
Nodes (7): shellQuote(), TerminalView(), ExecFn, queued, registerExec(), registry, unregisterExec()

### Community 89 - "Community 89"
Cohesion: 0.36
Nodes (7): goToChange(), hunkSources, delMarkerLine(), hunkAtLine(), hunkLine(), hunkToDecoration(), Monaco

### Community 90 - "Community 90"
Cohesion: 0.33
Nodes (7): appendOutput(), CURRENT_FILE_CONFIG, DebugStore, initDebugStore(), DebugConfig, DebugStackFrame, DebugStatus

### Community 91 - "Community 91"
Cohesion: 0.22
Nodes (6): g0, nsPrefix, s0, TerminalGroup, TerminalSession, TerminalState

### Community 92 - "Community 92"
Cohesion: 0.25
Nodes (8): buildSearchRegExp(), escapeRegExp(), grepFlags(), pathspecs(), previewAround(), replaceInFiles(), run$1, searchInFiles()

### Community 93 - "Community 93"
Cohesion: 0.39
Nodes (6): exists(), parseTscOutput(), pExecFile, runDiagnostics(), DiagnosticsState, ProjectDiagnostic

### Community 94 - "Community 94"
Cohesion: 0.50
Nodes (6): asStringArray(), extractErrorLines(), extractJson(), parsePatches(), parsePlan(), RawPatch

### Community 95 - "Community 95"
Cohesion: 0.50
Nodes (6): resolveSourceFile(), cleanFrameFile(), parseStackFrames(), resolveErrorSource(), splitLocation(), StackFrame

### Community 97 - "Community 97"
Cohesion: 0.52
Nodes (5): fallbackDefinition(), fileOf(), importSpecForName(), localDeclarationLine(), moduleSpecAtColumn()

### Community 98 - "Community 98"
Cohesion: 0.48
Nodes (5): classify(), computeDiff(), diffMiddle(), MidHunk, lines()

### Community 99 - "Community 99"
Cohesion: 0.40
Nodes (6): resolveAndOpen source resolution, AI Agent Workspace Mode, Codebase Map / Dependency Graph, Agent Orchestrator, AI Skeleton Mode (streamAiChat), Static Analysis Skeleton Mode

### Community 100 - "Community 100"
Cohesion: 0.60
Nodes (4): closingTagToInsert(), registerAutoCloseTag(), TAG_LANGUAGES, VOID_ELEMENTS

### Community 101 - "Community 101"
Cohesion: 0.40
Nodes (4): EDITOR_SCHEMES, EditorScheme, monacoThemeForScheme(), SCHEME_THEMES

### Community 102 - "Community 102"
Cohesion: 0.70
Nodes (3): isTabOutChar(), registerTabOut(), TAB_OUT_CHARS

### Community 103 - "Community 103"
Cohesion: 0.50
Nodes (4): DIVISOR, relativeTime(), rtf, STEPS

## Knowledge Gaps
- **444 isolated node(s):** `IpcChannels`, `repoQueues`, `FIELD_SEP`, `HIDDEN_ENTRIES`, `IGNORED_DIRS` (+439 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `electron` connect `IPC Registration` to `Main Process Core & Constants`, `Community 73`, `IPC Contract & Preload API`, `Filesystem Service`, `Terminal & Command Execution`, `Editor Integration Installer`, `Community 63`, `AWS Credentials Service`?**
  _High betweenness centrality (0.229) - this node is a cross-community bridge._
- **Why does `file()` connect `Java Language Service` to `Community 66`, `JDTLS Java Client`, `Git Service`, `Source Control & Navigator UI`, `Community 74`, `Node Debug Session`, `Bottom Panel & Debug Console`, `Debug & Search Panels`, `Command Registry & Palette`, `AI Streaming & Commit Messages`, `IPC Registration`, `Community 95`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `cn()` connect `Bottom Panel & Debug Console` to `App Shell & UI Components`, `Formatter & Breadcrumbs`, `Source Control & Navigator UI`, `Command Registration & App Root`, `Branch Picker & Codemap UI`, `Editor Tabs & File Tree`, `Command Registry & Palette`, `Browser View & Inspector`, `Agent Orchestrator`, `Browser Debug Panel UI`, `Source Control Panel & Git Graph`, `API Explorer Editor`, `GraphQL Schema Introspection`, `Debug & Search Panels`, `Task Runner & Terminal Panel`, `Community 64`, `Community 75`, `Community 76`, `Community 85`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `CodeEditor()` (e.g. with `.uri()` and `lines()`) actually correct?**
  _`CodeEditor()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `IpcChannels`, `repoQueues`, `FIELD_SEP` to the rest of the system?**
  _444 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Main Process Core & Constants` be split into smaller, more focused modules?**
  _Cohesion score 0.025987972508591067 - nodes in this community are weakly interconnected._
- **Should `AI Skeleton Generation` be split into smaller, more focused modules?**
  _Cohesion score 0.05025712949976625 - nodes in this community are weakly interconnected._