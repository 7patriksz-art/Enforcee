import type { Metadata } from 'next';
import Link from 'next/link';
import PageHead from '@/components/PageHead';
import { pageMeta, jsonLd } from '@/lib/seo';
import { SITE_URL } from '@/lib/site-url';

export const metadata: Metadata = pageMeta({
  title: 'Questions',
  description:
    'What Enforcee does, what it cannot do, what stays free, and what happens to your code. Including the questions that are awkward for us.',
  path: '/faq',
});

/**
 * The FAQ.
 *
 * Two audiences, and they want the same thing for different reasons.
 *
 * A buyer skims for the one objection they arrived with. An AI assistant answering
 * "is there a tool that checks whether Claude followed my CLAUDE.md" reads a question-and-
 * answer pair as a citable unit — increasingly how a developer finds a tool in this
 * category at all, and something a wall of marketing prose cannot be quoted from.
 *
 * So the questions are phrased the way people actually type them, not the way we would
 * like them phrased, and the awkward ones are answered rather than avoided. "Does this
 * even work" and "why should I trust a tool that uses a model to check a model" are the
 * two most likely to be asked and the two most likely to be missing from a page like this.
 * A FAQ that only contains flattering questions is recognisably an advertisement, and this
 * product cannot afford to read as one.
 */

type QA = { q: string; a: string; more?: { label: string; href: string } };

const SECTIONS: { title: string; items: QA[] }[] = [
  {
    title: 'What it is',
    items: [
      {
        q: 'What does Enforcee actually do?',
        a: 'It takes the rules you wrote for an AI coding agent — a CLAUDE.md, AGENTS.md, .cursor/rules file or a raw system prompt — and something the agent produced, and returns a verdict for every single rule: followed, violated, not applicable, or unverifiable. Each verdict carries the exact line from the output that decided it. It also compiles those rules into a guard that refuses a forbidden command before it runs.',
        more: { label: 'How the checking works', href: '/how-it-works' },
      },
      {
        q: 'How is this different from a linter for my rules file?',
        a: 'A linter grades the file. It tells you whether your CLAUDE.md is tidy, well-ordered and not too long. Enforcee grades what the model did with it. Those are different questions, and the second one is the one nobody could answer before — you can have a perfect rules file that the agent ignored on turn forty.',
      },
      {
        q: 'Why should I trust a tool that uses a model to check a model?',
        a: 'Because mostly it does not. About four fifths of a hand-written ruleset is settled by plain code — forbidden words, required literals, length limits, JSON validity, citation presence — with no model call at all. For the remainder, a judged verdict is thrown out unless the quote it cites is found literally in your output, character for character. That makes it impossible to pass an audit by inventing a sentence. Where nothing can be established, the answer is "unverifiable", which is a real answer here rather than a failure.',
        more: { label: 'The evidence gate, in detail', href: '/how-it-works' },
      },
      {
        q: 'Does it work with Cursor, Codex or something other than Claude Code?',
        a: 'The auditing does. It reads the rules as text, so CLAUDE.md, AGENTS.md, .cursor/rules and a pasted system prompt all work the same way, and a rule keeps the same identity if you move it between files. The guard currently hooks into Claude Code specifically, because that is where the hook API exists.',
      },
    ],
  },
  {
    title: 'Money',
    items: [
      {
        q: 'What is free, and for how long?',
        a: 'Auditing is free and unlimited, forever, on the web and in the command line. That is not a trial and there is no credit card. You pay when you want it to remember across weeks, to block commands before they run, and to fail a pull request.',
        more: { label: 'What each plan includes', href: '/pricing' },
      },
      {
        q: 'Is there a free trial of the paid plans?',
        a: 'No, deliberately. The free tier is the same engine, the same verdicts and the same evidence quotes a subscriber gets — so a trial would be showing you something you can already see. Paying is for the parts that persist, block and gate, not for finding out whether it works.',
      },
      {
        q: 'What happens if I cancel?',
        a: 'The guard stops when your licence expires, and auditing keeps working exactly as before, because it never needed an account. Cancel from a link in any receipt. Your stored receipts can be exported or deleted the same day you ask.',
        more: { label: 'Export or delete everything', href: '/account/data' },
      },
    ],
  },
  {
    title: 'Your code',
    items: [
      {
        q: 'Does my source code leave my machine?',
        a: 'On the free paths, nothing does. The command line and the guard make no network call at all — not one, not even a licence check — so your transcripts, rulesets and code are read locally and never uploaded. That is enforced by a check in our release pipeline that stubs the network and fails the build if a free audit opens a socket.',
        more: { label: 'What runs without an account', href: '/what-is-already-free' },
      },
      {
        q: 'What do you store if I do make an account?',
        a: 'Your email, your subscription state, and the receipts from audits you ran while signed in — verdicts and rule text. Never your source code.',
      },
      {
        q: 'Do I need to give you an API key?',
        a: 'Only on the free tier, and only for the judged fifth; four fifths runs on your machine with no key at all. On the paid plans there is no key to manage, rotate or leak.',
      },
    ],
  },
  {
    title: 'The awkward ones',
    items: [
      {
        q: 'What can Enforcee not do?',
        a: 'It audits text. It sees what the model produced, not what was in its context window — so a high score means the output is consistent with your rules, not that the model read them. It cannot settle rules about actions it has no record of, like whether an email was sent or an approval was obtained; those are reported as their own outcome rather than quietly counted as passing. And the guard stops actions, not intentions.',
        more: { label: 'Limits, stated plainly', href: '/how-it-works' },
      },
      {
        q: 'Is some of this already free in Claude Code?',
        a: 'Yes, and we keep a page listing exactly which parts, with links to Anthropic’s own documentation. Two features were cut from this product the week they went native, one of them a headline item on the pricing page. If you only want to block a dangerous command, the hook to do that is free and you should go and write it.',
        more: { label: 'What Claude Code already does for free', href: '/what-is-already-free' },
      },
      {
        q: 'Anthropic shipped a Compliance API. Is that the same thing?',
        a: 'No, and the name does most of the damage. It pulls activity events, chat data and file content out of an organisation for eDiscovery and retention — a record of what was said. It says nothing about rules, nothing about CLAUDE.md, and nothing about whether an instruction was followed. It is also Enterprise-only.',
      },
      {
        q: 'How many people use this?',
        a: 'Very few. It launched in August 2026 and the npm download numbers are almost entirely registry mirrors and security scanners rather than people — every published version shows a near-identical weekly count, including versions nobody would install, which is the signature of automated crawling and not of adoption. We would rather say that than quote a number we know is not real.',
      },
    ],
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  // Built FROM the same array the page renders, never hand-maintained alongside it. A
  // second copy would drift, and this one drifts into a machine-readable format that
  // search engines cache and show to buyers — the twelve-times-repeated bug on this
  // project, in the worst possible place for it.
  mainEntity: SECTIONS.flatMap((s) =>
    s.items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    }))
  ),
  url: `${SITE_URL}/faq`,
};

