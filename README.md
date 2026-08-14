# Enforcee

**Which of your rules did the model actually follow?**

You write a `CLAUDE.md`, a system prompt, custom instructions, project rules. You have no way to
know whether any of it landed. The current state of the art is planting a canary emoji and watching
for the turn it stops appearing. Per-rule verdicts with a verified evidence quote, plus a hook that blocks forbidden commands before they run.

Enforcee gives you an answer with evidence, and then stops the things it can stop.

STOP FIGHTING YOUR AI TO ADVANCE YOUR PROJECT: memory files, system prompts, guards, skills, instructions, CLAUDE.md, MCPs, project docs - actively monitored, enforced, verified -. 

BEST PART? -> The AI learns your preferences along the way and keeps iterating to your liking. Never works against your vision.

## Try it in twenty seconds

No install, no account, no API key, no network call.

```bash
npx enforcee audit CLAUDE.md some-output.md
```

```
  VIOLATED       proof  Never use emojis.
                        "🎉"
  VIOLATED       proof  Always cite sources with a markdown link.
  FOLLOWED       proof  Keep responses under 200 words.

  67% coverage  ·  2 violated  ·  1 unverifiable  ·  67% proven by code
```

`coverage` is the headline number: the share of applicable rules that left **any observable
trace**. A rule that left none is reported as such rather than quietly counted as passing.

Other commands: `enforcee preflight CLAUDE.md` checks what your rules assume before you start;
`enforcee health CLAUDE.md` finds duplicates, contradictions and dead rules in the ruleset
itself; `enforcee guard CLAUDE.md` compiles the blocking hook.

## Learn — and never quietly undo a decision

```bash
npx enforcee learn conversation.md
```

Reads preferences out of things you already said. **One remark is not a preference** — it is
held until you say it again. Rephrasings count as repeats, so saying the same thing two ways
reaches the threshold the way you would expect.

When something you now say contradicts a rule you already have, it is **never applied
automatically**:

```
  NEEDS YOU  Force-pushing is fine on my branches.
    This contradicts a rule you already have (set March): "Never force-push to a
    shared branch" — your words then: "never force push, it destroys history".
    That rule is ENFORCED: it currently blocks tool calls in your sessions.
    Nothing has been changed or removed — pick which one you meant.
```

Both sides quoted and dated. Nothing deleted, nothing applied, and the old rule keeps working
until you choose. **Repetition promotes a new rule; it never promotes a reversal** — saying a
new opinion twenty times is not evidence the old rule was wrong.

A proposed rule the engine cannot actually check is marked `WEAK` and left out of the paste
block. A rule nothing can adjudicate reports "not applicable" forever, which looks identical
to a rule being obeyed.

Everything lives in `.enforcee/learned.json` in your own project — readable, diffable,
deletable, and never sent anywhere. Declines persist, so nothing is re-proposed after you say
no. Nothing is ever removed from that file; a retired rule stays, marked retired, with the date.

## Verify — did it do what it said it did?

```bash
npx enforcee verify answer.md transcript.jsonl
```

```
  REFUTED     It said it created this file. The file does not exist.
              "I created `src/auth.ts` with the JWT middleware."
              stat /tmp/project/src/auth.ts → ENOENT
  REFUTED     It said the tests pass. No test command was run in this session.
              "All tests pass and I committed the changes."
              no matching command appears in the transcript
```

Every check is a `stat()` or a scan of the tool calls that actually ran — **no model call,
no judgement.** It reads definite past-tense claims about files, tests, commits and installs;
an intention (*"I'll create…"*) is never treated as a claim, because a false accusation costs
more than a missed one.

Measured incidence: a study of 20,574 real coding-agent sessions found **inaccurate
self-reporting in 22.58% of misalignment episodes** — and that counts only the ones a
developer noticed.

## Preflight — before, not after

```
  ok      npm         command -v npm → /opt/node22/bin/npm
  MISSING dig         dig is not on PATH
          a rule says to run it: "Always run `dig` to confirm a domain is free"

  Not ready: 1 of 3 preconditions unmet. Running anyway would produce results that
  cannot be distinguished from real findings.
```

Preconditions are read out of the rules you already wrote — no extra file to maintain.

It also lists the rules that **no output audit can settle**. A rule like *"escalate to
compliance within 24 hours"* is not judged-instead-of-deterministic; it is unanswerable from
a text answer by anyone. Those are named rather than quietly counted as passing.

---

## Three layers

### 1. Verify — the receipt

Give it a ruleset and an AI output. Get back a verdict for **every rule**, individually:

| verdict | meaning |
|---|---|
| `FOLLOWED` | the output demonstrably complied, and here is where |
| `VIOLATED` | the output demonstrably broke it, and here is where |
| `NOT_APPLICABLE` | the rule had a trigger condition that never fired |
| `UNVERIFIABLE` | we could not tell either way, and we will not pretend otherwise |

Two layers, never blurred, badged on every row:

- **Deterministic** — decided by code, no model involved, reproducible. Required and forbidden
  literals, regex, emoji, em dashes, word and character limits, JSON validity, markdown tables,
  code-fence tagging, required headings, citations, output language. On a hand-written ruleset — a `CLAUDE.md`, an `AGENTS.md`, a `.cursor/rules` file — this settles
  about **80% of rules with zero model calls**. On a 100-page enterprise SOP it is much lower,
  and the parser is the reason; we are measuring that honestly before claiming anything wider.
