# Backend handoff — web admin requirements

**Updated:** 2026-10-01  
**Owner:** backend developer, with product decisions agreed with the web developer.  
**Scope:** web admin console only. Mobile requirements belong to their separate handoffs.

## Status and priority

These requests enable unavailable Settings features or improve existing search.
They are **not confirmed blockers of the working console**. The latest documented
read-only backend checks were on 2026-09-30; this handoff does not claim a fresh
deployment check or implementation of the requests below.

| Priority | Required work | Current web behavior |
|---|---|---|
| Feature requirement | Service Requests server-side search | Searches the complete selected-status queue locally; the old first-100 cutoff is removed. |
| Feature requirement | Admin notification configuration and delivery | Settings controls are disabled and labelled unavailable. |
| Feature requirement | Shared platform name and support email with actual consumers | These Settings fields are disabled; the separate Platform administration page still works. |
| Feature requirement | Data & Privacy configuration and behavior | Purge, retention and report-anonymization controls are disabled. |
| Additional improvement | Booking-title search | Existing ID, client, provider and category search works. |
| Additional improvement | Larger-queue pagination | Full-list helpers retain a 5,000-row safety limit; web changes are also required. |

Pending real admin-action tests are tracked separately in
[web Manual Verification](../web/README.md#manual-verification). Missing test
evidence is not automatically missing backend functionality.

## Shared Settings contract — required before enabling controls

The notification, platform and privacy requests below need server-persisted
configuration, not independent values in each browser.

- Agree which values are platform-wide and which are per-admin preferences.
  Platform-wide values must read consistently for all authorized admins;
  per-admin preferences must be scoped to the signed-in admin.
- Define read/update endpoints, validation, defaults and who may change each field.
  Proposed behavior here is a requirement, not an existing API contract.
- Define concurrent-edit handling. For example, a version check can reject stale
  updates and let the web reload instead of silently overwriting another admin.
- Audit configuration changes and return actionable authorization, validation
  and conflict errors. Do not return success when the requested behavior was not saved.

**Verification:** use two authorized admin accounts in separate sessions. Confirm
persistence after reload, correct shared/per-admin scope, rejected unauthorized
updates and the agreed outcome when both sessions edit the same configuration.

## 1. Service Requests server-side search

**Backend work needed:** extend `GET /admin/skill-requests` with provider/category
search. Apply search and status filters before pagination and return the matching
total with a stable page order. Agree the query parameter and response contract
with the web developer; preserve existing callers.

**Web follow-up:** replace complete-queue loading/local search with server-filtered
pages, retaining loading, error, empty and stale-response handling.

**Verification:** a match beyond the first 100 records must appear; nonexistent
terms must return zero rows and total zero. Page totals must reflect the selected
status and search together, without duplicates or skipped records.

## 2. Admin notification settings and delivery

**Backend work needed:** implement configuration for the disabled admin alert
controls and daily summary. Agree recipients, event triggers and delivery channel;
define the summary schedule and timezone. The delivery worker must actually read
the saved configuration, and repeated processing must not send duplicate alerts.
Saving toggles without delivery behavior is not completion.

**Web follow-up:** connect and enable controls only after the configuration and
delivery behavior are supported. Keep failures visible instead of implying that
notifications are active.

**Verification:** trigger an agreed test event and a test summary. Confirm delivery
to intended recipients, disabled preferences suppress delivery, and retries do not
send duplicates. Verify the multi-admin scope agreed above.

## 3. Platform name and support email

**Backend/product work needed:** agree which screens, messages or services consume
these values. Persist shared configuration, validate updates and make those agreed
consumers use it. A stored value with no consumer is not a functioning feature.
An email field does not provision a mailbox; mailbox ownership/delivery remains a
separate operational requirement.

**Web follow-up:** connect the Settings fields and agreed web consumers. Do not
change the separate Platform administration page merely to enable these fields.

**Verification:** save a value, reload both admin sessions and confirm the agreed
consumers display/use it. Reject invalid values and unauthorized writes. Verify the
support mailbox separately before promising that support messages are received.

## 4. Data & Privacy settings

**Backend/product work needed:** agree rules before implementation for the visible
controls: inactive-account auto-purge (currently labelled one year), audit-log
retention (currently labelled 90 days), and report anonymization. These labels are
not approved deletion policy. Define inactivity, retention exceptions, permissions,
affected data and safeguards for wallet, escrow, disputes and required history.
Implement the agreed shared configuration and authorized retention/purge behavior.

**Web follow-up:** implement and test report-export anonymization, then connect only
verified controls. The web export transformation is web work; server policy and
scheduled deletion are backend work. Keep unsupported controls disabled.

**Verification:** use isolated test fixtures for retention/purge; do not delete live
accounts as a documentation check. Confirm protected obligations/history remain,
unauthorized actions fail, and anonymized exports omit the agreed identifying
fields while retaining useful report totals. Test enabling/disabling each policy.

## Additional improvements — not current blockers

### Booking-title search

**Backend work needed:** extend `admin_list_bookings` to search `job.title` before
pagination and counting, preserving existing search fields and status counts.

**Web follow-up:** update the search hint and regression tests after support exists.

**Verification:** title-only matches appear on the correct pages; filtered totals
and status counts match the same search. Existing search behavior remains intact.

### Larger queues

**Joint backend/web work needed:** move affected views off full-list helpers before
queues approach their 5,000-row safety limit. Reuse existing server pagination where
available; add missing filters/counts only where necessary. The backend alone cannot
remove the web's full-list loading limitation.

**Verification:** use fixtures larger than the old limit and confirm every record
is reachable through pagination, totals are accurate, and search/filtering is done
before paging without requiring a full browser download.

## Completion handoff back to web

For each completed item, provide:

1. The agreed endpoint/query/response contract, defaults, permissions and scope.
2. Any migration/configuration needed and whether it is applied/deployed to the
   environment the web uses. A merged PR alone is not deployment proof.
3. Verification results, including errors and multi-admin behavior where relevant.
4. Remaining product decisions or limitations, without secret values.

The web developer will wire the supported behavior and run web regression/manual
checks. Then remove completed requests from the active README list and record the
change in the web changelog; retain a clearly dated completion note in this handoff.
