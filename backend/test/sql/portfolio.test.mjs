import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase, readMigration } from './harness.mjs';
let db;
const owner = '11111111-1111-1111-1111-111111111111';
before(async () => {
  db = await migratedDatabase();
  await db.query(
    'insert into auth.users(id,raw_user_meta_data) values($1,\'{"role":"provider"}\')',
    [owner],
  );
  await db.query(
    "insert into provider_profiles(profile_id,category_id,bio) values($1,1,'Experienced provider with home repair skills')",
    [owner],
  );
});
after(async () => db.close());
it('uses private image storage and denies user-scoped table reads', async () => {
  assert.equal(
    (
      await db.query(
        "select public from storage.buckets where id='provider-portfolio'",
      )
    ).rows[0].public,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select relrowsecurity from pg_class where oid='provider_portfolio'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  assert.equal(
    (
      await db.query(
        "select * from pg_policies where tablename='provider_portfolio'",
      )
    ).rows.length,
    0,
  );
});
it('refuses a foreign image path, empty caption, invalid order or missing provider', async () => {
  for (const [path, caption, position] of [
    ['foreign/photo.jpg', 'Work', 0],
    [`${owner}/photo.jpg`, ' ', 0],
    [`${owner}/photo.jpg`, 'Work', -1],
  ])
    await assert.rejects(
      db.query(
        'insert into provider_portfolio(provider_id,image_path,caption,position) values($1,$2,$3,$4)',
        [owner, path, caption, position],
      ),
    );
});
it('refuses entries without a provider profile', async () => {
  await assert.rejects(
    db.query(
      'insert into provider_portfolio(provider_id,image_path,caption) values($1,$2,$3)',
      [
        '22222222-2222-2222-2222-222222222222',
        '22222222-2222-2222-2222-222222222222/photo.jpg',
        'Work',
      ],
    ),
  );
});
it('persists order/caption/category, limits twenty entries and allows removal/replacement', async () => {
  for (let i = 0; i < 20; i++)
    await db.query(
      'insert into provider_portfolio(provider_id,image_path,caption,position,category_id) values($1,$2,$3,$4,1)',
      [owner, `${owner}/${i}.jpg`, `Work ${i}`, 19 - i],
    );
  assert.equal(
    (
      await db.query(
        'select caption from provider_portfolio where provider_id=$1 order by position,created_at,id',
        [owner],
      )
    ).rows[0].caption,
    'Work 19',
  );
  await assert.rejects(
    db.query(
      'insert into provider_portfolio(provider_id,image_path,caption) values($1,$2,$3)',
      [owner, `${owner}/21.jpg`, 'Extra'],
    ),
    /at most 20/,
  );
  await db.query('delete from provider_portfolio where image_path=$1', [
    `${owner}/19.jpg`,
  ]);
  await db.query(
    'insert into provider_portfolio(provider_id,image_path,caption,position) values($1,$2,$3,0)',
    [owner, `${owner}/21.jpg`, 'Replacement'],
  );
  await db.exec(readMigration('0044_provider_portfolio.sql'));
  assert.equal(
    (await db.query('select count(*)::int as count from provider_portfolio'))
      .rows[0].count,
    20,
  );
});
it('enforces RLS against direct authenticated reads and writes even with table grants', async () => {
  await db.exec(
    'grant select, insert on public.provider_portfolio to authenticated; set role authenticated;',
  );
  try {
    assert.equal(
      (await db.query('select count(*)::int as count from provider_portfolio'))
        .rows[0].count,
      0,
    );
    await assert.rejects(
      db.query(
        'insert into provider_portfolio(provider_id,image_path,caption) values($1,$2,$3)',
        [owner, `${owner}/direct.jpg`, 'Direct client write'],
      ),
    );
  } finally {
    await db.exec('reset role;');
  }
});
