# TaskBuddy Full Exploratory Test 2 — Implementation Plan

Created: October 4, 2026 (Asia/Manila).

Status: Phases 1–9 are implemented and verified locally. Final local regression and affected-project README updates are complete; focused commits are recorded. Supabase migrations 0039–0045 and the Render API are deployed. The signed preview APK was built and installed. Phase 10 remains open for native/physical-device verification and the Vercel owner’s web deployment. Target-database lock overlap and rollback now pass. See the completion record and linked evidence for current results.

## Objective and working rules

Completely implement the behaviors requested in the new test report, phase by phase, while keeping TaskBuddy simple, correct, and maintainable.

- Follow the repository and user working agreements and the existing style of each file.
- Prefer the simplest correct implementation. Reuse existing APIs, components, services, and tooling before creating alternatives.
- Add abstractions only for demonstrated repeated use. Avoid speculative extensibility, extra configuration, new infrastructure, and unnecessary dependencies.
- Fail explicitly on invalid states and failed operations. Do not add silent fallbacks, speculative guards, or catch blocks that hide failures.
- Keep authorization, lifecycle rules, deadlines, and money movement authoritative on the backend/database. Mobile visibility alone is not enforcement.
- Keep each phase reviewable, with focused conventional commits and no AI attribution. Preserve unrelated local changes.
- Run the project's actual relevant tests, lint, and typechecks before declaring a phase complete. State missing commands and remaining failures explicitly.
- Verify actual behavior, not only implementation-shaped tests. Separate local tests, deployed integration checks, and physical-device evidence.
- Do not mark the entire plan complete until every requirement has implementation and appropriate verification evidence.
- Confirm before adding production dependencies, deleting files, rewriting history, making network calls, changing secrets or CI/deployment configuration, or modifying unrelated files.

## Sources and scope

Primary requirement source:

- [Full Exploratory Test 2 PDF](./Real-Full%20Manuscript_IOTG9.pdf): two pages. Despite its filename, this file is the new test report, not the thesis manuscript.
- [Full Test 2 screenshots](./Full%20Test%202/): 64 Android screenshots from October 3, 2026.

Supporting materials reviewed:

- [Earlier test PDF](../Test%20Documentation%20.pdf).
- [Earlier exploratory findings](../docs/manual_exploratory_test_documentation/Test_Documented_Bugs_Fixes_newImplementations.md).
- [Earlier verification statuses](../docs/manual_exploratory_test_documentation/Test%20Documentation%20Statuses.md).
- [Backend handoff](../HANDOFF.md), repository/app READMEs, and [backend schema](../backend/BACKEND_SCHEMA.md).
- Relevant mobile screens/hooks/API types, backend services, SQL migrations and tests, and admin dispute UI.
- [Wallet payout rail analysis](../docs/backend-handoff-wallet-payout-rail-spike.md) and [recovery-credit handoff](../docs/backend-handoff-recovery-vouchers.md).

The new report supersedes earlier requirement decisions where explicit. In particular, it requests dark mode, removal of redundant provider acceptance, and a three-day completed-work complaint window. Blank numbered PDF items do not define additional work.

This plan does not establish the deployed revision, APK identity, live migration state, payment-provider configuration, or current push/ML health. Historical handoff statements must be reverified before release work.

## Open decisions

D1 was answered on October 4: client hire confirms the booking; the provider starts actual work later. D6 was answered: hold escrow until the three-day warranty ends. D2–D4 were resolved by the user selecting the recommendations: provider-uploaded photos/captions visible to signed-in clients, readable steps/scrolling where needed, and a clearly labeled local payout simulator with receiving-account reconciliation. For Phase 2, the October 4 implementation go-ahead uses the documented D5 recommendation below; this was an implementation assumption, not a separate explicit policy selection.

| ID | Decision | Options / consequence | Blocks |
| --- | --- | --- | --- |
| D1 | Resolved: client hire confirms the booking | No second provider acceptance; provider explicitly starts actual work later, including future scheduled jobs. | Implemented locally in Phase 1 |
| D2 | May signup and policy content use steps/scrolling where necessary? | Permit steps and scrolling on small screens/enlarged text; or require one non-scrolling screen. Complete long content cannot universally fit while remaining readable. | Resolved: readable scrolling/steps accepted |
| D3 | What constitutes successful payout testing? | Verifiable sandbox demonstration; or actual bank/GCash delivery. | Resolved: local simulator; live rail remains external |
| D4 | What does portfolio contain? | Provider-uploaded photos/captions; completed-job summaries/reviews only; or completed-job photos with client permission. | Resolved: provider uploads, signed-in clients/owner |
| D5 | Which cancellations freeze escrow? | Every hired-job cancellation, including pre-start; or only cancellation after work starts. PDF Client #4 is broader than Shared #4b. | Phase 2 cancellation rules |
| D6 | Resolved: hold escrow until warranty ends | Hold payment for 72 hours after client completion confirmation; a timely open dispute blocks automatic release. | Phase 2 settlement and Phase 9 payouts |

For "complaint anytime," distinguish reporting a problem from disputing a payment. Specify the allowed job states and participant access during Phase 2; the three-day deadline applies to completed-work warranty complaints. Do not assume unassigned applicants are job participants or invent an unlimited payment-dispute window.

## Verified local baseline

Commands run during the October 4 planning review:

| Area | Command, from that area | Result |
| --- | --- | --- |
| Backend | `npm test -- --runInBand` | 599 passed |
| Backend SQL | `npm run test:sql` | 72 passed |
| Backend types | `./node_modules/.bin/tsc --noEmit` | Passed |
| Backend lint | `npm run lint -- --no-fix` | 10 errors |
| Mobile | `npm test -- --runInBand` | 79 passed; existing React act warnings |
| Mobile types | `npm run typecheck` | Passed |
| Mobile lint | No lint script | Unavailable |
| Web | `npm test` | 209 passed, 6 failed, 1 skipped |
| Web types | `./node_modules/.bin/tsc --noEmit` | Failed: undefined `f` |
| Web lint | `npm run lint` | 0 errors, 1 warning |

The web failure comes from a stray `f` at `web/src/context/AppContext.tsx:530` in an existing local edit. Backend lint errors are in `auth/google-redirect.spec.ts`, `auth/oauth-handoff.spec.ts`, `chat/chat.controller.ts`, `chat/chat.service.ts`, and `geocoding/geocoding.service.ts`. Record these as baseline failures; do not fold unrelated cleanup into feature changes.

Existing worktree changes include a deleted handoff file, a modified web AppContext, and untracked test/thesis/configuration materials. Preserve them. Refresh this baseline before implementation, since the workspace can change.

## Phase 0 — Baseline and requirement tracking

Goal: establish reproducible evidence before changing behavior.

- [x] Map each populated PDF item to the [verification matrix](./VERIFICATION_MATRIX.md), implementation/test pointers, and explicit integration/device evidence gaps.
- [ ] Record APK/build identity, mobile bundle, API revision, and migration state for the repeated test. External checks require confirmation.
- [x] Resolve the existing AppContext blocker while preserving surrounding local edits before depending on admin-console QA.
- [ ] Record answers to D1–D6 and refine the dependent acceptance criteria.
- [ ] Establish controlled client/provider/admin test fixtures for lifecycle, complaints, approved services, messages, and payments.

Track four independent verification states per requirement: code present, automated tests passed, deployed integration verified, physical-device verified. Screenshots alone do not establish the tested code revision.

Exit: reproducible baseline, identified blockers, and a traceable requirement checklist. Independent work may continue while product decisions remain open.

## Phase 1 — Hiring without redundant provider acceptance

Source: Core Flow, Provider #1. Depends on D1.

Previous behavior: client hire → provider acceptance → Start Job. Screenshots show Awaiting Provider and Booking Request Accept/Decline after hire.

- [x] Implement the agreed transition in wallet hire and card-funded hire.
- [x] For card hire, transition only after the authoritative funding webhook succeeds.
- [x] Ensure exactly one assigned provider, one escrow hold, competing-application rejection, and consistent booking/chat creation.
- [x] Remove redundant Accept Booking and Booking Request treatment for hired applicants.
- [x] Update both roles' job detail, Home, My Jobs/My Work, progress labels, status formatting, calendar, and notifications.
- [x] Keep checklist locked until Start Job, as required by the resolved D1 decision.
- [x] Define a reviewed compatibility/migration path for existing `assigned`/`confirmed` records. Preserve closed work and historical timestamps.

