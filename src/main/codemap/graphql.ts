import type { GqlOperation, GqlOpType } from '@shared/ipc-contract';

/**
 * Extract GraphQL operations/fragments from raw GraphQL text — either the body of a `.graphql`
 * file or the contents of a `gql`/`graphql` tagged template literal. Regex-based (no full parse) so
 * it tolerates interpolations (`${Fragment}`) and partial documents. Named and anonymous operations
 * are both captured; fragments always have a name.
 */
export function extractGqlOperations(text: string): GqlOperation[] {
  const ops: GqlOperation[] = [];
  const seen = new Set<string>();
  // Strip block/line comments so `# query Foo` in docs isn't picked up.
  const src = text.replace(/#[^\n]*/g, '');

  // Named: `query Foo`, `mutation Bar(...)`, `fragment Baz on Type`.
  const named = /\b(query|mutation|subscription|fragment)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = named.exec(src)) !== null) {
    const type = m[1] as GqlOpType;
    const name = m[2];
    const key = `${type}:${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      ops.push({ type, name });
    }
  }

  // Anonymous operations: `query {` / `mutation {` / a bare `{` document. Count once each.
  const anon = /\b(query|mutation|subscription)\s*[({]/g;
  while ((m = anon.exec(src)) !== null) {
    // Skip if this position was already matched as a named op (named regex requires an identifier).
    const after = src.slice(m.index + m[1].length).trimStart();
    if (/^[A-Za-z_]/.test(after)) continue;
    const key = `${m[1]}:(anonymous)`;
    if (!seen.has(key)) {
      seen.add(key);
      ops.push({ type: m[1] as GqlOpType, name: '(anonymous)' });
    }
  }

  return ops;
}
