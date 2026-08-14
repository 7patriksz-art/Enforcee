import type { Metadata } from 'next';
import { SITE_URL } from './site-url';

/**
 * Per-page metadata, in one place.
 *
 * Eleven of sixteen pages exported none, so every one of them inherited the root title —
 * `/pricing`, `/install`, `/how-it-works` and the rest all shipped to Google as
 * "Enforcee — stop fighting your own AI". Search engines deduplicate near-identical titles,
 * so the site was competing against itself for every query, and a searcher looking for
 * pricing had nothing to click that said "pricing".
 *
 * A canonical is set on every page too. Without one, `?ref=`, `?utm_`, trailing-slash and
 * the `*.vercel.app` deployment host are all distinct URLs serving identical content — which
 * is how a small site accidentally splits its own ranking four ways.
 */
export function pageMeta({
  title,
  description,
  path,
  noIndex = false,
}: {
  /** Without the brand suffix — it is appended here so it cannot drift. */
  title: string;
  description: string;
  /** Absolute path, e.g. `/pricing`. */
  path: string;
  noIndex?: boolean;
}): Metadata {
  const full = `${title} — Enforcee`;
  const url = `${SITE_URL}${path}`;
  return {
    title: full,
    description,
    alternates: { canonical: url },
    openGraph: { title: full, description, url, siteName: 'Enforcee', type: 'website' },
    twitter: { card: 'summary_large_image', title: full, description },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Structured data.
 *
 * There was none anywhere on the site. Two audiences read it and neither reads prose:
 * search engines deciding whether to show a rich result, and AI assistants answering
 * "what tool tells me if my AI followed my CLAUDE.md" — increasingly how a developer finds
 * a tool in this category at all.
 *
 * Everything asserted here is checkable against the pages themselves. Marking up a claim
 * the site does not make is the structured-data equivalent of the copy errors the weekly
 * recon caught, and it is penalised rather than ignored.
 */
export const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Enforcee',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Linux, Windows',
  url: SITE_URL,
  description:
    'Audits whether an AI coding agent followed your rules — per-rule verdicts with an evidence quote verified to exist in the output — and blocks forbidden tool calls before they run.',
  softwareHelp: `${SITE_URL}/how-it-works`,
  featureList: [
    'Per-rule verdicts against CLAUDE.md, AGENTS.md or .cursor/rules',
    'Evidence quote verified to exist literally in the output',
    'About four fifths of a ruleset decided by code, with no model call',
    'Blocks a forbidden tool call before it executes',
    'Checks the agent’s claims against the filesystem rather than the transcript',
  ],
  offers: [
    {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'USD',
      description: 'Unlimited auditing, on the web and in the CLI. No account, no key, no network.',
    },
    // Paid prices are deliberately NOT marked up. They are set in one place — src/lib/plans.ts
    // — and a second copy here is the twelve-times-repeated bug on this project: the copy
    // drifts, and this one would be drifting in a machine-readable format that search engines
    // cache and show to buyers.
  ],
};

export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Enforcee',
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  description: 'Proof that your AI followed your rules.',
};

/** A `<script type="application/ld+json">` payload, safely serialised. */
export function jsonLd(schema: object): { __html: string } {
  // `<` is escaped because a string inside the schema containing `</script>` would end the
  // block early and inject raw markup. Nothing here is user-supplied today; this file is
  // exactly the kind that stops being true later.
  return { __html: JSON.stringify(schema).replace(/</g, '\\u003c') };
}
