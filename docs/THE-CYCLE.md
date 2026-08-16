# The cycle — how every scheduled job runs

**Read this before writing or editing any scheduled job prompt.**

Patrik, 2026-08-16: *"turn this searching, researching, learning, enforcing, monitoring,
verifying workflow of enforcee into a cycle or have it always do it again with different paths,
so it won't just run once... all the tasks shall aim to improve this."*

And: *"Longer work which gets green on the first run is way more valuable than run it once,
gets red, and you can start over."*

Both sentences are constraints on how a job behaves, not suggestions. They are written here
once so eleven prompts do not each carry their own drifting copy — the duplicated-source
failure this project has hit twelve times.

---

## 1. Every job runs the same six-stage cycle

The stages are the product. A job that skips one is not doing a smaller version of the work,
it is doing a different job.

| stage | the question | the failure if skipped |
|---|---|---|
| **SEARCH** | What is actually there? Read the live remote, the registry, the filesystem, the transcripts. | Acting on memory. Every hour lost here was lost to a question already answered in the repo. |
| **RESEARCH** | What do primary sources say? Fetch the doc, run the command, read the response. | A fabricated setup step. Twice, at real cost. |
| **LEARN** | What does this project's own history already know? `obstacles`, `learned.json`, the logs. | Walking into a wall recorded four times over. |
| **ENFORCE** | Turn the finding into something that blocks. A test, a guard rule, a CI step. | A rule in a document is not a control. |
| **MONITOR** | Will this stay true? What watches it tomorrow? | Sixteen contradictions accumulated across nine days of unwatched prose. |
| **VERIFY** | Did the thing actually change? Break the control on purpose and watch it go red. | A control that could not have failed. Seven of those so far. |

---

## 2. Rotate the path. Never run the same job twice.

A job that does the same thing every night stops finding anything on night two. So each run
picks its focus from a rotation, and **states which one it took and why**.

Deterministic, so coverage is guaranteed rather than hoped for:

```
PATH = (days since 2026-08-16) mod 10
```

| # | path | what it means |
|---|---|---|
| 0 | **parser** | `src/lib/rules/parse.ts`, real rulesets, false accusations |
| 1 | **guard** | policy compilation, bypasses, fail-open, hook payloads |
| 2 | **checks** | deterministic checks, the judge, the evidence gate |
| 3 | **obstacles** | patterns, false-positive rate, unverified remedies |
| 4 | **website** | claims vs behaviour — every promise the site makes |
| 5 | **onboarding** | first sixty seconds; install, licence, first audit |
| 6 | **CI & release** | the pipeline, the platforms, what publishes |
| 7 | **docs** | any doc asserting a mechanism, checked against the repo |
| 8 | **security** | authz, secrets, injection, cost |
| 9 | **transcripts** | what real sessions show that no test does |

If the chosen path is genuinely dry, say so in one sentence **and take the next one in the
rotation** — do not stop, and do not silently substitute a path you like better.

---

## 3. Green on the first run beats fast and red

*"Longer work which gets green on the first run is way more valuable."*

Concretely, before pushing:

- Run the **full suite**, `typecheck`, and the build. Not the subset you touched.
- **Break every control you added** and watch it go red. Then assert the sabotage actually
  applied — a string replace that matches nothing reports "control passed" from a sabotage
  that never happened. That has occurred here.
- Report **which test went red**, not how many. An identical failure count either way can
  hide a stale test.
- Read CI from the Actions API afterwards. Never assume. Say which platforms were green.

A red push costs a whole cycle: the next run spends its budget re-deriving what broke instead
of finding something new. Taking three times as long to land green is cheap by comparison.

---

## 4. One commit or one task. Never only prose.

**A job that produces only a document is a job that failed.**

Sixteen contradictions accumulated across nine days of jobs that wrote prose nobody read. The
output of a run is a commit, or a concrete task with a named next action. If a run genuinely
finds nothing, that is one paragraph in `claude/70-DAILY-LOG.md` naming what was checked and
what would have counted as a finding — never manufactured work, and never a document that
looks like progress.

---

## 5. Everything aims at the product

*"this is the very product we are building and all the tasks shall aim to improve this."*

Enforcee's claim is that an agent can be made to check, enforce and learn. Every job is that
claim under test on its only honest subject — us. So the bar for a finding is:

> Would this have prevented a real failure recorded in this project's history?

If yes, it is worth building. If it is a hypothetical, write it down and go back to the
transcripts, where the real ones are.
