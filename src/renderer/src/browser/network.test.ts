import { describe, it, expect } from 'vitest';
import type { BrowserNetworkEvent } from '@shared/ipc-contract';
import {
  classifyNetwork,
  parseGraphQL,
  operationTypeFromQuery,
  operationNameFromQuery,
  toGraphQLEvent,
  redactHeaders,
  toCurl,
  isLocalUrl,
  SENSITIVE_HEADERS,
} from './network';

const GQL_BODY = JSON.stringify({
  operationName: 'GetSupplierFulfillments',
  variables: { filter: {} },
  query: 'query GetSupplierFulfillments($filter: F) { supplierFulfillments(filter: $filter) { id } }',
});

function net(partial: Partial<BrowserNetworkEvent>): BrowserNetworkEvent {
  return {
    id: 'n1',
    url: 'http://localhost:8080/graphql',
    method: 'POST',
    startedAt: 0,
    type: 'graphql',
    ...partial,
  };
}

describe('classifyNetwork', () => {
  it('detects GraphQL by endpoint path', () => {
    expect(classifyNetwork('http://localhost:8080/graphql', 'POST')).toBe('graphql');
  });
  it('detects GraphQL by request body shape', () => {
    expect(classifyNetwork('http://localhost:8080/api', 'POST', GQL_BODY)).toBe('graphql');
  });
  it('classifies static assets by extension', () => {
    expect(classifyNetwork('http://localhost:3000/_next/static/chunk.js', 'GET')).toBe('asset');
    expect(classifyNetwork('http://localhost:3000/logo.svg', 'GET')).toBe('asset');
  });
  it('classifies REST by /api path and json content type', () => {
    expect(classifyNetwork('http://localhost:3000/api/users', 'GET')).toBe('rest');
    expect(classifyNetwork('http://x/data', 'GET', undefined, 'application/json')).toBe('rest');
  });
  it('classifies html responses as document', () => {
    expect(classifyNetwork('http://localhost:3000/dashboard', 'GET', undefined, 'text/html')).toBe(
      'document',
    );
  });
  it('falls back to unknown', () => {
    expect(classifyNetwork('http://x/thing', 'GET')).toBe('unknown');
  });
});

describe('operation parsing', () => {
  it('extracts type and name from a query document', () => {
    const q = 'query GetUsers { users { id } }';
    expect(operationTypeFromQuery(q)).toBe('query');
    expect(operationNameFromQuery(q)).toBe('GetUsers');
  });
  it('treats a bare selection set as an anonymous query', () => {
    expect(operationTypeFromQuery('{ me { id } }')).toBe('query');
    expect(operationNameFromQuery('{ me { id } }')).toBeUndefined();
  });
  it('detects mutations and subscriptions', () => {
    expect(operationTypeFromQuery('mutation AddUser { addUser { id } }')).toBe('mutation');
    expect(operationTypeFromQuery('subscription OnTick { tick }')).toBe('subscription');
  });
  it('ignores leading comments', () => {
    expect(operationTypeFromQuery('# a comment\nmutation X { y }')).toBe('mutation');
  });
});

describe('parseGraphQL', () => {
  it('parses a single operation body', () => {
    const r = parseGraphQL(GQL_BODY);
    expect(r?.primary.operationName).toBe('GetSupplierFulfillments');
    expect(r?.primary.operationType).toBe('query');
    expect(r?.batchSize).toBe(1);
  });
  it('parses a batched array and reports batch size', () => {
    const r = parseGraphQL(JSON.stringify([{ query: 'query A { a }' }, { query: 'query B { b }' }]));
    expect(r?.primary.operationName).toBe('A');
    expect(r?.batchSize).toBe(2);
  });
  it('returns null for non-graphql bodies', () => {
    expect(parseGraphQL(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(parseGraphQL('not json')).toBeNull();
    expect(parseGraphQL(undefined)).toBeNull();
  });
});

describe('toGraphQLEvent', () => {
  it('derives operation facts and marks GraphQL errors as failed', () => {
    const e = toGraphQLEvent(
      net({
        requestBody: GQL_BODY,
        status: 200,
        responseBody: JSON.stringify({ errors: [{ message: 'boom' }], data: null }),
        durationMs: 184,
      }),
    );
    expect(e?.operationName).toBe('GetSupplierFulfillments');
    expect(e?.operationType).toBe('query');
    expect(e?.errors).toHaveLength(1);
    expect(e?.failed).toBe(true);
  });
  it('marks a clean 200 with data as not failed', () => {
    const e = toGraphQLEvent(
      net({ requestBody: GQL_BODY, status: 200, responseBody: JSON.stringify({ data: { x: 1 } }) }),
    );
    expect(e?.failed).toBe(false);
    expect(e?.dataPreview).toEqual({ x: 1 });
  });
  it('flags a non-2xx status as failed', () => {
    const e = toGraphQLEvent(net({ requestBody: GQL_BODY, status: 500 }));
    expect(e?.failed).toBe(true);
  });
  it('returns null for non-graphql events', () => {
    expect(toGraphQLEvent(net({ type: 'rest' }))).toBeNull();
  });
});

describe('redactHeaders', () => {
  it('masks sensitive headers case-insensitively when enabled', () => {
    const h = redactHeaders({ Authorization: 'Bearer x', 'Content-Type': 'application/json' }, true);
    expect(h.Authorization).toBe('<redacted>');
    expect(h['Content-Type']).toBe('application/json');
  });
  it('leaves values intact when redaction is off', () => {
    expect(redactHeaders({ Cookie: 'a=b' }, false).Cookie).toBe('a=b');
  });
  it('covers the documented sensitive set', () => {
    expect(SENSITIVE_HEADERS).toContain('authorization');
    expect(SENSITIVE_HEADERS).toContain('cookie');
    expect(SENSITIVE_HEADERS).toContain('x-api-key');
  });
});

describe('toCurl', () => {
  it('builds a curl command with method, headers and body, redacting secrets by default', () => {
    const c = toCurl(
      net({
        url: 'http://localhost:8080/graphql',
        method: 'post',
        requestHeaders: { 'content-type': 'application/json', authorization: 'Bearer secret' },
        requestBody: '{"operationName":"GetUsers"}',
      }),
    );
    expect(c).toContain("curl -X POST 'http://localhost:8080/graphql'");
    expect(c).toContain("-H 'content-type: application/json'");
    expect(c).toContain('<redacted>');
    expect(c).not.toContain('Bearer secret');
    expect(c).toContain(`-d '{"operationName":"GetUsers"}'`);
  });
  it('includes secrets only when explicitly opted in', () => {
    const c = toCurl(net({ requestHeaders: { authorization: 'Bearer secret' } }), true);
    expect(c).toContain('Bearer secret');
  });
});

describe('isLocalUrl', () => {
  it('accepts localhost, loopback and private ranges', () => {
    expect(isLocalUrl('http://localhost:3000/x')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:8080/graphql')).toBe(true);
    expect(isLocalUrl('http://192.168.1.10/api')).toBe(true);
    expect(isLocalUrl('http://10.0.0.5/')).toBe(true);
    expect(isLocalUrl('http://172.16.0.1/')).toBe(true);
    expect(isLocalUrl('http://api.local/')).toBe(true);
  });
  it('rejects public hosts', () => {
    expect(isLocalUrl('https://example.com/graphql')).toBe(false);
    expect(isLocalUrl('https://172.15.0.1/')).toBe(false); // just outside the private range
    expect(isLocalUrl('https://api.production.io/')).toBe(false);
  });
});
