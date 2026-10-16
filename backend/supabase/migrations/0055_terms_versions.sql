-- Which Terms & Conditions version each account accepted. Version 2 adds the
-- payment, urgency-pricing and payment-release terms; anyone on an older
-- version is asked to accept again at their next sign-in.
alter table public.profiles
  add column if not exists consented_terms_version smallint
    check (consented_terms_version > 0);

update public.profiles
   set consented_terms_version = 1
 where consented_terms_at is not null and consented_terms_version is null;
