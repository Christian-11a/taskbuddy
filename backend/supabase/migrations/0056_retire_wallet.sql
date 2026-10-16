-- Retires the in-app wallet. TaskBuddy no longer keeps a balance for anyone:
-- money comes in for one job (PayMongo test mode: GCash, Maya, card, online
-- banking), is held in escrow, and goes straight back out — to the provider's
-- linked GCash/Maya/bank account on release, or to the client's original
-- payment method on a refund. This is a prototype, so the payout is
-- simulated: it is recorded as sent, and no money moves.
--
-- wallet_transactions stays as the internal ledger the escrow functions
-- write to, but pass_through_balances() empties every balance right after
-- it forms, so no account ever holds money between jobs.
begin;

-- 1. Where a profile's money is sent.
create table if not exists public.linked_payout_accounts (
  profile_id     uuid primary key references profiles(id) on delete cascade,
  method         text not null check (method in ('gcash', 'maya', 'bank')),
  bank_name      text check (char_length(bank_name) between 2 and 80),
  account_name   text not null check (char_length(btrim(account_name)) between 2 and 120),
  account_number text not null check (account_number ~ '^[0-9]{6,20}$'),
  updated_at     timestamptz not null default now(),
  check ((method = 'bank') = (bank_name is not null))
);
alter table public.linked_payout_accounts enable row level security;

-- 2. What a statement line says the money went to, e.g. "GCash ••••4567".
create or replace function public.payout_destination_label(p_profile_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case a.method
           when 'gcash' then 'GCash'
           when 'maya' then 'Maya'
           else a.bank_name
         end || ' ••••' || right(a.account_number, 4)
    from linked_payout_accounts a
   where a.profile_id = p_profile_id;
$$;

-- 3. Sends every balance out. Clients' money (refunds, failed hires) goes
--    back to the payment method it came from; providers' money (payouts)
--    goes to their linked account, and waits for one if none is linked yet.
--    Each send is a completed `withdrawal` debit with a simulated reference.
--    Locks each wallet first, so two callers cannot send the same money.
create or replace function public.pass_through_balances(p_profile_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  amount numeric;
  destination text;
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
    if r.role = 'provider' then
      destination := payout_destination_label(r.id);
      continue when destination is null;
    else
      destination := 'Original payment method';
    end if;
    insert into wallet_transactions
      (profile_id, direction, kind, amount, title, status,
       withdrawal_destination, review_note)
    values
      (r.id, 'debit', 'withdrawal', amount,
       case when r.role = 'provider' then 'Payout sent' else 'Refund sent' end,
       'completed', destination,
       'SIM-' || upper(substr(md5(gen_random_uuid()::text), 1, 10)));
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke all on function public.pass_through_balances(uuid) from public, anon, authenticated;
revoke all on function public.payout_destination_label(uuid) from public, anon, authenticated;

-- 4. Prototype cut-over: open withdrawal requests are dropped and every
--    remaining balance is written off, so nobody starts with money.
update public.wallet_transactions
   set status = 'failed', review_note = 'Wallet retired'
 where kind = 'withdrawal' and status = 'pending';

insert into public.wallet_transactions
  (profile_id, direction, kind, amount, title, status, withdrawal_destination, review_note)
select b.profile_id, 'debit', 'withdrawal', b.balance, 'Prototype wallet retired',
       'completed', 'Not sent: prototype balance removed', 'Wallet retired'
  from (
    select p.id as profile_id, public.wallet_available_balance(p.id) as balance
      from public.profiles p
  ) b
 where b.balance > 0;

commit;