Likely files: `backend/src/applications/`, hire-funding/payment handlers, assignment triggers, `backend/src/jobs/`, both job-detail screens, provider Home/My Work, calendars, and shared status formatting.

Verification: wallet/card hire, insufficient funds, duplicate taps, concurrent competing hires, webhook replay, future schedules, and existing bookings. Both roles must agree on state without a second provider acceptance. State and money changes must remain consistent under failure.

Local exit reached: implementation and automated verification pass. The migration is not applied externally; deployed integration, rendered UI, and physical-device checks remain pending.

## Phase 2 — Complaints, cancellation review, appeals, and warranty

Sources: Core Flow Shared #3–4; Client #4. Depends on D5/D6 and Phase 1 semantics.

Baseline behavior: cancellation from `in_progress` freezes held escrow and opens a dispute. Completed complaints previously used seven days with immediate payout; the warranty portion is now implemented locally as described below. Migration 0041 and the case screens now support zero-budget complaints, participant evidence/appeals, admin clarification, and atomic reasoned decisions. Implementation is verified locally; deployment and device checks remain outstanding.

- [x] Rename provider Request Admin Review to File a Complaint across entry, form, and confirmation text.
- [x] Define complaint eligibility for both participants, separately from payment eligibility.
- [x] Support reporting problems without fabricating escrow for zero-budget/no-payment jobs.
- [x] Atomically cancel, freeze held money, and open/reuse a case for the agreed cancellation states.
- [x] Preserve job, task, message, photo, assignment, and payment evidence.
- [x] Show Payment under admin review on both sides of a cancelled disputed job.
- [x] Add case-linked statements/appeals from both participants with author and timestamp; include supported evidence where required.
- [x] Give admins both participants' statements, clarification requests, and a reasoned resolution in the dispute drawer.
- [x] Notify participants of case creation, information requests, and decisions.
- [x] Change completed-work filing to 72 hours from completion, enforced server-side (migration 0040; local tests).
- [x] Expose the server deadline to both mobile role screens to avoid divergent hard-coded windows.
- [x] Keep existing cases readable after filing eligibility expires.
- [x] Release/refund held money exactly once. Do not reopen already settled escrow to pay/refund twice.
- [x] Hold escrow until the 72-hour warranty ends; timely open complaints block automatic release. Historical settled payments stay settled.
- [x] Display recorded case activity; do not imply admin review occurred merely because a case is open.

Likely files: `backend/src/escrow/`, cancellation/dispute SQL, DTO/API types, filing/status screens, both job details, admin DisputesPage, wallet summaries, and notification routing.

Verification: authorized client/provider submissions; outsider refusal; zero-budget complaints; repeated cancellation; one open case; no automatic refund during review; evidence retention; exact warranty boundary; simultaneous completion/cancellation/resolution; duplicate decisions; settled-payment complaint without repeated settlement.

Exit: both parties can report and appeal, admins can review and decide, deadlines agree, and money/evidence remain consistent.

## Phase 3 — Notifications, routing, and foreground updates

Sources: Core Flow Shared #2; Provider #3; UI/UX Shared #4.

Current behavior: SQL creates a recipient notification per inserted chat message, including photo-only messages. Service approval/rejection notices exist. Phase 3 now provides chat/service-request/case destinations, one authenticated foreground subscription, and shared notification lists/counts. Verification below is local; physical-device checks are outstanding.

- [x] Verify one recipient notification per persisted message; do not add duplicate notification producers.
- [x] Preserve job/conversation/message identifiers.
- [x] Add service-request submission acknowledgement; preserve approval/rejection notices and include request ID/decision note.
- [x] Surface notification persistence failures explicitly.
- [x] Route message taps to chat and service-request taps to My Services.
- [x] Add one authenticated foreground subscription shared across screens using existing NestJS SSE and `react-native-sse` conventions.
- [x] Update unread count, lists, and Home activity without manual refresh.
- [x] Synchronize read/delete/clear actions immediately.
- [x] Reconcile on reconnect/foreground and clean up on logout/account change.
- [ ] Verify native in-app bell/list updates and reconciliation after app return. Android system push is outside the selected current-stack scope.

Tradeoff: existing SSE polls the database behind the stream. Reusing it minimizes complexity and dependencies; measure query load rather than introducing another realtime platform speculatively.

Verification: two accounts/devices; text and photos; bursts; no self-notification; submission/approval/rejection; tap destinations; unread/read/delete synchronization; reconnect; expired session; account switching; app return.

Exit: required events create notices exactly once, taps reach the correct destination, and foreground badges update automatically.

## Phase 4 — Approved services and profile location saving

Sources: UI/UX Provider #2; Core Flow Client #3.

### Approved services

- [x] Expose primary and approved secondary categories in relevant profile responses/types.
- [x] Render all approved services in My Services and appropriate profile views.
- [x] Exclude approved services from request choices.
- [x] Refresh request history/profile after decisions and foreground return.
- [x] Invalidate affected browse/profile data when services change.
- [x] Ensure category mutation and decision status cannot report inconsistent approval under competing/failing operations.
- [x] Preserve approved-secondary eligibility in browsing, applications, hiring, and matching.

Verification: admin approves Pedicure while provider uses the app; it appears without restart, persists on reopen, and permits eligible jobs. Pending/rejected services remain excluded.

### Location saving

Implemented locally: both edit-profile screens retain the selected location reference. The backend saves its exact server-resolved point without forward-geocoding the display label again. Manual-address precision checks remain intact.

- [x] Preserve resolved location with its displayed address; invalidate on manual edits.
- [x] Add an explicit backend-supported resolved-location save contract.
- [x] Prefer a short-lived server-issued reference binding label and coordinates rather than unchecked authoritative client coordinates.
- [x] Preserve the selected point instead of requiring its formatted label to survive another street lookup.
- [x] Keep manual-address validation explicit; do not globally weaken geocoding precision.

Likely files: AddressField, both edit-profile screens, profile DTO/service, geocoding responses, AuthContext and API types.

Verification: reported HSSi/Lipa address, autocomplete, GPS, edits after resolution, denied permissions, stale/mismatched resolution reference, and save/reload coordinate equality.

Exit: approved services are consistently visible and valid resolved locations survive saving.

## Phase 5 — Client job category filters

Source: Core Flow Client #1.

- [x] Add a service-category selector independent of status tabs.
- [x] Combine status/category selection and provide clear/reset behavior.
- [x] Retain selections and scroll position after opening a job.
- [x] Show accurate empty/loading/error states.
- [x] Use local filtering only if the endpoint returns the full list. For paginated/capped data, filter server-side before paging.

Verification: mixed categories/statuses, Active/Ongoing combinations, no matching rows, reset, and detail/back navigation.

Exit: clients can reliably isolate jobs by service category without losing the existing status filter.

## Phase 6 — Provider portfolio

Source: Core Flow Client #2. Depends on D4.

Selected behavior: provider-owned uploaded photos and captions, visible to signed-in clients and the owner; private storage and signed image URLs.

- [x] Implement the selected portfolio definition.
- [x] If provider-uploaded photos are required, add owned entries with image, caption, order, and optional service category.
- [x] Reuse signed-upload/image-validation conventions.
- [x] Add provider management and client read-only gallery from proposal profiles.
- [x] Define publication/visibility before selecting storage access.
- [x] Do not publish client job photos without the agreed permission model.
- [x] Cover empty/loading/upload-failure/removed-entry states.

Verification: create/manage/reopen an entry, client proposal-profile access, ownership/visibility enforcement, correct image opening, and permission enforcement if job photos are used.

Exit: the selected portfolio is usable and its visibility rules are enforced. If summaries/reviews are sufficient, verify and polish the existing surface without inventing a photo subsystem.

## Phase 7 — Signup, privacy, consent, and photo interactions

Sources: UI/UX Shared #1–3; Client #1–2; Provider #1. Layout depends on D2.

