import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');
const VIEW = 'admin_user_overview';

/**
 * `create or replace view` is append-only. Postgres refuses to drop or reorder
 * an existing column and answers 42P16, "cannot drop columns from view" — and
 * it only says so at apply time, against a real database, which is the worst
 * moment to find out.
 *
 * That is not hypothetical: migration 0023's first draft copied the select
 * list from 0005 without noticing 0014 had appended `suspended_until` and
 * `suspension_reason` to it. Copying the older list silently meant "drop those
 * two", and the push failed halfway through a production deploy.
 *
 * So this walks every migration that redefines the view, in order, and asserts
 * each one starts with the previous one's columns unchanged. A migration may
 * only add to the end.
 */
function migrationsDefiningView(): { file: string; columns: string[] }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({
      file,
      sql: readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'),
    }))
    .filter(({ sql }) => sql.includes(`create or replace view ${VIEW} as`))
    .map(({ file, sql }) => ({ file, columns: selectedColumns(sql) }));
}

/** The view's output column names, in order, as the migration declares them. */
function selectedColumns(sql: string): string[] {
  const start = sql.indexOf(`create or replace view ${VIEW} as`);
  const body = sql.slice(start, sql.indexOf('from profiles p', start));
  return body
    .split('\n')
    .slice(1)
    .map((line) => line.split('--')[0].trim().replace(/,$/, ''))
    .filter((line) => line.length > 0 && !line.startsWith('select'))
    .map((expr) => {
      // "sc.name as category_name" -> category_name; "p.id" -> id
      const aliased = expr.split(/\s+as\s+/i);
      return (aliased[1] ?? aliased[0]).split('.').pop()!;
    });
}

describe('admin_user_overview', () => {
  it('is redefined by more than one migration, which is what makes this matter', () => {
    // If this ever drops to one, the append-only rule below is vacuous and
    // someone should check why the earlier definitions disappeared.
    expect(migrationsDefiningView().length).toBeGreaterThan(1);
  });

  it('is only ever appended to, never reordered or narrowed', () => {
    const definitions = migrationsDefiningView();

    definitions.forEach((current, i) => {
      if (i === 0) return;
      const previous = definitions[i - 1];
      expect({
        file: current.file,
        head: current.columns.slice(0, previous.columns.length),
      }).toEqual({ file: current.file, head: previous.columns });
    });
  });

  it('carries every column the API selects from it', () => {
    const latest = migrationsDefiningView().at(-1)!.columns;

    // AdminService reads the view for the Users page; AdminPlatformService
    // reads it for the admin list and for resolving an email to a profile.
    for (const column of [
      'id',
      'email',
      'full_name',
      'role',
      'deactivated_at',
      'created_at',
      'suspended_until',
      'suspension_reason',
      'deleted_at',
    ]) {
      expect(latest).toContain(column);
    }
  });
});