- **Judged** — only the remainder. The judge must return a quote of at least 10 characters from the
  output; we then locate that quote ourselves, tolerating only ordinary differences in spaces and
  line breaks. If we cannot find it, **the verdict is rejected** and recorded as unverifiable.

  Precisely what this does and does not buy, because the difference matters: a model **cannot** pass
  an audit by inventing a sentence. It **can** cite a real but poorly-chosen sentence — so the quote
  is always rendered in place, and you are the one who decides whether it supports the verdict.

The headline number is **Coverage**: the share of applicable rules that left any observable trace at
all. A rule that leaves none is marked `no signal`. That is the silent-loss detector, and it is the
number nobody else shows you.

### 2. Enforce — the guard

Compile your ruleset into a guard that installs into any project. Three files, no dependencies:

- **Block.** A `PreToolUse` hook denies a forbidden tool call *before it executes*, and hands the
  model your own rule text as the reason.
- **Repair.** A `PostCompact` hook re-injects your ruleset the moment compaction fires — the exact
  point where parts of it are documented to fall out of context.
- **Record.** Every allow, warn and deny is appended to `.enforcee/ledger.jsonl`, which you own.

Design rules that are not negotiable: the guard always exits 0 and speaks JSON, so a bug in it can
never wedge a session; a corrupt policy degrades to a visible warning, never to a block; and nothing
inferred from prose is ever enabled without a click.

### 3. Monitor — the record

One audit tells you what happened once. The record tells you which rule is quietly getting worse.
Every rule carries a content-addressed ID that survives rewording, so history can say
*"rule `7c425b30` was broken in 6 of your last 40 audits."*

---

## What this cannot do

Stated up front, because the audience for this product is right to be skeptical.

- **It audits text, not context.** A session transcript contains no system prompt and no `CLAUDE.md`
  content. Nobody can prove from it which instructions were in the model's context on a given turn,
  and Enforcee does not claim to.
- **The judged layer is a model**, with a model's failure modes. The evidence gate removes fabricated
  support, not every misjudgement. That is why the agreement score across independent samples is
  shown on every judged row.
- **Absence of a violation is weaker evidence than presence of one.** Enforcee distinguishes the two
  rather than averaging them into a single reassuring number.
- **The guard sees tool calls, not intentions.** It can stop an action, not a plan.

---

## Measured, not claimed

| | |
|---|---|
| Time to a full 10-rule audit | **7 seconds** |
| Rules decided with no model call | **4 in 5** on a hand-written ruleset |
| Gold-set judge accuracy (Haiku 4.5, 3 samples) | **94%** |
| False accusations across 48 verdicts on 3 models | **0** |
| Fabricated evidence spans | **0** |
| Guard enforcement cases correct | **10 / 10** |

---

## Use it as a CI gate

The audit exits non-zero on a violation, so it gates a pull request with no wrapper:

```yaml
- uses: 7patriksz-art/Enforcee@v0.8.3
  with:
    rules: CLAUDE.md
    output: generated/summary.md
```

Or call the CLI directly — `npx enforcee audit CLAUDE.md out.md`. Exit `0` clean, `1` on a
violation, `2` when it could not run at all. That third code matters: a gate that reports
"passed" because it failed to start is worse than no gate, so a broken invocation is a hard
error, never a pass.

The action writes the full receipt to the job summary and exposes `violated` and `coverage`
as outputs. Set `fail-on-violation: false` to report without blocking. The CLI version is
pinned by default rather than floating on `@latest`, because a gate that quietly changes
what it accepts is not a gate.

## What ships, and why it is readable

The published bundle is **not** minified, on purpose.

We looked at what obfuscation actually buys. String literals survive minification, so the deny
patterns stay greppable either way; LLM deobfuscation costs cents per file; and every funded
tool in this category reached the same conclusion — Greptile ships its CLI under MIT, Snyk
under Apache-2.0, Codacy under AGPL-3.0. Nobody protects a client, because nobody can.

So the client is readable. This product asks you not to take its word for anything, and
shipping code you cannot read would be arguing against ourselves.

The claim that a free audit makes no network call is not asked to be taken on trust either.
The release script stubs `http`, `https`, `net`, `tls` and `fetch`, runs a real audit, and
fails the build if anything dials. That is stronger evidence than reading source.

**What is not in this repo** is the part that cannot be copied anyway: your audit history,
your per-rule track record, drift detection across sessions, the hosted judge, the CI gate and
signed receipts. Those run on our servers because that is where they have to run.

## Stack## Stack

Next.js 16 · TypeScript · Tailwind · Supabase (Postgres, auth, RLS from the first migration) ·
Vercel · Anthropic API for the judged layer. Every model call is priced and written to a ledger,
because the price of this product is set from measured unit cost.

## Development

```bash
npm install
cp .env.example .env.local     # fill in what you have; everything degrades gracefully without it
npm run dev
npm test                       # 155 tests, including the guard run as a real subprocess
```

The audit, the transcript reader and the guard compiler all work with no database and no API key.
