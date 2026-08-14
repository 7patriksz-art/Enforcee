import { SITE_URL } from './site-url';
import Stripe from 'stripe';

/**
 * Stripe is optional. With no key configured the pricing page still renders and simply
 * says checkout is not live yet, rather than throwing at build time.
 */
let cached: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key) : null;
  return cached;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Stripe's redirect origin — the SAME origin as everything else.
 *
 * This was a second, independent copy of the site-URL logic with a different fallback, in
 * the one module where getting it wrong strands a customer who has just been charged.
 * Twelfth instance on this project of one idea living in two places. It now delegates.
 */
export function siteUrl(): string {
  return SITE_URL;
}
