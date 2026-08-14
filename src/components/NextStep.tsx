'use client';

import Link from 'next/link';
import type { Receipt } from '@/lib/types';

/**
 * The one thing to do next, chosen from what the audit actually found.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * Three separate promotional notes used to stack up ABOVE the receipt: a gate note
 * linking to pricing, a "this is not being saved" note linking to pricing, and a quota
 * note. So a visitor who had just run their first audit met three pitches before they
 * were allowed to look at the thing they came for — and every one of them said the same
 * word, "pricing", in three different voices.
 *
 * That is the "features and buttons competing with each other" problem in its purest
 * form, sitting at the single highest-intent moment in the entire product.
 *
 * ── The rule this follows ───────────────────────────────────────────────────
 *
 * THE RESULT COMES FIRST. Nothing is sold above the receipt. The reader gets the value
 * they were promised, in full, and only then is there a next step — exactly one, phrased
 * from their own data.
 *
 * ── Why it is derived rather than generic ───────────────────────────────────
 *
 * "Upgrade for more features" is a sentence about us. "Two of these five broke, and both
 * are the kind the guard refuses before they run" is a sentence about them, and it
 * happens to be true, which is the only reason it is allowed to be persuasive.
 *
 * Three states, because there are three genuinely different things that can have just
 * happened, and each has a different honest next move:
 *
 *   VIOLATIONS FOUND, and some are enforceable → the guard is the answer.
 *   VIOLATIONS FOUND, none enforceable        → do NOT pitch the guard. It would not
 *                                                have helped, and saying so is worth more
 *                                                than the sale.
 *   NOTHING BROKE                              → the honest pitch is not "buy anyway", it
 *                                                is that one clean audit says nothing
 *                                                about next week.
 *   RULES LEFT NO TRACE                        → the problem is the ruleset, not the
 *                                                model, and the fix for that is free.
 *
 * The last one routes AWAY from the paid product on purpose. A funnel that recommends
 * the paid tier when the free tool is the right answer is the thing that makes people
 * stop trusting the verdicts too.
 */
