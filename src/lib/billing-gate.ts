/**
 * A hard interlock on taking money.
 *
 * Vercel's Hobby plan is for non-commercial use. The moment a Stripe payment lands,
 * the deployment is in breach of the plan it is hosted on, and that is not a usage
 * ceiling that degrades gracefully — it is a terms question that can take the site
 * down with no warning and no appeal.
 *
 * So billing is off by default and has to be switched on deliberately. This is not
 * belt-and-braces paranoia; it is the one failure mode where doing nothing is safe
 * and doing something is not, and defaults should point at the safe side.
 *
 * To switch it on, once the Vercel project is actually on Pro:
 *
 *   ENFORCEE_BILLING_ENABLED=1
 *
 * A server-side variable on purpose. NEXT_PUBLIC_* values are inlined at build time,
 * so flipping one needs a rebuild; this takes effect on the next request.
 */

export type BillingStatus =
  | { enabled: true }
  | { enabled: false; reason: string; detail: string };

export function billingStatus(): BillingStatus {
  const flag = process.env.ENFORCEE_BILLING_ENABLED?.trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return { enabled: true };

  return {
    enabled: false,
    reason: 'Checkout is deliberately switched off.',
    detail:
      'Enforcee is still hosted on a plan whose terms do not permit commercial use, so we are not taking payments yet. Everything free keeps working, and the 30-day trial will still be 30 days whenever you start it — you have lost nothing by arriving early.',
  };
}

export function billingEnabled(): boolean {
  return billingStatus().enabled;
}
