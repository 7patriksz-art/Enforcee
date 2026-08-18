# The spine — what Enforcee is actually for

Patrik, 2026-08-17, after nine days of the product not being the thing he keeps describing:

> *read the prompt, plan with everything in advance, count with all the possible outputs,
> ideally leave the human labour out, avoiding back and forth, learning and improving guards,
> preference, enforcements along the way and verify very thoroughly at the end if everything's
> green, if not solve that.*

> *I want to achieve the original goal: learn, enforce, verify — so the user and I can advance
> the project and keep working instead of me pivoting all the time because AI not working
> properly.*

That is one loop, six steps. This document is the contract for building it.

---

## Where we actually are, measured

| | lines |
|---|---|
| `tests/` | 10,592 |
| `src/lib/` — the engine users get | 8,797 |
| `src/app/` — the website | 6,740 |
| `cli/` | 1,125 |
| `guard/` — the paid enforcement | 1,117 |

**We have written more test than product.** Those tests are for OUR code — the parser, the
checks, the guard, the website, and our own release process. None of them is a rule the product
enforces on a user's behalf. They are how we stop shipping a broken tool; they are not the tool.

And against the six steps:

| step | today |
|---|---|
| 1 · read the prompt | **nothing.** No command takes a prompt as input. |
| 2 · plan / prerequisites in advance | partial — `preflight` probes tools named in a *ruleset*, never in a prompt |
| 3 · count all the outputs up front | **nothing.** Nothing writes acceptance criteria before work starts. |
| 4 · leave the human labour out | **nothing.** Nothing batches or auto-resolves what a run will need. |
| 5 · learn along the way | partial — `learn` and `obstacles` exist and feed reinjection |
| 6 · verify thoroughly at the end | partial — `audit` grades an OUTPUT against rules; nothing closes a PLAN |

**Four of six do not exist.** Enforcee today grades an answer after the fact. It does not run
the loop. That is the whole gap, and it is why the loop still runs on Patrik.

---

## The one missing object: a RUN CONTRACT

Everything above is missing the same thing — a written, checkable statement of *what this run
is for and how we will know it worked*, made **before** the work starts.

`.enforcee/brief.json`:

```
requirements[]   what the prompt actually asks for, itemised
preconditions[]  every tool, key, file and service the work will need — each with a probe
acceptance[]     the checks that must pass at the end, each a runnable command + expected result
blockers[]       preconditions that failed AND cannot be auto-resolved — the ONE batched ask
```

The acceptance criteria are the load-bearing part. Written **at the start**, they cannot be
chosen afterwards to flatter the result — which is the single failure that has cost this
project the most, on both sides of the keyboard.

### Two commands close the loop

```
enforcee brief <prompt>     steps 1-4 — read, plan, enumerate outputs, batch the asks
enforcee close              step 6 — run every acceptance check; red is the work list
```

and the existing pieces become step 5 rather than orphans: `guard` reinjects the brief at
SessionStart and PostCompact so the contract survives compaction; `obstacles` and `learn` turn
what went wrong into new guards.

**Exit codes are the contract.** `brief` exits 3 when a human is genuinely required, and prints
every such item at once — never one at a time, which is the back-and-forth Patrik is describing.
`close` exits non-zero while anything is red, so "done" is not something an agent can assert.

---

## Build order — each slice ships green, or it does not ship

| slice | what | proves |
|---|---|---|
| **1** | `enforcee brief` — requirements, preconditions probed, acceptance skeleton, blockers batched | a prompt becomes a checkable contract |
| **2** | `enforcee close` — run acceptance, red = work list, exit non-zero | "green" stops being a claim |
| **3** | guard reinjects the brief at SessionStart / PostCompact | the contract survives compaction |
| **4** | every failed acceptance becomes a candidate guard, via `learn` | the loop improves itself |
| **5** | scheduled tasks rebuilt around the six steps, not thirteen topics | the line runs the loop |

Nothing here is a rewrite. `brief` reuses `checkPrecondition` for probing and `parseRuleset`
for imperatives — one idea, one place, because E-1 is at twelve instances.

---

## The rule this document is under

Every slice must be usable by Patrik on ScreenKraft the day it lands. A slice that only works
on Enforcee is a slice that has not been tested — the artefact-versus-tree lesson, applied to
features instead of packaging.
