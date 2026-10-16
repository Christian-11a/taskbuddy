-- Xendit (test mode) replaces PayMongo. Provider payouts are now real
-- sandbox payouts through Xendit's Payouts API rather than simulated rows.
--
-- 1. Each linked account carries the Xendit channel code it pays out to.
-- 2. pass_through_balances() can queue a provider payout as a *pending*
--    `withdrawal` debit (review_note 'Sending via Xendit'). The API sends it
--    and marks it completed with Xendit's payout id, or failed. A pending
--    debit already reserves the money, so it cannot be sent twice. Client
--    refunds stay simulated: Xendit invoices are refunded per channel, which
--    this prototype does not do.
begin;

alter table public.linked_payout_accounts
  add column if not exists channel_code text;

update public.linked_payout_accounts
   set channel_code = case method when 'gcash' then 'PH_GCASH' when 'maya' then 'PH_PAYMAYA' else channel_code end
 where channel_code is null;

alter table public.linked_payout_accounts
  drop constraint if exists linked_payout_accounts_channel_check;
alter table public.linked_payout_accounts
  add constraint linked_payout_accounts_channel_check check (
    (method = 'gcash' and channel_code = 'PH_GCASH')
    or (method = 'maya' and channel_code = 'PH_PAYMAYA')
    or (method = 'bank' and channel_code ~ '^PH_[A-Z]{2,10}$')
  ) not valid;

drop function if exists public.pass_through_balances(uuid);

create or replace function public.pass_through_balances(
  p_profile_id uuid default null,
  p_queue_provider_payouts boolean default false
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  amount numeric;
  destination text;
  queued boolean;
  sent integer := 0;
begin
  for r in
    select p.id, p.role
      from profiles p
     where (p_profile_id is null or p.id = p_profile_id)
       and exists (select 1 from wallet_transactions t where t.profile_id = p.id)
  loop
    perform wallet_lock(r.id);
    amount := wallet_available_balance(r.id);
    continue when amount <= 0;
    queued := false;
    if r.role = 'provider' then
      destination := payout_destination_label(r.id);
      continue when destination is null;
      queued := p_queue_provider_payouts;
    else
      destination := 'Original payment method';
    end if;
    insert into wallet_transactions
      (profile_id, direction, kind, amount, title, status,
       withdrawal_destination, review_note)
    values
      (r.id, 'debit', 'withdrawal', amount,
       case when r.role = 'provider' then 'Payout sent' else 'Refund sent' end,
       (case when queued then 'pending' else 'completed' end)::wallet_txn_status,
       destination,
       case when queued then 'Sending via Xendit'
            else 'SIM-' || upper(substr(md5(gen_random_uuid()::text), 1, 10)) end);
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke all on function public.pass_through_balances(uuid, boolean) from public, anon, authenticated;

commit;
