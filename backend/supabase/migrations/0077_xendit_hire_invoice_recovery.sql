begin;

create table if not exists public.xendit_hire_payments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete restrict,
  client_id uuid not null references public.profiles(id) on delete restrict,
  invoice_id text unique,
  external_id text not null unique,
  checkout_url text,
  expected_amount numeric(12,2) not null check (expected_amount > 0),
  currency text not null default 'PHP' check (currency = 'PHP'),
  status text not null default 'creating'
    check (status in ('creating', 'pending', 'processing', 'processed', 'expired', 'failed', 'needs_review')),
  last_attempt_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  paid_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists xendit_hire_payments_pending_idx
  on public.xendit_hire_payments (created_at)
  where status in ('pending', 'processing');
create index if not exists xendit_hire_payments_application_idx
  on public.xendit_hire_payments (application_id, created_at desc);

alter table public.xendit_hire_payments enable row level security;
revoke all on public.xendit_hire_payments from public, anon, authenticated;
grant all on public.xendit_hire_payments to service_role;

comment on table public.xendit_hire_payments is
  'Service-role-only Xendit hire invoices, retained until paid invoices are applied or reviewed.';

create or replace function public.claim_xendit_hire_payment(p_invoice_id text)
returns setof public.xendit_hire_payments
language sql
security definer
set search_path = ''
as $$
  update public.xendit_hire_payments
     set status = 'processing',
         last_attempt_at = now(),
         updated_at = now()
   where invoice_id = p_invoice_id
     and (
       status = 'pending'
       or (status = 'processing' and last_attempt_at < now() - interval '5 minutes')
     )
  returning *;
$$;

revoke all on function public.claim_xendit_hire_payment(text) from public, anon, authenticated;
grant execute on function public.claim_xendit_hire_payment(text) to service_role;

commit;
