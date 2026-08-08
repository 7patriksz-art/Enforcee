import Link from 'next/link';
import Funnel from '@/components/Funnel';

export default function Home() {
  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-14 sm:pt-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">
          for people who have stopped trusting their own setup
        </p>

        <h1 className="mt-5 max-w-[19ch] font-display text-[42px] leading-[1.08] tracking-[-0.02em] sm:text-[58px]">
          Stop fighting <br className="hidden sm:block" />
          your own AI.
        </h1>

        <p className="readable mt-6 max-w-prose">
          You wrote the rules. You wrote them <em>again</em> after it ignored them. You added a
          <code className="mx-1 rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[14px]">CLAUDE.md</code>, then a skill,
          then an MCP server, then a nice long paragraph in ALL CAPS. And you still cannot answer the only question that
          matters: <strong>did any of it actually work?</strong>
        </p>

        <p className="readable mt-4 max-w-prose">
          So you start over. New rules, new file, new approach — not because the last one failed, but because you never
          found out whether it worked. <span className="hi font-semibold text-ink">That is not a discipline problem. It is a missing instrument.</span>
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/audit"
            className="rounded-xl bg-ink px-6 py-3 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-ink-soft"
          >
            See it on your own rules
          </Link>
          <Link
            href="/install"
            className="rounded-xl border border-ink/15 bg-white px-6 py-3 text-[15px] font-medium transition-colors hover:border-ink/30"
          >
            Install it into Claude Code
          </Link>
          <span className="font-mono text-[12px] text-skip">no account · 20 seconds · free forever</span>
        </div>

        <div className="mt-10 grid max-w-3xl gap-x-8 gap-y-3 border-t hairline pt-6 sm:grid-cols-3">
          {[
            ['80%', 'of a real ruleset decided with zero model calls'],
            ['0', 'fabricated evidence spans across 48 verdicts'],
            ['$0.006', 'measured cost of a full audit'],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="font-mono text-[26px] leading-none tracking-tight text-clay">{k}</div>
              <div className="mt-1.5 text-[13px] leading-snug text-ink-mid">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The feeling, named ───────────────────────────────────────────── */}
      <section className="border-y hairline bg-paper-soft">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="font-display text-[30px] leading-tight tracking-tight">You are not imagining it</h2>
          <p className="readable mt-3 max-w-prose">
            Every one of these is a real thing people do, right now, because there is no better option.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                t: 'The rewrite spiral',
                d: 'You rewrite the ruleset every few weeks. Each version is longer. None of them are measured, so you are decorating, not fixing.',
              },
              {
                t: 'The canary emoji',
                d: 'You plant a nonsense instruction — call me Chief, add a 🐙 — and watch for the turn it stops appearing. That is the state of the art. It is folk magic.',
              },
              {
                t: 'The re-explaining tax',
                d: 'Halfway through a session you start re-pasting rules it already has, because it feels like it forgot. You pay for those tokens twice.',
              },
              {
                t: 'The silent skip',
                d: 'It never says "I ignored rule 11." It writes something confident and slightly wrong, and you find out three commits later.',
              },
              {
                t: 'The dead skill',
                d: 'You wrote a skill. It has never once been invoked. Nothing anywhere told you that.',
              },
              {
                t: 'The 3am command',
                d: 'It ran a migration against production because your rule about that was somewhere on line 47 of a file it had stopped weighting.',
              },
            ].map((c) => (
              <div key={c.t} className="rounded-xl border hairline bg-white px-5 py-4">
                <div className="text-[14.5px] font-semibold">{c.t}</div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">{c.d}</p>
              </div>
            ))}
          </div>

          <p className="readable mt-8 max-w-prose">
            <span className="hi font-semibold text-ink">None of this is a prompting skill issue.</span> You cannot
            improve at something you get no feedback on. Enforcee is the feedback.
          </p>
        </div>
      </section>

      {/* ── The funnel ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-display text-[30px] leading-tight tracking-tight">Where it actually goes wrong</h2>
        <p className="readable mt-3 mb-8 max-w-prose">
          Six steps between your prompt and your output. You can see the first, the third and the last. The ones that
          decide the outcome are dark.
        </p>
        <Funnel />
      </section>

      {/* ── Why us ───────────────────────────────────────────────────────── */}
      <section className="border-y hairline bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay-soft">why this and not the others</p>
          <h2 className="mt-4 max-w-[22ch] font-display text-[32px] leading-[1.15] tracking-tight sm:text-[40px]">
            Everyone else grades the file. We grade what the model did.
          </h2>

          <div className="mt-10 grid gap-x-10 gap-y-8 lg:grid-cols-2">
            {[
              {
                k: 'It learns you',
                d: 'Say "stop opening with a summary" once, in passing, and Enforcee turns it into a rule — carrying the exact sentence you said it in. Your ruleset stops being something you sit down and write and becomes something that accretes from how you already work. Nobody else does this at all.',
              },
              {
                k: 'It refuses to guess',
                d: 'UNVERIFIABLE is a real answer here. When a model judges a rule, its evidence quote must exist character-for-character in the output, or the verdict is thrown away. Across 48 verdicts on three models: zero false accusations, zero invented evidence.',
              },
              {
                k: 'It blocks, not just reports',
                d: 'Observability tools tell you what already happened. Enforcee denies the forbidden command before it runs and hands the model your own words as the reason. Ten out of ten enforcement cases correct, tested as a real subprocess.',
              },
              {
                k: 'Most of it needs no model at all',
                d: 'About 80% of a real ruleset is decided by code — reproducible, instant, free. That is why an audit costs six-tenths of a cent instead of a subscription, and why you can check the maths yourself.',
              },
              {
                k: 'Every rule has an identity',
                d: 'Each rule gets a content-addressed id that survives rewording and file moves. So the product can say "this rule failed 6 of your last 40 audits" — a sentence no prompt-versioning tool can form, because they store prompts as opaque blobs.',
              },
              {
                k: 'It tells you what it cannot do',
                d: 'A session file contains no system prompt, so nobody can prove which rules were in context on a given turn. We say so on the page instead of selling a number we cannot stand behind.',
              },
            ].map((c) => (
              <div key={c.k}>
                <div className="font-display text-[20px] tracking-tight text-white">{c.k}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-paper-line/80">{c.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 overflow-hidden rounded-xl border border-white/15">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="bg-white/5 text-[11px] uppercase tracking-wide text-paper-line/60">
                  <th className="px-4 py-2.5 font-medium">Tool</th>
                  <th className="px-4 py-2.5 font-medium">What it answers</th>
                  <th className="px-4 py-2.5 font-medium">What it never answers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {[
                  ['Linters for CLAUDE.md', 'Is my rules file tidy?', 'Did the model follow it?'],
                  ['LangSmith, Langfuse, Helicone', 'What did this call cost, and how long did it take?', 'Which of my 12 rules broke?'],
                  ['Galileo instruction adherence', 'Did it comply, yes or no?', 'Which rule, and where is the proof?'],
                  ['Ruler, rulesync', 'Are my rule files in sync across tools?', 'Was any of it honoured?'],
                  ['Vanta, Credo, Drata', 'Is the org compliant with a regulation?', 'Anything about your own config, at your price.'],
                  ['Claude Code hooks', 'Can I block this command?', 'Which rules are decaying, and since when?'],
                ].map((r) => (
                  <tr key={r[0]}>
                    <td className="px-4 py-2.5 font-medium text-white">{r[0]}</td>
                    <td className="px-4 py-2.5 text-paper-line/70">{r[1]}</td>
                    <td className="px-4 py-2.5 text-clay-soft">{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Verdict vocabulary ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-display text-[30px] leading-tight tracking-tight">What an audit gives you back</h2>
        <p className="readable mt-3 mb-8 max-w-prose">
          Four answers, and we are strict about the difference between them.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['✓', 'Followed', 'It demonstrably complied, and here is the exact sentence that proves it.', 'border-pass-line bg-pass-pale text-pass'],
            ['✕', 'Violated', 'It demonstrably broke this rule, and here is the exact sentence that proves it.', 'border-fail-line bg-fail-pale text-fail'],
            ['?', 'Unverifiable', 'We could not tell either way. We will not invent a verdict to look complete.', 'border-unknown-line bg-unknown-pale text-unknown'],
            ['–', 'Not applicable', 'The rule had a trigger that never fired, so it was never in play.', 'hairline bg-paper-soft text-skip'],
          ].map(([g, t, d, cls]) => (
            <div key={t} className={`rounded-xl border px-5 py-4 ${cls}`}>
              <div className="font-mono text-[22px] leading-none">{g}</div>
              <div className="mt-2.5 text-[15px] font-semibold text-ink">{t}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mid">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-honey-line bg-honey-pale/50 px-5 py-4">
          <p className="text-[14.5px] leading-relaxed">
            And one number on top: <strong>Coverage</strong> — the share of your applicable rules that left{' '}
            <em>any</em> observable trace. <span className="hi font-semibold">A rule that leaves none was probably never read.</span>{' '}
            No other tool shows you this, because no other tool distinguishes “it passed” from “it was never in play”.
          </p>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="border-t hairline bg-paper-soft">
        <div className="mx-auto max-w-6xl px-5 py-16 text-center">
          <h2 className="mx-auto max-w-[20ch] font-display text-[32px] leading-tight tracking-tight">
            Find out what your rules are actually doing.
          </h2>
          <p className="readable mx-auto mt-4 max-w-[52ch]">
            Paste a ruleset and an answer. Twenty seconds, no account, and the deterministic half is free forever
            because it costs us nothing to run.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/audit" className="rounded-xl bg-ink px-6 py-3 text-[15px] font-medium text-white hover:bg-ink-soft transition-colors">
              Run an audit
            </Link>
            <Link href="/install" className="rounded-xl border border-ink/15 bg-white px-6 py-3 text-[15px] font-medium hover:border-ink/30 transition-colors">
              Install the guard
            </Link>
            <Link href="/pricing" className="rounded-xl border border-ink/15 bg-white px-6 py-3 text-[15px] font-medium hover:border-ink/30 transition-colors">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
