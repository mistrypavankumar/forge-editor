/**
 * A subset of the popular "ES7+ React/Redux/GraphQL/React-Native snippets" (dsznajder) prefixes,
 * registered as Monaco snippet completions for JS/TS (covers .jsx/.tsx too). Bodies use Monaco
 * snippet syntax: `$1`/`${1:placeholder}` for tab stops, `$0` for the final cursor, `\t` for
 * indentation (Monaco re-indents to the file's tab settings), and `${TM_FILENAME_BASE}` to seed
 * the component name from the file name — matching the extension's behavior.
 */
export interface ReactSnippet {
  prefix: string;
  body: string;
  description: string;
}

export const REACT_SNIPPETS: ReactSnippet[] = [
  // ── Imports ───────────────────────────────────────────────────────────────
  { prefix: 'imp', description: 'Import a module', body: "import ${2:moduleName} from '${1:module}'" },
  { prefix: 'imn', description: 'Import a module without name', body: "import '${1:module}'" },
  { prefix: 'imd', description: 'Import destructured', body: "import { $2 } from '${1:module}'" },
  { prefix: 'ime', description: 'Import everything as alias', body: "import * as ${2:alias} from '${1:module}'" },
  { prefix: 'ima', description: 'Import as alias', body: "import { ${2:originalName} as ${3:aliasName} } from '${1:module}'" },
  { prefix: 'imr', description: 'Import React', body: "import React from 'react'" },
  { prefix: 'imrd', description: 'Import ReactDOM', body: "import ReactDOM from 'react-dom'" },
  { prefix: 'imrc', description: 'Import React, { Component }', body: "import React, { Component } from 'react'" },
  { prefix: 'imrpc', description: 'Import React, { PureComponent }', body: "import React, { PureComponent } from 'react'" },
  { prefix: 'imrm', description: 'Import React, { memo }', body: "import React, { memo } from 'react'" },
  { prefix: 'imrf', description: 'Import React, { Fragment }', body: "import React, { Fragment } from 'react'" },
  { prefix: 'imrr', description: 'Import react-router-dom', body: "import { BrowserRouter as Router, Switch, Route, Link } from 'react-router-dom'" },
  { prefix: 'imbr', description: 'Import BrowserRouter', body: "import { BrowserRouter as Router } from 'react-router-dom'" },
  { prefix: 'imrs', description: 'Import { useState }', body: "import React, { useState } from 'react'" },
  { prefix: 'imrse', description: 'Import { useState, useEffect }', body: "import React, { useState, useEffect } from 'react'" },
  { prefix: 'impt', description: 'Import PropTypes', body: "import PropTypes from 'prop-types'" },
  { prefix: 'redux', description: 'Import { connect } from react-redux', body: "import { connect } from 'react-redux'" },

  // ── Exports ───────────────────────────────────────────────────────────────
  { prefix: 'exp', description: 'Export default', body: 'export default $1' },
  { prefix: 'exd', description: 'Export destructured from module', body: "export { $2 } from '${1:module}'" },
  { prefix: 'exa', description: 'Export as alias from module', body: "export { ${2:originalName} as ${3:aliasName} } from '${1:module}'" },
  { prefix: 'enf', description: 'Export named arrow function', body: 'export const ${1:functionName} = (${2:params}) => {\n\t$0\n}' },
  { prefix: 'edf', description: 'Export default arrow function', body: 'export default (${1:params}) => {\n\t$0\n}' },

  // ── Functions / language ──────────────────────────────────────────────────
  { prefix: 'nfn', description: 'Named arrow function', body: 'const ${1:name} = (${2:params}) => {\n\t$0\n}' },
  { prefix: 'anfn', description: 'Anonymous arrow function', body: '(${1:params}) => {\n\t$0\n}' },
  { prefix: 'met', description: 'Class method (arrow)', body: '${1:methodName} = (${2:params}) => {\n\t$0\n}' },
  { prefix: 'fre', description: 'forEach loop', body: '${1:array}.forEach((${2:item}) => {\n\t$0\n})' },
  { prefix: 'fof', description: 'for...of loop', body: 'for (const ${1:item} of ${2:iterable}) {\n\t$0\n}' },
  { prefix: 'fin', description: 'for...in loop', body: 'for (const ${1:key} in ${2:object}) {\n\t$0\n}' },
  { prefix: 'dob', description: 'Destructure object', body: 'const { $2 } = ${1:object}' },
  { prefix: 'dar', description: 'Destructure array', body: 'const [ $2 ] = ${1:array}' },
  { prefix: 'sti', description: 'setInterval', body: 'setInterval(() => {\n\t$0\n}, ${1:delay})' },
  { prefix: 'sto', description: 'setTimeout', body: 'setTimeout(() => {\n\t$0\n}, ${1:delay})' },
  { prefix: 'prom', description: 'New Promise', body: 'return new Promise((resolve, reject) => {\n\t$0\n})' },

  // ── React class components ──────────────────────────────────────────────────
  {
    prefix: 'rcc',
    description: 'React class component',
    body:
      "import React, { Component } from 'react'\n\n" +
      'export default class ${1:${TM_FILENAME_BASE}} extends Component {\n' +
      '\trender() {\n\t\treturn (\n\t\t\t<div>$0</div>\n\t\t)\n\t}\n}',
  },
  {
    prefix: 'rce',
    description: 'React class component, separate export',
    body:
      "import React, { Component } from 'react'\n\n" +
      'export class ${1:${TM_FILENAME_BASE}} extends Component {\n' +
      '\trender() {\n\t\treturn (\n\t\t\t<div>$0</div>\n\t\t)\n\t}\n}\n\n' +
      'export default ${1:${TM_FILENAME_BASE}}',
  },
  {
    prefix: 'rpc',
    description: 'React PureComponent',
    body:
      "import React, { PureComponent } from 'react'\n\n" +
      'export default class ${1:${TM_FILENAME_BASE}} extends PureComponent {\n' +
      '\trender() {\n\t\treturn (\n\t\t\t<div>$0</div>\n\t\t)\n\t}\n}',
  },
  {
    prefix: 'rcredux',
    description: 'React class component connected to Redux',
    body:
      "import React, { Component } from 'react'\n" +
      "import { connect } from 'react-redux'\n\n" +
      'export class ${1:${TM_FILENAME_BASE}} extends Component {\n' +
      '\trender() {\n\t\treturn (\n\t\t\t<div>$0</div>\n\t\t)\n\t}\n}\n\n' +
      'const mapStateToProps = (state) => ({})\n\n' +
      'const mapDispatchToProps = {}\n\n' +
      'export default connect(mapStateToProps, mapDispatchToProps)(${1:${TM_FILENAME_BASE}})',
  },

  // ── React function components ───────────────────────────────────────────────
  {
    prefix: 'rfc',
    description: 'React function component (default export inline)',
    body:
      "import React from 'react'\n\n" +
      'export default function ${1:${TM_FILENAME_BASE}}() {\n\treturn (\n\t\t<div>$0</div>\n\t)\n}',
  },
  {
    prefix: 'rfce',
    description: 'React function component, separate export',
    body:
      "import React from 'react'\n\n" +
      'function ${1:${TM_FILENAME_BASE}}() {\n\treturn (\n\t\t<div>$0</div>\n\t)\n}\n\n' +
      'export default ${1:${TM_FILENAME_BASE}}',
  },
  {
    prefix: 'rafc',
    description: 'React arrow function component (default export inline)',
    body:
      "import React from 'react'\n\n" +
      'export const ${1:${TM_FILENAME_BASE}} = () => {\n\treturn (\n\t\t<div>$0</div>\n\t)\n}',
  },
  {
    prefix: 'rafce',
    description: 'React arrow function component, separate export',
    body:
      "import React from 'react'\n\n" +
      'const ${1:${TM_FILENAME_BASE}} = () => {\n\treturn (\n\t\t<div>$0</div>\n\t)\n}\n\n' +
      'export default ${1:${TM_FILENAME_BASE}}',
  },

  // ── Hooks ───────────────────────────────────────────────────────────────────
  {
    prefix: 'useState',
    description: 'React useState hook',
    body: 'const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = useState(${2:initialState})',
  },
  { prefix: 'useEffect', description: 'React useEffect hook', body: 'useEffect(() => {\n\t$0\n}, [${1:input}])' },
  {
    prefix: 'useEffectCleanup',
    description: 'React useEffect with cleanup',
    body: 'useEffect(() => {\n\t$0\n\treturn () => {\n\t\t$1\n\t}\n}, [${2:input}])',
  },
  { prefix: 'useContext', description: 'React useContext hook', body: 'const ${1:context} = useContext(${2:contextValue})' },
  { prefix: 'useRef', description: 'React useRef hook', body: 'const ${1:ref} = useRef(${2:initialValue})' },
  { prefix: 'useReducer', description: 'React useReducer hook', body: 'const [${1:state}, dispatch] = useReducer(${2:reducer}, ${3:initialState})' },
  { prefix: 'useMemo', description: 'React useMemo hook', body: 'const ${1:memoized} = useMemo(() => ${2:computeExpensiveValue}, [${3:input}])' },
  { prefix: 'useCallback', description: 'React useCallback hook', body: 'const ${1:memoized} = useCallback(\n\t() => {\n\t\t$0\n\t},\n\t[${2:input}],\n)' },
  { prefix: 'useLayoutEffect', description: 'React useLayoutEffect hook', body: 'useLayoutEffect(() => {\n\t$0\n}, [${1:input}])' },
  { prefix: 'useImperativeHandle', description: 'React useImperativeHandle hook', body: 'useImperativeHandle(\n\t${1:ref},\n\t() => ({\n\t\t$0\n\t}),\n\t[${2:input}],\n)' },

  // ── Redux ─────────────────────────────────────────────────────────────────
  { prefix: 'rxaction', description: 'Redux action creator', body: 'export const ${1:actionName} = (${2:payload}) => ({\n\ttype: ${3:CONSTANT},\n\tpayload: ${2:payload}\n})' },
  { prefix: 'rxconst', description: 'Redux action type constant', body: "export const ${1:CONSTANT_NAME} = '${1:CONSTANT_NAME}'" },
  { prefix: 'rxreducer', description: 'Redux reducer', body: 'const initialState = {\n\t$1\n}\n\nexport default (state = initialState, { type, payload }) => {\n\tswitch (type) {\n\t\tcase ${2:CONSTANT}:\n\t\t\treturn { ...state }\n\t\tdefault:\n\t\t\treturn state\n\t}\n}' },
  { prefix: 'rxselect', description: 'Redux selector', body: 'export const ${1:selectorName} = (state) => state.${2:property}' },

  // ── GraphQL / Apollo ────────────────────────────────────────────────────────
  { prefix: 'gql', description: 'gql template literal', body: 'const ${1:QUERY_NAME} = gql`\n\t$0\n`' },
  { prefix: 'usequery', description: 'Apollo useQuery', body: 'const { loading, error, data } = useQuery(${1:QUERY})' },
  { prefix: 'usemutation', description: 'Apollo useMutation', body: 'const [${1:mutate}, { data, loading, error }] = useMutation(${2:MUTATION})' },
  { prefix: 'uselazyquery', description: 'Apollo useLazyQuery', body: 'const [${1:execute}, { data, loading, error }] = useLazyQuery(${2:QUERY})' },

  // ── React Native ────────────────────────────────────────────────────────────
  { prefix: 'imrn', description: 'Import from react-native', body: "import { $1 } from 'react-native'" },
  { prefix: 'imrns', description: 'Import StyleSheet, Text, View', body: "import { StyleSheet, Text, View } from 'react-native'" },
  {
    prefix: 'rnf',
    description: 'React Native function component',
    body:
      "import React from 'react'\n" +
      "import { View, Text } from 'react-native'\n\n" +
      'const ${1:${TM_FILENAME_BASE}} = () => {\n\treturn (\n\t\t<View>\n\t\t\t<Text>$0</Text>\n\t\t</View>\n\t)\n}\n\n' +
      'export default ${1:${TM_FILENAME_BASE}}',
  },
  {
    prefix: 'rnfs',
    description: 'React Native function component with StyleSheet',
    body:
      "import React from 'react'\n" +
      "import { StyleSheet, Text, View } from 'react-native'\n\n" +
      'const ${1:${TM_FILENAME_BASE}} = () => {\n\treturn (\n\t\t<View>\n\t\t\t<Text>$0</Text>\n\t\t</View>\n\t)\n}\n\n' +
      'export default ${1:${TM_FILENAME_BASE}}\n\n' +
      'const styles = StyleSheet.create({})',
  },

  // ── PropTypes ─────────────────────────────────────────────────────────────
  { prefix: 'pts', description: 'PropTypes.string', body: '${1:propName}: PropTypes.string,' },
  { prefix: 'ptn', description: 'PropTypes.number', body: '${1:propName}: PropTypes.number,' },
  { prefix: 'ptb', description: 'PropTypes.bool', body: '${1:propName}: PropTypes.bool,' },
  { prefix: 'ptf', description: 'PropTypes.func', body: '${1:propName}: PropTypes.func,' },
  { prefix: 'pto', description: 'PropTypes.object', body: '${1:propName}: PropTypes.object,' },
  { prefix: 'ptar', description: 'PropTypes.array', body: '${1:propName}: PropTypes.array,' },
  { prefix: 'ptnd', description: 'PropTypes.node', body: '${1:propName}: PropTypes.node,' },
  { prefix: 'ptel', description: 'PropTypes.element', body: '${1:propName}: PropTypes.element,' },
  { prefix: 'ptobs', description: 'PropTypes.shape', body: '${1:propName}: PropTypes.shape({\n\t$0\n}),' },

  // ── Console ─────────────────────────────────────────────────────────────────
  { prefix: 'clg', description: 'console.log', body: 'console.log($1)' },
  { prefix: 'clo', description: 'console.log a named variable', body: "console.log('${1:value}', ${1:value})" },
  { prefix: 'cer', description: 'console.error', body: 'console.error($1)' },
  { prefix: 'cwn', description: 'console.warn', body: 'console.warn($1)' },
  { prefix: 'clt', description: 'console.table', body: 'console.table($1)' },
  { prefix: 'cti', description: 'console.time', body: "console.time('${1:label}')" },
];
