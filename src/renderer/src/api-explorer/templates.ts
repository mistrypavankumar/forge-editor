import type { ApiTemplate } from './types';

const GLOBAL_SEARCH = `query Search($params: SearchParams!) {
  search(params: $params) {
    results {
      table
      id
      name
      recordType
      entityId
      productCode
      firstName
      lastName
      email
      entityName
      referenceName
      brandName
      familyName
    }
  }
}`;

const TRANSFER_ORDER_ROWS = `query GetTransferOrderRows($params: RowRequestInput!) {
  getTransferOrderRows(params: $params) {
    totalRows
    rows {
      id
      name
    }
  }
}`;

const INTROSPECTION_TYPENAME = `query Typename {
  __typename
}`;

/** Predefined starting points. Edit freely before running, or scaffold from the Schema tab. */
export const API_TEMPLATES: ReadonlyArray<ApiTemplate> = [
  {
    id: 'global-search',
    name: 'Global Search',
    description: 'Search across tables (e.g. shipments).',
    category: 'Search',
    query: GLOBAL_SEARCH,
    variables: JSON.stringify({ params: { tables: ['SHIPMENT'], query: 'DAX.' } }, null, 2),
  },
  {
    id: 'transfer-order-rows',
    name: 'Get Transfer Order Rows',
    description: 'Paginated transfer order rows (AG Grid row request shape).',
    category: 'Inventory',
    query: TRANSFER_ORDER_ROWS,
    variables: JSON.stringify(
      {
        params: {
          startRow: 0,
          endRow: 20,
          rowGroups: [],
          filterModels: [],
          sortModels: [],
          showDeleted: false,
        },
      },
      null,
      2,
    ),
  },
  {
    id: 'typename',
    name: 'Ping (__typename)',
    description: 'Minimal query to verify the endpoint + auth.',
    category: 'Utility',
    query: INTROSPECTION_TYPENAME,
    variables: '',
  },
];

export const DEFAULT_QUERY = API_TEMPLATES[0].query;
export const DEFAULT_VARIABLES = API_TEMPLATES[0].variables;

/** Default endpoint (the daxwell dev GraphQL server) — editable in the URL bar. */
export const DEFAULT_ENDPOINT = 'https://dev.server.scm.daxwell.com/graphql';
