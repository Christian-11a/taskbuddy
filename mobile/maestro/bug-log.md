# Bug log

Defects found during the mobile test sweep. Per the method in
`docs/superpowers/specs/2026-08-27-maestro-e2e-testing-design.md` §2: a defect
is fixed immediately only when it blocks further testing; everything else is
logged here and triaged per phase.

**Product defects** — bugs in the app, not the test harness — are the entries
below. Findings that only affect how flows are written (selector traps,
emulator setup) live in [`README.md`](./README.md) under "Known selector
traps"; there are 10 of them and they are not repeated here.

---

## BUG-001 — Any non-JSON error response reaches the user as "JSON Parse error"

**Found:** 2026-08-27, Phase 0 (while creating test accounts)
**Status:** open — logged, not fixed (did not block testing)
**Severity:** low impact per-incident, but it is the *only* thing the app says
when the backend is unreachable, so it is what a user sees during any outage.

### Steps

1. Point the app at a backend that answers with HTML rather than JSON. Any of
   these do it: a suspended Render service, a 502/504 from a proxy, a
   captive-portal wifi login page, or a CDN error page.
2. Open the app and submit any form that calls the API — registration is how
   this was found.

### Expected

A message that tells the user what to do: that the service is unreachable and
they should try again later. `api.ts` already has the right vocabulary for this
— the `catch` around `fetch` produces *"Cannot reach the server. Check your
connection and try again."*

### Actual

The red form error reads:

```
JSON Parse error: Unexpected character: <
```

The `<` is the first character of `<!DOCTYPE html>`. The message is
meaningless to a user and actively misleading to a developer — it looks like a
malformed API contract rather than "the server is down."

### Cause

`mobile/src/lib/api.ts:577-578`, in `rawRequest`:

```ts
const text = await response.text();
const data = text ? JSON.parse(text) : null;
```

`JSON.parse` is unguarded and runs *before* the `response.ok` check below it.
A non-JSON body therefore throws a raw `SyntaxError` out of `rawRequest`,
bypassing the `ApiError` path entirely — so it carries no status code, is not
recognised by any `instanceof ApiError` handler, and the 401-refresh-and-retry
logic in `authRequest` never sees it either.

The network-level `catch` around `fetch` is not reached, because the request
*succeeded* at the transport layer: the server responded, just not with JSON.

### Suggested fix

Wrap the parse and convert a non-JSON body into an `ApiError` carrying the real
status, so every caller keeps its existing error handling:

```ts
const text = await response.text();
let data: unknown = null;
try {
  data = text ? JSON.parse(text) : null;
} catch {
  // A non-JSON body means an error page from something between us and the
  // API — a suspended host, a proxy 502, a captive portal. The transport
  // succeeded, so the fetch catch above never fires; without this the raw
  // SyntaxError escapes as "JSON Parse error: Unexpected character: <".
  throw new ApiError(
    response.ok
      ? 'The server returned an unexpected response.'
      : 'The server is unavailable right now. Please try again shortly.',
    response.status,
  );
}
```

### Evidence

Screenshot: `~/.maestro/tests/2026-08-28_001636/00_setup_register_client/screenshots/step-040-assertCondition-Check_your_email.png`
— registration form correctly filled, all consents ticked, with the JSON Parse
error rendered where the submit error goes.

Confirmed server-side at the same time:

```
$ curl -sI https://taskbuddy-1d48.onrender.com/health
HTTP/1.1 503 Service Unavailable
x-render-routing: suspend-by-user
Content-Type: text/html; charset=utf-8
```

### Note

The suspended backend that surfaced this is a separate, unrelated issue — an
infrastructure state, not a code defect, and not tracked here.

---

## Not yet triaged

Two items observed during Phase 0 that need a runtime check before they can be
written up honestly:

- **First tap after a cold launch is swallowed.** The Login screen paints
  before React attaches press handlers, so a tap landing in that window does
  nothing. Worked around in the flows (`waitForAnimationToEnd` + a guarded
  retry) and documented as a selector trap, but it is a real user-facing
  behaviour, not only a test artifact. Needs a judgement on whether the window
  is long enough for a human to hit.
- **`@react-native-community/datetimepicker` downgraded 9.1.0 → 8.4.4** as part
  of the SDK 54 realignment (see README, "If the app crashes instantly on a dev
  build"). `HOCreateJobScreen` uses it heavily with platform-specific Android
  behaviour. `npm run typecheck` passes, but that is type-level only — the
  picker has not been exercised at runtime since the downgrade. Check it early
  in the next session.
