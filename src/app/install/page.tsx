import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import Link from 'next/link';
import CopyLine from '@/components/CopyLine';

export const metadata: Metadata = pageMeta({
  title: 'Install',
  description:
    'Five steps, about a minute. A plugin and a command-line tool that sit in your project and run on every turn — macOS, Linux and Windows.',
  path: '/install',
});

const STEPS = [
  {
    n: '01',
    t: 'Add the marketplace',
    d: 'One line, once per machine. It points Claude Code at this repo.',
    code: '/plugin marketplace add 7patriksz-art/Enforcee',
  },
  {
    n: '02',
    t: 'Install the plugin',
    d: 'Brings the guard hooks, the audit skill and the /receipt command with it.',
    code: '/plugin install enforcee@enforcee',
  },
  {
    n: '03',
    t: 'Drop in your licence',
    d: 'Once per machine. A signed line of text checked on your own disk — no activation server, no phone-home, and it keeps working on a plane. Same command on macOS, Linux and Windows.',
    code: 'npx enforcee licence set <your licence>',
  },
  {
    n: '04',
    t: 'Compile your rules into a policy',
    d: 'Run this in your project root. It reads your ruleset and writes .enforcee/policy.json. Nothing leaves the machine.',
    code: 'npx enforcee guard CLAUDE.md',
  },
  {
    n: '05',
    t: 'Restart Claude Code',
    d: 'Hooks load at startup. From here the guard is live in every session in that project.',
    code: null,
  },
];

const COMMANDS: [string, string, 'free' | 'licensed'][] = [
  ['npx enforcee audit CLAUDE.md answer.md', 'Per-rule verdicts with evidence. Exits non-zero on a violation, so it drops straight into CI.', 'free'],
  ['npx enforcee health CLAUDE.md', 'Critiques the ruleset itself: duplicates, contradictions, rules too vague to ever check.', 'free'],
  ['npx enforcee learn conversation.txt', 'Proposes rules from things you already said. Nothing is switched on for you.', 'free'],
  ['npx enforcee session <session>.jsonl', 'What the model could actually see: skills offered vs used, MCP servers that never connected.', 'free'],
  ['npx enforcee guard CLAUDE.md', 'Compiles and recompiles the policy the guard enforces.', 'licensed'],
  ['npx enforcee licence', 'Shows which licence this machine is using, and when it expires.', 'free'],
];

