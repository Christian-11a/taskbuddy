# Perf harness: fake API for the admin console

`fake-api.mjs` is a standalone Node server (no dependencies) that answers the
admin console's API calls with seeded, realistic data. Use it to benchmark a
production build of the console without the real backend.

## Run the fake API

```
node web/scripts/perf/fake-api.mjs
```

It listens on `127.0.0.1:4600` (set `PORT` to change it). Startup takes about
0.3 s to generate the data.

## Build and start the console against it

`NEXT_PUBLIC_API_URL` is inlined at build time, so rebuild if the API port changes.

Git Bash:

```
cd web
MSYS_NO_PATHCONV=1 NEXT_PUBLIC_API_URL=http://127.0.0.1:4600 npx next build --webpack
npx next start -p 3100
```

PowerShell:

```
cd web
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:4600"
npx next build --webpack
npx next start -p 3100
```

Open **http://127.0.0.1:3100**, not `localhost`. The session cookies are set by
`127.0.0.1`, and only the `127.0.0.1` console is same-site with the fake API.

## Sign in

Any email and any non-empty password are accepted. The session user is an admin
named after the email's local part. Sessions live in memory, so a restart signs
everyone out.

## Environment knobs

| Variable        | Default    | Meaning                                                                  |
| --------------- | ---------- | ------------------------------------------------------------------------ |
| `PORT`          | `4600`     | Listen port on `127.0.0.1`                                               |
| `USERS`         | `5000`     | Users, including about 3 admins. Keep the non-deleted count at or below 5000 (see the caveat below) |
| `BOOKINGS`      | `12000`    | Jobs (bookings)                                                          |
| `TRANSACTIONS`  | `8000`     | Escrow transactions. Keep at or below 5000 (see the caveat below)        |
| `WALLET`        | `15000`    | Wallet ledger rows. About 10% are withdrawals                            |
| `DISPUTES`      | `200`      | Disputes                                                                 |
| `VERIFICATIONS` | `300`      | Provider verification submissions                                        |
| `LATENCY_MS`    | `60`       | Added to every response, plus 1 ms per 100 rows returned                 |
| `ANALYTICS`     | (unset)    | `fail` makes `GET /admin/analytics/summary` return 500, to exercise the in-browser fallback |
| `SEED`          | `20261015` | The same seed and sizes always produce the same data                     |

## Caveat: the console's 5,000-row ceiling

`fetchAllRows` in `web/src/lib/services/index.ts` pages a list 200 rows at a
time for at most 25 pages (`MAX_LIST_PAGES`), so it stops at 5,000 rows and
throws `List from ... exceeds 5000 rows`. With the default `TRANSACTIONS=8000`,
the startup load fails at `GET /admin/transactions`. That read is shared with
`getDisputes`, so the whole initial load fails. Use `TRANSACTIONS=5000` (or
less) for a run that completes. The console code is not changed by this
harness, so this limit still applies to the real backend.

## Routes served

All routes return the wire shapes in `web/src/lib/api/types.ts`.

- Auth: `POST /auth/admin/login`, `GET /auth/admin/session`, `POST /auth/admin/refresh`, `POST /auth/admin/logout`
- Lists (`limit`, `offset`, `total`, with filters): `GET /admin/users` (`status`, `role`, `verification`, `search`), `/admin/verifications`, `/admin/disputes`, `/admin/bookings` (`status`, `category_id`, `search`, plus `status_counts`), `/admin/transactions` (`status`, `search`), `/admin/wallet-transactions` (`kind`, `status`, `search`), `/admin/withdrawals` (`status`), `/admin/skill-requests` (`status`, `search`), `/admin/audit` (`action`, `actor_id`, `search`, `from`, `to`), `/admin/activity` (`search`, `from`, `to`)
- Single items: `GET /admin/bookings/:id`, `GET /admin/jobs/:id/conversation`
- Plain reads: `GET /admin/analytics/summary`, `/admin/maintenance`, `/admin/commission`, `/admin/categories`, `/admin/admins`, `/admin/platform-identity`, `/admin/job-capacity`, `/settings`
- Writes (in-memory state): `PATCH /admin/maintenance`, `PATCH /admin/commission`, `PATCH /settings`, `POST /admin/notifications/broadcast`

Any other route returns 404. Other writes the console can make (suspend, approve,
resolve, and so on) also return 404, so do not click through them while
benchmarking.

Writes that need a session also need the `X-CSRF-Token` header, as the console
sends. Limits above 200 are clamped to 200. `GET /admin/skill-requests` returns
400 above 100, which matches its backend DTO.

## Request log and stats

Each request is one JSON line on stdout:

```
{"t":"...","method":"GET","url":"/admin/users?limit=200&offset=0","status":200,"rows":200,"bytes":77000,"ms":62.1}
```

- `GET /__stats` returns `{since, requests, bytes, routes}`, where each route has `count`, `bytes` and `rows`. Preflight requests are counted under `OPTIONS <path>`.
- `POST /__reset` clears the counters.

Server startup messages go to stderr.

CORS allows `http://localhost:*` and `http://127.0.0.1:*` origins with
credentials. Preflight answers `Content-Type` and `X-CSRF-Token`. Browsers
cache preflights for 600 s (`Access-Control-Max-Age`).

## Expected startup requests

A console load after sign-in, with `TRANSACTIONS=5000` and the other defaults.
Measured with a replay of the same reads (`GET /auth/admin/session` included):

| Request                                   | Calls | Bytes     |
| ----------------------------------------- | ----- | --------- |
| `GET /admin/users` (pages of 200)         | 25    | 2,104,826 |
| `GET /admin/users?status=deleted`         | 1     | 52,727    |
| `GET /admin/verifications`                | 2     | 196,025   |
| `GET /admin/disputes`                     | 1     | 345,701   |
| `GET /admin/transactions` (pages of 200)  | 25    | 2,580,262 |
| `GET /admin/activity`                     | 1     | 3,571     |
| `GET /settings`                           | 1     | 237       |
| `GET /admin/maintenance`                  | 1     | 93        |
| `GET /admin/analytics/summary`            | 1     | 39,165    |
| `GET /admin/withdrawals?limit=1` (count)  | 1     | 452       |
| `GET /admin/skill-requests?limit=1` (count) | 1   | 367       |
| **Total**                                 | **60 + session** | **about 5.3 MB** |

The console also sends `OPTIONS` preflights, and browsers may send one per
distinct URL on a cold cache. Those are counted separately in `/__stats`.

With the default `TRANSACTIONS=8000` the transactions reads grow to 40 calls
and about 4.1 MB, and the load fails at the 5,000-row ceiling described above.
