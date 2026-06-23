/**
 * Common Java live-template snippets (the familiar Eclipse / IntelliJ prefixes: sout, psvm, fori,
 * tryc, …), registered as Monaco snippet completions for `.java`. Bodies use Monaco snippet syntax:
 * `$1`/`${1:placeholder}` for tab stops, `$0` for the final cursor, `\t` for indentation (Monaco
 * re-indents to the file's tab settings), and `${TM_FILENAME_BASE}` to seed the type name.
 */
export interface JavaSnippet {
  prefix: string;
  body: string;
  description: string;
}

export const JAVA_SNIPPETS: JavaSnippet[] = [
  // ── Printing / logging ──────────────────────────────────────────────────────
  { prefix: 'sout', description: 'System.out.println', body: 'System.out.println($0);' },
  { prefix: 'souf', description: 'System.out.printf', body: 'System.out.printf("${1:%s}%n", $0);' },
  { prefix: 'soutv', description: 'Print a variable', body: 'System.out.println("${1:var} = " + ${1:var});' },
  { prefix: 'serr', description: 'System.err.println', body: 'System.err.println($0);' },

  // ── Entry point ─────────────────────────────────────────────────────────────
  {
    prefix: 'psvm',
    description: 'public static void main',
    body: 'public static void main(String[] args) {\n\t$0\n}',
  },
  { prefix: 'main', description: 'public static void main', body: 'public static void main(String[] args) {\n\t$0\n}' },

  // ── Loops ───────────────────────────────────────────────────────────────────
  { prefix: 'fori', description: 'Indexed for loop', body: 'for (int ${1:i} = 0; ${1:i} < ${2:limit}; ${1:i}++) {\n\t$0\n}' },
  { prefix: 'forr', description: 'Reverse for loop', body: 'for (int ${1:i} = ${2:array}.length - 1; ${1:i} >= 0; ${1:i}--) {\n\t$0\n}' },
  { prefix: 'foreach', description: 'Enhanced for loop', body: 'for (${1:Object} ${2:item} : ${3:collection}) {\n\t$0\n}' },
  { prefix: 'iter', description: 'Enhanced for loop', body: 'for (${1:Object} ${2:item} : ${3:collection}) {\n\t$0\n}' },
  { prefix: 'while', description: 'while loop', body: 'while (${1:condition}) {\n\t$0\n}' },
  { prefix: 'dowhile', description: 'do-while loop', body: 'do {\n\t$0\n} while (${1:condition});' },

  // ── Conditionals ────────────────────────────────────────────────────────────
  { prefix: 'ifn', description: 'if null', body: 'if (${1:value} == null) {\n\t$0\n}' },
  { prefix: 'ifnn', description: 'if not null', body: 'if (${1:value} != null) {\n\t$0\n}' },
  { prefix: 'ife', description: 'if-else', body: 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}' },
  {
    prefix: 'switch',
    description: 'switch statement',
    body: 'switch (${1:value}) {\n\tcase ${2:x}:\n\t\t$0\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}',
  },

  // ── Exception handling ──────────────────────────────────────────────────────
  { prefix: 'tryc', description: 'try-catch', body: 'try {\n\t$1\n} catch (${2:Exception} ${3:e}) {\n\t$0\n}' },
  { prefix: 'tryf', description: 'try-finally', body: 'try {\n\t$1\n} finally {\n\t$0\n}' },
  { prefix: 'trycf', description: 'try-catch-finally', body: 'try {\n\t$1\n} catch (${2:Exception} ${3:e}) {\n\t$4\n} finally {\n\t$0\n}' },
  { prefix: 'tryr', description: 'try-with-resources', body: 'try (${1:Resource} ${2:res} = ${3:init}) {\n\t$0\n} catch (${4:Exception} ${5:e}) {\n}' },

  // ── Type declarations ───────────────────────────────────────────────────────
  { prefix: 'class', description: 'public class', body: 'public class ${1:${TM_FILENAME_BASE}} {\n\t$0\n}' },
  { prefix: 'interface', description: 'public interface', body: 'public interface ${1:${TM_FILENAME_BASE}} {\n\t$0\n}' },
  { prefix: 'enum', description: 'public enum', body: 'public enum ${1:${TM_FILENAME_BASE}} {\n\t$0\n}' },
  { prefix: 'record', description: 'public record', body: 'public record ${1:${TM_FILENAME_BASE}}(${2:int value}) {\n}' },
  {
    prefix: 'singleton',
    description: 'Singleton pattern',
    body:
      'private static ${1:${TM_FILENAME_BASE}} instance;\n\n' +
      'private ${1:${TM_FILENAME_BASE}}() {\n}\n\n' +
      'public static ${1:${TM_FILENAME_BASE}} getInstance() {\n' +
      '\tif (instance == null) {\n\t\tinstance = new ${1:${TM_FILENAME_BASE}}();\n\t}\n\treturn instance;\n}',
  },

  // ── Members ─────────────────────────────────────────────────────────────────
  { prefix: 'psf', description: 'public static final', body: 'public static final ${1:int} ${2:NAME} = ${3:value};' },
  { prefix: 'psfi', description: 'public static final int', body: 'public static final int ${1:NAME} = ${2:value};' },
  { prefix: 'psfs', description: 'public static final String', body: 'public static final String ${1:NAME} = "${2:value}";' },
  { prefix: 'prf', description: 'private final field', body: 'private final ${1:Type} ${2:name};' },
  { prefix: 'method', description: 'Method declaration', body: '${1:public} ${2:void} ${3:name}(${4:}) {\n\t$0\n}' },
  { prefix: 'ctor', description: 'Constructor', body: 'public ${1:${TM_FILENAME_BASE}}(${2:}) {\n\t$0\n}' },
  { prefix: 'get', description: 'Getter', body: 'public ${1:Type} get${2:Name}() {\n\treturn ${3:field};\n}' },
  { prefix: 'set', description: 'Setter', body: 'public void set${1:Name}(${2:Type} ${3:value}) {\n\tthis.${4:field} = ${3:value};\n}' },
  { prefix: 'tostring', description: 'toString override', body: '@Override\npublic String toString() {\n\treturn $0;\n}' },
  { prefix: 'over', description: '@Override method', body: '@Override\n${1:public} ${2:void} ${3:name}(${4:}) {\n\t$0\n}' },

  // ── Collections ─────────────────────────────────────────────────────────────
  { prefix: 'list', description: 'New ArrayList', body: 'List<${1:Type}> ${2:list} = new ArrayList<>();' },
  { prefix: 'map', description: 'New HashMap', body: 'Map<${1:Key}, ${2:Value}> ${3:map} = new HashMap<>();' },
  { prefix: 'hset', description: 'New HashSet', body: 'Set<${1:Type}> ${2:set} = new HashSet<>();' },

  // ── Testing / logging ───────────────────────────────────────────────────────
  { prefix: 'test', description: 'JUnit @Test method', body: '@Test\nvoid ${1:name}() {\n\t$0\n}' },
  {
    prefix: 'logger',
    description: 'SLF4J logger field',
    body: 'private static final Logger log = LoggerFactory.getLogger(${1:${TM_FILENAME_BASE}}.class);',
  },
];
