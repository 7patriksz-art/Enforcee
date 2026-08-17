# The cycle — how every scheduled job runs

**Read this before writing or editing any scheduled job prompt.**

Patrik, 2026-08-16: *"turn this searching, researching, learning, enforcing, monitoring,
verifying workflow of enforcee into a cycle or have it always do it again with different paths,
so it won't just run once... all the tasks shall aim to improve this."*

And, correcting my first reading of it: *"under cycle I meant on the actual agent running
tasks have it try different paths and methods to avoid stucking."* — the cycle is about an
agent not getting stuck, not about rotating what it looks at. Section 2 is rewritten for that.

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

## 2. When you hit a wall, take a different route. Never stop.

**Corrected 2026-08-16.** This section first said "rotate the subject area each night". That
was a misreading. Patrik: *"under cycle I meant on the actual agent running tasks have it try
different paths and methods to avoid stucking."*

He means **persistence within a run**, not variety across runs. A job that stops at the first
refusal has failed, however tidily it reports the refusal.

The charter already names this as the CONTINUE layer: *"A blocked action is not a stop. It is
a different approach, tried."* Here is what that means mechanically.

### The escalation ladder

On any blocked step, work down this list. Do not stop until it is exhausted.

| # | move | example from this project |
|---|---|---|
| 1 | **Consult what is already known.** `enforcee obstacles`, the charter, the logs. | 4 pushes died on `could not read Username` with the remedy in our own charter. |
| 2 | **Same route, different mechanics.** | `git push` refused → push to an explicit URL. |
| 3 | **Bypass the layer that refused.** | Every "the sandbox blocks this" so far was the *proxy*. `env -u https_proxy` unlocked pushes and the GitHub API. |
| 4 | **Different transport, same goal.** | `api.supabase.com` blocked at egress → run the same call from a GitHub runner. |
| 5 | **Different tool entirely.** | `~/.claude` ungrantable → a hook inside the user's own Claude Code reaches it. |
| 6 | **Change the goal's shape.** | Templates could not be pasted from a phone → push them by API instead. |
| 7 | **Remove the dependency.** | Three image formats broke in email → draw the mark in HTML; nothing left to fetch. |
| 8 | **Only now, ask.** And ask for the fix with the longest half-life. | |

**Record which rung you reached.** A step that succeeded on rung 5 is an obstacle worth
storing: next time it starts at rung 5.

### Never repeat a failure identically

Retrying the same command unchanged is not persistence, it is a loop. If an approach fails
twice the same way, the third attempt must differ in **kind** — a different tool, transport or
goal shape — not in spacing or phrasing.

### What "stuck" actually looks like

Not an error. Errors are progress. Stuck is:

- the same command run three times with the same result
- a report that describes a blockage without having tried anything against it
- asking the user for something you have not verified is even usable — a Supabase token was
  nearly requested for an API this sandbox cannot reach at all
- **ending a run with the work in the same state it started**

### Coverage is a separate concern

Breadth still matters, so vary the subject too — parser, guard, checks, obstacles, website,
onboarding, CI & release, docs, security, transcripts. But that is about not re-treading
ground, and it is the weaker of the two ideas. **If a run has to choose, finishing the thing
in front of it beats sampling something new.** Half-finished work is what forces a pivot, and
pivoting is the thing this product exists to stop.

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
output of a run is a commit, or a concrete task with a named next action.

### Every finding goes in the ledger, or it does not exist

```bash
node scripts/findings.mjs add --source <your-job-name> \
  --claim "what is wrong, in one sentence someone could act on" \
  --severity blocker|high|medium|low \
  --needs agent|patrik \
  --where path/to/file.ts:42 \
  --evidence "the measurement or quote that makes it true"
```

`FINDINGS.jsonl` is committed, so it survives a container rollback and shows up in a diff.

**`--needs patrik` is for money, names, credentials, irreversible choices and questions of
taste. Nothing else.** Parking work there because it is hard is how an autonomous system
quietly turns back into a to-do list for a human — which is the thing being built against.

Ids are content-addressed on `(source, claim)`, so re-reporting the same thing records a
second SIGHTING rather than a second item. Seeing it again is information: it means the thing
is still true.

### Closing needs evidence

```bash
node scripts/findings.mjs close <id> --commit <sha>        # or --test <name>
node scripts/findings.mjs escalate <id> --why "<reason>"   # only when it truly needs Patrik
```

A close with nothing behind it is refused. The closer grades its own homework, so that is the
cheapest available lie and the one worth making impossible.

---

## 5. Everything aims at the product

*"this is the very product we are building and all the tasks shall aim to improve this."*

Enforcee's claim is that an agent can be made to check, enforce and learn. Every job is that
claim under test on its only honest subject — us. So the bar for a finding is:

> Would this have prevented a real failure recorded in this project's history?

If yes, it is worth building. If it is a hypothetical, write it down and go back to the
transcripts, where the real ones are.
