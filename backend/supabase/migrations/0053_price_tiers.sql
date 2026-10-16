-- Server-estimated job prices. Clients no longer type a budget: they pick one
-- of three tiers the API computes from the category, the checklist's effort
-- and the urgency. The rates are admin-editable data, not code.

alter table public.service_categories
  add column if not exists base_price numeric(10,2) not null default 500
    check (base_price > 0);

update public.service_categories set base_price = case name
  when 'Plumbing' then 800
  when 'Cleaning' then 600
  when 'Handyman' then 700
  when 'Manicure' then 300
  when 'Pedicure' then 350
  else base_price end;

alter table public.urgency_settings
  add column if not exists price_multiplier numeric(4,2) not null default 1
    check (price_multiplier between 0.5 and 3);

update public.urgency_settings set price_multiplier = case urgency
  when 'urgent' then 1.5
  when 'normal' then 1.0
  when 'flexible' then 0.9 end;

-- How demanding one checklist item is. Old rows are treated as moderate.
alter table public.job_tasks
  add column if not exists effort text not null default 'moderate'
    check (effort in ('light', 'moderate', 'heavy'));

-- The tier the client picked; null for jobs posted before this migration.
alter table public.jobs
  add column if not exists price_tier text
    check (price_tier in ('basic', 'standard', 'premium'));
