/**
 * The public contact address, in one place.
 *
 * This is cited in the Privacy Policy as the GDPR/data-subject contact and in the Terms
 * as the vulnerability-report address. Those are commitments to a reader, not decoration,
 * so the address has to be one that is actually monitored — a branded address that bounces
 * is strictly worse than a plain one that works.
 *
 * It sat as hello@enforcee.app in seven places while that domain was unregistered, so every
 * one of those commitments was unreachable. Pointed at the real inbox until the domain
 * exists; then set NEXT_PUBLIC_CONTACT_EMAIL and every surface follows.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '7patriksz@gmail.com';