- [x] Remove the fourth government-ID consent checkbox and its signup validation.
- [x] Keep email registration and Google provider onboarding payloads/requirements consistent.
- [x] Review verification-specific acknowledgement placement; removal from signup must not accidentally remove the intended verification acknowledgement.
- [x] Size signup/policy surfaces using available height, safe areas, keyboard state, and font scale.
- [x] Eliminate clipping and retain complete policy text, including Your Rights.
- [x] Keep close/accept actions reachable; implement approved step/scroll behavior.
- [x] Reuse one full-image viewer for Step 5 review and provider job details, preserving existing client-detail image viewing.
- [x] Open the selected image correctly, preserve aspect ratio, support multiple images/close/Android Back, and show load failures explicitly.
- [x] Preserve form/job state when closing the viewer.
- [x] Remove Step 5 terms checkbox, validation, error-position handling, and draft dependency.

Verification: both signup roles; Google path; small/large screens; enlarged fonts; keyboard; gesture/three-button navigation; complete policy; multiple portrait/landscape photos; failed images; Back; posting without the removed checkbox.

Exit: agreed layouts are readable and complete, consent changes are consistent, and requested photo interactions work.

## Phase 8 — Complete mobile dark mode

Source: Core Flow Shared #1; overrides the earlier documented deferral.

- [x] Add app-level theme state using existing stored `dark_mode` preference.
- [x] Define semantic light/dark surfaces, text, borders, inputs, disabled controls, statuses, and overlays.
- [x] Migrate both Colors and V6Colors consumers; avoid a partial second theme system.
- [x] Replace static module-level color consumers with reactive styles where necessary.
- [x] Cover auth, both roles, shared modals, toast, keyboard, status bar, calendars, chat, and photo overlays.
- [x] Enable settings control when it changes the whole app.
- [x] Persist selection and present preference failures clearly.

Verification: rendered light/dark states, switch during navigation/modal display, restart, login/logout, readable contrast, and loading/error/disabled states. Existing mobile test/visual matrix must cover both palettes.

Exit: all mobile surfaces react consistently; theme does not stop at Settings.

## Phase 9 — Payout setup and withdrawal demonstration

Sources: Core Flow Shared #5; Provider #2. Depends on D3/D6.

Keep the existing distinct flows explicit:

| Flow | Current mechanism | Proof needed |
| --- | --- | --- |
| Card-funded job earnings | Stripe Connect charge-linked transfer | Account eligibility, transfer, and external payout status |
| Wallet withdrawal | Admin-reviewed request | Reservation, processing, settlement reference, receiving-system evidence |

- [x] Verify Connect onboarding and return-to-app refresh.
- [x] Render setup-required/incomplete/restricted/ready/processing/success/failure from authoritative responses.
- [x] Expose traceable payment/payout references.
- [x] Exercise withdrawal reservation, rejection, and settlement.
- [x] Prevent duplicate payouts and reuse of reserved funds.
- [x] Never label a created request as delivered money.
- [x] No automated wallet rail selected: the agreed local simulator demonstrates receiving records; charge-linked Connect payouts do not process arbitrary wallet balances.
- [x] Provide a receiving test account or clearly identified simulator with observable results. A funded mock card alone proves collection, not withdrawal delivery.

Verification: funded test balance, insufficient funds, reservation, duplicate request, provider failure, rejected payout, success, and receiving-system reconciliation. Obtain confirmation before external research/calls, configuration changes, or transactions.

Exit: the selected sandbox/live outcome is demonstrated with traceable evidence; simulated settlement is not described as real bank delivery.

## Phase 10 — Integration, release, and final regression

- [x] Run relevant tests/lint/typechecks after each phase; add meaningful SQL tests for transaction, concurrency, permission, deadline, and replay behavior.
- [ ] Verify state changes across client, provider, and admin together.
- [x] Add new migrations rather than rewriting already applied migrations.
- [x] Inspect remote history before migration work; reviewed 0039–0045 were applied/registered atomically without replaying older registry gaps.
- [ ] Review migrations → deploy API → release web/mobile → verify integration → physical-device regression, with required confirmation before external operations.
- [ ] Rebuild the native app if native packages/plugins/permissions change; verify exact release artifacts regardless.
- [ ] Repeat all report scenarios on two role accounts/devices plus admin, covering small/larger screens, enlarged text, both Android navigation modes, foreground/background, and both themes.
- [ ] Capture expected outcome, automated result, deployed result, and new screenshot/transaction evidence for every populated PDF item.
- [x] Record unresolved failures and external/product blockers explicitly.

Exit: every requirement below is implemented and appropriately verified; no unsupported completion claim remains.

## Requirement coverage

| PDF section and item | Requirement | Phase |
| --- | --- | --- |
| Core Shared #1 | Dark mode | 8 |
| Core Shared #2 | Notification for each received message | 3 |
| Core Shared #3 | Provider File a Complaint wording | 2 |
| Core Shared #4a | Both participants can report complaints | 2 |
| Core Shared #4b | Cancellation dispute, escrow freeze, both sides appeal | 1, 2 |
| Core Shared #4c | Three-day completed-work complaint window | 2 |
| Core Shared #5 | Demonstrable withdrawal delivery | 9 |
| Core Client #1 | Job service-category filter | 5 |
| Core Client #2 | Provider portfolio | 6 |
| Core Client #3 | Save current-location address | 4 |
| Core Client #4 | Hired-job cancellation requires escrow review | 2; D5 |
| Core Provider #1 | No redundant provider acceptance after client hire | 1 |
| Core Provider #2 | Payout setup and withdrawals | 9 |
| Core Provider #3 | Service submission/approval/rejection notifications | 3 |
| UI Shared #1 | Remove fourth signup ID consent | 7 |
| UI Shared #2 | Complete, readable privacy policy | 7; D2 |
| UI Shared #3 | Signup fits agreed device layout | 7; D2 |
| UI Shared #4 | Notification bell updates without refresh | 3 |
| UI Client #1 | Tappable Step 5 review images | 7 |
| UI Client #2 | Remove Step 5 terms checkbox | 7 |
| UI Provider #1 | Tappable provider job photos | 7 |
| UI Provider #2 | Approved secondary service appears | 4 |

## Phase completion record

Current integration status as of October 4. The automated column retains each original phase gate; the latest full regression is linked in Phase 10. Historical updates below record earlier states and do not override this table.

