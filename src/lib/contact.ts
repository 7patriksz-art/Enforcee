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
 *
 * Moved to 8patriksz@gmail.com on 2026-08-14 at Patrik's instruction.
 *
 * NOTE — this is the PUBLIC CONTACT address only. It is deliberately NOT the git commit
 * author: Vercel rejects deployments whose git author is not on the project, and every one
 * of the 63 commits on this repo is authored 7patriksz@gmail.com. Changing the author
 * address without first adding it to the Vercel project would break deploys, which is a
 * worse failure than a mismatched address. See 69-EMAIL-MOVE-2026-08-14.md.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '8patriksz@gmail.com';
