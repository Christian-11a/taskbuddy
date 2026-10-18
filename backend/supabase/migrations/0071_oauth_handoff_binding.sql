-- Security fix (audit C2): bind a Google sign-in handoff to both ends.
--
-- The handoff id was chosen by whoever opened /auth/google/authorize, so an
-- attacker could send a victim an authorize link with an id the attacker
-- knew, wait for the victim to sign in with Google, and claim the victim's
-- session. A claim now also needs:
--   * the verifier whose sha256 (`challenge`) the app sent at authorize, which
--     only the app that started the flow holds; and
--   * a secret the callback minted and put only on the redirect back to the
--     browser/device that finished Google sign-in (`secret_hash` stores its
--     sha256).
-- The attacker starts the flow, so has the verifier but never sees the
-- secret; something that intercepts the redirect has the secret but not the
-- verifier. Rows without these columns (in flight at deploy) cannot be
-- claimed and expire within five minutes.

begin;

alter table public.oauth_handoffs
  add column if not exists challenge text,
  add column if not exists secret_hash text;

comment on column public.oauth_handoffs.challenge is
  'Hex sha256 of the verifier held by the app that started the sign-in (0071).';
comment on column public.oauth_handoffs.secret_hash is
  'Hex sha256 of the secret sent only on the callback redirect (0071).';

commit;