| Phase | Status | Commits / implementation | Automated checks | Integration / device evidence | Remaining blockers |
| --- | --- | --- | --- | --- | --- |
| 0 | Baseline/product decisions established; external gates remain | Removed stray `f`; fixed 10 lint findings; preserved unrelated local edits | All local suites/types and backend/web lint pass | Existing API, database, EAS artifact and dummy roles identified | Vercel owner; native UI authorization; physical devices |
| 1 | Implemented; deployed wallet-hire cases pass | Migration 0039; hire notifications; confirmed-booking UI; legacy handling | Backend 599; SQL 76; mobile 82; backend build and mobile types pass; changed backend files lint clean | 0039 applied; funded future hire creates one confirmed booking; assigned provider starts later ([cases](DEPLOYED_WORKFLOW_EVIDENCE.json)) | Native hire/start UI; card-at-hire end-to-end checkout |
| 2 | Implemented; deployed review/deadline cases pass | Migrations 0040–0041; 72-hour warranty; cancellation response/review; zero-budget complaints; statements/evidence/appeals; admin clarification and atomic decisions | Backend 603; SQL 98; mobile 90; web 218 passed / 1 live test skipped; backend build, lint and types pass | 0040–0041 applied; participant/admin cases, cancellation expiry and warranty scheduler pass on controlled clocks ([deadlines](DEPLOYED_DEADLINE_EVIDENCE.json)) | Native complaint/review UI and device coverage |
| 3 | Implemented; deployed notices/SSE pass | Migration 0042; atomic service notices/decisions; consistent notification snapshots; shared foreground SSE; tap destinations; synchronized mutations | Backend 616; SQL 104; mobile 111; backend lint/build and mobile typecheck pass. Web baseline 218 / 1 live-only skip | 0042 applied; text/photo notices, badge/snapshot/SSE and service decisions pass ([chat](DEPLOYED_CHAT_EVIDENCE.json), [services](DEPLOYED_SERVICES_FILTER_EVIDENCE.json)) | Native visible bell/list/navigation, app-return reconnect and mutations; system push excluded |
| 4 | Implemented; deployed services/location APIs pass | Approved-service profile/display/refresh and feed invalidation; signed location references; migration 0043 strengthens assigned-category validation | Backend 627; SQL 109; mobile 134; backend lint/build and mobile typecheck pass; web baseline 218 / 1 live-only skip | 0043 applied; secondary-service browse/apply/hire and signed Lipa-area QA point save/reload pass ([evidence](DEPLOYED_SERVICES_FILTER_EVIDENCE.json), [location](DEPLOYED_LOCATION_EVIDENCE.json)) | Exact HSSi GPS; native refresh, manual-edit, permission and expiry scenarios |
| 5 | Implemented; deployed nonempty filters pass | Combined service/status filters, retained selection/scroll and complete bounded server-filtered pages | Backend 638; mobile 140; backend build/lint and mobile typecheck pass; SQL unchanged, 109 at Phase 4 gate | Combined category/status and distinct one-row pages pass ([evidence](DEPLOYED_SERVICES_FILTER_EVIDENCE.json)) | Native selection/scroll/detail-back retention and small screens |
| 6 | Implemented; deployed private portfolio pass | Private owned photos/captions, order/category, provider management and proposal-profile gallery | Backend 651; SQL 114; mobile 147; lint/build/types pass | 0044/private Storage applied; real owned PNG upload/edit/viewing and access checks pass ([evidence](DEPLOYED_PORTFOLIO_EVIDENCE.json)) | Native photo picker/gallery/viewer and device checks |
| 7 | Implemented; local gate passes | Three signup consents; readable policy; shared image viewer; no posting checkbox | Mobile 154; backend 651; types/lint/build pass | Verified preview APK installed; signup/policy/photo layout not yet verified natively | Small-screen/font/keyboard/photo/native-navigation matrix |
| 8 | Implemented; API preference persistence passes | Shared light/dark palettes; reactive screen/component factories; persisted settings; calendars/chat/keyboard/status bar/modal coverage | Mobile 174 tests / 40 suites; typecheck and diff check pass; mobile has no lint script | Both accounts persist independent theme settings ([evidence](DEPLOYED_THEME_SETTINGS_EVIDENCE.json)); physical appearance unverified | Native appearance/restart/account switching and full theme matrix |
| 9 | Implemented; receiving demo and API reservation pass | Authoritative Connect refresh; mandatory references; receiving simulator; migration 0045 debit reservation guard | Backend 656; SQL 120; mobile 184; web 219 / one live-only skip; lint/build/types passed where run | 0045 applied; selected local receiving demo, independent local SQL races and target concurrent API reservation/cancel pass ([withdrawals](DEPLOYED_WITHDRAWAL_EVIDENCE.json)) | Native payout/setup/history; target SQL lock overlap and rollback now pass ([evidence](TARGET_CONCURRENCY_EVIDENCE.json)) |
| 10 | Full local regression/README complete; final integration/device gates open | Release evidence/checklist prepared; focused implementation commits recorded | Backend 667; SQL 120; mobile 185; web 227 / one live-only skip; configured lint/types/build pass ([regression](LOCAL_REGRESSION_EVIDENCE.json)) | API/database deployed; APK signature/install verified; deployed cases recorded; no physical-device proof | Vercel owner release; adb UI authorization; physical role/device matrix |

## October 4 implementation evidence — Phase 0 / Phase 1

- Source revision at the start of implementation: `dcebaae` with existing local modifications. This identifies the local base only, not a deployed build.
- Fixed the stray `f` after `sendPasswordReset` in AppContext. The unrelated local comment edit remains intact.
- D1: confirmed at client hire, actual work starts later. No new dependency or infrastructure was added.
- Migration [0039](../backend/supabase/migrations/0039_confirm_jobs_on_hire.sql) replaces the shared application-acceptance trigger, creates scheduled/ASAP bookings and the participant chat atomically with assignment, rejects sibling applications, and promotes historical assigned records. Existing bookings, schedules, assignment dates and closed work are preserved.
- Both wallet and card-webhook paths still use the same application transition and existing escrow logic. Provider notifications now say Booking confirmed.
- Provider Home lists confirmed bookings as links to details. Details offer Start Job directly, including legacy assigned records. Checklist stays locked until actual start. Pre-start decline behavior remains unchanged pending D5.
- Client/provider status formatting treats legacy assigned records as Confirmed. My Work retains confirmed bookings under Active; existing client Ongoing and calendar filtering already include confirmed jobs.
- Legacy acceptance API/component remain available for older clients; the changed mobile screens no longer use the second acceptance flow.
- Real SQL tests cover both funding methods, hold replay, repeated acceptance, losing competing applications, future schedules, checklist permissions, migration reapplication, and historical promotion. PGlite executes SQL locally; this is not proof of concurrent transactions on the deployed Supabase instance.
- Mobile interaction tests cover confirmed-booking navigation, direct Start Job, no Accept Booking button, and legacy assigned records. Existing provider My Work/client job-detail tests also pass. No visual/device result is claimed.

### Local fixture reuse

Reuse these existing fixtures rather than introducing another test framework or duplicating setup utilities:

| Concern | Existing fixture / verification surface | Limit |
| --- | --- | --- |
| SQL lifecycle, escrow, messages, complaints, skills | `backend/test/sql/harness.mjs`, `fulltest-remediation.test.mjs`, `money.test.mjs`, new `hire-confirmation.test.mjs` | In-process database, stubbed Supabase schemas; no external payments or physical device |
| Cross-service wallet/card hiring and payout lifecycle | `backend/src/jobs/job-lifecycle.spec.ts` shared FakeDb | Mocked API/Stripe surface; real SQL tested separately |
| Provider hired-job UI and navigation | Provider Home, Job Detail, and My Work Jest fixtures | Rendered component interactions; not device layout |
| Admin disputes and service queues | `web/src/components/pages/DisputesPage.test.tsx`, `web/src/app/dev/admin-preview/mockApi.ts` | Mocked API; controlled live admin account still needed |
| Device accounts | `mobile/maestro/flows/00_setup_test_accounts.md` | Setup contains external writes; do not run until target test environment and permission are established |

### Latest checks

- Backend `npm test -- --runInBand`: 599 passed.
- Backend `npm run test:sql`: 76 passed.
- Backend `npm run build`: passed. Backend typecheck passed during baseline refresh.
- Backend full `npm run lint -- --no-fix`: the same 10 pre-existing errors. Changed application service/spec and lifecycle spec pass direct ESLint.
- Mobile `npm test -- --runInBand`: 82 passed; existing act warnings remain.
- Mobile `npm run typecheck`: passed. No mobile lint script exists.
- Web `npm test`: 215 passed, 1 skipped; `npm run lint` and TypeScript `--noEmit`: passed.
- `git diff --check`: passed.

Phase 2 cancellation scope (D5) and warranty payment timing (D6) were requested again during implementation. D6 is now answered: hold escrow until the three-day warranty ends. D5 awaits selection after the cancellation-policy recommendation. Later phases are not marked implemented.


### Phase 2 warranty implementation constraints (inspection only)

D6 requires changing both completion and the existing reconciliation sweep: `JobsService.complete` currently releases immediately, and `PaymentsScheduler.reconcileSettledJobs` can release held completed-job escrow after two minutes. Removing the inline release alone is insufficient.

Use the existing scheduler rather than adding another job runner. Enforce the 72-hour deadline and open-dispute exclusion atomically at settlement, using the same job/escrow locking order as dispute creation. The database must reject early automatic release even if an application-layer caller races or retries. Keep admin dispute resolution separate from automatic warranty settlement. Update both role screens, completion confirmation, payout timing, and boundary/race tests. This design is recorded; the warranty code has not been changed yet.


### D5 recommendation — proposed, awaiting selection

Researched with explicit permission on October 4. Recommended behavior:

- Before hire: cancel the listing; no assigned-provider payment decision.
- After hire, before Start Job: request cancellation and keep escrow held. Notify the provider, who has 48 hours to accept or contest. Acceptance or no response by the deadline refunds the client; contesting freezes payment and opens admin review. A timely already-open complaint blocks automatic refund. Reuse existing case/notification/scheduler mechanisms, avoid a new job runner or configurable policy framework.
- After Start Job: cancellation stops work and freezes escrow for admin review immediately. Both participants submit evidence; cancellation alone awards money to neither side.
- After client confirms completion: hold escrow for 72 hours (D6 confirmed). A timely open complaint blocks release until admin resolution; otherwise the existing scheduler releases payment after the deadline.
- Do not introduce cancellation fees or partial-payment formulas in this batch; neither is defined in the report. No response means no contest, not proof that work never occurred; show the deadline clearly and notify both participants.

