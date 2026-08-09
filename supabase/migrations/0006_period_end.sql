-- Enforcee — store when the paid period actually ends.
--
-- /api/licence minted a fixed 45 days regardless of the subscription. A cancelled or
-- expired subscriber therefore kept the guard working for up to six more weeks, because
-- the licence is verified offline against a public key and there is no revocation list —
-- once issued, nothing can reach it. The licence has to expire when the thing it was
-- issued against expires, and that date only exists at Stripe until we write it down.

alter table public.subscriptions
  add column if not exists current_period_end timestamptz;

comment on column public.subscriptions.current_period_end is
  'End of the paid period, from Stripe. Licences expire at this date rather than a fixed offset, because an offline licence cannot be revoked after it is issued.';
