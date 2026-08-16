# Tweaking the engine so it actually checks, enforces and learns

**v2 — 2026-08-16.** Part 0 is closed and replaced. CHANGE 6 is new, and is Patrik's idea.
Part 3 and Part 4 rewritten. Nothing from v1 was deleted or quietly reversed.

**Written 2026-08-15, for Patrik, after his instruction:** *"in every session I'm doing now
you keep making the same mistakes and new ones also, not checking, not enforcing, not really
learning."*

He is right, and the interesting part is that it is not a discipline problem. Every one of
these failures happened **with a green suite and a written rule already forbidding it.** So
the fix cannot be another rule in another document. This plan is about the engine.

Everything below is measured from this repository and this session's actual history. Where a
number is reconstructed rather than observed, it says so.

---

## Part 0 — CLOSED. And what it revealed underneath.

**Original finding, 2026-08-15:** Enforcee was not installed on Enforcee. No `.claude/`, no
hook, and `grep -c 'selfcheck|verify:ui' ci.yml` → 0 — the two controls built after the two
worst incidents on this project were wired into nothing.

**Status: done.** `selfcheck` and `verify:ui` now run on every push, and the daily agent has
since added `npm run dogfood`, which compiles our own `CLAUDE.md` into `.enforcee/policy.json`
through the same library the shipped CLI uses, and **refuses to install when the ruleset
parses implausibly few rules** — so a parser regression that would silently empty every
customer's policy turns CI red instead of shipping a guard that guards nothing.

That is the loop working: a finding written down on the 15th, executed by a scheduled run on
the 16th, without anyone re-deciding it.

### The finding that replaces it

Patrik asked a reasonable question: now that it is installed, has it learned his preferences
from this project's history? So I pointed `enforcee learn` at our own 413-record session
transcript — **the first time that feature had ever been run on a real Claude Code session
rather than on a pasted conversation.**

It made 61 proposals. Among them, verbatim, offered to him as a rule *he* had asked for:

```
Never = /^(and|or|the|a|an|of|in|for|with|to|&)$/i.
```

That is a regex out of `src/lib/rules/parse.ts`. Alongside it: "Never read.", "Never runs.",
"Never throws." — sentences from my own commit messages.

Two defects, stacked, and the second is the one worth remembering:

1. **The CLI read the `.jsonl` as prose.** `userTurnsFromTranscript` already existed, already
   did the right thing, was already exported — and was called by **nothing except its own unit
   test.** The test passed for the entire life of the bug, because it proved a property of a
   *function* rather than of the *product*. Meanwhile the site said, and still says,
   *"Only your words are read — never the assistant's."* That was **false in the binary people
   install.**

2. **`role: "user"` is not the same claim as "the person typed this."** Measured: 150 records
   in that transcript carry `type:"user"` and `role:"user"`. **Three** are things Patrik typed,
   totalling 1,344 characters. **One is 19,412 characters — the compaction summary**, the
   assistant's own prose about its own work, re-injected wearing the user's role. After fixing
   (1), 93% of the corpus was still me.

Both fixed, both controls proved red. After: 1,348 characters — his three real messages — and
*"Nothing new to offer. That is a real answer, not an empty one."*

**A tool that invents your preferences is worse than one that finds none, because you cannot
tell by looking.** That is the same failure this product exists to prevent, shipped inside the
product, undetected for its entire life, with a green test sitting next to it.

## Part 1 — What actually failed, and why the check could not have caught it

Not a list of bugs. A list of *checks that passed while the thing was broken*, because that is
the engine's problem rather than mine.

