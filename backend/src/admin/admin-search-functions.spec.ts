import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0020_admin_search_functions.sql'),
  'utf8',
);

function functionBody(name: string): string {
  return (
    migration.match(
      new RegExp(`function public\\.${name}\\([\\s\\S]*?\\$\\$;`),
    )?.[0] ?? ''
  );
}

describe('admin search functions', () => {
  it('performs paginated booking search in a hardened SQL function', () => {
    const bookingSearch = functionBody('admin_list_bookings');

    expect(bookingSearch).toContain("set search_path = ''");
    expect(bookingSearch).toContain('from public.jobs as job');
    expect(bookingSearch).toContain(
      "job.id::pg_catalog.text ilike '%' || p_search_term || '%'",
    );
    expect(bookingSearch).toContain(
      'select pg_catalog.count(*) as total from filtered',
    );
    expect(bookingSearch).toContain(
      'pg_catalog.jsonb_agg(page.row order by page.sort_at desc, page.id desc)',
    );
  });

  it('performs paginated transaction search in a hardened SQL function', () => {
    const transactionSearch = functionBody('admin_list_transactions');

    expect(transactionSearch).toContain(
      "escrow.id::pg_catalog.text ilike '%' || p_search_term || '%'",
    );
    expect(transactionSearch).toContain(
      'from public.escrow_transactions as escrow',
    );
    expect(transactionSearch).toContain('from total left join page on true');
    expect(transactionSearch).toContain(
      'pg_catalog.jsonb_agg(page.row order by page.sort_at desc, page.id desc)',
    );
  });

  it('hardens every service-role function and preserves activity pagination', () => {
    for (const name of [
      'admin_list_bookings',
      'admin_list_activity',
      'admin_list_transactions',
    ]) {
      const body = functionBody(name);
      expect(body).toContain("set search_path = ''");
      expect(body).toContain('security definer');
    }
    expect(functionBody('admin_list_activity')).toContain(
      'from total left join page on true',
    );
    expect(functionBody('admin_list_activity')).toContain(
      'pg_catalog.jsonb_agg(page.row order by page.sort_at desc, page.id desc)',
    );
    expect(migration).toContain(
      'grant execute on function public.admin_list_bookings',
    );
    expect(migration).not.toContain('pg_catalog.coalesce(');
  });

  it('documents search on every searchable admin endpoint', () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');

    expect(readme).toContain(
      'GET /admin/bookings?search=&status=&category_id=&limit=&offset=',
    );
    expect(readme).toContain(
      'GET /admin/activity?search=&limit=&offset=&from=&to=',
    );
    expect(readme).toContain(
      'GET /admin/transactions?search=&status=&limit=&offset=',
    );
  });
});