export default function FAQ() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqSchema)} />

      <PageHead
        eyebrow="including the awkward ones"
        title="Questions"
        lede={
          <>
            What this does, what it cannot do, and what happens to your code. The last section is
            the one most products leave out.
          </>
        }
      />

      <div className="mt-12 space-y-10">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="font-display text-[22px] tracking-tight">{s.title}</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border hairline">
              {s.items.map((i, idx) => (
                <details
                  key={i.q}
                  className={`group ${idx ? 'border-t hairline' : ''} bg-white`}
                  // The first question of the first section is open on arrival, so the page
                  // never reads as a wall of closed rows with nothing to look at.
                  open={s === SECTIONS[0] && idx === 0}
                >
                  <summary className="press flex cursor-pointer items-start gap-3 px-5 py-4 text-[15px] font-medium hover:bg-paper-soft">
                    <span
                      aria-hidden
                      className="mt-[3px] font-mono text-[12px] text-clay transition-transform group-open:rotate-90"
                    >
                      ›
                    </span>
                    <span className="flex-1">{i.q}</span>
                  </summary>
                  <div className="px-5 pb-5 pl-[38px]">
                    <p className="readable text-[14.5px]">{i.a}</p>
                    {i.more && (
                      <Link
                        href={i.more.href}
                        className="mt-2.5 inline-block text-[13.5px] text-brand underline underline-offset-4"
                      >
                        {i.more.label}
                      </Link>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-12 rounded-2xl border border-clay-line bg-clay-pale px-6 py-6">
        <h2 className="font-display text-[20px] tracking-tight">Still not answered?</h2>
        <p className="readable mt-2 text-[14.5px]">
          The fastest answer is to run it on your own rules — it takes about twenty seconds and
          needs no account.
        </p>
        <Link
          href="/audit"
          className="press mt-4 inline-block rounded-xl bg-ink px-5 py-2.5 text-[14.5px] font-medium text-white hover:bg-ink-soft"
        >
          Try it on your own rules
        </Link>
      </section>
    </main>
  );
}