| # | The failure | What was checking | Why it could not fail |
|---|---|---|---|
| 1 | `.invert` collided with Tailwind's `filter: invert(100%)`; every panel painted backwards | 546 contrast measurements, 123 assertions | `getComputedStyle` reports values **before** filters, and a filter inverts fg and bg together, preserving the ratio *exactly*. Only a sampled pixel disagreed. |
| 2 | Email logo: SVG data URI → broken in Gmail | `expect(html).toContain('data:image/svg+xml;base64,')` | **The test asserted my choice.** When the choice was wrong, the test defended it. |
| 3 | Email logo: hosted PNG → still broken | `src` is https + ends `email-logo.png` + 28×28 + alt; PNG magic bytes on disk | All true. The asset shipped in the **same commit** as the template, so the URL was a 404 when the mail was opened. Every assertion was about this repo; the failure was about the internet. |
| 4 | Notification templates never deployed | full suite green | `readFileSync(process.cwd() + …)` is never traced into a Vercel function. Repo-truth again. |
| 5 | "Start the trial" button live for **5 days**, violating D-021 | `tests/invariants.test.ts` | It scanned `pricing/page.tsx`. The button was in `account/Licence.tsx`. A partial scan reporting as a full one. |
| 6 | UI claimed "a copy is in your inbox" beside `void notify(...)` | nothing | No check relates shipped copy to the code that would have to be true for it. |
| 7 | Fabricated setup steps, twice — including a "Resend → Settings → Reply-To" screen that does not exist | nothing | Nothing distinguishes a UI I fetched from a UI I remember. |
| 8 | Five Windows path-separator bugs | CI (caught #3, #4, #5) | CI catches the *instance*, every time, after a full red build. Nothing was ever added to catch the *class*. |
| 9 | Five controls that could not have failed (comment-stripper ate `//enforcee.com`; contact parser matched zero rules **twice**; `git stash` stashed nothing; shell threshold of 1) | themselves | A scan matching nothing passes. |
| 10 | **Today, this session:** `grep -o '<img[^>]*>'` reported "no images" for four templates that each had one | me, ten minutes before writing this | Line-anchored pattern; the tag wraps across two lines. **Number six.** I nearly built the whole email fix on it. |
| 11 | **Today:** I wrote a code comment saying "SITE_URL is still imported for links in the body". It was imported and used nowhere. | typecheck (would have caught the import) | Nothing audits prose against the code beside it. Caught only because I happened to grep. |

Recurrence, counted:

```
path-separator bugs .................. 5
email logo formats that shipped broken. 3
fabricated manuals ................... 2
duplicated-source bugs ............... 10
false-accusation classes ............. 11
controls that could not have failed ... 6
```

**That table is the whole complaint, quantified.** The fixes worked. The classes kept coming
back. A system that fixes instances and never closes classes will produce exactly the
experience you are describing, forever, no matter how careful the operator is.

---

## Part 2 — Six changes to the engine

Ordered by how much of the table above each one closes. Each is both a fix for us **and** a
product feature, because every failure above is one your customers are having too — a green
suite that ships a broken thing is the universal condition.

---

### CHANGE 1 — REACH: a second axis beside METHOD

**This is the big one. It closes rows 3, 4, 5, 6, 7 and (as a special case) row 1.**

The site already promises, in the footer of every page: *"Every verdict is labelled by
method. We say plainly what cannot be verified at all."* Method today is
`deterministic | judged | structural` — **how** a verdict was reached.

There is no label for **where the check could see**. And that, not method, is where every
false green on this project came from.

Add `reach` to every check and every verdict:

```
repo       the files in this checkout
build      the artefact produced from them — the bundle, the .nft.json, the painted pixel
deployed   what a request to the live origin actually returns
external   a third-party system's state — Stripe, Supabase, Resend, a Gmail render
```

And one hard rule, at the framework level:

> **A rule whose subject lives at reach *N* can never be marked FOLLOWED by a check at reach
> below *N*.** It resolves to `UNVERIFIABLE — checked at reach 'repo'; this rule is about
> 'deployed'`.

Run the table against it:

- Row 3 (logo 404): rule is `deployed`, checks were `repo` → **UNVERIFIABLE, not green.**
- Row 4 (templates undeployed): rule is `build` → **UNVERIFIABLE.**
- Row 1 (`.invert`): "the panel is readable" is a `build` claim; `getComputedStyle` is a
  `repo`-reach reading of a stated intention. Charter honesty rule #8 — *measure the
  artefact, not the intent* — turns out to be **a special case of reach**, which is a good
  sign the axis is real and not invented to fit.

This is a natural extension of the discipline the product already has and already sells. It
is also the sharpest thing we could put on the pricing page, because "your tests only prove
things about your repository" is true of every team on earth and almost nobody has a word
for it.

**Cost:** one field on the check interface, a resolver for rule→reach, and a pass over the
existing checks to label them. Days, not weeks. **Non-negotiable:** `reach` must be a
*required* field with no default — a default is how everything ends up `repo` and the axis
quietly means nothing.

---

### CHANGE 2 — A check must report its own denominator, structurally

**Closes rows 5, 9, 10 — six incidents, one of them from today.**

Charter honesty rule #9 already says this in prose. It has been violated six times *since it
was written*, which is the clearest possible evidence that a rule in a document is not a
control.

Make it impossible to express instead:

```ts
type CheckResult = {
  verdict: Verdict;
  reach: Reach;
  scanned: number;      // corpus size — REQUIRED
  matched: number;      // hits within it
  expected?: number;    // declared corpus size, where knowable
};
```

Enforced by the framework, with no opt-out:

- `scanned === 0` → **UNVERIFIABLE**, never FOLLOWED. Not a warning. Not lint. Structural.
- `expected` declared and `scanned < expected` → UNVERIFIABLE with the shortfall named.
  This is row 5: the invariants test scanned 1 file of the 47 that ship copy, and reported
  the same green as a full sweep.

Today's `<img>` grep found 0 in 4 templates that had 4. Under this rule it could not have
reported "clean" — it would have had to say *"scanned 4, matched 0"*, and 0 matches across
4 templates that visibly contain a logo is a number that stops you.

---

### CHANGE 3 — Ban the mirror test

**Closes row 2 and row 3's *test* half — the deepest one, because it is the failure mode that
survives arbitrary care.**

When I chose an SVG data URI, I wrote:

```ts
expect(html).toContain('data:image/svg+xml;base64,');
```

That is not a check. It is the implementation, restated in the assertion position. It can
only fail if I typo. It cannot fail *when I am wrong*, which is the only time a check matters.
Then, when you reported the broken image, **my own test was an argument against fixing it.**

A test written by the same process, in the same minute, from the same belief, is a **mirror**.
And mirrors are mechanically detectable:

> If a check's assertion literal appears verbatim in the implementation it guards, it is a
> mirror. Flag it and require an outcome-shaped restatement.

The rewrite is always available and always better:

| mirror (asserts mechanism) | control (asserts outcome) |
|---|---|
| `toContain('data:image/svg+xml;base64,')` | `expect(imgTags(html)).toEqual([])` — *no email fetches an image* |
| `src` is https + ends `email-logo.png` + 28×28 | same |

The outcome version survives a total rewrite of the mechanism. The mirror dies the moment the
mechanism changes, which trains you to update the test rather than question the code.

This is a genuinely new check class and I have not seen it in another tool. It belongs in the
`health` command — *critique the ruleset itself* — as: **this rule cannot fail.** Which is
exactly charter honesty rule #6, finally executable.

---

### CHANGE 4 — Incident → class → guard, as a pipeline with a gate

**Closes row 8, and the recurrence counts. This is the "learning" Patrik says isn't happening.**

Today every fixed bug gets a named regression test. That closes the **instance**. Five
separator bugs, three logo formats and ten duplicated-source bugs say the **class** stays
open — and the class is what recurs.

Every incident gets a `class` label and, where the class is mechanically detectable, a guard
that fires **before the fact**:

| class | guard |
|---|---|
| `path-separator` | deny a source edit where a path comparison contains a literal `'/'` |
| `duplicated-source` | deny a second copy of a value that already has a canonical home |
| `framework-name-collision` | deny a custom class/var/file named after something the framework ships (charter §6.12 — currently prose) |
| `scan-matched-nothing` | Change 2 |
| `mirror-test` | Change 3 |
| `unverified-external-claim` | Change 5 |

Then the gate that makes it real:

> **An incident may not be closed until its class has either a guard or a written, dated
> reason why it cannot have one.**

And the metric that says whether any of this is working — I would put it above coverage on
our own dashboard:

> **Repeat-class rate: the share of incidents whose class has been seen before.**

Right now that number is somewhere around **half**, reconstructed from the counts above
(5 + 3 + 2 + 10 + 6 repeats across roughly 60 logged incidents). It is the honest measurement
of "not really learning", and unlike a feeling it can be driven down and watched.

---

### CHANGE 5 — Extend the evidence gate to claims about the outside world

**Closes rows 7 and 11.**

The gate that makes this product work already exists and is genuinely strong: *a judged
verdict is thrown out unless its quote is located in the output, character for character.*

It applies to exactly one claim class — a model's verdict about your text. Extend the same
mechanism to a second:

> **A claim about an external system's behaviour or interface must carry a citation to a
> fetched artefact, with a timestamp.** No citation, no claim — it renders as
> `UNVERIFIED (remembered)`.

That is the whole of row 7. "Resend → Settings → Reply-To" was a confident, plausible, false
sentence about a screen I had never loaded, and it cost you a real hour: *"couldn't do step 4.
It is a vague manual."* Under this gate it never reaches you — it renders as unverified, and
the honest move (go and fetch the page) becomes the cheap one.

It is also row 11, and my own comment three hours ago claiming SITE_URL was still used, and
the charter's own *"the GitHub REST API is blocked"* — which was false, was believed for
weeks, and cost six hours in one session. Same class, three scales.

---

### CHANGE 6 — `enforcee onboard`: be worth something in the first sixty seconds

**Patrik's idea, 2026-08-16, and it is the best one in this document.** *"It should absolutely
be a feature so people downloading it would get a meaningful thing from the very beginning."*

He is right, and the reason is structural rather than marketing. Every rule-checking tool on
the market starts **empty**: you install it, and it knows nothing until you have used it for a
month. That is the whole reason such tools get uninstalled by Friday — the value arrives after
the patience runs out.

But a developer installing Enforcee is **not** starting from zero. They are sitting on months
of `~/.claude/projects/**/*.jsonl`, a `CLAUDE.md` they have rewritten twice, and a git history
full of the same bug fixed five times. All of it already on their disk. Nobody has ever read it
back to them.

```
$ npx enforcee onboard

  read 47 sessions · 1.2M tool calls · CLAUDE.md, 31 rules

  RULES THAT NEVER LEFT A TRACE            8 of 31
    Probably never reached the model at all. Ranked by how often you restated them.

  RULES YOUR AGENT BROKE MOST              "always run the tests before saying it works" — 12×
  THE THING YOU SAID SIX TIMES             not in your CLAUDE.md. Add it?
  A CLASS OF BUG FIXED FIVE TIMES          path separators. Here is a guard for it.
  COMPACTIONS THAT DROPPED YOUR RULES      9 — after each, violations rise
```

Every line of that is computable **today, offline, with no model call**, from parts that
already exist: `session` parses transcripts, `learn` extracts preferences, `audit` grades
outputs, `health` critiques the ruleset, and rule ids are content-addressed so a rule can be
tracked across months of rewording. **`onboard` is a composition, not new machinery.** That is
why it is achievable and why it should be next.

It is also the honest answer to "how discoverable are we" — the demo is the user's own history,
which no competitor can show them and no screenshot can fake.

**Two limits, stated now rather than discovered later.** Compaction eats history: this
project's own transcript yielded 1,348 readable characters because everything earlier had been
compacted into a summary that `learn` must now — correctly — refuse to read. And a first run
that says *"nothing found"* must say **why**, or it reads as a broken install.

---

## Part 3 — Sequence

**Done since this plan was written (15th → 16th).** `selfcheck` + `verify:ui` in CI · the guard
installed on our own repo via `npm run dogfood`, refusing to install on an implausible parse ·
`learn` no longer mines the assistant · the wrapped-paragraph parser fix · a class of "works
only where it was written" bugs closed three times over.

**Next, in order.**

1. **CHANGE 6, `enforcee onboard`.** Highest value per day of work, because it is composition
   of parts that exist, and because it is the only item here a stranger can feel. Ship it
   before any further engine work.
2. **CHANGE 2, the denominator.** A day. Stops the next false green. Six incidents on this
   project so far, one of them this week.
3. **CHANGE 1, reach.** The biggest idea, and the one that would have caught the undeployed
   templates, the 404 logo, the five-day trial button and `.invert`.
4. **CHANGE 3, mirror detection**, into `health` — now with the sharpest example we own: a
   unit test that passed for the whole life of a bug because it tested a function nothing
   called.
5. **CHANGE 4, the class ledger**, seeded from Part 1. The incidents are already written down;
   they have no class column.
6. **CHANGE 5**, last — its failures are visible to you rather than silent.

**One correction to make immediately, before any of it:** the site says *"Only your words are
read — never the assistant's."* That is true again as of `8ab80be`, and it was false for the
whole life of the feature. Anything else on the site asserted about behaviour deserves the same
treatment `learn` just got: **run it on a real input and watch.**

---

## Part 4 — What this does not fix, and what it will never be

Stated plainly, per honesty rule #4. This section is longer than the plan's author would like,
which is the point.

**It is not a continuous monitor, and should not become one.** The description of Enforcee as
something that "actively learns, checks, prevents, verifies, researches, studies, enhances,
tracks, monitors, down to the very last bit" is a description of an *agent*, not of a
compliance layer. Enforcee is four discrete things: a hook that runs before a tool call, three
commands that run when invoked, a receipt, and a ledger. Everything in this plan makes those
four sharper. **None of it makes the tool watch you.** A tool that watches everything is a tool
nobody installs, and the ambition is worth resisting on purpose.

**It cannot make a model stop being wrong.** Everything here converts a *silent* failure into a
*loud* one. That is the entire mechanism. Expect receipts to look worse and be more true, and
expect that to feel like a regression for a week.

**"Eliminates all the frustration so you only focus on development and marketing" is not
achievable, and promising it is how tools lose trust.** The achievable version is a number, and
the charter already names it: **human interventions per completed unit of work.** Today, on this
project, that number is high — this session alone needed you for a PAT, a Supabase token, four
dashboard pastes, and a CI failure report. Drive it toward zero and the feeling follows. Promise
the feeling and you get neither.

**Reach labels are only as good as the rule→reach resolver.** Get it wrong and a `deployed`
rule labelled `repo` is green again. It moves the failure from invisible to auditable, which is
real and is not a guarantee.

**Mirror detection is a heuristic** and will flag legitimate literal assertions. It should
annoy, not block.

**CHANGE 4 needs discipline exactly when discipline is scarcest** — at the moment an incident
closes, the fix works, and everyone wants to move on. A gate can only partly enforce that.

**And the counts in Part 1 are reconstructed**, not read from an incident database, because
there isn't one. CHANGE 4 is what would make them measured.
