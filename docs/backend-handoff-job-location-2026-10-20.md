# Backend task: job location follow-ups JL-1 to JL-5 (TaskBuddy)

Written 2026-10-20. Self-contained. Code is `backend/` on `main` (live `/health` commit `1b25d454`, which includes UAT-B2 `db24614b`).

## Why

A client tapped "Use my current location", got `HSSi BTG 1 Hub, Lipa, 4217 BT, Philippines` and was refused at Post job with
"We couldn't match that address exactly". UAT-B2 (thank you) lets `POST /jobs` take the signed `location_reference`. The app now sends
it (`fix/job-location-reference`), so GPS and suggestion addresses post whatever Geoapify knows about the area. Five gaps remain on the
server. The product decision from the app owner: **the pin decides where the job is**. Typed text that Geoapify cannot place stays
strict, as it is today.

## Working rules

- Tests first, with the negative cases listed under each item.
- Show the real `npm test` output.
- Conventional Commits.
- A new numbered migration for schema (never edit an applied one).
- Update `BACKEND_SCHEMA.md` + `README.md` with any contract change.
- snake_case on the wire. `forbidNonWhitelisted` is on.
- No keys or `.env` values in commits or docs.

| ID | Severity | What | Done when |
|---|---|---|---|
| JL-1 | HIGH | A job posted at the saved home address is re-geocoded from text | posting at `profile.address` uses the stored profile point |
| JL-2 | MEDIUM | The location reference lasts 15 min; the 5-step job form with photos can outlast it | jobs accept a reference for ≥ 60 min |
| JL-3 | MEDIUM (product) | No place for house no./unit/landmark without breaking the pin | `POST /jobs` takes optional `address_details` |
| JL-4 | LOW | `GET /jobs/geocode` returns no reference, so a typed address is geocoded twice | it returns a `location_reference` |
| JL-5 | MEDIUM | A provider's typed address in Accept booking calls `/jobs/geocode`, which is `@Roles('client')` | a provider can verify a typed start address |

## JL-1. Place a job at the saved profile point

The job form prefills `profile.address` with the profile's coordinates. The app has no reference for it, so `JobsService.create`
forward-geocodes the text. A profile saved from GPS (`PATCH /profiles/me` with a reference) holds a reverse-geocoded label, the same
kind of text that fails. **Ask:** in `JobsService.create`, when there is no `location_reference`, the caller's profile has
`latitude`/`longitude`, and `dto.address.trim() === profile.address.trim()`, use the profile's stored point and skip `geocode()`. The
server wrote that point itself, so it is trusted. Meanwhile the app works around this: it asks `GET /geocoding/reverse` for the profile
point at post time and sends that reference if the text matches, which spends one Geoapify credit per post.

Tests:
- matching saved address → `geocode()` not called, the row has the profile's lat/lng;
- different text → `geocode()` called as today;
- a profile with no coordinates → `geocode()` called;
- whitespace differences only → still matches.

## JL-2. A longer reference lifetime for jobs

`issueLocationReference` signs for 15 minutes (`geocoding.service.ts`). The app renews a reference older than 12 minutes from the same
point, but a suggestion's point often reverse-geocodes to different text, and then the server falls back to geocoding the text.
**Ask:** issue references valid for 60 minutes (or accept job references up to 60 minutes). Keep the user and address binding.

Tests:
- 59 minutes → accepted;
- 61 minutes → 400 with the existing expiry message;
- profile behaviour unchanged, or deliberately the same 60.

## JL-3. Optional `address_details` on jobs (house no., unit, floor, landmark)

OpenStreetMap often has no house there. `resolveLocationReference` requires `address` to equal the signed text exactly, so the app has
to clear the pin the moment someone adds "Unit 2" to it. **Ask:**
- new migration: `jobs.address_details text null`, with a `CHECK` of length ≤ 120;
- `CreateJobDto.address_details?: string` (`@IsOptional() @IsString() @Length(1, 120)`), not geocoded and not part of the reference check;
- return it wherever the job's `address` is returned (job detail, provider feed/detail, bookings).

Once it is live, the app adds an "House no., unit or landmark (optional)" field under the address. Tell the mobile owner when it is
deployed: the app cannot send it before that (`forbidNonWhitelisted`).

Tests:
- saved and returned;
- 121 chars → 400;
- empty string → 400;
- a reference still resolves when `address_details` is set.

## JL-4. `GET /jobs/geocode` returns a reference

The app verifies a typed address on step 2 with `GET /jobs/geocode`, then the server geocodes the same text again at `POST /jobs` (two
credits, and the answer can change in between). **Ask:** return `issueLocationReference(user.id, result)` from `GET /jobs/geocode`, as
`/geocoding/autocomplete` does for precise rows. The app will send it once it is live.

Tests:
- the response carries `location_reference`;
- posting with it does not call `geocode()`.

## JL-5. Providers cannot verify a typed start address

The provider's Accept booking dialog (`AcceptBookingModal.tsx`) lets them pick a suggestion or use GPS, which works. If they **type**
an address and press Confirm, the app calls `GET /jobs/geocode`, which is `@Roles('client')` (`jobs.controller.ts`), so a provider gets
403 and the app says "We couldn't find that address". **Ask:** move the route to a path any signed-in user may call (like
`/geocoding/*`, e.g. `GET /geocoding/search`), or allow `provider` on it. Also consider letting `AcceptJobDto` take a
`location_reference`, as jobs do, so the accepted point is server-signed rather than client-supplied lat/lng.

Tests:
- a provider gets 200 with a point for a precise address;
- a provider gets the same 400 copy as a client for a vague one;
- throttling is unchanged.

## Not asked

Do not loosen `PRECISE_RESULT_TYPES` / `MIN_STREET_CONFIDENCE` for typed text. The app owner chose to keep typed addresses strict and
steer people to GPS, suggestions and (after JL-3) the details field.

## Report back with

- commit SHAs;
- `npm test` output;
- the deployed `/health` commit;
- a note to the mobile owner when JL-3, JL-4 and JL-5 are live.