export default function NextStep({
  receipt,
  plan,
  signedIn,
}: {
  receipt: Receipt;
  plan: string;
  signedIn: boolean;
}) {
  const s = receipt.summary;

  /**
   * How many of the broken rules could actually have been refused before they ran?
   *
   * The first version called `proposeDenyRules()` on the broken rules and counted the
   * result. It rendered **"16 of 2 could have been refused"**, which is the kind of number
   * that ends a sale on its own.
   *
   * Two reasons, both worth recording. A `Proposal` carries no link back to a source rule,
   * so proposals cannot be attributed; and `proposeDenyRules` also emits a standing
   * library of destructive operations that exists independently of your ruleset. Counting
   * proposals was never going to answer a question about rules.
   *
   * A DETERMINISTIC verdict is the honest proxy, and it is already sealed into the
   * receipt: it means a literal, a command or a pattern decided this, which is precisely
   * what the guard can compile into a block. A judged verdict came from reading the
   * output, and there is nothing there to refuse in advance.
   *
   * It also cannot exceed `violated`, because it is a subset of the same rows — the
   * property whose absence produced "16 of 2".
   */
  const brokenResults = receipt.results.filter((r) => r.verdict === 'VIOLATED');
  const enforceable = brokenResults.filter((r) => r.method === 'deterministic').length;

  const noSignal = Math.max(0, s.total - s.notApplicable - Math.round(s.coverage * (s.total - s.notApplicable)));
  const paid = plan !== 'free';

  /** Choose ONE. Order matters: the most specific true statement wins. */
  const step = (() => {
    if (s.violated > 0 && enforceable > 0) {
      return {
        tone: 'fail' as const,
        eyebrow: `${s.violated} rule${s.violated === 1 ? '' : 's'} broken`,
        // Singular is spelled out rather than templated. "All 1 could have been refused
        // before they ran" is what the generic version rendered on a real audit, and a
        // sentence that reads like a database row undoes the sobriety the rest of the
        // page is working for.
        title:
          s.violated === 1
            ? 'It could have been refused before it ran.'
            : enforceable === s.violated
              ? `All ${s.violated} could have been refused before they ran.`
              : `${enforceable} of ${s.violated} could have been refused before they ran.`,
        body:
          'An audit is the diagnosis. The guard is the treatment — it compiles these same rules into a hook that denies the tool call and quotes your own rule as the reason.',
        cta: { label: 'See what the guard blocks', href: '/enforce' },
        aside: { label: 'What it costs', href: '/pricing' },
      };
    }

    if (s.violated > 0) {
      // Honest, and it costs us the sale: these are judged/prose rules the guard cannot
      // compile into a deterministic block. Pitching it here would be a lie with a price.
      return {
        tone: 'fail' as const,
        eyebrow: `${s.violated} rule${s.violated === 1 ? '' : 's'} broken`,
        title: 'These are not the kind a guard can block.',
        body:
          'They were decided by reading the output, not by matching a command — so there is nothing to refuse before the fact. What helps here is knowing whether they keep breaking, which needs more than one audit.',
        cta: { label: 'Run it on another output', href: '/audit' },
        aside: { label: 'How verdicts are decided', href: '/how-it-works' },
      };
    }

    if (noSignal > 0 && s.coverage < 0.75) {
      // Routes to a FREE tool on purpose. Low coverage is a ruleset problem, and selling
      // a subscription to someone whose rules are unenforceable is how you earn a refund.
      return {
        tone: 'unknown' as const,
        eyebrow: `${noSignal} rule${noSignal === 1 ? '' : 's'} left no trace`,
        title: 'Nothing broke — but not much was actually checked.',
        body:
          'A rule that leaves no observable trace was probably never applied, and no audit can tell you which. That is a ruleset problem rather than a model problem, and the fix for it is free.',
        cta: { label: 'Critique the ruleset itself', href: '/learn' },
        aside: { label: 'What coverage means', href: '/how-it-works' },
      };
    }

    return {
      tone: 'pass' as const,
      eyebrow: 'clean run',
      title: 'Every applicable rule held. This time.',
      body:
        'One audit is a snapshot. The rule that quietly starts failing in three weeks looks exactly like this one today — which is the whole reason a track record exists.',
      cta: { label: 'Keep a record of every audit', href: '/pricing' },
      aside: { label: 'Try a harder output', href: '/audit' },
    };
  })();

  const tone = {
    fail: 'border-fail-line bg-fail-pale',
    pass: 'border-pass-line bg-pass-pale',
    unknown: 'border-unknown-line bg-unknown-pale',
  }[step.tone];

  return (
    <section className={`reveal mt-8 rounded-2xl border px-6 py-6 ${tone}`}>
      <p className="num text-[11px] uppercase tracking-[0.16em] text-ink-mid">{step.eyebrow}</p>
      <h2 className="mt-2.5 max-w-[30ch] font-display text-[24px] leading-tight tracking-tight text-ink">
        {step.title}
      </h2>
      <p className="readable measure mt-3 text-[14.5px]">{step.body}</p>

      {/* ONE button. The second link is text, deliberately — two buttons of equal weight
          is the same failure as three notes, just tidier. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link
          href={step.cta.href}
          className="press inline-block rounded-xl bg-ink px-5 py-2.5 text-[14.5px] font-medium text-white hover:bg-ink-soft"
        >
          {step.cta.label}
        </Link>
        <Link href={step.aside.href} className="text-[13.5px] text-brand underline underline-offset-4">
          {step.aside.label}
        </Link>
      </div>

      {/* The retention fact, stated where it is relevant rather than as a third banner
          above the receipt — and only to people it is actually true for. */}
      {!paid && (
        <p className="mt-5 border-t border-ink/10 pt-4 text-[12.5px] leading-relaxed text-ink-mid">
          {signedIn
            ? 'This receipt is not being kept. Download the JSON if you want it after this tab closes.'
            : 'Auditing stays free and unlimited whether or not you sign in. Signing in only decides whether the receipt is still here tomorrow.'}
        </p>
      )}
    </section>
  );
}
