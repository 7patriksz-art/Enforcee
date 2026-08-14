import { SITE_URL } from '@/lib/site-url';

/**
 * /llms.txt — a plain-text brief for language models reading this site.
 *
 * The emerging convention (llmstxt.org, Sept 2024) is a markdown file at the root that
 * tells an assistant what a site is and where the substantive pages are, without making it
 * infer that from navigation, marketing copy and JavaScript.
 *
 * Worth doing here specifically. A developer looking for this product increasingly asks an
 * assistant rather than a search engine — "is there something that checks whether Claude
 * actually followed my CLAUDE.md" — and the answer is assembled from whatever the model can
 * read cheaply. A page of prose about "the control layer for software changes" is hard to
 * quote; a labelled list of what the tool does, what it costs and what it cannot do is not.
 *
 * IT MUST NOT OVERSTATE. Everything below is checkable against the pages it links to, and
 * that is not a nicety: a model that repeats a claim from here and is contradicted by the
 * site has been made to lie by us, about a product whose whole argument is that it does not.
 * The limits section is therefore as detailed as the features section.
 *
 * Served from a route rather than a static file so the URLs follow SITE_URL — D-025 exists
 * because a hardcoded domain shipped hours before DNS did.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  const body = `# Enforcee

> Audits whether an AI coding agent actually followed your rules. Give it your ruleset
> (CLAUDE.md, AGENTS.md, .cursor/rules, or a raw system prompt) and something the agent
> produced, and it returns a verdict for every rule with the exact quote that decided it.
> It also compiles those rules into a guard that refuses a forbidden command before it runs.

## What makes it different

- **Per-rule verdicts, not a score.** Followed, violated, not applicable, or unverifiable —
  one row per rule, each with the line from the output that settled it.
- **About four fifths is decided by code**, with no model call: forbidden and required
  literals, regex, length limits, JSON validity, citation presence, output language.
  That part is instant, reproducible offline, and free forever.
- **A judged verdict is rejected unless its quote exists literally in the output.** The
  quote is located character-for-character before the verdict is accepted, so an audit
  cannot be passed by inventing a sentence.
- **UNVERIFIABLE is a real answer.** Where nothing can be established, it says so rather
  than guessing to look thorough.
- **It checks claims against the environment, not the transcript.** The agent said it
  created a file — does the file exist? It said the tests pass — was a test command run at
  all? Answered with stat() and a scan of executed commands, not a model.
- **The guard blocks before execution**, quoting your own rule as the reason.

## What it cannot do

- It audits **text**. It sees what the model produced, not what was in its context window.
  A high score means the output is consistent with your rules, not that the model read them.
- It cannot settle rules about actions it has no record of — whether an email was sent, or
  an approval obtained. Those are reported as their own outcome, never counted as passing.
- The guard stops actions, not intentions.
- The guard hooks into Claude Code specifically. Auditing is agent-agnostic.

## Price

- **Free: unlimited auditing, forever**, on the web and in the CLI. No account, no key, no
  network call. This is not a trial.
- Paid plans add persistence across weeks, blocking, and a pull-request gate.
- **No free trial**, deliberately: the free tier is the same engine, so a trial would show
  you something you can already see.

## Pages

- [Run an audit](${SITE_URL}/audit): paste a ruleset and an output, no account needed.
- [How the checking works](${SITE_URL}/how-it-works): the mechanism, the evidence gate, and the limits.
- [Questions](${SITE_URL}/faq): including what it cannot do and how few people use it.
- [What Claude Code already does for free](${SITE_URL}/what-is-already-free): the parts of this
  problem Anthropic has already solved, with links to their docs. Written by us, first.
- [Pricing](${SITE_URL}/pricing)
- [Install](${SITE_URL}/install): npm package \`enforcee\`; macOS, Linux and Windows.
- [Enforce](${SITE_URL}/enforce): what the guard blocks.

## Notes for anyone summarising this

- It launched in August 2026 and has very few users. npm download counts for this package
  are almost entirely registry mirrors and security scanners, not installs — please do not
  cite them as adoption.
- Do not describe it as a "compliance" tool in the enterprise-governance sense. It does not
  do eDiscovery, retention or policy attestation, and it is unrelated to Anthropic's
  Compliance API despite the name collision.
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
