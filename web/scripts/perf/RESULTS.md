# Admin console performance: results (2026-10-15)

How these were measured: a production build (`next build --webpack`) against `fake-api.mjs`
(5,000 users, 5,000 transactions, 12,000 bookings, 15,000 wallet rows, 60 ms latency per
response), in a browser, signed in, reloading `/admin/dashboard`. Request counts and bytes
come from the fake API's `/__stats`; timings come from the browser's resource timing.
Local machine, so absolute times are optimistic; the request and byte counts are what
matter on a real network. See `README.md` here for how to rerun.

| Measure | Before | After |
|---|---|---|
| Cold start: requests | 63 | 36 |
| Cold start: data downloaded | 5.26 MB | 2.62 MB |
| Cold start: time from first to last data response | about 2.9 s | about 0.6 s |
| OPTIONS preflights per cold start | 61 | 0 |
| One 30 s live refresh | 60 requests, 5.08 MB | 7 requests, 0.43 MB |
| JavaScript parsed before the dashboard starts (decoded) | 1,309 KB | 867 KB |
| Opening a screen from the sidebar (rows visible) | not measured before | 65 to 175 ms |

Per fix (each measured on its own commit):

| Fix | Effect measured |
|---|---|
| Fetch list pages in parallel, six at a time | data window 2.9 s to 1.1 s |
| No custom headers on GET (no preflight) | preflights 61 to 0 |
| Users off the 30 s tick, loaded behind the console | refresh 5.08 MB to about 3 MB; exposed a duplicate users read, fixed later |
| Recharts loaded lazily | initial JavaScript 1,309 KB to 867 KB; the 403 KB charts chunk arrives after the data |
| Disputes read without downloading every transaction | refresh 3 MB to 0.56 MB (8 requests) |
| One users read per console load | cold start 94 requests to 36 |
| Pending-only verifications on the tick | refresh 0.56 MB to 0.43 MB |

Not fixed, for later:
- Disputes (all rows) are still re-read on every tick (about 345 KB at 200 disputes).
- Every list is still downloaded in full: there is no incremental read (`updated_since`) on the backend.
  Lists over 5,000 rows are cut at 5,000 with a console warning (they used to fail the whole load).
- Two silent refreshes can run back to back when a tab becomes visible again.
- The Users page filters in the browser, so it needs the whole users list.
