begin;
-- Reuse the existing wallet lock for every spending path. API-only prechecks let
-- concurrent withdrawals/hiring spend the same funds.
create or replace function public.guard_wallet_debit_reservation()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare available numeric;
begin
  if tg_op = 'UPDATE' and old.profile_id <> new.profile_id then
    raise exception using errcode = 'TB409', message = 'Wallet transaction ownership is immutable';
  end if;
  if new.direction <> 'debit' or new.status not in ('pending','completed') then
    return new;
  end if;
  perform public.wallet_lock(new.profile_id);
  available := public.wallet_available_balance(new.profile_id);
  if tg_op = 'UPDATE' then
    if old.direction = 'debit' and old.status in ('pending','completed') then
      available := available + old.amount;
    elsif old.direction = 'credit' and old.status = 'completed' then
      available := available - old.amount;
    end if;
  end if;
  if available < new.amount then
    raise exception using errcode = 'TB402', message = 'Insufficient wallet balance';
  end if;
  return new;
end; $$;
drop trigger if exists guard_wallet_debit_reservation on public.wallet_transactions;
create trigger guard_wallet_debit_reservation
before insert or update of amount, direction, status, profile_id on public.wallet_transactions
for each row execute function public.guard_wallet_debit_reservation();
revoke all on function public.guard_wallet_debit_reservation() from public, anon, authenticated;
commit;
