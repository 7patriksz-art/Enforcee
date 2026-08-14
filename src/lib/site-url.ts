/**
 * The canonical public origin, in one place.
 *
 * This existed in four copies with three different fallbacks — robots.ts and sitemap.ts
 * hardcoded the vercel.app domain, stripe.ts fell back to localhost, and the metadata in
 * layout.tsx had no base at all, which silently resolved the OG card to
 * http://localhost:3000 in every social preview. A link posted to HN would have shown a
 * broken image, which is a poor way to spend a launch you only get once.
 *
 * Set NEXT_PUBLIC_SITE_URL in Vercel once the real domain is live and every one of these
 * follows. Until then the vercel.app origin is correct rather than merely tolerated.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  // NEVER fall back to the custom domain. It was hardcoded here as a production fallback
  // on 2026-08-14, hours before the domain was actually attached to the project — so had
  // that shipped while DNS still pointed at the registrar's parking page, every canonical
  // URL, every OG card and every Stripe redirect would have sent a paying customer to a
  // page that is not ours. The deployment URL always works. Switching to enforcee.com is a
  // deliberate act: set NEXT_PUBLIC_SITE_URL in Vercel, once the domain resolves.
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
).replace(/\/+$/, '');