export default function Install() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">not two browser tabs</p>
      <h1 className="mt-4 max-w-[20ch] font-display text-[38px] leading-[1.1] tracking-tight">
        Enforcee lives inside the session, not beside it.
      </h1>
      <p className="readable mt-5 max-w-prose">
        The website is a place to try it. The real product is a plugin and a command-line tool that sit in your project
        and run on every turn. <span className="hi font-semibold text-ink">A forbidden command is denied before it executes</span>, not
        described to you afterwards.
      </p>

      <section className="mt-12">
        <h2 className="font-display text-[24px] tracking-tight">Five steps, about a minute</h2>
        <ol className="mt-5 space-y-px overflow-hidden rounded-2xl border hairline bg-paper-line">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-white px-5 py-5">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[12px] text-ink-light">{s.n}</span>
                <h3 className="text-[16px] font-semibold tracking-tight">{s.t}</h3>
              </div>
              <p className="mt-1.5 pl-[36px] text-[14px] leading-relaxed text-ink-mid">{s.d}</p>
              {s.code && (
                <CopyLine code={s.code} label={`step ${s.n}`} tone="invert" className="ml-[36px] mt-3" />
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-[24px] tracking-tight">What it does once it is in</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            {
              t: 'Blocks',
              d: 'A PreToolUse hook denies the call before it runs and hands the model your own rule text as the reason. Force-push denied, --force-with-lease allowed, rm -rf ./build warned, rm -rf / denied.',
            },
            {
              t: 'Repairs',
              d: 'Claude Code already re-reads your project-root CLAUDE.md after /compact — that part is native, free, and we will not sell it to you. What it does not re-inject is nested CLAUDE.md files and paths:-scoped rules. A PostCompact hook covers that residue and records that it did.',
            },
            {
              t: 'Records',
              d: 'Every allow, warn and deny is appended to .enforcee/ledger.jsonl on your disk. It is yours; nothing is sent anywhere.',
            },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border border-honey-line bg-honey-pale/40 px-5 py-4">
              <div className="font-display text-[19px] tracking-tight">{c.t}</div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-mid">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-[24px] tracking-tight">The command line</h2>
        <p className="readable mt-2 max-w-prose">
          Zero network calls. Not one, not even the licence check. About 80% of a real ruleset is decided by code, so
          the diagnostic half genuinely does not need a model, a key or an account —{' '}
          <span className="hi font-semibold text-ink">and it never will</span>.
        </p>
        <div className="mt-5 overflow-hidden rounded-2xl border hairline">
          {COMMANDS.map(([cmd, d, tier], i) => (
            <div key={cmd} className={i % 2 ? 'bg-paper-soft/60' : 'bg-white'}>
              <div className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <code className="font-mono text-[13px] text-clay">{cmd}</code>
                  <span
                    className={
                      tier === 'free'
                        ? 'rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide bg-pass-pale text-pass'
                        : 'rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide bg-honey-pale text-honey'
                    }
                  >
                    {tier === 'free' ? 'free, no account' : 'licensed'}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-mid">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-2xl border border-honey-line bg-honey-pale/40 px-6 py-6">
        <h2 className="font-display text-[22px] tracking-tight">How the licence works, plainly</h2>
        <p className="readable mt-2 max-w-prose">
          The auditing commands are free forever and need no licence — that is not a trial, it is the deal. The guard is
          what we charge for, and it is checked with a signature your machine verifies on its own.
        </p>
        <ul className="readable mt-3 max-w-prose list-disc space-y-1.5 pl-5">
          <li>Your licence is one line of text. Put it in <code className="font-mono text-[13px]">~/.enforcee/licence</code>, or in <code className="font-mono text-[13px]">ENFORCEE_LICENCE</code> for CI.</li>
          <li>It is verified offline against a key compiled into the tool. Nothing is sent to us, ever — including the fact that you ran it.</li>
          <li>It carries an expiry date and stops enforcing when that date passes — so cancelling needs no watching from us. Renewing means fetching a new line from your account page; nothing renews in the background, because nothing here talks to us.</li>
          <li><code className="font-mono text-[13px]">npx enforcee licence</code> tells you what you have and when it expires.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/account" className="rounded-xl bg-ink px-4 py-2.5 text-[14px] font-medium text-white hover:bg-ink-soft transition-colors">
            Get my licence
          </Link>
          <Link href="/pricing" className="rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-[14px] font-medium hover:border-ink/30 transition-colors">
            Subscribe
          </Link>
        </div>
      </section>

      <section className="mt-12 rounded-2xl border hairline bg-paper-soft px-6 py-6">
        <h2 className="font-display text-[22px] tracking-tight">Use it as a CI gate</h2>
        <p className="readable mt-2 max-w-prose">
          <code className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[14px]">audit</code> exits non-zero when any
          rule is violated, so the same check that runs on your laptop can fail a pull request.
        </p>
        <CopyLine tone="invert" className="mt-4" label="the GitHub Action step" code={`- name: Enforcee
  run: npx enforcee audit CLAUDE.md build/answer.md`}
        />
      </section>

      <section className="mt-12 rounded-2xl border border-clay-line bg-clay-pale px-6 py-6">
        <h2 className="font-display text-[22px] tracking-tight">What it will not do</h2>
        <ul className="readable mt-3 max-w-prose list-disc space-y-1.5 pl-5">
          <li>It sees tool calls, not intentions. It can stop an action, not a plan.</li>
          <li>Re-injection puts your rules back into context. It cannot force the model to weigh them.</li>
          <li>Anything ambiguous arrives switched off. A guard that blocks ordinary work gets uninstalled by Friday.</li>
          <li>There is no curl-piped-to-shell installer, because the guard blocks that pattern by default.</li>
        </ul>
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/enforce" className="rounded-xl bg-ink px-6 py-3 text-[15px] font-medium text-white hover:bg-ink-soft transition-colors">
          Build a policy from your rules
        </Link>
        <Link href="/pricing" className="rounded-xl border border-ink/15 bg-white px-6 py-3 text-[15px] font-medium hover:border-ink/30 transition-colors">
          Pricing
        </Link>
      </div>
    </main>
  );
}
