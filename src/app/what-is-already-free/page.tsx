import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'What Claude Code already does for free — Enforcee',
  description:
    'The parts of this problem Anthropic has already solved, with links to their docs, and the parts they have not. Written by the people trying to sell you the second list.',
};

interface Item {
  what: string;
  // `different` is not a hedge between native and open — it is the honest answer to a
  // NAME COLLISION, where a vendor ships something that sounds like ours and answers an
  // unrelated question. Filing that under "already free" would be a lie, and filing it
  // under "nobody does this" would look like we had not noticed. It gets its own word.
  verdict: 'native' | 'partial' | 'open' | 'different';
  detail: string;
  quote?: string;
  link: { label: string; url: string };
}

const ITEMS: Item[] = [
  {
    what: 'Proving a rules file actually loaded',
    verdict: 'native',
    detail:
      'There is a hook that fires whenever a CLAUDE.md or .claude/rules/*.md file enters context, and you can filter it by why it loaded. There is also a slash command that lists the memory files in the current session. If somebody sells you "proof your rules were loaded" as a headline feature, they are selling you a hook you already have.',
    quote:
      'Use the InstructionsLoaded hook to log exactly which instruction files are loaded, when they load, and why.',
    link: { label: 'Claude Code — memory docs', url: 'https://code.claude.com/docs/en/memory' },
  },
  {
    what: 'Your root CLAUDE.md surviving a compaction',
    verdict: 'native',
    detail:
      'This used to be the loudest complaint in the category, and it is fixed. We had a whole feature built around it. We cut the claim rather than keep selling it.',
    quote:
      'Project-root CLAUDE.md survives compaction: after /compact, Claude re-reads it from disk and re-injects it into the session.',
    link: { label: 'Claude Code — memory docs', url: 'https://code.claude.com/docs/en/memory' },
  },
  {
    what: 'Nested and path-scoped rules surviving a compaction',
    verdict: 'partial',
    detail:
      'The root file comes back. The rest does not, until something happens to trigger it. In a monorepo, "the rest" is most of your rules, and nothing tells you they are missing. This one is still real, and it is narrow — we would rather say narrow-and-true than broad-and-stale.',
    quote:
      'Nested CLAUDE.md files in subdirectories and rules with paths: frontmatter are not re-injected automatically; they reload the next time Claude reads a file in that subdirectory or a file matching the rule’s patterns.',
    link: { label: 'Claude Code — memory docs', url: 'https://code.claude.com/docs/en/memory' },
  },
  {
    what: 'Blocking a dangerous command',
    verdict: 'native',
    detail:
      'PreToolUse hooks exist, they are free, and a community catalogue of them exists too. If all you want is "never let it force-push", write the hook — genuinely, go and do that. What we add is compiling them out of the rules you already wrote, and keeping a record of what fired.',
    quote:
      'To block an action regardless of what Claude decides, use a PreToolUse hook instead.',
    link: { label: 'Claude Code — hooks', url: 'https://code.claude.com/docs/en/hooks' },
  },
  {
    what: 'Telling you your ruleset is too big',
    verdict: 'native',
    detail:
      'There is a checkup command that proposes trims to a checked-in CLAUDE.md. Our ruleset health does a different job — duplicates, contradictions, rules too vague to ever check — but the size problem is handled and you should use theirs.',
    link: { label: 'Claude Code — commands', url: 'https://code.claude.com/docs/en/commands' },
  },
  {
    what: 'Whether the model actually obeyed a rule, rule by rule, with the quote',
    verdict: 'open',
    detail:
      'Nothing native does this, and the docs are candid about where they stop — when an instruction is not followed, the guidance is to look at how you wrote it. That is reasonable advice and it is not an answer. This is the only thing we would ask you to pay for, and it is the whole product.',
    quote:
      'Claude reads it and tries to follow it, but there’s no guarantee of strict compliance, especially for vague or conflicting instructions.',
    link: { label: 'Claude Code — memory docs', url: 'https://code.claude.com/docs/en/memory' },
  },
  {
    // Added 2026-08-14 from the weekly market recon. A prospect who hears "Anthropic
    // shipped a Compliance API" will assume it does what we do, and answering that in a
    // sales thread is far more expensive than answering it here first. Verified against
    // Anthropic's own help centre, not the recon's summary.
    what: 'Anthropic’s Compliance API — and why it is not this',
    verdict: 'different',
    detail:
      'It shipped in August and the name does most of the damage. It pulls activity events, chat data and file content out of your organisation for eDiscovery and retention — a record of what was said. It says nothing about rules, nothing about CLAUDE.md, and nothing about whether an instruction was followed. It is also Enterprise-only, and in beta for Claude Code and Cowork. If your legal team needs the transcripts, use it. It will not tell you which of your rules held.',
    quote:
      'Programmatically pull activity feed events, chat data, and file content across all your Claude deployments.',
    link: {
      label: 'Anthropic — Compliance API',
      url: 'https://support.claude.com/en/articles/13015708-access-the-compliance-api',
    },
  },
  {
    what: 'A per-rule track record across weeks',
    verdict: 'open',
    detail:
      'Nothing native, and nothing we found in any competitor. Rules here are identified by a hash of their normalised text, so a rule keeps its identity when you reword it — which is what makes "this rule has failed 6 of your last 40 audits" a sentence anyone can say.',
    link: { label: 'How it works', url: '/how-it-works' },
  },
];

