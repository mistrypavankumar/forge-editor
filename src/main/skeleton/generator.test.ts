import { describe, expect, it } from 'vitest';
import { detectUiLibrary, findComponents, listComponents } from './detect';
import { generateSkeleton } from './generator';

const MUI_CARD = `
import { Card, CardContent, Typography, Button } from '@mui/material';

export function UserCard({ user }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">{user.name}</Typography>
        <Typography>{user.email}</Typography>
        <Button onClick={() => alert(user.id)}>Open</Button>
      </CardContent>
    </Card>
  );
}
`;

const MUI_TABLE = `
export function OrdersTable({ orders }) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>Order</TableCell>
          <TableCell>Status</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {orders.map(order => (
          <TableRow key={order.id}>
            <TableCell>{order.name}</TableCell>
            <TableCell>{order.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
`;

const TAILWIND_CARD = `
export function ProductCard({ product }) {
  return (
    <div className="rounded-xl border p-4">
      <img src={product.image} className="h-40 w-full rounded-lg object-cover" />
      <h2 className="mt-4 text-lg font-semibold">{product.name}</h2>
      <p className="text-sm text-gray-500">{product.description}</p>
    </div>
  );
}
`;

const MULTI = `
export function Header() { return <div>Header</div>; }
export function Body() { return <div>Body</div>; }
export function Footer() { return <div>Footer</div>; }
`;

const WITH_PROPS = `
import { Stack, Avatar, Box, Typography } from '@mui/material';
type Props = { user: { name: string; email: string; avatarUrl?: string } };
export function UserProfile({ user }: Props) {
  return (
    <Stack direction="row" spacing={2}>
      <Avatar src={user.avatarUrl} />
      <Box>
        <Typography>{user.name}</Typography>
        <Typography color="text.secondary">{user.email}</Typography>
      </Box>
    </Stack>
  );
}
`;

describe('component detection', () => {
  it('finds a single named component', () => {
    const c = listComponents('/x/UserCard.tsx', MUI_CARD);
    expect(c.map((x) => x.name)).toEqual(['UserCard']);
  });

  it('finds all components in a multi-component file', () => {
    expect(listComponents('/x/Layout.tsx', MULTI).map((c) => c.name)).toEqual([
      'Header',
      'Body',
      'Footer',
    ]);
  });

  it('detects a default-export arrow component using the file name', () => {
    const code = `const Foo = () => <div>hi</div>;\nexport default Foo;`;
    // export default of an identifier isn't a function literal; use the inline form:
    const inline = `export default function Widget() { return <div>hi</div>; }`;
    expect(listComponents('/x/Widget.tsx', inline)[0]).toMatchObject({
      name: 'Widget',
      isDefaultExport: true,
    });
    expect(findComponents('/x/Foo.tsx', code).map((c) => c.name)).toContain('Foo');
  });

  it('ignores non-component exports (no JSX)', () => {
    expect(listComponents('/x/util.tsx', `export function addNumbers(a, b) { return a + b; }`)).toEqual([]);
  });

  it('detects a forwardRef-wrapped component default-exported separately', () => {
    const code = `
import { forwardRef } from 'react';
const ListPageView = forwardRef(function ListPageView(props, ref) {
  return <div>{props.title}</div>;
});
export default ListPageView;`;
    expect(listComponents('/x/list-page-view.tsx', code)).toMatchObject([
      { name: 'ListPageView', isDefaultExport: true },
    ]);
  });

  it('detects memo- and React.forwardRef-wrapped arrow components', () => {
    const memo = `import { memo } from 'react';\nexport const Widget = memo((props) => <div>{props.x}</div>);`;
    expect(listComponents('/x/Widget.tsx', memo).map((c) => c.name)).toEqual(['Widget']);
    const fwd = `export const Field = React.forwardRef((props, ref) => { return <input />; });`;
    expect(listComponents('/x/Field.tsx', fwd).map((c) => c.name)).toEqual(['Field']);
  });
});

