# Tweaking the engine so it actually checks, enforces and learns

**Written 2026-08-15, for Patrik, after his instruction:** *"in every session I'm doing now
you keep making the same mistakes and new ones also, not checking, not enforcing, not really
learning."*

He is right, and the interesting part is that it is not a discipline problem. Every one of
these failures happened **with a green suite and a written rule already forbidding it.** So
the fix cannot be another rule in another document. This plan is about the engine.

Everything below is measured from this repository and this session's actual history. Where a
number is reconstructed rather than observed, it says so.

---

## Part 0 — The finding that reframes everything else

I checked, expecting to confirm the opposite:

```
.claude/                     does not exist
.git/hooks/                  empty (samples only)
.github/workflows/ci.yml     typecheck · test · pack:cli · build
grep -c 'selfcheck|enforcee audit|verify:ui|guard' ci.yml   →   0
```

**Enforcee is not installed on Enforcee.** Not as a hook, not in CI, not anywhere in the path
between me writing a line and that line reaching you.

Worse: the two controls built *specifically in response to the two worst incidents on this
project* are wired into nothing.

| Control | Built after | Runs on push? |
|---|---|---|
| `npm run verify:ui` — real Chromium, both themes, **sampled pixels** | the `.invert` disaster, where 546 contrast measurements and 123 assertions stayed green while every panel painted backwards | **no** |
| `npm run selfcheck` — `health` + `preflight` over `CLAUDE.md` | the dogfooding decision, charter §8 | **no** |

Both exist. Both are excellent. Both are a thing someone has to remember, which is the exact
category of control this product exists because models ignore.

**We are selling a hook that blocks a violation before it runs, and building the product with
no hook.** Everything in Part 2 is downstream of that.

---

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

## Part 2 — Five changes to the engine

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

## Part 3 — Sequence

**Today, and it is one line.** Wire the controls we already own into the gate. `selfcheck` and
`verify:ui` are built, tested and running nowhere. This is the highest ratio of risk removed
to work done on the entire list:

```yaml
- run: npm run selfcheck
- run: npm run verify:ui     # ubuntu leg only — it needs Chromium
```

**This week.** Change 2 (denominator) then Change 1 (reach), in that order — reach is the
bigger idea, but denominator is what stops the next false green, and it is a day's work.

**Next.** Change 3 (mirror detection) into `health`. Change 4's class ledger, seeded from the
table in Part 1 — the incidents are already written down, they just have no class column.

**After.** Change 5, which is the largest and the least urgent, because it is the only one
whose failures are visible to you rather than silent.

**Install the hook on this repo before any of it.** We ship a hook that blocks a forbidden
action before it runs. Not using it here is not an oversight — it is the single loudest
statement about whether we believe our own product.

---

## Part 4 — What this does not fix

Stated plainly, per honesty rule #4:

- **Reach labels are only as good as the rule→reach resolver.** Get it wrong and a `deployed`
  rule labelled `repo` is green again. It shifts the failure from invisible to
  auditable-and-still-possible. That is a real improvement and it is not a guarantee.
- **Mirror detection is a heuristic.** It will flag some legitimate literal assertions —
  checking an exact wire format is a real thing to do. It should annoy, not block.
- **None of this makes me not be wrong.** It makes being wrong *loud*. Every change above
  converts a silent green into a visible UNVERIFIABLE. Expect the receipt to get worse-looking
  and more true, and expect that to feel like a regression for about a week.
- **Change 4 needs discipline at exactly the moment discipline is scarcest** — closing an
  incident, when the fix works and everyone wants to move on. It is the one item here that a
  gate can only partly enforce.
- **The counts in Part 1 are reconstructed** from this project's logs and this session's
  history, not read from an incident database, because there isn't one. Change 4 creates the
  thing that would make them measured rather than assembled.

---

## The one-paragraph version

Enforcee's checks can only see this repository, are written by the same process that makes the
mistake, pass when they match nothing, close instances rather than classes, and are installed
nowhere near the moment a mistake is made. Give every check a **reach** and forbid it from
grading above its own; make it **report its denominator** and refuse to pass on an empty one;
detect **mirror tests** that restate the implementation; close **classes rather than
instances**, and measure the repeat-class rate; extend the **evidence gate** from a model's
verdict to any claim about the outside world. Then install the hook on our own repo, because
we are selling prevention and building without it.