const BADGE = {
  native: { label: 'already free', cls: 'bg-pass-pale text-pass border-pass-line' },
  partial: { label: 'partly free', cls: 'bg-honey-pale text-honey border-honey-line' },
  open: { label: 'nobody does this', cls: 'bg-clay-pale text-clay border-clay-line' },
  different: { label: 'sounds like us, isn’t', cls: 'bg-brand-pale text-brand-deep border-brand/25' },
};

export default function WhatIsAlreadyFree() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">the awkward page</p>
      <h1 className="mt-4 max-w-[22ch] font-display text-[36px] leading-[1.1] tracking-tight">
        What Claude Code already does for free.
      </h1>
      <p className="readable mt-5 max-w-prose">
        Every verification tool in this category is one afternoon away from a reader opening the vendor docs and finding
        out that half the pitch is a feature they already have.{' '}
        <span className="hi font-semibold text-ink">So here is that list, written by us, first.</span>
      </p>
      <p className="readable mt-3 max-w-prose">
        We cut two claims off this site the week we learned they had gone native. One of them was a headline feature on
        the pricing page. It is a worse pitch and a true one, and given what we sell, we do not get to choose the other
        thing.
      </p>

      <div className="mt-10 space-y-4">
        {ITEMS.map((i) => {
          const b = BADGE[i.verdict];
          return (
            <section key={i.what} className="rounded-2xl border hairline bg-white px-5 py-5">
              <div className="flex flex-wrap items-start gap-3">
                <h2 className="flex-1 text-[16px] font-semibold leading-snug tracking-tight">{i.what}</h2>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${b.cls}`}>
                  {b.label}
                </span>
              </div>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-mid">{i.detail}</p>
              {i.quote && (
                <blockquote className="mt-3 border-l-2 border-paper-line pl-3.5 text-[13px] leading-relaxed text-ink">
                  &ldquo;{i.quote}&rdquo;
                </blockquote>
              )}
              <a
                href={i.link.url}
                target={i.link.url.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className="mt-3 inline-block font-mono text-[11px] text-brand hover:underline"
              >
                {i.link.label} →
              </a>
            </section>
          );
        })}
      </div>

      <section className="mt-10 rounded-2xl border border-honey-line bg-honey-pale/50 px-6 py-6">
        <h2 className="font-display text-[22px] tracking-tight">So what are we actually for?</h2>
        <p className="readable mt-2 max-w-prose">
          One sentence:{' '}
          <span className="hi font-semibold text-ink">
            which of your rules did it actually obey — rule by rule, with the quote.
          </span>{' '}
          Everything else we do is in service of that, or is free above and we say so.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/audit" className="rounded-xl bg-ink px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-ink-soft">
            Check it on your own rules
          </Link>
          <Link href="/pricing" className="rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-[14px] font-medium transition-colors hover:border-ink/30">
            Pricing
          </Link>
        </div>
      </section>

      <p className="mt-8 max-w-prose font-mono text-[11px] leading-relaxed text-skip">
        Docs quoted verbatim and linked, checked 8 August 2026. Vendors ship fast; if you find something here that has
        since gone native and we have not moved it, tell us and we will — that is the entire point of the page.
      </p>
    </main>
  );
}
