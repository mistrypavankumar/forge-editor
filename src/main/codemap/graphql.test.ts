import { describe, it, expect } from 'vitest';
import { extractGqlOperations } from './graphql';

describe('extractGqlOperations', () => {
  it('extracts named queries, mutations, and fragments', () => {
    const src = `
      query GetSuppliers { suppliers { id } }
      mutation UpdateSupplier { updateSupplier { id } }
      fragment SupplierFields on Supplier { id name }
    `;
    const ops = extractGqlOperations(src);
    expect(ops).toContainEqual({ type: 'query', name: 'GetSuppliers' });
    expect(ops).toContainEqual({ type: 'mutation', name: 'UpdateSupplier' });
    expect(ops).toContainEqual({ type: 'fragment', name: 'SupplierFields' });
  });

  it('captures anonymous operations', () => {
    const ops = extractGqlOperations('query { me { id } }');
    expect(ops).toEqual([{ type: 'query', name: '(anonymous)' }]);
  });

  it('ignores GraphQL comments', () => {
    const ops = extractGqlOperations('# query NotReal\nquery Real { x }');
    expect(ops).toEqual([{ type: 'query', name: 'Real' }]);
  });

  it('deduplicates repeated operations', () => {
    const ops = extractGqlOperations('fragment A on T { x }\nfragment A on T { x }');
    expect(ops).toHaveLength(1);
  });
});