describe('UI library detection', () => {
  it('detects MUI from imports', () => {
    expect(detectUiLibrary('/x/UserCard.tsx', MUI_CARD)).toBe('mui');
  });
  it('detects Tailwind from className utilities', () => {
    expect(detectUiLibrary('/x/ProductCard.tsx', TAILWIND_CARD)).toBe('tailwind');
  });
  it('falls back to plain-react for JSX without a known library', () => {
    expect(detectUiLibrary('/x/Plain.tsx', `export function P() { return <div><span>hi</span></div>; }`)).toBe(
      'plain-react',
    );
  });
});

describe('MUI skeleton generation (Test 1)', () => {
  const r = generateSkeleton({ filePath: '/x/UserCard.tsx', code: MUI_CARD });
  it('names and classifies correctly', () => {
    expect(r.skeletonName).toBe('UserCardSkeleton');
    expect(r.uiLibrary).toBe('mui');
    expect(r.generationMode).toBe('static-analysis');
  });
  it('preserves layout containers and emits MUI Skeletons', () => {
    expect(r.code).toContain('<Card>');
    expect(r.code).toContain('<CardContent>');
    expect(r.code).toContain('<Skeleton variant="text"');
    expect(r.code).toContain('<Skeleton variant="rounded"'); // the Button
  });
  it('removes event handlers and business logic', () => {
    expect(r.code).not.toContain('onClick');
    expect(r.code).not.toContain('alert');
    expect(r.code).not.toContain('user.');
  });
  it('reports Skeleton as an import to add', () => {
    expect(r.importsToAdd).toContain('Skeleton');
    expect(r.fileImports).toContain('Skeleton');
  });
});

describe('MUI table skeleton generation (Test 2)', () => {
  const r = generateSkeleton({ filePath: '/x/OrdersTable.tsx', code: MUI_TABLE });
  it('preserves table structure and repeats rows', () => {
    expect(r.code).toContain('<Table>');
    expect(r.code).toContain('<TableHead>');
    expect(r.code).toContain('<TableBody>');
    expect(r.code).toContain('Array.from({ length: 4 })'); // repeated body rows
    expect(r.code).toContain('key={i}');
  });
  it('removes the .map business logic', () => {
    expect(r.code).not.toContain('orders.map');
    expect(r.code).not.toContain('order.name');
  });
});

describe('Tailwind skeleton generation (Test 3)', () => {
  const r = generateSkeleton({ filePath: '/x/ProductCard.tsx', code: TAILWIND_CARD });
  it('uses animate-pulse blocks and preserves outer layout', () => {
    expect(r.uiLibrary).toBe('tailwind');
    expect(r.code).toContain('className="rounded-xl border p-4"'); // outer layout preserved
    expect(r.code).toContain('animate-pulse');
    expect(r.code).toContain('bg-gray-200');
  });
  it('does not import MUI', () => {
    expect(r.code).not.toContain('@mui/material');
    expect(r.importsToAdd).toBeUndefined();
  });
  it('carries over image sizing classes', () => {
    expect(r.code).toContain('h-40');
    expect(r.code).toContain('w-full');
  });
});

describe('props component (Test 6)', () => {
  const r = generateSkeleton({ filePath: '/x/UserProfile.tsx', code: WITH_PROPS });
  it('preserves Stack direction/spacing and maps avatar + text', () => {
    expect(r.code).toContain('<Stack direction="row" spacing={2}>');
    expect(r.code).toContain('<Skeleton variant="circular"'); // Avatar
    expect(r.code).toContain('<Skeleton variant="text"'); // Typography
  });
});

describe('unsupported / edge cases', () => {
  it('rejects non-React files (Test 5)', () => {
    expect(() => generateSkeleton({ filePath: '/x/util.ts', code: 'export const a = 1;' })).toThrow(
      /only available for React component files/,
    );
  });
  it('asks the caller to choose when multiple components exist and none is named', () => {
    expect(() => generateSkeleton({ filePath: '/x/Layout.tsx', code: MULTI })).toThrow(
      /multiple components/,
    );
  });
  it('generates for a named component from a multi-component file', () => {
    const r = generateSkeleton({ filePath: '/x/Layout.tsx', code: MULTI, componentName: 'Body' });
    expect(r.skeletonName).toBe('BodySkeleton');
  });
});
