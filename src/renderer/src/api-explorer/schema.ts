import {
  print,
  parse,
  isEnumType,
  isListType,
  isUnionType,
  isScalarType,
  isObjectType,
  isNonNullType,
  getNamedType,
  buildClientSchema,
  isInterfaceType,
  isInputObjectType,
  getIntrospectionQuery,
} from 'graphql';
import { useState, useEffect, useCallback } from 'react';

import type {
  GraphQLSchema,
  GraphQLArgument,
  GraphQLInputType,
  GraphQLOutputType,
  IntrospectionQuery,
} from 'graphql';
import type { SchemaField, SchemaArgNode, SchemaOperations } from './types';

import { runHttp } from './runner';

const MAX_INPUT_DEPTH = 5;
const schemaCache = new Map<string, GraphQLSchema>();

export interface IntrospectArgs {
  endpoint: string;
  token?: string;
  headers?: Record<string, string>;
}

async function introspect(args: IntrospectArgs): Promise<GraphQLSchema> {
  const cached = schemaCache.get(args.endpoint);
  if (cached) return cached;

  const result = await runHttp({
    method: 'POST',
    url: args.endpoint,
    auth: args.token ? { type: 'bearer', token: args.token } : { type: 'none' },
    headers: args.headers ?? {},
    bodyMode: 'graphql',
    bodyText: '',
    formRows: [],
    query: getIntrospectionQuery(),
    operationName: 'IntrospectionQuery',
  });

  if (result.networkError) throw new Error(result.networkError);
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join('; '));
  if (!result.data || typeof result.data !== 'object') {
    throw new Error('Introspection returned no schema. It may be disabled on the server.');
  }

  const schema = buildClientSchema(result.data as unknown as IntrospectionQuery);
  schemaCache.set(args.endpoint, schema);
  return schema;
}

/** Recurse into input-object types so the tree can show nested fields (depth-bounded + cycle guard). */
function buildArgNode(
  name: string,
  type: GraphQLInputType,
  depth: number,
  seen: ReadonlySet<string>,
): SchemaArgNode {
  const node: SchemaArgNode = {
    name,
    typeString: String(type),
    required: isNonNullType(type),
  };
  const named = getNamedType(type);
  if (isInputObjectType(named) && depth < MAX_INPUT_DEPTH && !seen.has(named.name)) {
    const nextSeen = new Set(seen).add(named.name);
    node.children = Object.values(named.getFields()).map((field) =>
      buildArgNode(field.name, field.type, depth + 1, nextSeen),
    );
  }
  return node;
}

function toField(
  name: string,
  field: {
    type: GraphQLOutputType;
    description?: string | null;
    args: ReadonlyArray<GraphQLArgument>;
  },
): SchemaField {
  return {
    name,
    typeString: String(field.type),
    description: field.description ?? undefined,
    args: field.args.map((arg) => buildArgNode(arg.name, arg.type, 0, new Set<string>())),
  };
}

export function listOperations(schema: GraphQLSchema): SchemaOperations {
  const queryType = schema.getQueryType();
  const mutationType = schema.getMutationType();
  return {
    queries: queryType
      ? Object.entries(queryType.getFields()).map(([name, field]) => toField(name, field))
      : [],
    mutations: mutationType
      ? Object.entries(mutationType.getFields()).map(([name, field]) => toField(name, field))
      : [],
  };
}

function indent(depth: number): string {
  return '  '.repeat(depth);
}

function buildSelectionSet(type: GraphQLOutputType, depth: number, maxDepth: number): string {
  const named = getNamedType(type);
  if (!isObjectType(named) && !isInterfaceType(named)) return '';
  if (depth >= maxDepth) return `${indent(depth + 1)}__typename`;

  const lines: string[] = [];
  for (const field of Object.values(named.getFields())) {
    if (field.args.some((arg) => isNonNullType(arg.type))) continue;
    const fieldNamed = getNamedType(field.type);
    if (isScalarType(fieldNamed) || isEnumType(fieldNamed)) {
      lines.push(`${indent(depth + 1)}${field.name}`);
    } else if ((isObjectType(fieldNamed) || isInterfaceType(fieldNamed)) && depth + 1 < maxDepth) {
      const sub = buildSelectionSet(field.type, depth + 1, maxDepth);
      if (sub) lines.push(`${indent(depth + 1)}${field.name} {\n${sub}\n${indent(depth + 1)}}`);
    }
  }
  if (lines.length === 0) lines.push(`${indent(depth + 1)}__typename`);
  return lines.join('\n');
}

