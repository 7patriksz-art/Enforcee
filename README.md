# Enforcee

**Which of your rules did the model actually follow?**

You write a `CLAUDE.md`, a system prompt, custom instructions, project rules. You have no way to
know whether any of it landed. The current state of the art is planting a canary emoji and watching
for the turn it stops appearing.

Enforcee gives you an answer with evidence, and then stops the things it can stop.

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
  code-fence tagging, required headings, citations, output language. On a realistic ruleset this
  settles about **80% of rules with zero model calls**.
- **Judged** — only the remainder. The judge must return a quote copied character-for-character
  from the output; we then search the output for it. If it is not literally there, **the verdict is
  rejected** and recorded as unverifiable. A model cannot pass an audit by inventing a sentence.

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
| Rules decided with no model call | **4 in 5** on a realistic ruleset |
| Gold-set judge accuracy (Haiku 4.5, 3 samples) | **94%** |
| False accusations across 48 verdicts on 3 models | **0** |
| Fabricated evidence spans | **0** |
| Guard enforcement cases correct | **10 / 10** |

---

## Stack

Next.js 16 · TypeScript · Tailwind · Supabase (Postgres, auth, RLS from the first migration) ·
Vercel · Anthropic API for the judged layer. Every model call is priced and written to a ledger,
because the price of this product is set from measured unit cost.

## Development

```bash
npm install
cp .env.example .env.local     # fill in what you have; everything degrades gracefully without it
npm run dev
npm test                       # 97 tests, including the guard run as a real subprocess
```

The audit, the transcript reader and the guard compiler all work with no database and no API key.
