# The plan: stop being the transport

**2026-08-16.** Patrik: *"I was just pasting back and forth between you and PowerShell. That is
what I want to eliminate."*

He is right, and the diagnosis is narrow. In the last hour the loop was: I write a command → he
pastes it into PowerShell → he reads the output → he tells me what it said → I fix something →
repeat. **A human was the network cable between two machines.** Every step of that is a machine
step, and the tool whose entire purpose is removing manual labour was the thing generating it.

---

## What I tested, so the design rests on facts rather than hope

Four routes for reaching his machine. Three are dead, and knowing *which* three is the plan.

| route | result |
|---|---|
| Grant `~/.claude` to this session | **Refused.** `device_request_folder_access` cannot grant it; only his own folder picker can, and a grant lasts one session. |
| `device_bash` → read `~/.claude/projects` | **Dead.** That VM mounts *only* connected folders. Transcripts are not reachable. |
| `device_bash` → `git pull` in his repo | **Dead.** `403 from proxy after CONNECT` reaching github.com, plus `.git/index.lock` is unwritable. |
| **A hook running inside his own Claude Code** | **WORKS.** Runs as him, on his machine, with his filesystem — and `SessionStart` stdout is injected into the model's context. |

That last row is the whole answer, and it is our own product. Not a workaround: the guard was
built for exactly this and we were routing around it with a person.

---

## Done in this session

**The guard now carries the obstacles brief.** `guard.mjs` already re-injected the ruleset on
`SessionStart` and `PostCompact`; it now appends `.enforcee/obstacles.md` to the same payload.
No new mechanism, no new hook, no new user action.

The two events are exactly the right ones:

- **SessionStart** — a fresh session has forgotten every wall the last one hit.
- **PostCompact** — compaction is precisely when accumulated *"we already tried that"*
  evaporates. This is his *"claude stops being able to read everything as the project grows"*,
  and it now has a mechanical answer.

Rules go first, obstacles second, so the 9,500-character cap eats advice rather than the
contract. A missing or unreadable brief changes nothing — a learned artefact is a bonus, never
a precondition. Four tests through the real licensed harness; two proved red.

---

## The gap that remains, and it is the keystone

The brief is injected automatically. **It is not yet refreshed automatically.** Something still
has to run `enforcee obstacles` over `~/.claude/projects`, and today that something is Patrik.

Three ways to close it, in order of preference:

**1. The guard refreshes it itself, in the background.** On `SessionStart`, after emitting the
current brief, spawn a detached scan and let it finish whenever. Zero added latency — the
session never waits — and the next session gets the fresher brief. Eventual consistency is
exactly right here: an obstacle that appeared 20 minutes ago does not need to be known *this*
second, it needs to be known before the next time we walk into it.

The scan must be **incremental** — only transcripts whose mtime moved since the last run. The
occurrence fingerprints shipped today already make re-reads idempotent, so incremental is safe
rather than merely fast.

**2. A Windows Scheduled Task**, installed once by `enforcee guard` on Windows. More moving
parts, survives Claude Code not running. Second choice because it is a second install surface.

**3. `SessionEnd`.** Latency-free by definition, but its budget is 1.5s by default and a scan
that gets killed halfway is worse than one that never ran.

**Take route 1.** It needs no new install step, no scheduler, no permission, and it degrades to
"the brief is a session out of date", which is a rounding error against "the brief does not
exist".

---

## Round-the-clock, and what it should actually do

He has Claude Max and wants the quota used. Eleven scheduled jobs already run (see `82-…`).
The honest assessment: **they are producing more documents than changes.** Sixteen
contradictions accumulated across nine days of them, which is what a pipeline that writes looks
like when nothing reads.

So the addition is not more jobs. It is **three jobs that close loops**, and a rule that a job
which produces only a document is a job that failed.

| job | cadence | what it must produce |
|---|---|---|
| **Obstacle sweep** | daily | Run `obstacles` over every transcript reachable in the cloud. Any signature ≥3 hits with no observed remedy becomes a task, not a paragraph. |
| **Contradiction check** | daily | Re-run the cross-doc audit that found sixteen. Any doc asserting a mechanism (`npm run X`, a file path, a script) is checked against the repo. C-1 was a doc claiming a script that does not exist — that is one `grep` from automatic. |
| **Prerequisite prover** | weekly | For every remedy marked `observed`, actually run it and confirm it still works. A remedy that has rotted is worse than none, and today nothing re-tests them. |

Each writes at most one paragraph and at least one commit or one task. **A job that only writes
prose is a job that failed** — that rule is the fix for the last nine days.

---

## What this adds up to, against what he actually asked for

| his words | mechanism | state |
|---|---|---|
| *"searches for pre requisites... during project plans"* | `preflight` reads rules; joining it to `obstacles` makes it read history too | **next** |
| *"enforces and reinjects important guides, tools, skills, mds"* | `SessionStart` / `PostCompact` re-injection | **done**, now carrying obstacles |
| *"self verifies at the end"* | `verify` checks claims against the filesystem | exists, not wired to session end |
| *"never gets STUCK in... api key locating manual labour"* | obstacles records credential walls with observed remedies | **done**, refresh pending |
| *"learning the users preference and creating guardrails"* | `learn` → `accept` → policy | exists; `learn` fixed today to stop mining my own words |
| *"pick up the line when installed mid-project"* | `obstacles` + `onboard` read history that predates install | obstacles **done**; onboard is CHANGE 6 |
| *"claude stops being able to read everything as the project grows"* | `PostCompact` re-injection | **done** |
| *"learn itself from actions, not me pointing at every error"* | obstacles mines tool failures, not user statements | **done** |

---

## What I will not promise

**This does not stop the model being wrong.** It makes being wrong loud and cheap to catch, and
stops the same wall being walked into twice. Those are different things and only the second is
achievable.

**"Never gets stuck" is not reachable as stated.** What is reachable: every wall this project has
already hit is known before it is hit again, and the number of times Patrik is the transport
goes to zero. That is measurable — the charter already names it as *human interventions per
completed unit of work* — and it is high today. This session alone needed him for a PAT, a
Supabase token, four dashboard pastes, a CI failure report, and two PowerShell round-trips.

**The eleven existing jobs are not obviously earning their quota.** More automation on top of
automation that produces documents nobody reads is how this gets worse rather than better. The
"one commit or one task, never only prose" rule is the constraint that makes round-the-clock
worth running at all.