function sampleForInput(
  type: GraphQLInputType,
  depth: number = 0,
  seen: ReadonlySet<string> = new Set<string>(),
): unknown {
  let inner: GraphQLInputType = type;
  if (isNonNullType(inner)) inner = inner.ofType as GraphQLInputType;
  if (isListType(inner)) return [];

  const named = getNamedType(type);
  if (isScalarType(named)) {
    switch (named.name) {
      case 'Int':
      case 'Float':
        return 0;
      case 'Boolean':
        return false;
      default:
        return '';
    }
  }
  if (isEnumType(named)) return named.getValues()[0]?.value ?? null;
  if (isInputObjectType(named) && depth < MAX_INPUT_DEPTH && !seen.has(named.name)) {
    const nextSeen = new Set(seen).add(named.name);
    return Object.fromEntries(
      Object.values(named.getFields()).map((field) => [
        field.name,
        sampleForInput(field.type, depth + 1, nextSeen),
      ]),
    );
  }
  return null;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Scaffold a ready-to-edit operation + variables template for a root field. */
export function buildOperation(
  schema: GraphQLSchema,
  kind: 'query' | 'mutation',
  fieldName: string,
): { query: string; variables: string } {
  const rootType = kind === 'query' ? schema.getQueryType() : schema.getMutationType();
  const field = rootType?.getFields()[fieldName];
  if (!field) return { query: '', variables: '' };

  const varDefs = field.args.map((arg) => `$${arg.name}: ${String(arg.type)}`);
  const argUses = field.args.map((arg) => `${arg.name}: $${arg.name}`);

  const named = getNamedType(field.type);
  const needsSelection = isObjectType(named) || isInterfaceType(named) || isUnionType(named);

  let body = field.name;
  if (argUses.length) body += `(${argUses.join(', ')})`;
  if (needsSelection) {
    const selection = isUnionType(named)
      ? `${indent(1)}__typename`
      : buildSelectionSet(field.type, 0, 2);
    body += ` {\n${selection}\n}`;
  }

  const raw = `${kind} ${capitalize(fieldName)}${varDefs.length ? `(${varDefs.join(', ')})` : ''} {\n${body}\n}`;
  let query = raw;
  try {
    query = print(parse(raw));
  } catch {
    // Keep the hand-built string if printing fails for an exotic type.
  }

  const variables =
    field.args.length === 0
      ? ''
      : JSON.stringify(
          Object.fromEntries(field.args.map((arg) => [arg.name, sampleForInput(arg.type)])),
          null,
          2,
        );

  return { query, variables };
}

interface SchemaState {
  schema: GraphQLSchema | null;
  loading: boolean;
  error: string | null;
}

/** Lazily introspects once `enabled` is true, caching per endpoint; `reload` busts the cache. */
export function useGraphqlSchema(args: IntrospectArgs, enabled: boolean) {
  const { endpoint, token, headers } = args;
  const headersKey = JSON.stringify(headers ?? {});
  const [state, setState] = useState<SchemaState>({ schema: null, loading: false, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !endpoint) return undefined;
    const cached = schemaCache.get(endpoint);
    if (cached && nonce === 0) {
      setState({ schema: cached, loading: false, error: null });
      return undefined;
    }
    let active = true;
    setState({ schema: cached ?? null, loading: true, error: null });
    introspect({ endpoint, token, headers })
      .then((schema) => {
        if (active) setState({ schema, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (active) {
          setState({
            schema: null,
            loading: false,
            error: e instanceof Error ? e.message : 'Failed to load schema.',
          });
        }
      });
    return () => {
      active = false;
    };
    // headersKey/token included so a credential change re-introspects on reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, enabled, nonce, token, headersKey]);

  const reload = useCallback(() => {
    schemaCache.delete(endpoint);
    setNonce((n) => n + 1);
  }, [endpoint]);

  return { ...state, reload };
}
