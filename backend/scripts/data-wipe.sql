-- Pre-release data wipe (handoff §4). DESTRUCTIVE: run only on the owner's
-- go-ahead, against the project you mean, after a backup.
--
-- Keeps: the schema, functions, triggers, the migration history,
-- configuration (service_categories, urgency_settings, platform_settings,
-- job_capacity_settings) and admin accounts. Removes every other account and
-- all marketplace data: jobs, proposals, payments and ledger rows, chats,
-- notifications, verifications, credentials, reviews, audit rows.
--
-- Storage files (photos, documents) are NOT removed here; empty the buckets
-- from the Supabase dashboard or storage API afterwards.
--
-- Dry run: run the first SELECT on its own to see what would go.

select
  (select count(*) from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'admin')) as accounts_to_remove,
  (select count(*) from public.profiles where role = 'admin') as admins_kept,
  (select count(*) from public.jobs) as jobs,
  (select count(*) from public.wallet_transactions) as ledger_rows,
  (select count(*) from public.escrow_transactions) as escrows,
  (select count(*) from public.notifications) as notifications;

begin;

truncate table
  public.admin_actions,
  public.bookings,
  public.chat_push_state,
  public.conversations,
  public.device_tokens,
  public.dispute_entries,
  public.disputes,
  public.escrow_transactions,
  public.job_applications,
  public.job_change_requests,
  public.job_status_history,
  public.job_tasks,
  public.jobs,
  public.linked_payout_accounts,
  public.messages,
  public.notification_broadcasts,
  public.notifications,
  public.oauth_handoffs,
  public.provider_credentials,
  public.provider_payout_accounts,
  public.provider_portfolio,
  public.provider_release_requests,
  public.provider_secondary_categories,
  public.provider_verifications,
  public.recommendation_candidates,
  public.recommendation_runs,
  public.reviews,
  public.skill_change_requests,
  public.stripe_events,
  public.wallet_transactions
restart identity cascade;

-- Accounts: everyone but admins. Profiles, provider profiles and settings go
-- with them (on delete cascade from auth.users).
delete from auth.users u
 where not exists (
   select 1 from public.profiles p where p.id = u.id and p.role = 'admin'
 );

-- What is left, for the record.
select
  (select count(*) from auth.users) as accounts_left,
  (select count(*) from public.profiles where role = 'admin') as admins_left,
  (select count(*) from public.service_categories) as categories_left,
  (select count(*) from public.jobs) as jobs_left;

commit;
