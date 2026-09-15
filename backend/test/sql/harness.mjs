/**
 * Runs the real migrations against a real Postgres — PGlite, Postgres compiled
 * to WebAssembly, in-process, no server or Docker.
 *
 * The jest suites mock supabase-js and so cannot see SQL at all:
 * job-lifecycle.spec.ts even says so ("the triggers are transcribed ... not
 * executed"). Migration 0028 moved the money moves themselves into SQL
 * functions, and a transcription of those would prove nothing. This executes
 * them.
 *
 * Supabase provides a few things plain Postgres does not — the auth and
 * storage schemas and the anon/authenticated/service_role roles — so they are
 * stubbed to the shape the migrations touch. 0025 is skipped: it needs pg_cron,
 * pg_net and Vault, none of which exist outside Supabase, and it creates no
 * table anything else depends on.
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations',
);

const SKIP = new Set(['0025_scheduler_cron.sql']);

const SUPABASE_STUBS = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  email_confirmed_at timestamptz
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select current_setting('request.jwt.claim.role', true) $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid, metadata jsonb
);
create function storage.foldername(name text) returns text[] language sql as
  $$ select string_to_array(name, '/') $$;
`;

export function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !SKIP.has(f))
    .sort();
}

export function readMigration(file) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

/** A fresh database with every migration applied, in order, each in its own transaction. */
export async function migratedDatabase() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of migrationFiles()) {
    try {
      await db.exec(readMigration(file));
    } catch (err) {
      throw new Error(`${file}: ${err.message}`);
    }
  }
  return db;
}
