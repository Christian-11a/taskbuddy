-- TaskBuddy schema — an admin-authored notification type
-- Source of truth: backend/BACKEND_SCHEMA.md §27.
--
-- RUN THIS FILE ON ITS OWN, BEFORE 0023 AND 0024.
--
-- Same constraint as 0018: Postgres will not let a new enum value be *used* in
-- the same transaction that adds it, and the Supabase SQL editor wraps a
-- script in one transaction. Apply this file, wait for it to commit, then
-- apply the rest.
--
-- Why 'announcement'
-- ------------------
-- Every notification_type so far names something the platform did on a user's
-- behalf: a recommendation was issued, an application changed state, a job
-- moved. `POST /admin/notifications/broadcast` (web/README.md, "Not yet
-- built") writes rows nobody's own activity produced — a maintenance window,
-- a policy change, a promotion. Filing those under 'job_update' would make
-- every "which of my jobs is this about?" consumer wrong, so they get their
-- own value instead.
--
-- Why 'wallet_update'
-- -------------------
-- A withdrawal request now waits for an admin (0024), so for the first time
-- something happens to a user's money that no job of theirs explains. The
-- notification that carries the payout reference — or the reason it was
-- refused — has no job_id to attach to, which is exactly what makes it a
-- different type rather than another 'job_update'.

alter type notification_type add value if not exists 'announcement';
alter type notification_type add value if not exists 'wallet_update';