This is a TaskBuddy product recommendation, not a claim of a universal marketplace rule. [Airtasker cancellation process](https://support.airtasker.com/hc/en-au/articles/360021358052-What-happens-when-I-cancel-a-task) provides a 48-hour accept/reject response window. [Airtasker dispute process](https://support.airtasker.com/hc/en-au/articles/360001291168-What-is-Airtasker-s-dispute-process) collects both parties' evidence for a reasoned decision. [Taskrabbit late-cancellation policy](https://support.taskrabbit.com/hc/en-us/articles/46260490101275-My-Task-was-Canceled-Why-Was-I-Charged) recognizes reserved provider time through a fee; TaskBuddy should not copy that fee without an agreed pricing policy.

D5 has not been accepted or implemented. Network research permission covered policy lookup only, not deployment, API/database modifications, or financial transactions.

### Phase 1 verification gate — October 4 rerun

Reran the actual project commands on the current working tree: backend 599 tests, SQL 76 tests, mobile 82 tests, and web 215 tests passed (one live web test skipped). Backend build, mobile typecheck, web typecheck and web lint passed. Direct ESLint on all changed backend TypeScript files and `git diff --check` passed.

Full backend lint still fails with 10 existing errors in `auth/google-redirect.spec.ts`, `auth/oauth-handoff.spec.ts`, `chat/chat.controller.ts`, `chat/chat.service.ts`, and `geocoding/geocoding.service.ts`. These files are outside Phase 1's changes. The working agreement requires confirmation before unrelated edits, so they were left intact. Phase 1 passes its local functional checks, but the repository-wide verification gate is not clean; Phase 2 implementation has not begun under the request to proceed only if everything is okay.

Migration 0039 remains local. Deployed database/API and physical-device verification remain outstanding; the rerun does not establish live behavior. D5 still needs a product decision; D6 is resolved as a 72-hour escrow hold.

### Verification gate cleared; Phase 2 warranty implementation — October 4

The user authorized fixing discovered issues. Fixed all 10 existing backend lint errors in the five auth/chat/geocoding files using the existing ESLint/Prettier configuration: formatting plus removal of an unnecessary fetch-mock assertion. Full backend lint now passes. Fixed the mobile Settings test warnings by waiting for the settings load to finish before assertions; production Settings behavior is unchanged.

Implemented the resolved D6 warranty model without a new dependency, scheduler, or payment infrastructure:

- Completion records the completed job and starts its 72-hour warranty; it no longer calls immediate escrow release. Provider messaging describes the hold, without claiming held payment for jobs without a budget.
- The existing payments sweep queries eligible completed jobs using `completed_at`, rather than releasing after two minutes. Cancellation reconciliation retains its existing behavior pending D5. Eligible rows are bounded and ordered oldest first.
- Migration 0040 guards held-to-released settlement under the job lock, followed by the existing conditional escrow update and ledger insert. Completion, the deadline and open complaints are checked in the database. Complaint creation uses the same lock order and accepts completed-work filings strictly before the 72-hour deadline. Disputed escrow can still be resolved by an admin before or after the deadline.
- Job responses expose `warranty_expires_at`; both mobile role screens use this deadline for complaint eligibility and display it. The completion confirmation explains that escrow remains held. Existing cases remain accessible after filing eligibility expires.
- Card payouts are scheduled only when escrow is released. Existing released/refunded payments are not reopened or moved by the migration. Automatic payout occurs on the first successful existing five-minute sweep after expiry, subject to batching and service availability.
- Real SQL tests verify early refusal, exact expiry, timely complaints, a stale held row with an open complaint, late filing refusal, admin resolution, commission/card-transfer state, payout replay and repeatable migration privileges. Updated older payout fixtures to represent completed jobs with an assigned provider.

Final local verification:

| Surface | Command | Result |
| --- | --- | --- |
| Backend | `npm test -- --runInBand` | 600 passed |
| Real migration/SQL tests | `npm run test:sql` | 83 passed |
| Backend build | `npm run build` | Passed |
| Backend lint | `npm run lint -- --no-fix` | Passed; all 10 earlier findings fixed |
| Mobile | `npm test -- --runInBand` | 84 passed; earlier act warnings fixed |
| Mobile types | `npm run typecheck` | Passed; no mobile lint script exists |
| Web, preceding Phase 1 verification | `npm test`, `npm run lint`, TypeScript `--noEmit` | 215 passed, one live test skipped; lint/types passed; web source unchanged in this batch |
| Whitespace | `git diff --check` | Passed |

These are local checks. PGlite exercises the actual SQL but does not prove contention on separate deployed database connections. Migrations 0039/0040, the updated API, scheduler operation on the target environment, payments and physical-device UI still require external verification. No external writes, deployment or production dependency changes were made.

Phase 2 is partial. D5 was requested again: the recommended pre-start 48-hour cancellation response versus admin review for every cancellation after hire. Cancellation changes, zero-budget complaints, participant statements/appeals, admin clarification and evidence exchange remain to be implemented and verified. Do not mark Phase 2 complete or proceed to Phase 3 before its remaining work is addressed.


### Phase 2 complete locally — October 4

The user's instruction to implement Phase 2 follows the documented cancellation recommendation. Implementation uses a 48-hour provider response window for client cancellation before work starts: held funds freeze, acceptance or expiry refunds once, and a contest routes the case to admin review. Cancellation after work starts requires admin review. Provider decline before starting refunds immediately unless an open complaint already blocks settlement. This policy is an implementation assumption following the go-ahead, not a separate explicit D5 selection.

Both assigned participants can file complaints during assigned/confirmed/in-progress/cancelled work; completed-work filing closes at the server's exact 72-hour warranty deadline. Zero-budget cases need no escrow. Existing cases stay readable, participants can submit statements or appeal, and their own job-chat text/photos can be linked as evidence. Recorded author/time activity replaces fabricated review milestones. Admins can request clarification and must give a resolution reason; no-payment/settled cases permit review without another money movement.

Migration 0041 keeps cancellation, settlement, decision history, audit, and notifications in database transactions with consistent job/case/escrow lock order. Case-linked message evidence is retained. Settled-case appeals preserve earlier decisions and cannot pay/refund twice. A deadline bug affecting appeals of admin-decided pre-start cancellation and truncation of complaint details were fixed and tested. Account deletion now checks open cases independently of escrow, so zero-budget complaints cannot strand a participant.

Local verification: backend Jest 603 tests; SQL/PGlite 98 tests; mobile Jest 90 tests; web Vitest 218 tests with one live-only test skipped. Backend lint/build, web lint/TypeScript, and mobile TypeScript passed. SQL tests cover authorization, exact deadlines, zero-budget cases, evidence ownership, migration replay, duplicate decisions, and rollback of financial changes when notification creation fails. PGlite does not establish multi-connection production race behavior.

Apply 0039, 0040, then 0041 before deploying the matching API. No database migration, API/web/mobile deployment, live payment operation, or physical-device validation was performed. Controlled integration checks still need two participants and an admin, real storage signed URLs, the expiry scheduler, and concurrent server requests. Phase 3 has not started. Earlier partial/blocking notes above are historical and superseded by this entry.


### Phase 2 verification gate and Phase 3 implementation — October 4

Fresh Phase 2 verification passed before Phase 3 work: backend Jest 603, SQL/PGlite 98, mobile Jest 90, web Vitest 218 passed with one live-only test skipped. Backend lint/build, mobile typecheck, web lint/TypeScript all passed. No live database, payment, deployed application, or device behavior was inferred from those results.

Phase 3 implements a single account-owned foreground notification context shared by Home and both notification screens. It reuses the installed `react-native-sse` package. `GET /notifications/stream` emits consistent snapshots, with pings when unchanged. The server runs one service-role `notification_snapshot` RPC every five seconds per connection; it returns the latest 50 rows and counts every unread row in one SQL statement. Polling does not overlap; unsubscribe stops polling. Foreground reconnect fetches a snapshot and refreshes expired tokens before opening SSE; rejected sessions stop retrying. Logout/account changes close the stream and discard old state. Old connection events and late REST results are ignored.

Read, delete, read-all and clear actions update shared rows/counts after successful persistence and reconcile once. The former permanent clear/delete masking state is removed, so newly arriving notifications remain visible. Failed API mutations show errors and leave shared state intact. A mutation completing after the account token changes cannot publish into the next account's context.

Chat notices route to the job's Chat screen; case notices route to Dispute Status; service-request notices route to provider My Services. Submission, approval and rejection notices include the request ID, status and decision note. My Services refreshes requests and cached primary service on relevant notices. Live and cold-start push taps use the same deduplication and routing rules. Push payloads carry a trusted recipient ID; foreign-recipient and legacy payloads without recipient context are ignored. Cold-start consumption waits for authentication, and delayed subscription setup is cleaned up safely.

Migration 0042 writes service acknowledgements/decision notices in a trigger and moves admin service decisions into `review_service_request`. The service change, request status, admin audit and decision notice commit together; injected notification failure rolls them all back. The API no longer duplicates trigger-generated notices. Text/photo message producers remain unchanged and real SQL verifies exactly one recipient notification with job/conversation/message IDs. Notification reads/mutations report database errors. Existing best-effort producers now log failed notification writes explicitly; they preserve already committed operations, and recommendation results report the actual persisted notice count. These logs do not constitute automatic repair of older partial operations.

Final local checks: backend Jest 616; SQL/PGlite 104; mobile Jest 111; backend lint/build and mobile typecheck passed. Web's Phase 2 baseline passed 218 tests (one live-only test skipped), lint and TypeScript; Phase 3 changes no web files. New tests cover snapshot scoping/counts, non-overlapping stream polling, database failures, service-notice rollback/replay, route destinations, expired-session refresh, reconnect/disposal, account switches, read/delete/clear synchronization, stale responses, service-screen refresh, push recipient payloads and opt-out handling. `git diff --check` passed. No production dependencies were added.

Apply migrations 0039 → 0040 → 0041 → 0042 before deploying the matching backend/mobile changes. Existing service-notification API producers must be replaced with this build to avoid duplicates after 0042. Live verification still requires two controlled accounts, text/photo bursts, navigation from in-app and background/cold-start pushes, token registration/opt-out, network interruption, and physical-device foreground/background transitions. Measure deployed SSE query load; the local tests prove the polling bound, not production throughput. No migration or deployment was performed. Phase 4 has not started.


### Phase 3 verification gate and Phase 4 implementation — October 4

Fresh Phase 3 checks passed before Phase 4: backend Jest 616, SQL/PGlite 104, mobile Jest 111, and web Vitest 218 with one live-only test skipped. Backend lint/build, mobile typecheck and web lint/TypeScript passed. Verification found a mutation race: an SSE snapshot started before read/delete/clear could restore older notification state afterward. Successful mutations now invalidate and close that connection, then reconnect and reconcile after the write. A delayed-event test proves the older snapshot is ignored.

Phase 4 exposes primary and approved secondary services in authenticated/public provider profile responses. My Services lists every approved service and excludes it from request choices; rejected/pending requests remain in history or review, without becoming offered services. Central notification handling refreshes provider profiles on request notices and foreground return; request history refreshes independently. Browse cache keys include the account and approved category set. Public profiles load current data on reopen/foreground. Older profile responses cannot overwrite a newer refresh or repopulate profile state after logout. An old browse request can no longer write into a newer cache key or repopulate an unmounted account cache.

The existing 0037 primary-service and hiring guards already serialize on the profile row; they are retained. Migration 0043 extends that existing assigned-job guard to category changes as well as provider assignment. Tests prove active-work approvals fail without changing request/audit state, stale applications cannot hire after a service change, and assigned-job category changes cannot bypass approved-service eligibility. Existing 0042 transactions preserve atomic service/status/audit/notification decisions and failure rollback.

Both Edit Profile screens retain a selected autocomplete/GPS reference and matching city, and discard the reference on manual address or city edits. Precise autocomplete and reverse lookup responses issue a 15-minute account-bound HMAC reference containing the label and exact resolved coordinates. The API verifies its signature, account, label, expiry and provided canonical city before saving; raw coordinates and invalid/null reference fields are rejected. The reference is never stored in profiles, and an expired or mismatched reference never silently falls back to geocoding. Signing uses a domain-separated key derived from the existing server-only Supabase service-role key; no dependency, new environment variable or key change is required. Instances with the same configured key can verify each other's references.

Manual-address validation retains the existing street precision/confidence requirements and legacy unchanged-address behavior. GPS coordinates are preserved rather than substituted with a nearby reverse-geocoder point. AddressField ignores a delayed GPS or autocomplete result after typing changes the query; erasing the input also clears lookup progress. Permission denial leaves manual entry available.

Final local checks: backend Jest **627**, SQL/PGlite **109**, mobile Jest **134** passed; backend lint/build, mobile typecheck and `git diff --check` passed. Mobile has no lint script. Web passed **218** with one live-only skip, lint and TypeScript during this turn's initial gate; Phases 3–4 add no web changes. New rendered component tests cover service lists, duplicate request choices, public-profile reopen, feed refresh, selected-point save payloads, city/address invalidation, expiry errors, permission denial and delayed results. HSSi/Lipa coordinates in unit fixtures are synthetic, not live location evidence.

Apply migrations 0039 → 0040 → 0041 → 0042 → 0043 before releasing the matching API/mobile changes. No migration, deployment, network lookup, financial operation or physical-device check was performed. Real PostgREST relationship responses, live Geoapify address/city results, device GPS, saved-coordinate reload on the target database, and separate-connection contention still require controlled integration verification. Earlier phase entries are historical; this entry records the current gate. Phase 5 is next.


### Whole-plan objective and Phase 5 verification — October 4

The user authorized completing the whole plan, verifying every phase before the next, then running final regression, updating each affected project's README, and committing in focused conventional batches. This supersedes stopping after one next phase. Product decisions and external evidence remain requirements rather than assumed completion.

Phase 5 adds a service-category selector alongside the existing All/Active/Ongoing/Completed/Cancelled status tabs. Clear filters resets both selections. Selection and vertical scroll remain in retained session state and restore after opening a job and returning. Filtered empty states explain how to change or clear filters; loading and request errors remain visible, and retry retains selections. Cache keys include the account, category and status.

`GET /jobs/mine` now accepts optional `category_id`, `status_group`, `limit` (1–100), and nonnegative `offset`. Ownership, category and grouped statuses are applied in the database before stable created-at/id ordering and paging. Database errors are surfaced. Callers without paging parameters retain the existing array contract. My Jobs fetches all matching results in sequential 100-row pages, avoiding a silent REST row cap without introducing another pagination state machine. This favors a simple complete per-client list; a later genuinely large workload can justify incremental display. A later page failure reports an error rather than presenting a partial result as complete.

Verification: full backend Jest **638** and mobile Jest **140** passed. Backend lint/build, mobile TypeScript and `git diff --check` passed. SQL is unchanged in Phase 5; the Phase 4 full SQL gate passed **109**. Web remains unchanged; its current-turn gate passed **218** with one live-only skip, lint and TypeScript. Meaningful tests cover status/category filtering before paging and owner scoping, invalid query bounds, combinations/reset, empty/loading/retry behavior, detail/back scroll restoration, a 1,101-row API result, and later-page failure. No new dependency or migration is needed for Phase 5. Deployment/device evidence remains pending.

The supporting documents explicitly leave photo portfolio publication undefined (`HANDOFF.md` §4), signup no-scroll acceptance unresolved, and payout receiving-system evidence unspecified. Three concise choices were requested before the dependent work. Phase 6's existing provider/public profiles, completed-work endpoint and signed upload/ownership/image validation conventions were inspected; no gallery schema or publication choice has been guessed. Phases 6–10, final regression, README updates and commits remain unfinished. The whole-plan goal remains active.


### Requirement traceability audit — October 4

Re-extracted both pages of the source PDF using the bundled PDF runtime and checked all 22 populated items against the coverage table. Added [VERIFICATION_MATRIX.md](./VERIFICATION_MATRIX.md) with actual implementation/test pointers for Phases 1–5 and explicit incomplete states for Phases 6–9. Verified every local link target exists. Integration and physical-device evidence remain pending on every row; fixture-based geocoding and payout collection are not counted as real GPS or receiving-account delivery. This completes the Phase 0 mapping task, not the whole plan.

The current source still leaves portfolio publication unresolved (`HANDOFF.md` §4). The pending portfolio, signup-layout and payout-demo questions have not been answered. No schema/publication choice, external call, deployment or transaction was inferred from automatic goal continuation. All earlier local phase gates remain recorded evidence; this documentation audit does not claim to rerun them.


### Product choices resolved — October 4

The user answered “use your recommendations.” D4: providers upload their own portfolio photos/captions, visible to signed-in clients; client job photos are not republished. D2: allow signup steps and policy scrolling where needed for complete readable content on small screens/enlarged fonts. D3: demonstrate wallet delivery using a clearly identified local simulator with receiving-account records and reconciliation; simulated results must not be described as live bank/GCash delivery. This answer resolves the pending dependent choices and authorizes resuming implementation. External network calls, production dependencies, deployment, secrets and real transactions still require separate confirmation under the working agreement.

### Phase 6 local gate — October 4

Backend lint/build and all 651 tests, SQL/PGlite 114 tests, and mobile typecheck/147 tests passed. Coverage includes ownership, client visibility, actual row-level read/write restrictions, image validation, 20-photo cap, replay, create/edit/remove, failed uploads, selected-image navigation and Android Back. Migration 0044 has not been applied externally. Removed entries stop receiving new URLs; previously signed URLs may remain valid for up to one hour. Storage objects remain private after metadata removal, matching the existing upload lifecycle.

### Phase 7 local gate — October 4

Mobile typecheck and all 154 tests passed; backend lint/build and all 651 tests passed. Tests exercise both email-signup roles and Google provider signup with three consents, all privacy sections including Your Rights, independent policy close/accept behavior, selected images on provider/client details, and a complete job-posting flow after opening/closing the second review photo without an additional terms acceptance. Shared gallery tests cover failed image/retry and Android Back callbacks.

The policy dialog sizes to available window height and safe-area insets, with its complete body scrollable and actions outside that body; signup retains keyboard-aware scrolling. The existing verification-specific privacy notice and hosted verification flow remain. Legacy optional backend biometric flags remain compatible with older apps; current signup UI/context no longer supplies them. Actual small-device/font/keyboard layout and Android gesture/three-button behavior remain pending device evidence. Phase 8 will migrate both palette families and static styles before enabling Dark Mode.

### Phase 8 local gate — October 4

Mobile typecheck and all 174 tests across 40 suites passed. Both Colors and V6Colors consumers now select the current palette; colored static styles were moved into local style factories. Shared settings control the whole app, with device restoration, authoritative account preferences, stale-response protection, write serialization, explicit failures and retry. Corrupt device preferences are reported without being silently replaced.

The gate includes rendered signup/dialog/gallery changes, both role calendars retaining their viewed month while repainting the library's cached styles, both chat screens preserving drafts and stream subscriptions, failed-save rollback, login/logout/account-switch restoration and semantic contrast checks in both palettes. Keyboard appearance, role/auth surfaces, overlays and status bars use the appropriate palette/foreground. Brand heroes and the photo viewer retain deliberate dark contrast surfaces. Mobile has no configured lint command; its actual typecheck/Jest commands were run. Physical rendering, native behavior and deployed preference persistence remain unverified. See [theme verification](./THEME_VERIFICATION.md) for the remaining device matrix. Phase 9 subsequently passed its local gate; see the evidence below.

## October 4 implementation evidence — Phase 9 / Phase 10 local gate

The selected [local simulator](./PAYOUT_VERIFICATION.md) demonstrates reservation,
single settlement, rejection and receiving-account reconciliation with matched
references. Receiver failures roll back both ledgers. The wallet debit guard in
new migration 0045 closes a verified overspending gap and shares the existing
wallet advisory lock. Admin settlement now requires a nonblank reference.
Provider history exposes ledger/settlement/Stripe references, reports load and
cancellation failures, and does not display failed transfers as spent funds.

Payout setup refreshes authoritative status on entry, browser return and
foreground; return URLs do not establish readiness. Copy reflects the 72-hour
warranty. Setup-state, expiry and failure tests passed. Final local checks: backend
656 tests and lint/build; SQL 120; mobile 184 and typecheck; web 219 with one
live-only skip plus lint/typecheck. Mobile has no lint script. Backend end-to-end
command exits with no tests found. Production web build subsequently passed after approved Google-font download.
Both Git remotes were fetched and their migration trees reviewed; target database
history remains unverified.

Affected root/backend/mobile/web/test-docs READMEs are updated.
[Release verification](./RELEASE_VERIFICATION.md) records outstanding remote
history, migration/release, cross-role deployed and physical-device gates.
Local simulator/component/PGlite checks do not close those gates.

## Phase 10 — Approved remote/build checks

User approval covered Git remote history and the existing web build/font download.
Both fetches succeeded; `npm run build` passed (optimized production compilation,
TypeScript, 38 generated pages). Origin main is `773003a`; upstream main is
`d9af9d4`. Origin adds merges of the prior handoff work. Upstream also contains
CSV-privacy/admin-settings work; neither adds migrations 0039–0045. No merge,
push, deployment or database call was performed. Target database history, controlled
release and deployed/device scenarios remain pending.

## Phase 10 — Approved target preflight

The existing linked Supabase/Render environment was inspected read-only with
user approval. [Target snapshot](TARGET_PREFLIGHT_EVIDENCE.json): registry gaps
remain, some unregistered older functions exist, 0039–0045/new guard functions
and portfolio bucket are missing, zero wallets are overreserved, one pending
withdrawal reserves ₱100, and one legacy paid request lacks a reference. Render
database is healthy; ML remains HTTP 429 and health exposes no exact API commit.
The preflight's CLI result-shape issue was fixed, all eight sections verified
locally, and SQL 120 passed. Definition review, history reconciliation, releases,
independent-connection verification and device evidence remain open.

Read-only function review subsequently completed: four 0036 admin functions and
wallet lock/balance match local definitions, while new hire/warranty/review
routines are not installed. The dated 0034 entry's exact text hash matches;
0032/0033 names match but text hashes differ. Older history must not be blindly
replayed or repaired. Proposed next approval is upstream integration plus only
new migrations 0039–0045, followed by separate release/integration/device gates.

## Phase 10 — Authorized release preparation and dedicated accounts

The user approved pending work using the existing Supabase/Render/Vercel
projects and sandbox payments only. Upstream was merged in `4a0dcdd`; web lint,
typecheck, tests and production build passed. Protected public-schema/data
backups completed; their scope and pending restore verification are recorded in
[release verification](RELEASE_VERIFICATION.md).

The supplied admin login and newly created dedicated QA client/provider API
logins and roles are verified. The dummy provider has a Cleaning profile and is
unavailable for real jobs. Credentials remain protected outside version control.
No funds or payments were created. Deployment remains blocked by the signed-in
Render/Vercel accounts lacking TaskBuddy project access. Migrations remain
unapplied until the matching API release can be coordinated. Earlier references
to pending release approval are superseded by this authorization; access and
verification evidence remain required.

## Phase 10 — Access retry and independent PostgreSQL verification

Render access is verified for the existing API and ML services; Vercel release
requires its project owner because the user has no access. The ML endpoint and
API now both report healthy; deployed Stripe key prefixes are test mode, without
payment attempts. Four independent-connection wallet checks passed on isolated
PostgreSQL 18. Protected public backup restore verified 28 table counts and two
sequences, then 0039–0045 passed on the restored target public schema/data.
See the release evidence for Supabase-extension/auth/storage limitations.

## Phase 10 — Applied database and matching API release

Reviewed 0039–0045 migrations/source registry committed atomically. Fork main
was fast-forwarded to `68feb6f`; Render reports that exact revision live.
Database/ML health and ten authenticated role/API smoke checks passed, and
maintenance is off. Full cross-role state changes/payment/device evidence and
Vercel owner deployment remain open. EAS archive inspection caught and fixed
credential-file inclusion before any upload; mobile typecheck/184 tests passed.

### October 4 — deployed sandbox review cases and corrective completion response

Render revision `15bc94a` fixes completion responses to include timestamps saved
by the database AFTER trigger. Backend lint/build and 667 tests pass. Actual
Stripe sandbox funds exercised warranty holds, complaints, admin statements and
refunds, appeal reopening, cancellation responses and no-budget review; see
[deployed evidence](DEPLOYED_WORKFLOW_EVIDENCE.json). Fixture provider flags were
restored and no live payment was used. Preview Android build `a5a067c2` finished
from mobile revision `efb0047`; device verification remains pending. The user
has no Vercel access, so web release requires the existing project's owner.
Phase 10 remains open for remaining deployed and device requirements.

### October 4 — service/location/filter and full regression pass

Real service submission/approval/rejection, exactly-once notices, persisted
secondary services and a secondary-service browse/apply/hire lifecycle passed.
Nonempty category/status pagination and signed Lipa-area location persistence
also passed. The existing scheduler expired/refunded a dedicated cancellation
with its deadline advanced for QA. See the linked evidence in
[release verification](RELEASE_VERIFICATION.md). Full local regression passes:
667 backend, 120 SQL, 185 mobile and 227 web tests, with one live-only web skip.
Phase 10 remains open: exact HSSi GPS, native UI/device coverage and Vercel owner
deployment are not proved. Native CUA cannot access the emulator; an explicit
adb UI automation choice is pending.

### October 4 — warranty scheduler verification

The existing scheduler released a dedicated completed fixture after its timestamp
was advanced past the 72-hour deadline. ₱42.50 provider payout plus ₱7.50
commission conserves the original ₱50 hold; replay produces no second payout.
Both participants' late complaint filings are rejected. This is a controlled
clock test of deployed scheduling, not elapsed real-world waiting time or
external receiving-account delivery. [Deadline evidence](DEPLOYED_DEADLINE_EVIDENCE.json)
records this alongside the automatic cancellation refund.

### October 4 — withdrawal reservation, preferences and Firebase preflight

Two simultaneous ₱30 requests against the dedicated provider's ₱42.50 balance
produced one accepted reservation and one refusal. Ownership, cancellation and
replay checks passed and the balance was restored. Both dummy accounts' theme
preferences also persist independently across a fresh login; original settings
were restored.

Static inspection of the exact installed preview APK finds no Firebase app/sender
resources, and app config has no `googleServicesFile`. The existing EAS FCM V1
credential status is not inferred from that client artifact. No Firebase project exists. The earlier request to create one was withdrawn; optional system push is outside scope. See
[push preflight](ANDROID_PUSH_PREFLIGHT_EVIDENCE.json). No Firebase account or
security permission was created. Native adb authorization is still pending.

### October 4 — notification scope correction: retain current stack

The user requires the existing stack and declines Firebase setup. Re-reading
and rendering both source PDF pages confirms Core Shared #2 asks for a notice
in the notification list for each received message, while UI Shared #4 asks
for a bell that updates without refresh. Neither item requests Android OS
background/closed-app push. Earlier Firebase/system-push release gates expanded
the requirement and are superseded: no Firebase project, FCM credentials or
native rebuild for Firebase is part of this plan.

The selected behavior uses stored Supabase notices, Render snapshot/SSE, the
shared Expo in-app list/bell and refresh on app return/reconnect. Native visual,
tap navigation, read/delete/clear and app-return checks remain required. Legacy
optional system-push code is not proof of these in-app requirements, and its
missing Firebase configuration does not block this selected scope.


### October 4 — active jobs and notification mutation verification

[Active-job API evidence](DEPLOYED_ACTIVE_JOB_EVIDENCE.json) confirms three owned
fixtures across two categories, combined active/category filtering, stable
one-row pagination, and exact uploaded photo bytes in provider job details.
All three unassigned jobs were cancelled afterward and disappear from active
results. Records and the public QA icon remain for traceability.

[Notification mutation evidence](DEPLOYED_NOTIFICATION_MUTATION_EVIDENCE.json)
confirms recipient ownership, read timestamp preservation on replay, individual
delete replay, mark-all-read, clear-all and zero unread count. Only the dedicated
QA provider's notices were cleared; the client snapshot remained unchanged.
Four QA messages remain in the controlled conversation. No new defect was found.

These checks exercise the deployed API, not native screens. Native filter/back
retention, photo taps, bell rendering, navigation and app return remain pending.
No device was connected at this checkpoint. No source code changed; the prior
full regression remains applicable. New evidence JSON and diff formatting were
validated. Vercel deployment remains with the project owner.


### October 4 — target database contention and rollback

[Target concurrency evidence](TARGET_CONCURRENCY_EVIDENCE.json) verifies the
deployed wallet-debit trigger on two independent PostgreSQL transactions. Each
attempted a PHP30 pending withdrawal debit against the dedicated QA provider's
PHP42.50 wallet. A third connection observed the second transaction blocked by
the first using `pg_blocking_pids`. Rolling back the first allowed the second
insert to finish. Both transactions rolled back; neither test ledger row
persisted and the available balance remained unchanged.

The existing Supabase CLI connection and its documented dump role were used;
no credential or database configuration changed. This test proves target lock
overlap and rollback recovery. The separate concurrent API case proves a
committed reservation rejects competing unaffordable spending. Cross-kind
withdrawal/escrow/Connect contention remains covered by local native PostgreSQL
tests. No external payment rail was invoked.


### October 4 — authorized adb emulator verification

The user approved adb UI control and confirmed web deployment follows their
upstream PR merge. Client signup/privacy, live bell, notification navigation and
mutations, filtered detail/back, persistent dark mode, photo selection/viewing
and posting without a terms checkbox now have native emulator evidence in
[NATIVE_EMULATOR_EVIDENCE.json](NATIVE_EMULATOR_EVIDENCE.json). The posted test
job was cancelled without a hire or payment.

Native QA found and corrected delayed initial chat scrolling (`cdb533f`), dark
hero/navigation contrast (`af243c3`), and remaining escrow wording (`8c5a498`).
The full mobile suite passes 187 tests/42 suites plus typecheck. Preview build
`6b051063-47b3-49ca-9bb4-2bb8112fa5ac` contains these fixes; native retests and
provider/layout coverage continue. No physical-device completion claim is made.

### October 5 — origin/main handoff

The user requested wrapping up and pushing the implemented work to origin/main.
Phases 1–9 are implemented. Phase 10 remains partially verified, not complete.
This checkpoint supersedes earlier pending adb permission and Firebase gates:
adb testing is authorized, and Firebase is outside the selected scope.

Native verification rejected the initial chat timing fix. Commit `90089f4`
uses an inverted message list; provider entry, keyboard visibility and sending
passed in preview APK `48aa549`. Provider greeting/navigation contrast also
passed. Commit `c5ebb83` replaces the known Stripe Connect configuration error
with actionable user copy. Commit `3aed1c6` fixes compact-screen login scrolling;
it passed with the development client at font scale 1.3. See
[NATIVE_EMULATOR_EVIDENCE.json](NATIVE_EMULATOR_EVIDENCE.json).

Remaining release verification: a final preview APK containing the latest fixes;
client chat/hero and escrow-copy retests; friendly payout-error retest; remaining
native hire/start, location permissions/persistence, app-return notifications,
and full layout/theme coverage. Physical GPS accuracy is not established by an
emulator. Stripe Connect is not enabled; sandbox ledger/simulator evidence does
not establish external bank delivery. Web deployment follows the user's upstream
merge. These are explicit handoff items, not claims of completed verification.

### October 5 — Phase 10 continuation

Client chat entry, greeting contrast, wallet warranty copy, app-return unread
refresh, and friendly provider payout setup failure passed on the development
client. Enlarged-text policy scrolling exposed a nested-Pressable gesture bug;
`5254c3d` separates the backdrop and dialog. Retention and full rights text now
scroll into view, with Close/Accept reachable. Mobile 188 tests and typecheck pass.
Final preview build `2d621778-db43-4f45-877b-352c92f5be61` was submitted with this fix.
Location permission denial passed; the emulator could not provide a usable GPS
fix, so native resolved-location saving remains unverified. Temporary emulator
location test providers were removed. Native hire/start and final APK verification
remain open. The user is evaluating an upstream merge before Phase 10 completes.
